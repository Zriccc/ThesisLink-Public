<?php
declare(strict_types=1);
namespace ThesisLink;

final class Auth
{
    private bool $secure;
    private string $cookie;
    public function __construct(private Db $db, private array $config, private Mailer $mail)
    {
        $this->secure=str_starts_with($config['app_url'],'https://');$this->cookie=$this->secure?'__Host-thesislink-session':'thesislink-session';
    }
    public function identity(): ?array
    {
        $token=$_COOKIE[$this->cookie]??'';if(!is_string($token)||!preg_match('/\A[a-f0-9]{64}\z/',$token))return null;
        $row=$this->db->one('SELECT u.*,s.expires_at AS session_expires_at,s.purpose AS session_purpose FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP()',[hash('sha256',$token)]);
        if(!$row||!$this->allowed($row))return null;return $row;
    }
    private function allowed(array $u): bool
    {
        return $u['email_verified_at']!==null && !(bool)$u['graduated'] && ($u['role']!=='student'||($u['expires_at']!==null&&strtotime($u['expires_at'].' UTC')>time()));
    }
    public function requireUser(?array $roles=null): array
    {
        $u=$this->identity();
        if(!$u || (bool)$u['must_change_password'] || ($u['session_purpose']??'normal')!=='normal' || ($roles&&!in_array($u['role'],$roles,true))) Http::fail(403,'Access denied.');
        return $u;
    }
    public function publicUser(array $u): array
    {
        $extensions=$this->db->all('SELECT * FROM account_extensions WHERE user_id=? ORDER BY approved_at',[$u['id']]);
        return ['id'=>$u['id'],'email'=>$u['email'],'name'=>$u['name'],'role'=>$u['role'],'registeredAt'=>Http::iso($u['registered_at']),'expiresAt'=>$u['role']==='student'?Http::iso($u['expires_at']):null,'graduated'=>(bool)$u['graduated'],'mustChangePassword'=>(bool)$u['must_change_password'],'gmail'=>$u['gmail']??'','program'=>$u['program']??'','status'=>'registered','sessionExpiresAt'=>Http::iso($u['session_expires_at']??null),
            'extensions'=>array_map(fn($x)=>['requestedInPerson'=>(bool)$x['requested_in_person'],'notGraduatedConfirmed'=>(bool)$x['not_graduated_confirmed'],'previousExpiry'=>Http::iso($x['previous_expiry']),'expiresAt'=>Http::iso($x['expires_at']),'approvedAt'=>Http::iso($x['approved_at']),'approvedBy'=>$x['approved_by_email']],$extensions)];
    }
    private function login(array $u, string $purpose='normal'): array
    {
        if(!$this->allowed($u))Http::fail(403,'This account cannot sign in. Contact the administrator.');
        $token=bin2hex(random_bytes(32));$expires=gmdate('Y-m-d H:i:s',time()+1800);
        $this->db->transaction(function()use($u,$token,$expires,$purpose){
            $this->db->one('SELECT id FROM users WHERE id=? FOR UPDATE',[$u['id']]);
            $this->db->run('DELETE FROM user_sessions WHERE user_id=?',[$u['id']]);
            $this->db->run('INSERT INTO user_sessions (token_hash,user_id,expires_at,purpose) VALUES (?,?,?,?)',[hash('sha256',$token),$u['id'],$expires,$purpose]);
        });
        Http::cookie($this->cookie,$token,time()+1800,$this->secure);$u['session_expires_at']=$expires;
        return $this->publicUser($u);
    }
    private function logout(): void
    {
        $token=$_COOKIE[$this->cookie]??'';
        if(is_string($token))$this->db->run('DELETE FROM user_sessions WHERE token_hash=?',[hash('sha256',$token)]);
        Http::cookie($this->cookie,'',time()-3600,$this->secure);
    }
    private function token(array $u, string $purpose): void
    {
        $token=bin2hex(random_bytes(32));$seconds=$purpose==='reset_password'?3600:86400;
        $this->db->run('UPDATE auth_tokens SET consumed_at=UTC_TIMESTAMP() WHERE user_id=? AND purpose=? AND consumed_at IS NULL',[$u['id'],$purpose]);
        $this->db->run('INSERT INTO auth_tokens (token_hash,user_id,purpose,expires_at) VALUES (?,?,?,?)',[hash('sha256',$token),$u['id'],$purpose,gmdate('Y-m-d H:i:s',time()+$seconds)]);
        $url=$this->config['app_url'].'/api/auth/confirm?token_hash='.$token.'&type='.($purpose==='verify_email'?'signup':'recovery');
        $verification=$purpose==='verify_email';
        $subject=$verification?'Verify your ThesisLink account':'Reset your ThesisLink password';
        $heading=$verification?'Verify your email':'Reset your password';
        $intro=$verification?'Confirm your ISU email address to finish creating your ThesisLink account.':'We received a request to reset the password for your ThesisLink account.';
        $action=$verification?'Verify email':'Reset password';
        $expiry=$verification?'This verification link expires in 24 hours.':'This password-reset link expires in 1 hour.';
        $body="$intro\n\n$action: $url\n\n$expiry\nIf you did not request this, ignore this message.";
        $safeUrl=htmlspecialchars($url,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
        $html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f1f4f2;color:#18211c;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f4f2;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d8ded9;border-radius:8px;overflow:hidden"><tr><td style="background:#115c36;padding:22px 28px;color:#ffffff;font-size:24px;font-weight:700">ThesisLink</td></tr><tr><td style="padding:32px 28px"><h1 style="margin:0 0 16px;color:#123c28;font-size:24px;line-height:1.3">'.$heading.'</h1><p style="margin:0 0 24px;font-size:16px;line-height:1.6">'.$intro.'</p><p style="margin:0 0 24px"><a href="'.$safeUrl.'" style="display:inline-block;background:#12653d;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:13px 22px;border-radius:5px">'.$action.'</a></p><p style="margin:0 0 8px;color:#526158;font-size:14px;line-height:1.5">'.$expiry.'</p><p style="margin:0;color:#526158;font-size:14px;line-height:1.5">If you did not request this, you can safely ignore this email.</p></td></tr><tr><td style="border-top:1px solid #e1e6e2;padding:18px 28px;color:#66736b;font-size:12px">CCSICT · Isabela State University – Cabagan Campus</td></tr></table></td></tr></table></body></html>';
        $this->mail->queue($u['email'],$subject,$body,$html);
    }
    private function google(array $body): array
    {
        $id=$this->config['google_client_id']??'';if($id==='')Http::fail(503,'Google sign-in is not configured.');
        $credential=Validation::text($body['credential']??null,'Google credential',8192);
        $nonce=Validation::text($body['nonce']??null,'Google nonce',128);
        if(!preg_match('/\A[A-Za-z0-9_-]{16,128}\z/',$nonce))Http::fail(400,'Invalid Google security nonce.');
        try{$client=new \Google\Client(['client_id'=>$id]);$claims=$client->verifyIdToken($credential);}catch(\Throwable){$claims=false;}
        if(!$claims||!($claims['email_verified']??false)||!isset($claims['nonce'])||!hash_equals(hash('sha256',$nonce),(string)$claims['nonce']))Http::fail(401,'Google sign-in could not be completed.');
        $email=Validation::email($claims['email']??null,true);
        if(($claims['hd']??'')!=='isu.edu.ph'||!isset($claims['sub']))Http::fail(403,'Only institutional Google accounts can sign in.');
        $u=$this->db->transaction(function()use($claims,$email,$credential){
            $key=hash('sha256',$credential);if($this->db->one('SELECT token_hash FROM oauth_replays WHERE token_hash=?',[$key]))Http::fail(401,'This Google sign-in was already used.');
            $this->db->run('INSERT INTO oauth_replays (token_hash,expires_at) VALUES (?,?)',[$key,gmdate('Y-m-d H:i:s',(int)$claims['exp'])]);
            $u=$this->db->one('SELECT * FROM users WHERE email=? FOR UPDATE',[$email]);
            if($u){if($u['google_subject']!==null&&!hash_equals($u['google_subject'],(string)$claims['sub']))Http::fail(403,'Google identity does not match this account.');
                $this->db->run('UPDATE users SET google_subject=?,email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP()) WHERE id=?',[$claims['sub'],$u['id']]);
            }else{
                $userId=Db::uuid();$name=Validation::text($claims['name']??strstr($email,'@',true),'name',120);
                $this->db->run("INSERT INTO users (id,email,name,role,google_subject,email_verified_at,expires_at) VALUES (?,?,?,'student',?,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR))",[$userId,$email,$name,$claims['sub']]);
                $u=['id'=>$userId,'name'=>$name];$this->db->log('registered',$u,$email);
            }
            return $this->db->one('SELECT * FROM users WHERE id=?',[$u['id']]);
        });
        return $this->login($u);
    }
    public function route(string $action, string $method, array $body): never
    {
        if($method==='GET'&&$action==='session')Http::json(['user'=>($u=$this->identity())?$this->publicUser($u):null]);
        if($method==='GET'&&$action==='google/config'){
            $id=$this->config['google_client_id']??'';if($id==='')Http::fail(503,'Google sign-in is not configured.');Http::json(['clientId'=>$id]);
        }
        if($method==='GET'&&$action==='confirm'){
            $token=$_GET['token_hash']??'';$type=($_GET['type']??'')==='signup'?'verify_email':(($_GET['type']??'')==='recovery'?'reset_password':'');
            if(!is_string($token)||!preg_match('/\A[a-f0-9]{64}\z/',$token)||$type==='')Http::redirect('/pages/auth/index.html?error=confirmation');
            $u=$this->db->transaction(function()use($token,$type){
                $row=$this->db->one('SELECT * FROM auth_tokens WHERE token_hash=? AND purpose=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[hash('sha256',$token),$type]);
                if(!$row)return null;$this->db->run('UPDATE auth_tokens SET consumed_at=UTC_TIMESTAMP() WHERE token_hash=?',[$row['token_hash']]);
                if($type==='verify_email')$this->db->run('UPDATE users SET email_verified_at=UTC_TIMESTAMP() WHERE id=?',[$row['user_id']]);
                return $this->db->one('SELECT * FROM users WHERE id=?',[$row['user_id']]);
            });
            if(!$u)Http::redirect('/pages/auth/index.html?error=confirmation');
            if($type==='reset_password'){$this->login($u,'password_reset');Http::redirect('/pages/auth/index.html?recovery=1');}
            Http::redirect('/pages/auth/index.html?verified=1');
        }
        if($method==='POST'&&in_array($action,['login','register','recover','google'],true)){
            $this->db->throttle('auth-ip:'.($_SERVER['REMOTE_ADDR']??'local'),30,900);
            if($action!=='google')$this->db->throttle('auth-account:'.$action.':'.strtolower((string)($body['email']??'')),10,900);
        }
        if($method==='POST'&&$action==='login'){
            $email=Validation::email($body['email']??null);$password=$body['password']??'';$u=$this->db->one('SELECT * FROM users WHERE email=?',[$email]);
            // Run a password hash check for absent accounts as well.
            $valid=is_string($password)&&password_verify($password,$u['password_hash']??'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
            if(!$u||!$valid||!$this->allowed($u))Http::fail(401,'Sign-in failed. Check your credentials and verify your email.');
            Http::json(['user'=>$this->login($u)]);
        }
        if($method==='POST'&&$action==='google')Http::json(['user'=>$this->google($body)]);
        if($method==='POST'&&$action==='register'){
            if(($body['acceptedTerms']??false)!==true)Http::fail(400,'Read and accept the Terms and Privacy Policy before registering.');
            $email=Validation::email($body['email']??null,true);$name=Validation::text($body['name']??null,'name',120);$password=Validation::password($body['password']??null);
            $this->db->transaction(function()use($email,$name,$password){
                if($this->db->one('SELECT id FROM users WHERE email=?',[$email]))return;
                $u=['id'=>Db::uuid(),'email'=>$email,'name'=>$name];
                $this->db->run("INSERT INTO users (id,email,name,password_hash,role,expires_at,terms_accepted_at) VALUES (?,?,?,?,'student',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR),UTC_TIMESTAMP())",[$u['id'],$email,$name,password_hash($password,PASSWORD_DEFAULT)]);
                $this->token($u,'verify_email');$this->db->log('registered',$u,$email);
            });
            $this->mail->attemptDelivery();
            Http::json(['message'=>'Check your email to verify your account before signing in.']);
        }
        if($method==='POST'&&$action==='recover'){
            $email=Validation::email($body['email']??null);$u=$this->db->one('SELECT * FROM users WHERE email=?',[$email]);
            if($u&&$this->allowed($u))$this->db->transaction(fn()=> $this->token($u,'reset_password'));
            $this->mail->attemptDelivery();
            Http::json(['message'=>'If the account exists, a password reset email will arrive shortly. Check your Spam or Junk folder.']);
        }
        if($method==='POST'&&$action==='logout'){$this->logout();Http::json(['ok'=>true]);}
        if($method==='POST'&&$action==='session/activity'){
            $u=$this->requireUser();$activity=$body['activityAt']??'';$time=is_string($activity)?strtotime($activity):false;
            if(!$time||$time>time()+60||$time<time()-360)Http::fail(400,'Invalid session activity.');
            $expires=gmdate('Y-m-d H:i:s',time()+1800);$hash=hash('sha256',$_COOKIE[$this->cookie]);
            $count=$this->db->run('UPDATE user_sessions SET last_seen_at=UTC_TIMESTAMP(),expires_at=? WHERE token_hash=? AND expires_at>UTC_TIMESTAMP()',[$expires,$hash])->rowCount();
            if(!$count)Http::fail(401,'Sign in again.');Http::cookie($this->cookie,$_COOKIE[$this->cookie],time()+1800,$this->secure);$u['session_expires_at']=$expires;Http::json(['user'=>$this->publicUser($u)]);
        }
        if($method==='POST'&&in_array($action,['password','change-password'],true)){
            $u=$this->identity();if(!$u)Http::fail(401,'Open a valid reset link or sign in first.');
            if($action==='password'&&!(bool)$u['must_change_password']&&($u['session_purpose']??'')!=='password_reset')Http::fail(403,'Use the password-change form.');
            if($action==='change-password'){ $this->requireUser(); if(!is_string($body['currentPassword']??null)||!password_verify($body['currentPassword'],$u['password_hash']??''))Http::fail(401,'Your current password is incorrect.'); }
            $password=Validation::password($body['password']??null);
            $this->db->transaction(function()use($u,$password){
                $this->db->run('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$u['id']]);
                $this->db->run('DELETE FROM user_sessions WHERE user_id=?',[$u['id']]);$this->db->run('UPDATE auth_tokens SET consumed_at=UTC_TIMESTAMP() WHERE user_id=? AND consumed_at IS NULL',[$u['id']]);
            });$this->logout();Http::json(['message'=>'Password updated. Sign in with your new password.']);
        }
        if($method==='GET'&&in_array($action,['advisers','panel-members'],true)){
            $this->requireUser();$rows=$this->db->all("SELECT id,name,role FROM users WHERE role='faculty' AND graduated=0 ORDER BY name");Http::json([$action==='advisers'?'advisers':'members'=>$rows]);
        }
        if($method==='POST'&&$action==='maintenance'){
            $this->requireUser(['admin']);$cleanup=($body['cleanupR2']??false)===true;
            if($cleanup&&($this->config['enable_storage_cleanup']??false)!==true)Http::fail(409,'R2 cleanup remains disabled until hosting cutover is confirmed.');
            Http::json(['maintenance'=>(new Maintenance($this->db,$this->mail,$this->config))->run($cleanup)]);
        }
        if($action==='users'||str_starts_with($action,'users/'))$this->admin($action,$method,$body);
        Http::fail(404,'Endpoint not found.');
    }
    private function admin(string $action,string $method,array $body): never
    {
        $actor=$this->requireUser(['admin']);
        if($action==='users'&&$method==='GET')Http::json(['users'=>array_map(fn($u)=>$this->publicUser($u),$this->db->all('SELECT * FROM users ORDER BY registered_at DESC'))]);
        if($action==='users'&&$method==='POST'){
            $name=Validation::text($body['name']??null,'name',120);$email=Validation::email($body['email']??null);$pw=$body['password']??null;
            if(!is_string($pw)||strlen($pw)<8||strlen($pw)>20||str_contains($pw,"\0"))Http::fail(400,'Use an 8–20 character temporary password.');
            if($this->db->one('SELECT id FROM users WHERE email=?',[$email]))Http::fail(409,'Email is already registered.');
            $this->db->transaction(function()use($actor,$name,$email,$pw){$this->db->run("INSERT INTO users (id,email,name,role,password_hash,email_verified_at,must_change_password,created_by) VALUES (?,?,?,'faculty',?,UTC_TIMESTAMP(),1,?)",[Db::uuid(),$email,$name,password_hash($pw,PASSWORD_DEFAULT),$actor['id']]);$this->db->log('created faculty account',$actor,$email);});Http::json(['ok'=>true]);
        }
        if(preg_match('~\Ausers/([^/]+)/(extend|delete)\z~',$action,$m)&&$method==='POST'){
            $id=Validation::uuid($m[1]);
            $this->db->transaction(function()use($actor,$body,$id,$m){
                $u=$this->db->one('SELECT * FROM users WHERE id=? FOR UPDATE',[$id]);if(!$u)Http::fail(404,'Account not found.');
                if($m[2]==='delete'){
                    if($u['id']===$actor['id']||!in_array($u['role'],['student','faculty'],true))Http::fail(400,'This account cannot be removed.');
                    $this->db->run('DELETE FROM users WHERE id=?',[$id]);$this->db->log('deleted graduated student account',$actor,$u['email']);
                }else{
                    $expiry=$body['expiresAt']??null;$when=is_string($expiry)?strtotime($expiry):false;
                    if($u['role']!=='student'||(bool)$u['graduated']||!$when||$when<=max(time(),strtotime($u['expires_at'].' UTC'))||($body['extension']['requestedInPerson']??false)!==true||($body['extension']['notGraduatedConfirmed']??false)!==true)Http::fail(400,'This account is not eligible for the requested extension.');
                    $date=gmdate('Y-m-d H:i:s',$when);$this->db->run('INSERT INTO account_extensions (user_id,previous_expiry,expires_at,requested_in_person,not_graduated_confirmed,approved_at,approved_by,approved_by_email) VALUES (?,?,?,1,1,UTC_TIMESTAMP(),?,?)',[$id,$u['expires_at'],$date,$actor['id'],$actor['email']]);
                    $this->db->run('UPDATE users SET expires_at=? WHERE id=?',[$date,$id]);$this->db->log('extended account',$actor,$u['email']);
                }
            });Http::json(['ok'=>true]);
        }
        Http::fail(404,'Endpoint not found.');
    }
}
