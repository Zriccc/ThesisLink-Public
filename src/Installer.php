<?php
declare(strict_types=1);
namespace ThesisLink;

final class Installer
{
    public static function handle(string $root): never
    {
        header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');header('Referrer-Policy: same-origin');header('Cache-Control: no-store');header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
        $method=$_SERVER['REQUEST_METHOD']??'GET';
        $configured=getenv('THESISLINK_CONFIG');
        if(is_file($root.'/config/installed.lock')||is_file($root.'/config/config.local.php')||(is_string($configured)&&$configured!==''&&is_file($configured)))self::page('ThesisLink is installed','Setup is locked. Open ThesisLink to continue.','/',200);
        if($method==='GET')self::form();
        if($method!=='POST')self::page('Method not allowed','Setup accepts only GET and POST requests.','/setup',405);
        $site=(($_SERVER['HTTPS']??'')==='on'?'https':'http').'://'.($_SERVER['HTTP_HOST']??'');
        $origin=$_SERVER['HTTP_ORIGIN']??'';$fetchSite=$_SERVER['HTTP_SEC_FETCH_SITE']??'';
        if($origin!==''?!hash_equals($site,$origin):$fetchSite!=='same-origin')self::page('Request rejected','Open setup from this server and try again.','/setup',403);
        try{self::install($_POST,$root);self::page('Installation complete','The database, administrator, and application configuration are ready. Keep the deployment archive private and delete any downloaded copy of INSTALL-CODE.txt.','/',200);}
        catch(\Throwable $error){error_log('ThesisLink installer: '.get_class($error).' '.$error->getMessage());self::form($error->getMessage(),$_POST);}
    }

