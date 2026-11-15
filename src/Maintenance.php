<?php
declare(strict_types=1);
namespace ThesisLink;

final class Maintenance
{
    public function __construct(private Db $db, private Mailer $mail, private array $config) {}

    public function run(bool $cleanupR2=false): array
    {
        $expired=[];
        foreach(['user_sessions','auth_tokens','rate_limits','oauth_replays'] as $table){
            $expired[$table]=$this->db->run("DELETE FROM $table WHERE expires_at<UTC_TIMESTAMP()")->rowCount();
        }
        $result=['expired'=>$expired,'mailDelivered'=>$this->mail->deliver(),'r2'=>['processed'=>0,'failed'=>0,'skipped'=>0]];
        if(!$cleanupR2)return $result;
        if(($this->config['enable_storage_cleanup']??false)!==true)throw new \RuntimeException('R2 deletion is disabled until cutover is confirmed in configuration.');
        $storage=new Storage($this->config['r2']);
        foreach($this->db->all('SELECT * FROM storage_cleanup WHERE created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE) AND attempts<5 LIMIT 50') as $file){
            if($this->db->one('SELECT id FROM thesis_files WHERE bucket=? AND object_key=?',[$file['bucket'],$file['object_key']])){$result['r2']['skipped']++;continue;}
            try{
                $this->db->run('UPDATE storage_cleanup SET attempts=attempts+1 WHERE id=?',[$file['id']]);
                $storage->remove($file);$this->db->run('DELETE FROM storage_cleanup WHERE id=?',[$file['id']]);$result['r2']['processed']++;
            }catch(\Throwable){$result['r2']['failed']++;error_log('ThesisLink R2 cleanup failed for queue item '.$file['id']);}
        }
        return $result;
    }
}
