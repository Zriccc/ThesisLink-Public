<?php
declare(strict_types=1);
// Development: php -S 127.0.0.1:8080 -t public router.php
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(is_string($path)&&preg_match('~\A/(css|js|assets|vendor)/~',$path)&&!str_contains($path,'..')&&is_file(__DIR__.'/public/'.$path))return false;
require __DIR__.'/public/index.php';
