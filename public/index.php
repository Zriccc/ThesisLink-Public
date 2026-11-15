<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/src/Http.php';
use ThesisLink\Http;
use ThesisLink\HttpError;
header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');header('Referrer-Policy: same-origin');
header('Permissions-Policy: camera=(self), microphone=(), geolocation=()');
$path=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH);$method=$_SERVER['REQUEST_METHOD']??'GET';
if($path==='/setup'){
    $autoload=dirname(__DIR__).'/vendor/autoload.php';if(!is_file($autoload)){http_response_code(503);exit('The deployment package is incomplete. Composer dependencies are missing.');}
    require_once $autoload;\ThesisLink\Installer::handle(dirname(__DIR__));
}
try {
    $app=require dirname(__DIR__).'/bootstrap.php';extract($app);
    $storageOrigin=Http::origin($config['r2']['endpoint']);$bucket=$config['r2']['bucket'];$storageSources=$storageOrigin;
    if(preg_match('/\A[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\z/',$bucket))$storageSources.=' '.preg_replace('~://~','://'.$bucket.'.',$storageOrigin,1);
    header("Content-Security-Policy: default-src 'self'; base-uri 'self'; connect-src 'self' https://accounts.google.com $storageSources; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; frame-src 'self' data: blob: https://accounts.google.com; img-src 'self' data: blob: $storageSources; media-src 'self' blob:; object-src 'none'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; worker-src 'self' blob:");
    if(($config['environment']??'production')==='production')header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    if(!is_string($path)||str_contains($path,"\0")||str_contains($path,'..'))Http::fail(400,'Invalid path.');
    if($path==='/maintenance'){
        if($method!=='GET')Http::fail(405,'Method not allowed.');$auth->requireUser(['admin']);
        header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ThesisLink Maintenance</title><style>body{margin:0;background:#eef1ef;color:#18211c;font:15px system-ui}.card{max-width:680px;margin:40px auto;background:#fff;border:1px solid #d8ded9;border-radius:8px;padding:24px}h1{color:#0f5b36}button{background:#12653d;color:#fff;border:0;border-radius:5px;padding:11px 16px;font-weight:700}label{display:block;margin:18px 0}pre{white-space:pre-wrap;background:#f4f6f4;padding:14px;border-radius:5px;min-height:42px}</style></head><body><main class="card"><h1>Maintenance</h1><p>Deliver queued email and remove expired sessions, tokens, replay markers, and rate-limit records.</p><label><input id="cleanup" type="checkbox"> Also process deferred R2 deletion (available only after cutover is enabled)</label><button id="run" type="button">Run maintenance</button><pre id="result" aria-live="polite"></pre><p><a href="/pages/admin/dashboard.html">Return to dashboard</a></p></main><script>document.getElementById("run").addEventListener("click",async()=>{const button=document.getElementById("run"),result=document.getElementById("result");button.disabled=true;result.textContent="Running…";try{const response=await fetch("/api/auth/maintenance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cleanupR2:document.getElementById("cleanup").checked})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Maintenance failed.");result.textContent=JSON.stringify(data.maintenance,null,2)}catch(error){result.textContent=error.message}finally{button.disabled=false}});</script></body></html>';exit;
    }
    if(str_starts_with($path,'/api/')){
        $db->throttle('api:'.($_SERVER['REMOTE_ADDR']??'local'),300,60);$body=[];
        if(in_array($method,['POST','PATCH','PUT','DELETE'],true)){Http::sameOrigin($config);$body=Http::body();}
        if(str_starts_with($path,'/api/auth/'))$auth->route(substr($path,10),$method,$body);
        if(str_starts_with($path,'/api/repository/'))(new \ThesisLink\Repository($db,$auth,new \ThesisLink\Storage($config['r2']),$config))->route(substr($path,16),$method,$body);
        Http::fail(404,'Endpoint not found.');
    }
    if($method!=='GET'&&$method!=='HEAD')Http::fail(405,'Method not allowed.');$resource=null;
    if($path==='/'||preg_match('~\A/thesis/[a-f0-9-]{36}\z~i',$path))$resource='index.html';
    elseif($path==='/pages/auth/index.html')$resource='pages/auth/index.html';
    elseif(preg_match('~\A/pages/(admin|adviser|student|account)/([a-z-]+\.html)\z~',$path,$m)){
        $u=$auth->identity();if(!$u)Http::redirect('/pages/auth/index.html');
        if((bool)$u['must_change_password']||$u['session_purpose']==='password_reset')Http::redirect('/pages/auth/index.html?recovery=1');
        $role=$m[1]==='adviser'?'faculty':$m[1];
        if($role!=='account'&&$u['role']!==$role)Http::redirect(['admin'=>'/pages/admin/dashboard.html','faculty'=>'/pages/adviser/repository.html','student'=>'/pages/student/repository.html'][$u['role']]);
        $resource=ltrim($path,'/');
    }
    $file=$resource?dirname(__DIR__).'/resources/'.$resource:'';
    if(!$file||!is_file($file))Http::fail(404,'Page not found. Build frontend assets for a new installation.');
    header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');if($method!=='HEAD')readfile($file);
}catch(HttpError $e){Http::json(['error'=>$e->getMessage(),...$e->details],$e->status);}
catch(Throwable $e){error_log('ThesisLink: '.get_class($e).' '.$e->getMessage());Http::json(['error'=>'ThesisLink is temporarily unavailable. Check server configuration and logs.'],503);}
