<?php
declare(strict_types=1);
require_once __DIR__.'/src/Http.php';
if(!is_file(__DIR__.'/vendor/autoload.php')) \ThesisLink\Http::fail(503,'Install the PHP dependencies before starting ThesisLink.');
require_once __DIR__.'/vendor/autoload.php';
require_once __DIR__.'/src/Database.php';
$configFile=getenv('THESISLINK_CONFIG') ?: __DIR__.'/config/config.local.php';
if(!is_file($configFile)) \ThesisLink\Http::fail(503,'School hosting configuration is not installed.');
$config=require $configFile;
if(!is_array($config)||!preg_match('/\A[a-f0-9]{64}\z/',$config['app_secret']??'')) \ThesisLink\Http::fail(503,'Set a random 64-character hexadecimal application secret.');
\ThesisLink\Http::origin($config['app_url']??'');
$config['app_url']=rtrim($config['app_url'],'/');
if(!in_array(parse_url($config['app_url'],PHP_URL_PATH),[null,'','/'],true)) \ThesisLink\Http::fail(503,'Configure a domain or virtual host with this application at its root.');
if(($config['environment']??'production')==='production'&&!str_starts_with($config['app_url'],'https://')) \ThesisLink\Http::fail(503,'Production requires an HTTPS application URL.');
date_default_timezone_set('UTC');
$db=new \ThesisLink\Db(Database::connect($config['database']));
$mail=new \ThesisLink\Mailer($db,$config);
$auth=new \ThesisLink\Auth($db,$config,$mail);
return compact('config','db','mail','auth');