    public static function install(array $input,string $root,bool $testing=false): array
    {
        foreach(['pdo_mysql','intl','mbstring','openssl','gd','curl'] as $extension)if(!extension_loaded($extension))throw new \RuntimeException('Missing PHP extension: '.$extension);
        $codeFile=$root.'/config/install-code.php';if(!is_file($codeFile))throw new \RuntimeException('The one-time installation code is missing. Create a fresh deployment package.');
        $expected=require $codeFile;$provided=trim((string)($input['installationCode']??''));
        if(!is_string($expected)||!preg_match('/\A[a-f0-9]{64}\z/',$expected)||!hash_equals($expected,hash('sha256',$provided)))throw new \RuntimeException('The installation code is incorrect.');
        $environment=$testing?'development':'production';$appUrl=rtrim((string)($input['appUrl']??''),'/');Http::origin($appUrl);
        if(!in_array(parse_url($appUrl,PHP_URL_PATH),[null,'','/'],true))throw new \RuntimeException('Application URL must be the root of a domain or subdomain.');
        if(!$testing&&!str_starts_with($appUrl,'https://'))throw new \RuntimeException('Production setup requires an HTTPS application URL.');
        $port=filter_var($input['databasePort']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>65535]]);if($port===false)throw new \RuntimeException('Database port is invalid.');
        $database=self::plain($input,'databaseName','Database name',64,'/\A[A-Za-z0-9_-]+\z/');
        $encryption=(string)($input['mailEncryption']??'');if(!in_array($encryption,['tls','ssl'],true))throw new \RuntimeException('SMTP encryption is invalid.');
        $config=['environment'=>$environment,'app_url'=>$appUrl,'app_secret'=>bin2hex(random_bytes(32)),'enable_storage_cleanup'=>false,
            'database'=>['host'=>self::plain($input,'databaseHost','Database host',255),'port'=>$port,'name'=>$database,'username'=>self::plain($input,'databaseUsername','Database username',128),'password'=>(string)($input['databasePassword']??'')],
            'r2'=>['endpoint'=>rtrim(self::plain($input,'r2Endpoint','R2 endpoint',500),'/'),'region'=>'auto','bucket'=>self::plain($input,'r2Bucket','R2 bucket',63,'/\A[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\z/'),'access_key_id'=>self::plain($input,'r2AccessKey','R2 access key',255),'secret_access_key'=>self::plain($input,'r2SecretKey','R2 secret key',255)],
            'mail'=>$testing?['transport'=>'file','directory'=>$root.'/storage/mail','from'=>Validation::email($input['mailFrom']??null)]:['transport'=>'smtp','host'=>self::plain($input,'mailHost','SMTP host',255),'port'=>self::port($input['mailPort']??null,'SMTP port'),'encryption'=>$encryption,'username'=>self::optional($input,'mailUsername','SMTP username',255),'password'=>self::optional($input,'mailPassword','SMTP password',1024),'from'=>Validation::email($input['mailFrom']??null)],
            'google_client_id'=>self::plain($input,'googleClientId','Google client ID',255)];
        Http::origin($config['r2']['endpoint']);
        $adminEmail=Validation::email($input['adminEmail']??null);$adminName=Validation::text($input['adminName']??null,'administrator name',120);$adminPassword=Validation::password($input['adminPassword']??null);
        $configDir=$root.'/config';if(!is_dir($configDir)||!is_writable($configDir))throw new \RuntimeException('The private config directory is not writable.');
        $temporary=$configDir.'/.config-'.bin2hex(random_bytes(8)).'.tmp';
        if(file_put_contents($temporary,"<?php\ndeclare(strict_types=1);\nreturn ".var_export($config,true).";\n",LOCK_EX)===false)throw new \RuntimeException('The application configuration cannot be written.');chmod($temporary,0600);
        try{
            if(!class_exists('Database',false))require_once __DIR__.'/Database.php';
            try{$pdo=\Database::connect($config['database']);}catch(\Throwable $error){throw new \RuntimeException('Database connection failed. Check the database name, username, password, host, and port.',0,$error);}
            $tables=$pdo->query('SHOW TABLES')->fetchAll(\PDO::FETCH_COLUMN);if($tables)throw new \RuntimeException('The selected database is not empty. Choose an empty database.');
            try{(new Storage($config['r2']))->check();}catch(\Throwable $error){throw new \RuntimeException('R2 connection failed. Check the endpoint, bucket, access key, secret key, and server network access.',0,$error);}
            if(!$testing)self::checkSmtp($config['mail']);
            $schema=file_get_contents($root.'/database/schema.sql');if($schema===false)throw new \RuntimeException('The database schema is missing.');
            try{$pdo->exec($schema);$db=new Db($pdo);$db->run("INSERT INTO users (id,email,name,role,password_hash,email_verified_at) VALUES (?,?,?,'admin',?,UTC_TIMESTAMP())",[Db::uuid(),$adminEmail,$adminName,password_hash($adminPassword,PASSWORD_DEFAULT)]);}
            catch(\Throwable $error){throw new \RuntimeException('Database schema or administrator creation failed. Review the server database log.',0,$error);}
            if(!rename($temporary,$configDir.'/config.local.php'))throw new \RuntimeException('The final application configuration cannot be installed.');
            if(file_put_contents($configDir.'/installed.lock',gmdate('c')."\n",LOCK_EX)===false)throw new \RuntimeException('The installer lock cannot be written.');chmod($configDir.'/installed.lock',0600);
            @unlink($codeFile);@unlink($root.'/INSTALL-CODE.txt');
            return ['adminEmail'=>$adminEmail,'appUrl'=>$appUrl];
        }catch(\Throwable $error){@unlink($temporary);throw $error;}
    }

    private static function checkSmtp(array $options): void
    {
        $mail=new \PHPMailer\PHPMailer\PHPMailer(true);$mail->isSMTP();$mail->Host=$options['host'];$mail->Port=(int)$options['port'];$mail->SMTPAuth=$options['username']!=='';$mail->Username=$options['username'];$mail->Password=$options['password'];$mail->SMTPSecure=$options['encryption'];$mail->Timeout=10;
        try{if(!$mail->smtpConnect())throw new \RuntimeException();$mail->smtpClose();}catch(\Throwable $error){throw new \RuntimeException('SMTP connection failed. Check the host, port, encryption, username, password, and server network access.',0,$error);}
    }
    private static function port(mixed $value,string $label): int {$port=filter_var($value,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>65535]]);if($port===false)throw new \RuntimeException($label.' is invalid.');return $port;}
    private static function plain(array $input,string $key,string $label,int $max,?string $pattern=null): string {$value=trim((string)($input[$key]??''));if($value===''||strlen($value)>$max||str_contains($value,"\0")||($pattern&&!preg_match($pattern,$value)))throw new \RuntimeException($label.' is invalid.');return $value;}
    private static function optional(array $input,string $key,string $label,int $max): string {$value=(string)($input[$key]??'');if(strlen($value)>$max||str_contains($value,"\0"))throw new \RuntimeException($label.' is invalid.');return $value;}
    private static function escape(string $value): string {return htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
    private static function form(string $error='',array $old=[]): never
    {
        $v=fn(string $key)=>self::escape((string)($old[$key]??''));$message=$error!==''?'<p class="error">'.self::escape($error).'</p>':'';
        http_response_code($error===''?200:400);header('Content-Type: text/html; charset=utf-8');echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Install ThesisLink</title><style>body{margin:0;background:#eef1ef;color:#18211c;font:15px system-ui}.shell{max-width:900px;margin:32px auto;padding:0 16px}.card{background:#fff;border:1px solid #d8ded9;border-radius:8px;padding:24px}h1{color:#0f5b36;margin-top:0}fieldset{border:0;border-top:1px solid #d8ded9;margin:22px 0 0;padding:18px 0 0}legend{font-weight:700;padding-right:12px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}label{display:grid;gap:6px;font-weight:600}input,select{box-sizing:border-box;width:100%;min-height:42px;border:1px solid #aeb9b1;border-radius:5px;padding:9px 11px;font:inherit}.full{grid-column:1/-1}.error{padding:12px;background:#fff0f0;border:1px solid #d88;color:#8b1717;border-radius:5px}button{border:0;border-radius:5px;background:#12653d;color:#fff;padding:12px 18px;font-weight:700;cursor:pointer}@media(max-width:650px){.grid{grid-template-columns:1fr}.full{grid-column:auto}}</style></head><body><main class="shell"><form class="card" method="post" action="/setup" autocomplete="off"><h1>Install ThesisLink</h1><p>Use the one-time code from INSTALL-CODE.txt. Installation is allowed only with an empty database.</p>'.$message.'<fieldset><legend>Installation</legend><div class="grid"><label class="full">Installation code<input required name="installationCode" type="password" placeholder="TL-7K9M-2Q4X"></label><label class="full">Application URL<input required name="appUrl" placeholder="https://thesislink.isuc-ccsict.com" value="'.$v('appUrl').'"></label></div></fieldset><fieldset><legend>MySQL database</legend><div class="grid"><label>Host<input required name="databaseHost" value="'.$v('databaseHost').'" placeholder="127.0.0.1"></label><label>Port<input required name="databasePort" value="'.($v('databasePort')?:'3306').'" inputmode="numeric" placeholder="3306"></label><label>Database<input required name="databaseName" value="'.$v('databaseName').'" placeholder="thesislink"></label><label>Username<input required name="databaseUsername" value="'.$v('databaseUsername').'" placeholder="thesislink_app"></label><label class="full">Password<input name="databasePassword" type="password" placeholder="Database@2026"></label></div></fieldset><fieldset><legend>Cloudflare R2</legend><div class="grid"><label class="full">Endpoint<input required name="r2Endpoint" value="'.$v('r2Endpoint').'" placeholder="https://1234567890abcdef.r2.cloudflarestorage.com"></label><label>Bucket<input required name="r2Bucket" value="'.$v('r2Bucket').'" placeholder="thesislink"></label><label>Access key<input required name="r2AccessKey" value="'.$v('r2AccessKey').'" placeholder="0123456789ABCDEF"></label><label class="full">Secret key<input required name="r2SecretKey" type="password" placeholder="R2Secret@2026"></label></div></fieldset><fieldset><legend>Email and Google</legend><div class="grid"><label>SMTP host<input required name="mailHost" value="'.$v('mailHost').'" placeholder="smtp.resend.com"></label><label>SMTP port<input required name="mailPort" value="'.($v('mailPort')?:'587').'" inputmode="numeric" placeholder="587"></label><label>Encryption<select name="mailEncryption"><option value="tls">TLS</option><option value="ssl">SSL</option></select></label><label>From address<input required name="mailFrom" type="email" value="'.$v('mailFrom').'" placeholder="noreply@thesislink.isuc-ccsict.com"></label><label>SMTP username<input name="mailUsername" value="'.$v('mailUsername').'" placeholder="resend"></label><label>SMTP password<input name="mailPassword" type="password" placeholder="SmtpKey@2026"></label><label class="full">Google OAuth client ID<input required name="googleClientId" value="'.$v('googleClientId').'" placeholder="1234567890-thesislink.apps.googleusercontent.com"></label></div></fieldset><fieldset><legend>First administrator</legend><div class="grid"><label>Name<input required name="adminName" value="'.$v('adminName').'" placeholder="Juan Dela Cruz"></label><label>Email<input required name="adminEmail" type="email" value="'.$v('adminEmail').'" placeholder="juan.delacruz@isu.edu.ph"></label><label class="full">Password<input required name="adminPassword" type="password" minlength="8" maxlength="20" placeholder="Admin@2026"></label></div></fieldset><button type="submit">Install ThesisLink</button></form></main></body></html>';exit;
    }
    private static function page(string $title,string $message,string $href,int $status): never {http_response_code($status);header('Content-Type: text/html; charset=utf-8');echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.self::escape($title).'</title><body style="font:16px system-ui;max-width:680px;margin:48px auto;padding:16px"><h1>'.self::escape($title).'</h1><p>'.self::escape($message).'</p><p><a href="'.self::escape($href).'">Continue</a></p></body></html>';exit;}
}
