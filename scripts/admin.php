<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
$app=require dirname(__DIR__).'/bootstrap.php';
echo 'Admin email: ';$email=\ThesisLink\Validation::email(trim(fgets(STDIN)));
echo 'Admin display name: ';$name=\ThesisLink\Validation::text(trim(fgets(STDIN)),'name',120);
echo 'Admin password (input may be visible in this terminal): ';$password=\ThesisLink\Validation::password(rtrim(fgets(STDIN),"\r\n"));
$db=$app['db'];
if($db->one('SELECT id FROM users WHERE email=?',[$email]))throw new RuntimeException('Account exists. This command never overwrites or promotes an existing user.');
$db->run("INSERT INTO users (id,email,name,role,password_hash,email_verified_at) VALUES (?,?,?,'admin',?,UTC_TIMESTAMP())",[\ThesisLink\Db::uuid(),$email,$name,password_hash($password,PASSWORD_DEFAULT)]);
echo "Administrator created.\n";
