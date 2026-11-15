<?php
declare(strict_types=1);
// Input is a private, normalized JSON export, not a PostgreSQL SQL dump.
// Default is validation only. --apply imports into an EMPTY target database.
if(PHP_SAPI!=='cli')exit(1);
$app=require dirname(__DIR__).'/bootstrap.php';$db=$app['db'];
$file=$argv[1]??'';if(!is_file($file))throw new RuntimeException('Usage: php scripts/import.php exports/migration.json [--apply]');
$data=json_decode(file_get_contents($file),true,512,JSON_THROW_ON_ERROR);
$tables=['users','account_extensions','theses','thesis_authors','thesis_files','thesis_reviews','notifications','thesis_views','activity_logs'];
foreach($tables as $table)if(!isset($data[$table])||!is_array($data[$table]))throw new RuntimeException("Export must contain a $table array, including an empty array when appropriate.");
function dateValue(mixed $value): ?string { if($value===null||$value==='')return null;return (new DateTimeImmutable((string)$value,new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u'); }
foreach($tables as $table)foreach($data[$table] as $row)foreach($row as $field=>$value)if(str_ends_with((string)$field,'_at')||in_array($field,['previous_expiry','expires_at'],true))dateValue($value);
function referencedId(mixed $value,array $known,string $field,bool $nullable=false): ?string {
    if($nullable&&($value===null||$value===''))return null;
    $id=\ThesisLink\Validation::uuid($value);if(!isset($known[$id]))throw new RuntimeException("Unknown $field reference: $id");return $id;
}
function uniqueId(mixed $value,array &$known,string $field): string {
    $id=\ThesisLink\Validation::uuid($value);if(isset($known[$id]))throw new RuntimeException("Duplicate $field ID: $id");$known[$id]=true;return $id;
}
$users=[];$ids=[];$emails=[];$googleSubjects=[];
foreach($data['users'] as $u){
    $id=\ThesisLink\Validation::uuid($u['id']);if(isset($ids[$id]))throw new RuntimeException('Duplicate user ID.');$ids[$id]=true;
    $email=\ThesisLink\Validation::email($u['email']);if(isset($emails[$email]))throw new RuntimeException('Duplicate account email.');$emails[$email]=true;
    $meta=$u['app_metadata']??[];$personal=$u['user_metadata']??[];$role=strtolower($meta['role']??(str_ends_with($email,'@isu.edu.ph')?'student':'guest'));if(in_array($role,['adviser','advisor'],true))$role='faculty';
    if(!in_array($role,['student','faculty','admin'],true))throw new RuntimeException('Unsupported imported account role.');
    $created=dateValue($u['created_at']);if(!$created)throw new RuntimeException('Missing account registration timestamp.');
    $expiry=$meta['expiresAt']??null;if($role==='student'&&!$expiry){$d=new DateTimeImmutable($created,new DateTimeZone('UTC'));$year=(int)$d->format('Y')+1;$month=(int)$d->format('m');$day=min((int)$d->format('d'),(int)$d->setDate($year,$month,1)->format('t'));$expiry=$d->setDate($year,$month,$day)->format('c');}
    $subject=null;foreach($u['identities']??[] as $identity)if(($identity['provider']??'')==='google')$subject=$identity['identity_data']['sub']??null;
    if($subject!==null){$subject=\ThesisLink\Validation::text($subject,'Google subject',255);if(isset($googleSubjects[$subject]))throw new RuntimeException('Duplicate Google identity subject.');$googleSubjects[$subject]=true;}
    if($data['account_extensions']&&($meta['extensions']??[]))throw new RuntimeException('Supply extension history in metadata or the explicit collection, not both.');
    foreach($meta['extensions']??[] as $extension){dateValue($extension['previousExpiry']??null);if(!dateValue($extension['expiresAt']??null)||!dateValue($extension['approvedAt']??null))throw new RuntimeException('Account extension dates are required.');}
    $users[]=['id'=>$id,'email'=>$email,'name'=>\ThesisLink\Validation::text($personal['name']??$personal['full_name']??$u['email'],'name',120),'role'=>$role,
        'password_hash'=>null,'google_subject'=>$subject,'email_verified_at'=>dateValue($u['email_confirmed_at']??null),'registered_at'=>$created,'expires_at'=>$role==='student'?dateValue($expiry):null,
        'graduated'=>(int)(bool)($meta['graduated']??false),'must_change_password'=>(int)(bool)($meta['mustChangePassword']??false),'gmail'=>$meta['gmail']??null,'program'=>$meta['program']??null,
        'terms_accepted_at'=>dateValue($personal['termsAcceptedAt']??null),'created_by'=>null];
}
$thesisIds=[];foreach($data['theses'] as $row){uniqueId($row['id']??null,$thesisIds,'thesis');referencedId($row['submitted_by']??null,$ids,'theses submitted_by',true);}
foreach($data['users'] as $u){$createdBy=$u['app_metadata']['createdBy']??null;if($createdBy!==null&&$createdBy!=='')referencedId($createdBy,$ids,'users createdBy');}
foreach($data['account_extensions'] as $row){referencedId($row['user_id']??null,$ids,'account_extensions user_id');referencedId($row['approved_by']??null,$ids,'account_extensions approved_by',true);dateValue($row['expires_at']??null);dateValue($row['approved_at']??null);}
$authors=[];$authorPositions=[];$authorNames=[];
foreach($data['thesis_authors'] as $row){
    $thesisId=referencedId($row['thesis_id']??null,$thesisIds,'thesis_authors thesis_id');$name=\ThesisLink\Validation::text($row['name']??null,'author name',120);$position=filter_var($row['position']??null,FILTER_VALIDATE_INT);
    if($position===false||$position<1||isset($authorPositions[$thesisId][$position]))throw new RuntimeException('Invalid or duplicate thesis author position.');
    $canonical=\ThesisLink\Validation::canonical($name);if(isset($authorNames[$thesisId][$canonical]))throw new RuntimeException('Duplicate thesis author name.');
    $authorPositions[$thesisId][$position]=true;$authorNames[$thesisId][$canonical]=true;$row['name']=$name;$row['canonical_name_hash']=hash('sha256',$canonical);$authors[$thesisId][]=$row;
}
$theses=[];$warnings=[];
foreach($data['theses'] as $r){
    $names=$authors[$r['id']]??[];usort($names,fn($a,$b)=>$a['position']<=>$b['position']);
    $meta=\ThesisLink\Validation::metadata(['title'=>$r['title'],'authors'=>implode('; ',array_column($names,'name')),'adviser'=>$r['adviser_name']??'Unassigned','course'=>$r['course'],'year'=>$r['publication_year'],'abstract'=>$r['abstract'],'keywords'=>$r['keywords']]);
    unset($meta['names']);$r['duplicate_title_hash']=$meta['duplicate_title_hash'];$r['duplicate_authors_hash']=$meta['duplicate_authors_hash'];$r['duplicate_abstract_hash']=$meta['duplicate_abstract_hash'];
    $warnings[$r['id']]=is_array($r['duplicate_warnings']??null)?$r['duplicate_warnings']:[];
    foreach(['duplicate_title_key','duplicate_authors_key','duplicate_abstract_key','duplicate_warnings','submitted_by_email'] as $key)unset($r[$key]);
    $theses[]=$r;
}
$fileIds=[];$objectKeys=[];$fileCategories=[];
foreach($data['thesis_files'] as $file){
    uniqueId($file['id']??null,$fileIds,'thesis file');$thesisId=referencedId($file['thesis_id']??null,$thesisIds,'thesis_files thesis_id');$category=$file['category']??'';
    if(!in_array($category,['full','approval'],true)||isset($fileCategories[$thesisId][$category]))throw new RuntimeException('Invalid or duplicate thesis file category.');$fileCategories[$thesisId][$category]=true;
    $key=$file['object_key']??null;if(!is_string($key)||!preg_match('/\A[\x20-\x7e]{1,1024}\z/',$key))throw new RuntimeException('Non-ASCII R2 key requires an explicit schema/import adjustment.');
    if(isset($objectKeys[$key]))throw new RuntimeException('Duplicate R2 object key.');$objectKeys[$key]=true;
    \ThesisLink\Validation::text($file['bucket']??null,'storage bucket',63);\ThesisLink\Validation::text($file['original_name']??null,'filename',255);\ThesisLink\Validation::text($file['mime_type']??null,'MIME type',127);
    if(filter_var($file['byte_size']??null,FILTER_VALIDATE_INT)===false||(int)$file['byte_size']<1)throw new RuntimeException('Invalid thesis file size.');
}
$reviewIds=[];foreach($data['thesis_reviews'] as $row){uniqueId($row['id']??null,$reviewIds,'thesis review');referencedId($row['thesis_id']??null,$thesisIds,'thesis_reviews thesis_id');referencedId($row['reviewer_id']??null,$ids,'thesis_reviews reviewer_id',true);if(!in_array($row['decision']??'', ['approved','declined'],true))throw new RuntimeException('Invalid thesis review decision.');}
$notificationIds=[];foreach($data['notifications'] as $row){uniqueId($row['id']??null,$notificationIds,'notification');referencedId($row['recipient_user_id']??null,$ids,'notifications recipient_user_id');referencedId($row['thesis_id']??null,$thesisIds,'notifications thesis_id');if(!in_array($row['type']??'',['submission_approved','submission_declined'],true))throw new RuntimeException('Invalid notification type.');}
$viewKeys=[];foreach($data['thesis_views'] as $row){$thesisId=referencedId($row['thesis_id']??null,$thesisIds,'thesis_views thesis_id');$hash=$row['viewer_hash']??'';if(!is_string($hash)||!preg_match('/\A[0-9a-f]{64}\z/',$hash)||isset($viewKeys[$thesisId][$hash]))throw new RuntimeException('Invalid or duplicate thesis view.');$viewKeys[$thesisId][$hash]=true;}
$actions=['submitted','uploaded','resubmitted','approved','declined','edited','deleted','registered','extended account','deleted graduated student account','created adviser account','created faculty account'];$activityIds=[];
foreach($data['activity_logs'] as $row){uniqueId($row['id']??null,$activityIds,'activity');referencedId($row['actor_user_id']??null,$ids,'activity_logs actor_user_id',true);if(!in_array($row['action']??'', $actions,true))throw new RuntimeException('Invalid activity action.');}
foreach($warnings as $types)foreach(array_unique($types) as $type)if(!in_array($type,['title','authors','abstract'],true))throw new RuntimeException('Invalid duplicate warning.');
$count=array_map('count',array_intersect_key($data,array_flip($tables)));echo json_encode(['counts'=>$count,'mode'=>in_array('--apply',$argv,true)?'apply':'validation-only'],JSON_PRETTY_PRINT).PHP_EOL;
if(!in_array('--apply',$argv,true))exit(0);
$replaceSetupAdmin=in_array('--replace-setup-admin',$argv,true);
if($replaceSetupAdmin){
    $existing=$db->all('SELECT id,role FROM users');if(count($existing)!==1||$existing[0]['role']!=='admin')throw new RuntimeException('Replacement requires exactly one installer-created administrator and no other accounts.');
    foreach(array_diff($tables,['users']) as $table)if((int)$db->one("SELECT COUNT(*) n FROM $table")['n']!==0)throw new RuntimeException('Replacement requires all application data tables except users to be empty.');
    if(!array_filter($users,fn($user)=>$user['role']==='admin'))throw new RuntimeException('Imported data must contain an administrator before replacing the setup account.');
}else foreach($tables as $table)if((int)$db->one("SELECT COUNT(*) n FROM $table")['n']!==0)throw new RuntimeException('Import requires an empty target database. Use --replace-setup-admin only immediately after web setup.');
function insertRow(\ThesisLink\Db $db,string $table,array $row): void {
    $columns=array_column($db->all("SHOW COLUMNS FROM $table"),'Field');$allowed=array_flip($columns);
    $row=array_intersect_key($row,$allowed);
    foreach($row as $key=>$value){if(($value!==null&&str_ends_with($key,'_at'))||in_array($key,['previous_expiry','expires_at'],true))$row[$key]=dateValue($value);}
    $db->run('INSERT INTO '.$table.' ('.implode(',',array_keys($row)).') VALUES ('.implode(',',array_fill(0,count($row),'?')).')',array_values($row));
}
$db->transaction(function()use($db,$data,$users,$theses,$authors,$warnings,$replaceSetupAdmin){
    if($replaceSetupAdmin)$db->run('DELETE FROM users');
    foreach($users as $r)insertRow($db,'users',$r);
    foreach($data['users'] as $u){$meta=$u['app_metadata']??[];if(!empty($meta['createdBy']))$db->run('UPDATE users SET created_by=? WHERE id=?',[$meta['createdBy'],$u['id']]);
        foreach($meta['extensions']??[] as $x)insertRow($db,'account_extensions',['user_id'=>$u['id'],'previous_expiry'=>$x['previousExpiry']??null,'expires_at'=>$x['expiresAt'],'requested_in_person'=>(int)($x['requestedInPerson']??false),'not_graduated_confirmed'=>(int)($x['notGraduatedConfirmed']??false),'approved_at'=>$x['approvedAt'],'approved_by_email'=>$x['approvedBy']??'']);
    }
    foreach($data['account_extensions'] as $r)insertRow($db,'account_extensions',$r);
    foreach($theses as $r)insertRow($db,'theses',$r);
    foreach($authors as $rows)foreach($rows as $r)insertRow($db,'thesis_authors',$r);
    foreach(['thesis_files','thesis_reviews','notifications','thesis_views','activity_logs'] as $table)foreach($data[$table] as $r)insertRow($db,$table,$r);
    foreach($warnings as $id=>$types)foreach(array_unique($types) as $type)$db->run('INSERT INTO thesis_duplicate_warnings (thesis_id,warning) VALUES (?,?)',[$id,$type]);
});
echo "Import committed. Sessions were not imported; password users must reset their passwords.\n";
