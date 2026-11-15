<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
$app=require dirname(__DIR__).'/bootstrap.php';
$result=(new \ThesisLink\Maintenance($app['db'],$app['mail'],$app['config']))->run(in_array('--cleanup-r2',$argv,true));
echo 'Mail delivered: '.$result['mailDelivered'].PHP_EOL;
echo 'Expired records removed: '.array_sum($result['expired']).PHP_EOL;
if(in_array('--cleanup-r2',$argv,true))echo 'R2 cleanup: '.json_encode($result['r2'],JSON_THROW_ON_ERROR).PHP_EOL;
