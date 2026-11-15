<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
if(!class_exists(ZipArchive::class))throw new RuntimeException('Enable PHP zip for packaging.');
$root=dirname(__DIR__);foreach(['vendor/autoload.php','resources/index.html','public/js/shared/auth.js'] as $file)if(!is_file($root.'/'.$file))throw new RuntimeException('Run Composer install and the frontend build before packaging.');
$directory=$root.'/dist';if(!is_dir($directory))mkdir($directory,0700,true);$output=$directory.'/ThesisLink-Public-'.gmdate('Ymd-His').'.zip';
$zip=new ZipArchive();if($zip->open($output,ZipArchive::CREATE|ZipArchive::EXCL)!==true)throw new RuntimeException('Cannot create deployment archive.');
foreach(['bootstrap.php','database/schema.sql'] as $file)$zip->addFile($root.'/'.$file,$file);
$installCode=bin2hex(random_bytes(16));
$zip->addFromString('INSTALL-CODE.txt',"ThesisLink one-time installation code\n\n$installCode\n\nOpen /setup after extracting the package. Keep this code private and delete this file after installation.\n");
$zip->addFromString('config/install-code.php',"<?php\ndeclare(strict_types=1);\nreturn '".hash('sha256',$installCode)."';\n");
$vendorNoise=static function(string $relative):bool{
    $lower=strtolower($relative);$name=basename($lower);
    if(str_ends_with($lower,'.md')&&!str_starts_with($name,'license')&&!str_starts_with($name,'notice'))return true;
    foreach(['/test/','/tests/','/doc/','/docs/','/example/','/examples/','/.github/'] as $directory)if(str_contains($lower,$directory))return true;
    return in_array($name,['.gitattributes','.gitignore','phpunit.xml','phpunit.xml.dist'],true);
};
foreach(['src','public','resources','vendor'] as $folder){$iterator=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/'.$folder,FilesystemIterator::SKIP_DOTS));foreach($iterator as $file){if(!$file->isFile())continue;$relative=str_replace('\\','/',substr($file->getPathname(),strlen($root)+1));if($folder==='vendor'&&$vendorNoise($relative))continue;$zip->addFile($file->getPathname(),$relative);}}
foreach(['admin.php','check.php','import.php','maintenance.php'] as $file)$zip->addFile($root.'/scripts/'.$file,'scripts/'.$file);
$zip->close();echo $output.PHP_EOL;
