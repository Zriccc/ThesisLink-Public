<?php
declare(strict_types=1);
require dirname(__DIR__).'/vendor/autoload.php';require dirname(__DIR__).'/src/Http.php';
$c=require getenv('THESISLINK_CONFIG');$d=$c['database'];
if(!preg_match('/\Athesislink_test_[a-z0-9_]+\z/',$d['name']))throw new RuntimeException('Tests require their own generated database name.');
$pdo=new PDO("mysql:host={$d['host']};port={$d['port']};charset=utf8mb4",$d['username'],$d['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec("CREATE DATABASE `{$d['name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");$pdo->exec("USE `{$d['name']}`");
$pdo->exec(file_get_contents(dirname(__DIR__).'/database/schema.sql'));$db=new ThesisLink\Db($pdo);
foreach(in_array('--empty',$argv,true)?[]:['admin','faculty','student','temporary','expired'] as $role){$accountRole=in_array($role,['temporary','expired'],true)?($role==='temporary'?'faculty':'student'):$role;
    $db->run('INSERT INTO users (id,email,name,role,password_hash,email_verified_at,expires_at,must_change_password) VALUES (?,?,?,?,?,UTC_TIMESTAMP(),?,?)',
        [ThesisLink\Db::uuid(),$role.'@isu.edu.ph',$role==='faculty'?'Sample Faculty':ucfirst($role),$accountRole,password_hash('Password1!',PASSWORD_DEFAULT),$accountRole==='student'?gmdate('Y-m-d H:i:s',time()+($role==='expired'?-60:86400)):null,(int)($role==='temporary')]);
}
echo "Isolated test schema and accounts initialized.\n";
