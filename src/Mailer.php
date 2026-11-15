<?php
declare(strict_types=1);
namespace ThesisLink;

final class Mailer
{
    public function __construct(private Db $db, private array $config) {}
    public function queue(string $email, string $subject, string $body, ?string $html=null): void
    {
        $iv=random_bytes(12);$tag='';$cipher=openssl_encrypt(json_encode(compact('email','subject','body','html'),JSON_THROW_ON_ERROR),'aes-256-gcm',hash('sha256',$this->config['app_secret'],true),OPENSSL_RAW_DATA,$iv,$tag);
        if($cipher===false) throw new \RuntimeException('Mail encryption failed.');
        $this->db->run('INSERT INTO mail_outbox (id,payload) VALUES (?,?)',[Db::uuid(),base64_encode($iv.$tag.$cipher)]);
    }
    public function deliver(int $limit=50): int
    {
        $sent=0;
        for($i=0;$i<$limit;$i++){
            $row=$this->db->transaction(function(){
                $row=$this->db->one("SELECT * FROM mail_outbox WHERE status='pending' AND attempts<5 AND available_at<=UTC_TIMESTAMP() ORDER BY created_at LIMIT 1 FOR UPDATE");
                if($row)$this->db->run("UPDATE mail_outbox SET attempts=attempts+1,available_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE) WHERE id=?",[$row['id']]);
                return $row;
            });
            if(!$row)break;
            try{
                $raw=base64_decode($row['payload'],true);
                $plain=openssl_decrypt(substr($raw,28),'aes-256-gcm',hash('sha256',$this->config['app_secret'],true),OPENSSL_RAW_DATA,substr($raw,0,12),substr($raw,12,16));
                if($plain===false)throw new \RuntimeException('Unreadable mail payload.');
                $data=json_decode($plain,true,32,JSON_THROW_ON_ERROR);$options=$this->config['mail'];
                if(($options['transport']??'smtp')==='file'){
                    if(($this->config['environment']??'production')!=='development')throw new \RuntimeException('File mail is disabled in production.');
                    $dir=$options['directory']??dirname(__DIR__).'/storage/mail';if(!is_dir($dir))mkdir($dir,0700,true);
                    file_put_contents($dir.'/'.$row['id'].'.txt',$plain,LOCK_EX);chmod($dir.'/'.$row['id'].'.txt',0600);
                }else{
                    $mail=new \PHPMailer\PHPMailer\PHPMailer(true);$mail->isSMTP();$mail->Host=$options['host'];$mail->Port=(int)$options['port'];
                    $mail->SMTPAuth=($options['username']??'')!=='';$mail->Username=$options['username']??'';$mail->Password=$options['password']??'';
                    $mail->SMTPSecure=$options['encryption']??'tls';$mail->Timeout=15;$mail->CharSet='UTF-8';$mail->setFrom($options['from'],'ThesisLink');$mail->addAddress($data['email']);$mail->Subject=$data['subject'];
                    if(is_string($data['html']??null)&&$data['html']!==''){$mail->isHTML(true);$mail->Body=$data['html'];$mail->AltBody=$data['body'];}else{$mail->Body=$data['body'];}
                    $mail->send();
                }
                $this->db->run("UPDATE mail_outbox SET status='sent',payload='',sent_at=UTC_TIMESTAMP() WHERE id=?",[$row['id']]);$sent++;
            }catch(\Throwable){error_log('ThesisLink mail delivery failed for outbox '.$row['id']);}
        }
        return $sent;
    }
    public function attemptDelivery(int $limit=1): int
    {
        try{return $this->deliver($limit);}catch(\Throwable){error_log('ThesisLink immediate mail delivery failed; the message remains queued.');return 0;}
    }
}
