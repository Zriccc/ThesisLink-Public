<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
try{
    foreach(['pdo_mysql','intl','mbstring','openssl','gd','curl'] as $extension)if(!extension_loaded($extension))throw new RuntimeException('Missing PHP extension: '.$extension);
    $app=require dirname(__DIR__).'/bootstrap.php';
    foreach(['users','account_extensions','user_sessions','auth_tokens','theses','rate_limits','oauth_replays','mail_outbox','storage_cleanup','thesis_duplicate_warnings','thesis_authors','thesis_files','thesis_reviews','notifications','thesis_views','activity_logs'] as $table)$app['db']->one("SELECT COUNT(*) n FROM $table");
    foreach(['index.html','pages/admin/dashboard.html','pages/student/upload.html','pages/adviser/reports.html'] as $page)if(!is_file(dirname(__DIR__).'/resources/'.$page))throw new RuntimeException('Build the frontend resources first.');
    echo "PHP extensions, configuration, database tables, and protected frontend resources are present.\n";
    echo "SMTP delivery, Google credentials, real R2 access, and school-domain HTTPS still require live acceptance tests.\n";
}catch(Throwable $e){fwrite(STDERR,$e->getMessage().PHP_EOL);exit(1);}
