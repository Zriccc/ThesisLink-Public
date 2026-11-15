<?php
declare(strict_types=1);
namespace ThesisLink;

final class Repository
{
    public function __construct(private Db $db, private Auth $auth, private Storage $storage, private array $config) {}
    public function shape(array $row, bool $private=false): array
    {
        $id=$row['id'];$authors=$this->db->all('SELECT name FROM thesis_authors WHERE thesis_id=? ORDER BY position',[$id]);
        $parts=[];foreach($this->db->all('SELECT * FROM thesis_files WHERE thesis_id=?',[$id]) as $file)$parts[$file['category']]=['id'=>$file['id'],'name'=>$file['original_name'],'size'=>(int)$file['byte_size'],'type'=>$file['mime_type'],'ext'=>'.'.strtolower(pathinfo($file['original_name'],PATHINFO_EXTENSION)),'available'=>true];
        $review=$private?$this->db->one("SELECT remarks FROM thesis_reviews WHERE thesis_id=? AND decision='declined' ORDER BY created_at DESC LIMIT 1",[$id]):null;
        $warnings=$private?array_values(array_filter(array_column($this->db->all('SELECT warning FROM thesis_duplicate_warnings WHERE thesis_id=?',[$id]),'warning'),fn($warning)=>in_array($warning,['title','abstract'],true))):[];
        return ['id'=>$id,'title'=>$row['title'],'authors'=>implode('; ',array_column($authors,'name')),'adviser'=>$row['adviser_name']??'','course'=>$row['course'],'year'=>(int)$row['publication_year'],'abstract'=>$row['abstract'],'keywords'=>$row['keywords'],'status'=>$row['status'],'views'=>(int)$row['views'],'parts'=>$parts,'fileName'=>$parts['full']['name']??'','uploadedAt'=>Http::iso($row['published_at']??$row['submitted_at']),'submittedAt'=>Http::iso($row['submitted_at']),'uploadedBy'=>'','uploadedByName'=>$private?$row['submitted_by_name']:'','duplicateWarnings'=>$warnings,'declineRemarks'=>$review['remarks']??''];
    }
    private function thesis(string $id, bool $lock=false): array
    {
        $row=$this->db->one('SELECT * FROM theses WHERE id=?'.($lock?' FOR UPDATE':''),[Validation::uuid($id)]);
        if(!$row)Http::fail(404,'Thesis not found.');return $row;
    }
    private function files(string $id): array { return $this->db->all('SELECT * FROM thesis_files WHERE thesis_id=?',[$id]); }
    private function warnings(array $row, ?string $exclude=null): array
    {
        $warnings=[];
        foreach(['title','abstract'] as $type){$hash=$row['duplicate_'.$type.'_hash']??'';if($hash==='')continue;
            $sql="SELECT id FROM theses WHERE status IN ('pending','published') AND duplicate_{$type}_hash=?";$args=[$hash];
            if($exclude!==null){$sql.=' AND id<>?';$args[]=$exclude;}
            if($this->db->one($sql.' LIMIT 1',$args))$warnings[]=$type;
        }
        if(!in_array('title',$warnings,true)&&$this->hasSimilarTitle((string)($row['title']??''),$exclude))array_unshift($warnings,'title');
        return $warnings;
    }
    private function titleTerms(string $title): array
    {
        $parts=preg_split('/[^\pL\pN]+/u',Validation::canonical($title),-1,PREG_SPLIT_NO_EMPTY);
        $ignored=['a','an','the','of','for','and','in','on','to','with','using','web','based','system','repository','management','monitoring','information','technology','research','project','study','application','platform','mobile','online','digital','integrated','development','design'];
        return array_values(array_unique(array_diff($parts?:[],$ignored)));
    }
    private function hasSimilarTitle(string $title, ?string $exclude): bool
    {
        if($title==='')return false;$canonical=Validation::canonical($title);$terms=$this->titleTerms($title);
        $sql="SELECT id,title FROM theses WHERE status IN ('pending','published')";$args=[];
        if($exclude!==null){$sql.=' AND id<>?';$args[]=$exclude;}
        foreach($this->db->all($sql,$args) as $candidate){
            if(Validation::canonical((string)$candidate['title'])===$canonical)return true;
            $other=$this->titleTerms((string)$candidate['title']);$sharedTerms=array_intersect($terms,$other);$shared=count($sharedTerms);
            if(array_filter($sharedTerms,fn($term)=>mb_strlen($term)>=8))return true;
            if($shared>=2&&2*$shared/(count($terms)+count($other))>=0.75)return true;
        }
        return false;
    }
    private function saveWarnings(string $id,array $warnings): void
    {
        $this->db->run('DELETE FROM thesis_duplicate_warnings WHERE thesis_id=?',[$id]);
        foreach($warnings as $warning)$this->db->run('INSERT INTO thesis_duplicate_warnings (thesis_id,warning) VALUES (?,?)',[$id,$warning]);
    }
    private function metadata(string $id,array $data): void
    {
        $names=$data['names'];unset($data['names']);$sets=implode(',',array_map(fn($k)=>"$k=?",array_keys($data)));
        $this->db->run("UPDATE theses SET $sets,updated_at=UTC_TIMESTAMP() WHERE id=?",[...array_values($data),$id]);
        $this->db->run('DELETE FROM thesis_authors WHERE thesis_id=?',[$id]);
        foreach($names as $i=>$name)$this->db->run('INSERT INTO thesis_authors (thesis_id,name,canonical_name_hash,position) VALUES (?,?,?,?)',[$id,$name,hash('sha256',Validation::canonical($name)),$i+1]);
    }
    private function selectedFiles(mixed $input, bool $required): array
    {
        if(!is_array($input))Http::fail(400,'Choose valid files.');$files=[];
        foreach($input as $category=>$file){
            if(!in_array($category,['full','approval'],true)||!is_array($file))Http::fail(400,'Invalid file category.');
            $name=Validation::text($file['name']??null,'filename',255);$ext=strtolower(pathinfo($name,PATHINFO_EXTENSION));$type=$file['type']??'';$size=$file['size']??0;
            $types=['pdf'=>'application/pdf','png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','webp'=>'image/webp'];
            if(strpbrk($name,"/\\")!==false||($types[$ext]??null)!==$type||($category==='full'?$ext!=='pdf':$ext==='pdf')||!is_int($size)||$size<1||$size>($category==='full'?52428800:10485760))Http::fail(400,'Invalid file name, type, or size.');
            $files[]=['category'=>$category,'original_name'=>$name,'mime_type'=>$type,'byte_size'=>$size,'extension'=>$ext];
        }
        if($required&&(count($files)!==2||!isset($input['full'],$input['approval'])))Http::fail(400,'A thesis PDF and approval-sheet image are required.');return $files;
    }
    private function fileRow(array $file,array $thesis): array
    {
        $prefix=$file['category']==='full'?'Theses':'Approval-Sheet';
        return ['id'=>Db::uuid(),'thesis_id'=>$thesis['id'],'category'=>$file['category'],'bucket'=>$this->storage->bucket,
            'object_key'=>$prefix.'/'.$thesis['course'].'/'.$thesis['id'].'/'.Db::uuid().'.'.$file['extension'],
            'original_name'=>$file['original_name'],'mime_type'=>$file['mime_type'],'byte_size'=>$file['byte_size']];
    }
    private function insertFile(array $file): void
    {
        $this->db->run('INSERT INTO thesis_files ('.implode(',',array_keys($file)).') VALUES ('.implode(',',array_fill(0,count($file),'?')).')',array_values($file));
    }
    private function owner(array $row,array $u): void { if($u['role']!=='admin'&&$row['submitted_by']!==$u['id'])Http::fail(403,'Access denied.'); }
    private function queueDelete(array $file): void
    {
        $this->db->run('INSERT INTO storage_cleanup (id,bucket,object_key) VALUES (?,?,?)',[Db::uuid(),$file['bucket'],$file['object_key']]);
    }
    public function route(string $path,string $method,array $body): never
    {
        if($path==='theses'&&$method==='GET')Http::json(['theses'=>array_map(fn($r)=>$this->shape($r),$this->db->all("SELECT * FROM theses WHERE status='published' AND completed_at IS NOT NULL ORDER BY published_at DESC"))]);
        if($path==='submissions'&&$method==='GET'){
            $this->auth->requireUser(['admin']);Http::json(['submissions'=>array_map(fn($r)=>$this->shape($r,true),$this->db->all("SELECT * FROM theses WHERE status='pending' AND completed_at IS NOT NULL ORDER BY submitted_at DESC"))]);
        }
        if($path==='student-submissions'&&$method==='GET'){
            $u=$this->auth->requireUser(['student']);Http::json(['submissions'=>array_map(fn($r)=>$this->shape($r,true),$this->db->all('SELECT * FROM theses WHERE submitted_by=? AND completed_at IS NOT NULL ORDER BY submitted_at DESC',[$u['id']]))]);
        }
        if(preg_match('~\Astudent-submissions/([^/]+)\z~',$path,$m)&&$method==='GET'){
            $u=$this->auth->requireUser(['student']);$row=$this->thesis($m[1]);$this->owner($row,$u);if($row['status']!=='declined')Http::fail(404,'Declined submission not found.');Http::json(['submission'=>$this->shape($row,true)]);
        }
        if($path==='notifications'&&$method==='GET'){
            $u=$this->auth->requireUser(['student']);
            if(($_GET['summary']??'')==='1')Http::json(['unread'=>(int)$this->db->one('SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id=? AND read_at IS NULL',[$u['id']])['n']]);
            $rows=$this->db->all('SELECT n.*,t.title FROM notifications n JOIN theses t ON t.id=n.thesis_id WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT 100',[$u['id']]);
            Http::json(['notifications'=>array_map(fn($r)=>['id'=>$r['id'],'thesisId'=>$r['thesis_id'],'title'=>$r['title'],'type'=>$r['type'],'message'=>$r['message'],'createdAt'=>Http::iso($r['created_at']),'readAt'=>Http::iso($r['read_at'])],$rows)]);
        }
        if(preg_match('~\Anotifications/([^/]+)/read\z~',$path,$m)&&$method==='POST'){
            $u=$this->auth->requireUser(['student']);$id=Validation::uuid($m[1]);$r=$this->db->one('SELECT id FROM notifications WHERE id=? AND recipient_user_id=?',[$id,$u['id']]);if(!$r)Http::fail(404,'Notification not found.');
            $this->db->run('UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP()) WHERE id=? AND recipient_user_id=?',[$id,$u['id']]);Http::json(['ok'=>true,'readAt'=>Http::iso($this->db->one('SELECT read_at FROM notifications WHERE id=?',[$id])['read_at'])]);
        }
        if($path==='activity'){
            $u=$this->auth->requireUser(['admin']);
            if($method==='GET')Http::json(['activities'=>array_map(fn($r)=>['id'=>$r['id'],'type'=>$r['action'],'actor'=>$r['actor_name'],'subject'=>$r['subject'],'createdAt'=>Http::iso($r['created_at'])],$this->db->all('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 1000'))]);
            // Admin account actions are already recorded transactionally by Auth.
            if($method==='POST')Http::json(['ok'=>true]);
        }
        if(str_starts_with($path,'approval-sheets')&&$method==='GET')$this->approvals($path);
        if($path==='theses'&&$method==='POST'){
            $u=$this->auth->requireUser(['admin','student']);$data=Validation::metadata($body['metadata']??null);$files=$this->selectedFiles($body['files']??null,true);$id=Db::uuid();
            $result=$this->db->transaction(function()use($u,$data,$files,$id){
                $warnings=$this->warnings($data);$values=$data;unset($values['names']);$values=['id'=>$id,'submitted_by'=>$u['id'],'submitted_by_name'=>$u['name'],...$values];
                $this->db->run('INSERT INTO theses ('.implode(',',array_keys($values)).') VALUES ('.implode(',',array_fill(0,count($values),'?')).')',array_values($values));
                $this->metadata($id,$data);$this->saveWarnings($id,$warnings);$uploads=[];
                foreach($files as $file){$r=$this->fileRow($file,['id'=>$id,'course'=>$data['course']]);$this->insertFile($r);$uploads[]=['category'=>$r['category'],'url'=>$this->storage->sign($r,true)];}
                return ['id'=>$id,'uploads'=>$uploads,'duplicateWarnings'=>$warnings];
            });Http::json($result,201);
        }
        if(preg_match('~\Atheses/([^/]+)/(files|stream)/(full|approval)\z~',$path,$m)&&$method==='GET')$this->file($m[1],$m[3],$m[2]==='stream');
        if(preg_match('~\Atheses/([^/]+)/view\z~',$path,$m)&&$method==='POST'){
            $id=Validation::uuid($m[1]);$u=$this->auth->identity();$cookie='thesislink-viewer';$token=$_COOKIE[$cookie]??'';
            if(!is_string($token)||!preg_match('/\A[a-f0-9]{64}\z/',$token)){$token=bin2hex(random_bytes(32));Http::cookie($cookie,$token,time()+31536000,str_starts_with($this->config['app_url'],'https://'));}
            $hash=hash('sha256',$u?'user:'.$u['id']:'guest:'.$token);
            $result=$this->db->transaction(function()use($id,$hash){$r=$this->thesis($id,true);if($r['status']!=='published')Http::fail(404,'Thesis not found.');
                $count=$this->db->run('INSERT IGNORE INTO thesis_views (thesis_id,viewer_hash) VALUES (?,?)',[$id,$hash])->rowCount();
                if($count)$this->db->run('UPDATE theses SET views=views+1 WHERE id=?',[$id]);return ['counted'=>(bool)$count,'views'=>(int)$r['views']+$count];});Http::json($result);
        }
        if(preg_match('~\Atheses/([^/]+)/review\z~',$path,$m)&&$method==='POST'){$this->review($m[1],$body);}
        if(preg_match('~\Atheses/([^/]+)/resubmit\z~',$path,$m)&&$method==='POST'){$this->resubmit($m[1],$body);}
        if(preg_match('~\Atheses/([^/]+)/(complete|complete-resubmission)\z~',$path,$m)&&$method==='POST'){$this->complete($m[1],$m[2]==='complete-resubmission',$body);}
        if(preg_match('~\Atheses/([^/]+)\z~',$path,$m)){
            $u=$this->auth->requireUser($method==='PATCH'?['admin']:['admin','student']);$id=Validation::uuid($m[1]);
            if($method==='PATCH'){
                $data=Validation::metadata($body['metadata']??$body);$warnings=$this->db->transaction(function()use($id,$data,$u){$this->thesis($id,true);$warnings=$this->warnings($data,$id);$this->metadata($id,$data);$this->saveWarnings($id,$warnings);$this->db->log('edited',$u,$data['title']);return $warnings;});Http::json(['ok'=>true,'duplicateWarnings'=>$warnings]);
            }
            if($method==='DELETE'){
                $this->db->transaction(function()use($id,$u){$r=$this->thesis($id,true);$this->owner($r,$u);if($u['role']==='student'&&$r['status']!=='pending')Http::fail(403,'Only pending submissions can be removed.');
                    foreach($this->files($id) as $file)$this->queueDelete($file);$this->db->run('DELETE FROM theses WHERE id=?',[$id]);if($u['role']==='admin')$this->db->log('deleted',$u,$r['title']);});Http::json(['ok'=>true]);
            }
        }
        Http::fail(404,'Endpoint not found.');
    }
    private function resubmit(string $id,array $body): never
    {
        $u=$this->auth->requireUser(['student']);$data=Validation::metadata($body['metadata']??null);$files=$this->selectedFiles($body['files']??[],false);
        $result=$this->db->transaction(function()use($id,$u,$data,$files){$r=$this->thesis($id,true);$this->owner($r,$u);if($r['status']!=='declined')Http::fail(409,'Only declined submissions can be corrected.');
            $warnings=$this->warnings($data,$id);$this->metadata($id,$data);$this->db->run('UPDATE theses SET completed_at=NULL WHERE id=?',[$id]);$this->saveWarnings($id,$warnings);$uploads=[];
            foreach($files as $file){foreach($this->files($id) as $old)if($old['category']===$file['category']){$this->queueDelete($old);$this->db->run('DELETE FROM thesis_files WHERE id=?',[$old['id']]);}
                $new=$this->fileRow($file,['id'=>$id,'course'=>$data['course']]);$this->insertFile($new);$uploads[]=['category'=>$new['category'],'url'=>$this->storage->sign($new,true)];}
            return ['id'=>$id,'uploads'=>$uploads,'duplicateWarnings'=>$warnings];});Http::json($result);
    }
    private function complete(string $id,bool $resubmit,array $body): never
    {
        $u=$this->auth->requireUser($resubmit?['student']:['admin','student']);
        $r=$this->thesis($id);$this->owner($r,$u);$files=$this->files($id);
        if($r['status']!==($resubmit?'declined':'pending')||$r['completed_at']!==null)Http::fail(409,'Submission is not awaiting upload completion.');
        if(count($files)!==2)Http::fail(400,'Both thesis and approval files are required.');
        // Verify outside the database lock, then compare file revisions under lock.
        $etags=[];foreach($files as $f)$etags[$f['id']]=$this->storage->verify($f);
        $status=$this->db->transaction(function()use($id,$u,$resubmit,$body,$files,$etags){$row=$this->thesis($id,true);$current=$this->files($id);
            if($row['status']!==($resubmit?'declined':'pending')||$row['completed_at']!==null||array_column($current,'object_key','id')!==array_column($files,'object_key','id'))Http::fail(409,'Submission changed during verification.');
            $warnings=$this->warnings($row,$id);if($u['role']==='admin'&&$warnings&&($body['confirmDuplicate']??false)!==true)Http::fail(409,'Possible duplicate thesis information detected.',['code'=>'DUPLICATE_WARNING','duplicateWarnings'=>$warnings]);
            $this->saveWarnings($id,$warnings);foreach($etags as $fileId=>$etag)$this->db->run('UPDATE thesis_files SET etag=? WHERE id=?',[$etag,$fileId]);
            $status=$u['role']==='admin'?'published':'pending';$this->db->run('UPDATE theses SET status=?,completed_at=UTC_TIMESTAMP(),reviewed_at=NULL,published_at=IF(?=\'published\',UTC_TIMESTAMP(),published_at),updated_at=UTC_TIMESTAMP() WHERE id=?',[$status,$status,$id]);
            $this->db->log($resubmit?'resubmitted':($u['role']==='admin'?'uploaded':'submitted'),$u,$row['title']);return $status;
        });Http::json(['ok'=>true,'status'=>$status]);
    }
    private function review(string $id,array $body): never
    {
        $u=$this->auth->requireUser(['admin']);$decision=$body['decision']??'';
        if(!in_array($decision,['approved','declined'],true))Http::fail(400,'Invalid review decision.');
        $remarks=Validation::text($body['remarks']??'','remarks',1000,$decision==='declined');if($decision==='approved'&&$remarks!=='')Http::fail(400,'Approval remarks are not accepted.');
        $status=$this->db->transaction(function()use($id,$body,$u,$decision,$remarks){$r=$this->thesis($id,true);if($r['status']!=='pending'||!$r['completed_at'])Http::fail(409,'Submission is not ready for review.');
            $warnings=$this->warnings($r,$id);if($decision==='approved'&&$warnings&&($body['confirmDuplicate']??false)!==true)Http::fail(409,'Possible duplicate thesis information detected.',['code'=>'DUPLICATE_WARNING','duplicateWarnings'=>$warnings]);
            $status=$decision==='approved'?'published':'declined';$this->db->run('UPDATE theses SET status=?,reviewed_at=UTC_TIMESTAMP(),published_at=IF(?=\'published\',UTC_TIMESTAMP(),published_at),updated_at=UTC_TIMESTAMP() WHERE id=?',[$status,$status,$id]);
            $this->db->run('INSERT INTO thesis_reviews (id,thesis_id,reviewer_id,reviewer_name,decision,remarks) VALUES (?,?,?,?,?,?)',[Db::uuid(),$id,$u['id'],$u['name'],$decision,$decision==='declined'?$remarks:null]);$this->saveWarnings($id,$warnings);
            if($r['submitted_by'])$this->db->run('INSERT INTO notifications (id,recipient_user_id,thesis_id,type,message) VALUES (?,?,?,?,?)',[Db::uuid(),$r['submitted_by'],$id,$decision==='approved'?'submission_approved':'submission_declined',$decision==='approved'?'Your thesis submission was approved.':$remarks]);
            $this->db->log($decision,$u,$r['title']);return $status;});Http::json(['ok'=>true,'status'=>$status]);
    }
    private function file(string $id,string $category,bool $stream): never
    {
        $r=$this->thesis($id);if($r['status']!=='published'){$u=$this->auth->requireUser(['admin','faculty','student']);if($u['role']!=='admin'&&$r['submitted_by']!==$u['id']&&!($u['role']==='faculty'&&$category==='approval'))Http::fail(403,'Access denied.');}
        $file=$this->db->one('SELECT * FROM thesis_files WHERE thesis_id=? AND category=?',[$id,$category]);if(!$file)Http::fail(404,'File not found.');
        if(!$stream){$url=$this->storage->sign($file);if($category==='approval'&&($_GET['view']??'')==='1')Http::redirect($url);Http::json(['url'=>$url,'file'=>['name'=>$file['original_name'],'size'=>(int)$file['byte_size'],'type'=>$file['mime_type']]]);}
        $range=$_SERVER['HTTP_RANGE']??null;if($range!==null&&!preg_match('/\Abytes=(?:\d+-\d*|-\d+)\z/',$range))Http::fail(416,'Invalid byte range.');
        $object=$this->storage->get($file,$range);header('Content-Type: '.$file['mime_type']);header('Content-Disposition: inline');header('Accept-Ranges: bytes');header('Cache-Control: private, no-store');
        if(isset($object['ContentLength']))header('Content-Length: '.$object['ContentLength']);if(isset($object['ContentRange'])){http_response_code(206);header('Content-Range: '.$object['ContentRange']);}
        $body=$object['Body'];while(!$body->eof())echo $body->read(65536);exit;
    }
    private function approvals(string $path): never
    {
        $u=$this->auth->requireUser(['faculty']);$rows=$this->db->all("SELECT * FROM theses WHERE status='published' AND completed_at IS NOT NULL AND adviser_name=? ORDER BY submitted_at DESC",[$u['name']]);
        if($path==='approval-sheets'){
            $out=[];foreach($rows as $row){$s=$this->shape($row);if(!isset($s['parts']['approval']))continue;$out[]=['id'=>$s['id'],'title'=>$s['title'],'authors'=>$s['authors'],'adviser'=>$s['adviser'],'program'=>$s['course'],'year'=>$s['year'],'abstract'=>$s['abstract'],'keywords'=>$s['keywords'],'status'=>$s['status'],'approval'=>$s['parts']['approval']];}Http::json(['approvalSheets'=>$out]);
        }
        if(!in_array($path,['approval-sheets/urls','approval-sheets/pdf'],true))Http::fail(404,'Endpoint not found.');
        $raw=$_GET['ids']??'';if(!is_string($raw))Http::fail(400,'Invalid approval-sheet selection.');$ids=array_values(array_unique(explode(',',$raw)));if(!$ids||count($ids)>100)Http::fail(400,'Select 1–100 approval sheets.');
        $allowed=array_column($rows,null,'id');$files=[];
        foreach($ids as $id){Validation::uuid($id);if(!isset($allowed[$id]))Http::fail(403,'One or more approval sheets are unavailable.');$file=$this->db->one("SELECT * FROM thesis_files WHERE thesis_id=? AND category='approval'",[$id]);if(!$file)Http::fail(404,'Approval sheet not found.');$files[]=$file;}
        if($path==='approval-sheets/urls')Http::json(['approvals'=>array_map(fn($f)=>['id'=>$f['thesis_id'],'url'=>$this->storage->sign($f),'file'=>['name'=>$f['original_name'],'size'=>(int)$f['byte_size'],'type'=>$f['mime_type']]],$files)]);
        // Original-sheet export avoids slow OCR and preserves uploaded signatures.
        $output=ApprovalPdf::build($files,$this->storage);header('Content-Type: application/pdf');header('Content-Disposition: attachment; filename="approval-sheets.pdf"');header('Cache-Control: private, no-store');echo $output;exit;
    }
}
