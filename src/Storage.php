<?php
declare(strict_types=1);
namespace ThesisLink;

final class Storage
{
    public \Aws\S3\S3Client $client;
    public string $bucket;
    public function __construct(array $config, ?\Aws\S3\S3Client $client=null)
    {
        $this->bucket=$config['bucket'];
        $this->client=$client??new \Aws\S3\S3Client(['version'=>'latest','region'=>'auto','endpoint'=>$config['endpoint'],'use_path_style_endpoint'=>true,
            'credentials'=>['key'=>$config['access_key_id'],'secret'=>$config['secret_access_key']],
            'request_checksum_calculation'=>'when_required','response_checksum_validation'=>'when_required','http'=>['connect_timeout'=>5,'timeout'=>30]]);
    }
    public function sign(array $file, bool $upload=false): string
    {
        $options=['Bucket'=>$file['bucket']??$this->bucket,'Key'=>$file['object_key']];
        if($upload)$options['ContentType']=$file['mime_type'];
        else{$options['ResponseContentDisposition']='inline';$options['ResponseContentType']=$file['mime_type'];}
        $command=$this->client->getCommand($upload?'PutObject':'GetObject',$options);
        return (string)$this->client->createPresignedRequest($command,'+5 minutes')->getUri();
    }
    public function get(array $file, ?string $range=null): \Aws\Result
    {
        $args=['Bucket'=>$file['bucket']??$this->bucket,'Key'=>$file['object_key']];if($range!==null)$args['Range']=$range;
        return $this->client->getObject($args);
    }
    public function verify(array $file): string
    {
        $head=$this->client->headObject(['Bucket'=>$file['bucket']??$this->bucket,'Key'=>$file['object_key']]);
        if((int)$head['ContentLength']!==(int)$file['byte_size']||$head['ContentType']!==$file['mime_type'])Http::fail(400,'Uploaded file verification failed.');
        $bytes=(string)$this->get($file,'bytes=0-11')['Body'];
        $valid=match($file['mime_type']){
            'application/pdf'=>str_starts_with($bytes,'%PDF-'),
            'image/png'=>str_starts_with($bytes,"\x89PNG\r\n\x1a\n"),
            'image/jpeg'=>str_starts_with($bytes,"\xff\xd8\xff"),
            'image/webp'=>str_starts_with($bytes,'RIFF')&&substr($bytes,8,4)==='WEBP',default=>false};
        if(!$valid)Http::fail(400,'Uploaded file contents do not match the declared type.');
        return (string)($head['ETag']??'');
    }
    public function remove(array $file): void
    {
        $this->client->deleteObject(['Bucket'=>$file['bucket']??$this->bucket,'Key'=>$file['object_key']]);
    }
    public function check(): void
    {
        $this->client->headBucket(['Bucket'=>$this->bucket]);
    }
}
