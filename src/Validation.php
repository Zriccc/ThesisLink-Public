<?php
declare(strict_types=1);
namespace ThesisLink;

final class Validation
{
    public static function text(mixed $v, string $label, int $max, bool $required=true, bool $multiline=false): string
    {
        if(!is_string($v) || mb_strlen($v)>$max || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x{200b}-\x{200f}\x{202a}-\x{202e}\x{2066}-\x{2069}\x{feff}]/u',$v) || (!$multiline&&preg_match('/[\r\n\t]/',$v))) Http::fail(400,"Enter a valid $label.");
        $v=trim(\Normalizer::normalize($v,\Normalizer::FORM_C));
        if($multiline) $v=trim(preg_replace('/\n{3,}/',"\n\n",implode("\n",array_map(fn($line)=>trim(preg_replace('/[\t \x{00a0}]+/u',' ',$line)),preg_split('/\r\n?|\n/',$v)))));
        if($required && $v==='') Http::fail(400,"Enter a valid $label.");
        return $v;
    }
    public static function email(mixed $v, bool $institutional=false): string
    {
        $v=strtolower(self::text($v,'email',254));
        if(!filter_var($v,FILTER_VALIDATE_EMAIL)||($institutional&&!str_ends_with($v,'@isu.edu.ph'))) Http::fail(400,$institutional?'Use your @isu.edu.ph email address.':'Enter a valid email address.');
        return $v;
    }
    public static function password(mixed $v): string
    {
        $length=is_string($v)?strlen(mb_convert_encoding($v,'UTF-16LE','UTF-8'))/2:0;
        if(!is_string($v)||$length<8||$length>20||str_contains($v,"\0")||!preg_match('/[A-Z]/',$v)||!preg_match('/[0-9]/',$v)||!preg_match('/[^A-Za-z0-9\s]/',$v)) Http::fail(400,'Use 8–20 characters with an uppercase letter, number, and symbol.');
        return $v;
    }
    public static function uuid(mixed $v): string { if(!is_string($v)||!preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i',$v)) Http::fail(400,'Invalid identifier.'); return strtolower($v); }
    public static function canonical(string $v): string { return mb_strtolower(trim(preg_replace('/\s+/u',' ',\Normalizer::normalize($v,\Normalizer::FORM_KC))),'UTF-8'); }
    public static function metadata(mixed $data): array
    {
        if(!is_array($data)) Http::fail(400,'Enter thesis information.');
        $title=self::text($data['title']??null,'title',500);$authors=self::text($data['authors']??null,'authors',1000);$adviser=self::text($data['adviser']??null,'adviser',120);
        if(mb_strlen($title)<5||!preg_match('/[\pL\pN].*[\pL\pN]/u',$title)||preg_match('/[@#$%^*_=~{}\[\]\\\\|!]{3,}/u',$title)) Http::fail(400,'Enter a clear thesis title.');
        if(!preg_match('/\A[\pL\pM .,“”\x{2019}\x{2018}\x{0027}\-;]+\z/u',$authors)||!preg_match('/\A[\pL\pM .,“”\x{2019}\x{2018}\x{0027}\-]+\z/u',$adviser)) Http::fail(400,'Enter valid author and adviser names.');
        $names=array_map('trim',explode(';',$authors));$keys=array_map([self::class,'canonical'],$names);
        if(count($names)>20||in_array('',$names,true)||count(array_unique($keys))!==count($keys)) Http::fail(400,'Enter 1–20 distinct authors separated by semicolons.');
        foreach($names as $name) if(mb_strlen($name)>120) Http::fail(400,'Author names must be at most 120 characters.');
        $course=$data['course']??'';$year=(string)($data['year']??'');
        if(!in_array($course,['BSIT','BSCS','BSDSA'],true)||!preg_match('/\A\d{4}\z/',$year)||(int)$year<2010||(int)$year>(int)gmdate('Y')) Http::fail(400,'Choose a valid program and publication year.');
        $abstract=self::text($data['abstract']??null,'abstract',20000,true,true);preg_match_all('/[\pL\pN]+/u',$abstract,$words);
        if(mb_strlen($abstract)<30||count($words[0])<5) Http::fail(400,'Abstract must contain at least 5 words and 30 characters.');
        $keywords=preg_split('/[,;]/',self::text($data['keywords']??null,'keywords',1000));$keywords=array_map('trim',$keywords);
        if(count($keywords)>5) Http::fail(400,'Enter up to 5 keywords.');
        foreach($keywords as $word) if($word===''||mb_strlen($word)>80||!preg_match('/[\pL\pN]/u',$word)||!preg_match('/\A[\pL\pM\pN\s+#&\/().:\x{0027}\x{2019}_%\-]+\z/u',$word)) Http::fail(400,'Enter valid keywords.');
        sort($keys,SORT_STRING);
        return ['title'=>$title,'names'=>$names,'adviser_name'=>$adviser,'course'=>$course,'publication_year'=>(int)$year,'abstract'=>$abstract,'keywords'=>implode(', ',$keywords),
            'duplicate_title_hash'=>hash('sha256',self::canonical($title)),'duplicate_authors_hash'=>hash('sha256',implode("\x1f",$keys)),'duplicate_abstract_hash'=>hash('sha256',self::canonical($abstract))];
    }
}
