import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import net from 'node:net';import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {createTestDirectory,findMariaDb,findPhp} from './runtime.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const php=findPhp(process.env,root);
const databaseRuntime=findMariaDb(process.env,root);
const port=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const run=(args,env)=>{const r=spawnSync(php,args,{cwd:root,env,encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(r.stdout+r.stderr);return r.stdout;};
const runAsync=(args,env)=>new Promise((resolve,reject)=>{const child=spawn(php,args,{cwd:root,env,windowsHide:true});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('PHP command timed out.'));},60000);child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('close',status=>{clearTimeout(timer);status===0?resolve(stdout):reject(Error(stdout+stderr));});});
let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;};
async function main(){
 const dbPort=await port(),appPort=await port(),storagePort=await port();
 const testDir=createTestDirectory(root);const dbDir=path.join(testDir,'data');
 const initialized=spawnSync(databaseRuntime.initialize,['--datadir='+dbDir,'--port='+dbPort],{encoding:'utf8',timeout:60000,windowsHide:true});
 if(initialized.status!==0)throw Error(initialized.stdout+initialized.stderr);
 const dbLog=fs.openSync(path.join(testDir,'database.log'),'a');
 const database=spawn(databaseRuntime.server,['--no-defaults','--basedir='+databaseRuntime.home,'--datadir='+dbDir,'--port='+dbPort,'--bind-address=127.0.0.1','--console'],{stdio:['ignore',dbLog,dbLog],windowsHide:true});
 const objects=new Map();
 const storage=http.createServer(async(req,res)=>{const key=new URL(req.url,'http://localhost').pathname;
   if(req.method==='HEAD'&&key==='/test-bucket'){res.writeHead(200);return res.end();}
   if(req.method==='PUT'){const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks);objects.set(key,{bytes,type:req.headers['content-type']});res.writeHead(200,{ETag:'"'+crypto.createHash('md5').update(bytes).digest('hex')+'"'});return res.end();}
   if(req.method==='DELETE'){objects.delete(key);res.writeHead(204);return res.end();}
   const item=objects.get(key);if(!item){res.writeHead(404);return res.end();}
   const headers={'Content-Type':item.type,'Content-Length':item.bytes.length,ETag:'"'+crypto.createHash('md5').update(item.bytes).digest('hex')+'"'};
   if(req.method==='HEAD'){res.writeHead(200,headers);return res.end();}
   const match=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);if(match){const start=+match[1],end=match[2]?Math.min(+match[2],item.bytes.length-1):item.bytes.length-1;const bytes=item.bytes.subarray(start,end+1);res.writeHead(206,{...headers,'Content-Length':bytes.length,'Content-Range':`bytes ${start}-${end}/${item.bytes.length}`});return res.end(bytes);}
   res.writeHead(200,headers);res.end(item.bytes);
 });
 await new Promise(r=>storage.listen(storagePort,'127.0.0.1',r));
 const config={environment:'development',app_url:`http://127.0.0.1:${appPort}`,app_secret:crypto.randomBytes(32).toString('hex'),enable_storage_cleanup:false,
  database:{host:'127.0.0.1',port:dbPort,name:'thesislink_test_'+Date.now(),username:'root',password:''},
  r2:{endpoint:`http://127.0.0.1:${storagePort}`,bucket:'test-bucket',access_key_id:'test-only-key',secret_access_key:'test-only-secret'},mail:{transport:'file',directory:path.join(testDir,'mail')},google_client_id:''};
 const configPath=path.join(testDir,'config.php');fs.writeFileSync(configPath,'<?php return json_decode('+JSON.stringify(JSON.stringify(config)).replaceAll("'","\\'")+ ',true);');
 // PHP quoted strings differ from JSON strings: encode the configuration as base64.
 fs.writeFileSync(configPath,`<?php return json_decode(base64_decode('${Buffer.from(JSON.stringify(config)).toString('base64')}'),true);`);
 const env={...process.env,THESISLINK_CONFIG:configPath};let server;
 try{
  let ready=false;for(let i=0;i<100;i++){try{await new Promise((r,j)=>{const s=net.connect(dbPort,'127.0.0.1',()=>{s.end();r();});s.on('error',j);});ready=true;break;}catch{await pause(100);}}
  if(!ready)throw Error('Isolated database did not start. '+fs.readFileSync(path.join(testDir,'database.log'),'utf8'));
  console.log(run(['tests/setup.php'],env).trim());
  const phpTemp=path.join(testDir,'php-temp');fs.mkdirSync(phpTemp);
  const appLog=fs.openSync(path.join(testDir,'php.log'),'a');server=spawn(php,['-d','upload_tmp_dir='+phpTemp,'-S',`127.0.0.1:${appPort}`,'-t','public','router.php'],{cwd:root,env,stdio:['ignore',appLog,appLog],windowsHide:true});
  const base=config.app_url;let available=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/auth/session')).ok){available=true;break;}}catch{}await pause(100);}if(!available)throw Error(fs.readFileSync(path.join(testDir,'php.log'),'utf8'));
  function client(){const cookies=new Map();return {get cookie(){return [...cookies].map(([k,v])=>k+'='+v).join('; ');},async request(url,body,method=body===undefined?'GET':'POST',extra={}){
    const cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
    const response=await fetch(base+url,{method,redirect:'manual',headers:{...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json',origin:base}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    for(const set of response.headers.getSetCookie()){const pair=set.split(';')[0];const equals=pair.indexOf('=');cookies.set(pair.slice(0,equals),pair.slice(equals+1));}
    // Drain each PHP-server response before opening the next connection.
    const bytes=await response.arrayBuffer();return new Response(bytes,{status:response.status,headers:response.headers});
  }};}
  const admin=client(),faculty=client(),student=client(),guest=client();
  const login=async(c,email)=>{const r=await c.request('/api/auth/login',{email:email+'@isu.edu.ph',password:'Password1!'});check(r.status===200,'Login '+email);return (await r.json()).user;};
  const au=await login(admin,'admin'),fu=await login(faculty,'faculty'),su=await login(student,'student');check(au.role==='admin'&&fu.role==='faculty'&&su.role==='student','Canonical account roles');
  const setupLocked=await guest.request('/setup');check(setupLocked.status===200&&(await setupLocked.text()).includes('Setup is locked'),'Setup is unavailable after application configuration');
  check((await guest.request('/')).status===200,'Guest repository page');
  check((await guest.request('/pages/admin/dashboard.html')).status===303,'Protected page denies anonymous');
  check((await student.request('/pages/admin/dashboard.html')).status===303,'Wrong role page redirects');
  for(const page of ['dashboard','repository','reports','users','logs','upload','requests','manage','scanner'])check((await admin.request('/pages/admin/'+page+'.html')).status===200,'Admin page '+page);
  for(const page of ['repository','reports','advisees','scanner'])check((await faculty.request('/pages/adviser/'+page+'.html')).status===200,'Faculty page '+page);
  for(const page of ['repository','upload','notifications','my-uploads','scanner'])check((await student.request('/pages/student/'+page+'.html')).status===200,'Student page '+page);
  check((await admin.request('/maintenance')).status===200,'Administrator maintenance page');
  check((await student.request('/maintenance')).status===403,'Maintenance page denies students');
  check((await student.request('/api/auth/maintenance',{})).status===403,'Maintenance endpoint denies students');
  const maintenance=await admin.request('/api/auth/maintenance',{});check(maintenance.status===200&&(await maintenance.json()).maintenance.mailDelivered===0,'Administrator runs bounded maintenance');
  check((await admin.request('/api/auth/maintenance',{cleanupR2:true})).status===409,'R2 cleanup stays disabled before cutover');
  check((await student.request('/api/auth/users')).status===403,'Account listing admin-only');
  const adviserDirectory=await(await student.request('/api/auth/advisers')).json();check(adviserDirectory.advisers.length===2&&adviserDirectory.advisers.every(item=>item.role==='faculty')&&adviserDirectory.advisers.some(item=>item.name==='Sample Faculty'),'Signed-in adviser directory contains faculty accounts only');
  check((await admin.request('/api/auth/login',{email:'admin@isu.edu.ph',password:'Password1!'},'POST',{origin:'https://attacker.example'})).status===403,'Cross-origin mutations denied');
  check((await guest.request('/api/auth/login',{email:'expired@isu.edu.ph',password:'Password1!'})).status===401,'Expired account denied');
  const previous=admin.cookie;await login(admin,'admin');check((await(await fetch(base+'/api/auth/session',{headers:{cookie:previous}})).json()).user===null,'New login invalidates old session');
  const temporary=client();await login(temporary,'temporary');check((await temporary.request('/api/repository/submissions')).status===403,'Temporary password limits API access');
  check((await temporary.request('/api/auth/password',{password:'Changed1!'})).status===200,'Forced password setup');
  const metadata={title:'Research Repository Integration Study',authors:'Ada Lovelace; Grace Hopper',adviser:'Sample Faculty',course:'BSIT',year:2026,keywords:'research, repository',abstract:'This research provides a repository for students and faculty to discover published academic work.'};
  const full=Buffer.from('%PDF-1.7\nIntegration fixture');const approval=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  const files={full:{name:'study.pdf',type:'application/pdf',size:full.length},approval:{name:'approval.png',type:'image/png',size:approval.length}};
  const createSubmission=async(c,data=metadata)=>{const r=await c.request('/api/repository/theses',{metadata:data,files});check(r.status===201,'Create submission');return r.json();};
  const upload=async(c,data=metadata)=>{const result=await createSubmission(c,data);for(const item of result.uploads){const f=files[item.category];check((await fetch(item.url,{method:'PUT',headers:{'Content-Type':f.type},body:item.category==='full'?full:approval})).ok,'R2 signed upload');}return result;};
  const first=await upload(student);check((await student.request(`/api/repository/theses/${first.id}/complete`,{})).status===200,'Verify complete upload');
  check((await guest.request(`/api/repository/theses/${first.id}/files/full`)).status===403,'Pending full file private');
  check((await faculty.request(`/api/repository/theses/${first.id}/files/full`)).status===403,'Faculty cannot read pending full thesis');
  check((await faculty.request(`/api/repository/theses/${first.id}/files/approval`)).status===200,'Faculty can review pending approval sheet');
  check((await student.request(`/api/repository/theses/${first.id}/files/full`)).status===200,'Student owns pending full thesis');
  check((await admin.request(`/api/repository/theses/${first.id}/review`,{decision:'declined'})).status===400,'Decline requires remarks');
  check((await admin.request(`/api/repository/theses/${first.id}/review`,{decision:'declined',remarks:'Correct the abstract.'})).status===200,'Decline submission');
  check((await(await student.request('/api/repository/notifications')).json()).notifications.length===1,'Decline notification');
  check((await student.request(`/api/repository/theses/${first.id}/resubmit`,{metadata:{...metadata,abstract:metadata.abstract+' The revised work incorporates reviewer feedback.'},files:{}})).status===200,'Prepare corrected submission');
  check((await student.request(`/api/repository/theses/${first.id}/complete-resubmission`,{})).status===200,'Complete correction');
  check((await admin.request(`/api/repository/theses/${first.id}/review`,{decision:'approved'})).status===200,'Approve submission atomically');
  check((await admin.request(`/api/repository/theses/${first.id}/review`,{decision:'approved'})).status===409,'Repeated review denied');
  const notices=(await(await student.request('/api/repository/notifications')).json()).notifications;check(notices.some(item=>item.type==='submission_approved')&&notices.some(item=>item.type==='submission_declined'),'Student receives approval and decline notifications');
  check((await(await guest.request('/api/repository/theses')).json()).theses.length===1,'Public catalog only published');
  const original=await(await student.request('/api/repository/theses')).json();
  const duplicate=await upload(student,{...metadata,abstract:original.theses[0].abstract,authors:'GRACE HOPPER; ADA LOVELACE'});
  check(JSON.stringify(duplicate.duplicateWarnings)===JSON.stringify(['title','abstract']),'Title and abstract duplicates warn without author-group warnings');
  const authorOnly=await createSubmission(student,{...metadata,title:'Independent Attendance Analytics',abstract:'This independent study evaluates attendance analytics using a distinct collection of classroom records.'});
  check(authorOnly.duplicateWarnings.length===0,'Matching author groups alone do not trigger duplicate warnings');
  await createSubmission(student,{...metadata,title:'ThesisLink: A Hybrid Repository',authors:'Katherine Johnson',abstract:'This baseline study describes a hybrid academic archive with a distinct implementation and evaluation.'});
  const similarTitle=await createSubmission(student,{...metadata,title:'ThesisLink: Web Based Repository System',authors:'Alan Turing',abstract:'This separate investigation evaluates discovery workflows using an independently written research abstract.'});
  check(JSON.stringify(similarTitle.duplicateWarnings)===JSON.stringify(['title']),'Strongly similar thesis titles trigger a title warning');
  const sharedProjectName=await createSubmission(student,{...metadata,title:'ThesisLink: Hello World',authors:'Donald Knuth',abstract:'This unrelated demonstration uses original content while intentionally repeating only the distinctive project name.'});
  check(JSON.stringify(sharedProjectName.duplicateWarnings)===JSON.stringify(['title']),'A repeated distinctive project name triggers a title warning');
  check((await student.request(`/api/repository/theses/${duplicate.id}/complete`,{})).status===200,'Duplicate student submission can enter review');
  check((await admin.request(`/api/repository/theses/${duplicate.id}/review`,{decision:'approved'})).status===409,'Duplicate publication requires confirmation');
  check((await admin.request(`/api/repository/theses/${duplicate.id}/review`,{decision:'approved',confirmDuplicate:true})).status===200,'Confirmed duplicate review');
  const fileInfo=await guest.request(`/api/repository/theses/${first.id}/files/full`);const signedFile=await fileInfo.json();check(fileInfo.status===200&&(await fetch(signedFile.url)).status===200,'Published file metadata returns a working signed R2 URL');
  const editedMetadata={...metadata,title:'Edited Repository Integration Study'};check((await admin.request(`/api/repository/theses/${first.id}`,editedMetadata,'PATCH')).status===200,'Admin edits published thesis metadata');
  const editedCatalog=(await(await guest.request('/api/repository/theses')).json()).theses;check(editedCatalog.find(item=>item.id===first.id)?.title===editedMetadata.title,'Edited metadata is visible in the public catalog');
  check((await student.request(`/api/repository/theses/${first.id}`,{},'DELETE')).status===403,'Student cannot delete a published thesis');
  const disposable=await upload(student,{...metadata,title:'Disposable Pending Submission',abstract:metadata.abstract+' This copy is used to verify pending deletion.'});check((await student.request(`/api/repository/theses/${disposable.id}`,{},'DELETE')).status===200,'Student deletes own pending submission');
  const view=await(await student.request(`/api/repository/theses/${first.id}/view`,{})).json();const repeated=await(await student.request(`/api/repository/theses/${first.id}/view`,{})).json();check(view.counted&&!repeated.counted&&repeated.views===view.views,'Unique view counting');
  const stream=await guest.request(`/api/repository/theses/${first.id}/stream/full`,undefined,'GET',{range:'bytes=0-4'});check(stream.status===206&&(await stream.text())==='%PDF-','PDF range streaming');
  const report=await faculty.request('/api/repository/approval-sheets/pdf?ids='+first.id),reportBody=await report.text();check(report.status===200&&reportBody.startsWith('%PDF'),`Native PHP approval-sheet PDF (${report.status}: ${reportBody.slice(0,120)})`);
  check(/\/MediaBox\s*\[\s*0(?:\.0+)?\s+0(?:\.0+)?\s+612(?:\.0+)?\s+792(?:\.0+)?\s*\]/.test(reportBody),'Native PHP approval-sheet pages use US Letter size');
  check((await(await faculty.request('/api/repository/approval-sheets')).json()).approvalSheets.length===2,'Faculty assigned approvals');
  const extensionDate=new Date(Math.ceil(Date.now()/1000)*1000+3*86400000).toISOString();check((await admin.request(`/api/auth/users/${su.id}/extend`,{expiresAt:extensionDate,extension:{requestedInPerson:true,notGraduatedConfirmed:true}})).status===200,'Admin extends an active student account');
  const extended=(await(await admin.request('/api/auth/users')).json()).users.find(user=>user.id===su.id);check(Date.parse(extended.expiresAt)===Date.parse(extensionDate)&&extended.extensions.length===1,'Student extension is stored in account history');
  const secondFaculty=client();check((await admin.request('/api/auth/users',{name:'Other Faculty',email:'other@isu.edu.ph',password:'Password1!'})).status===200,'Admin creates faculty');
  const other=await login(secondFaculty,'other');check(other.role==='faculty'&&other.mustChangePassword===true,'Created faculty has the canonical role and forced password setup');
  check((await secondFaculty.request('/pages/adviser/repository.html')).status===303,'Temporary faculty password cannot access workspace pages');
  const otherRecord=(await(await admin.request('/api/auth/users')).json()).users.find(user=>user.email==='other@isu.edu.ph');check((await admin.request(`/api/auth/users/${otherRecord.id}/delete`,{})).status===200,'Admin deletes faculty account');
  check((await guest.request('/api/auth/login',{email:'other@isu.edu.ph',password:'Password1!'})).status===401,'Deleted faculty cannot sign in');
  const activities=(await(await admin.request('/api/repository/activity')).json()).activities;check(activities.some(item=>item.type==='created faculty account'),'Administrative account changes are audited');
  check((await guest.request('/api/auth/register',{name:'New Student',email:'newstudent@isu.edu.ph',password:'Password1!',acceptedTerms:true})).status===200,'Register verified-email workflow');
  const mailDir=config.mail.directory;let messages=fs.readdirSync(mailDir).map(n=>JSON.parse(fs.readFileSync(path.join(mailDir,n),'utf8')));check(messages.some(x=>x.email==='newstudent@isu.edu.ph'),'Registration attempts immediate email delivery');
  console.log(run(['scripts/maintenance.php'],env).trim());
  messages=fs.readdirSync(mailDir).map(n=>JSON.parse(fs.readFileSync(path.join(mailDir,n),'utf8')));const mail=messages.find(x=>x.email==='newstudent@isu.edu.ph');check(!!mail,'Encrypted outbox remains compatible with scheduled maintenance');
  check(mail.html.includes('>Verify email</a>')&&!mail.html.replace(/<[^>]*>/g,'').includes('http'),'Verification email presents a branded action instead of a visible raw link');
  const link=mail.body.match(/http[^\s]+/)[0];check((await guest.request(new URL(link).pathname+new URL(link).search)).status===303,'One-use email confirmation');
  check((await guest.request(new URL(link).pathname+new URL(link).search)).headers.get('location').includes('error=confirmation'),'Confirmation replay denied');
  const newStudent=client();await login(newStudent,'newstudent');check((await newStudent.request('/api/auth/recover',{email:'newstudent@isu.edu.ph'})).status===200,'Password recovery queued');
  run(['scripts/maintenance.php'],env);const recovery=fs.readdirSync(mailDir).map(n=>JSON.parse(fs.readFileSync(path.join(mailDir,n),'utf8'))).find(x=>x.email==='newstudent@isu.edu.ph'&&x.subject.startsWith('Reset'));
  check(recovery.html.includes('>Reset password</a>')&&!recovery.html.replace(/<[^>]*>/g,'').includes('http'),'Recovery email presents a branded action instead of a visible raw link');
  const recoveryLink=new URL(recovery.body.match(/http[^\s]+/)[0]);const reset=client();check((await reset.request(recoveryLink.pathname+recoveryLink.search)).status===303,'Recovery link creates restricted session');
  check((await reset.request('/api/repository/student-submissions')).status===403,'Recovery session has no repository access');check((await reset.request('/api/auth/password',{password:'Recovered1!'})).status===200,'Recovery sets password and revokes sessions');
  check((await(await newStudent.request('/api/auth/session')).json()).user===null,'Password reset revokes old sessions');
  check((await admin.request(`/api/repository/theses/${duplicate.id}`,undefined,'DELETE')).status===403,'DELETE requires a valid same-origin request');
  check((await admin.request(`/api/repository/theses/${duplicate.id}`,{},'DELETE')).status===200,'Delete records and queue R2 cleanup');
  check(objects.size===6,'Deferred cleanup does not delete R2 objects before cutover');
  check((await admin.request('/api/auth/logout',{})).status===200,'Logout');check((await(await admin.request('/api/auth/session')).json()).user===null,'Logged-out session unusable');
  const importConfig={...config,database:{...config.database,name:config.database.name+'_import'}};
  const importConfigPath=path.join(testDir,'import-config.php');fs.writeFileSync(importConfigPath,`<?php return json_decode(base64_decode('${Buffer.from(JSON.stringify(importConfig)).toString('base64')}'),true);`);
  const importEnv={...env,THESISLINK_CONFIG:importConfigPath};run(['tests/setup.php','--empty'],importEnv);
  const importedId='99999999-9999-4999-8999-999999999999',importedFacultyId='77777777-7777-4777-8777-777777777777',importedAdminId='44444444-4444-4444-8444-444444444444';const thesisId='88888888-8888-4888-8888-888888888888';
  const exportData={users:[
    {id:importedId,email:'imported@isu.edu.ph',created_at:'2026-01-01T08:00:00+08:00',email_confirmed_at:'2026-01-01T08:10:00+08:00',user_metadata:{name:'Imported Student'},app_metadata:{role:'student',extensions:[]}},
    {id:importedFacultyId,email:'imported.faculty@isu.edu.ph',created_at:'2026-01-01T08:00:00+08:00',email_confirmed_at:'2026-01-01T08:10:00+08:00',user_metadata:{name:'Imported Faculty'},app_metadata:{role:'adviser',extensions:[]}},
    {id:importedAdminId,email:'imported.admin@isu.edu.ph',created_at:'2026-01-01T08:00:00+08:00',email_confirmed_at:'2026-01-01T08:10:00+08:00',user_metadata:{name:'Imported Admin'},app_metadata:{role:'admin',extensions:[]}},
  ],account_extensions:[],
    theses:[{id:thesisId,submitted_by:importedId,submitted_by_name:'Imported Student',title:metadata.title,adviser_name:metadata.adviser,course:metadata.course,publication_year:2026,abstract:metadata.abstract,keywords:metadata.keywords,status:'published',views:7,submitted_at:'2026-02-01T08:00:00+08:00',published_at:'2026-02-02T08:00:00+08:00',completed_at:'2026-02-01T08:05:00+08:00',duplicate_warnings:['title']}],
    thesis_authors:[{id:1,thesis_id:thesisId,name:'Ada Lovelace',position:1},{id:2,thesis_id:thesisId,name:'Grace Hopper',position:2}],thesis_files:[],thesis_reviews:[],notifications:[],thesis_views:[],activity_logs:[]};
  const exportFile=path.join(testDir,'migration.json');fs.writeFileSync(exportFile,JSON.stringify(exportData));
  const invalidExport=structuredClone(exportData);invalidExport.notifications=[{id:'66666666-6666-4666-8666-666666666666',recipient_user_id:'55555555-5555-4555-8555-555555555555',thesis_id:thesisId,type:'submission_approved',message:'Approved',created_at:'2026-02-02T08:00:00+08:00'}];
  const invalidFile=path.join(testDir,'invalid-migration.json');fs.writeFileSync(invalidFile,JSON.stringify(invalidExport));
  const invalid=spawnSync(php,['scripts/import.php',invalidFile],{cwd:root,env:importEnv,encoding:'utf8'});check(invalid.status!==0&&invalid.stderr.includes('notifications recipient_user_id'),'Validation rejects broken import relationships before apply');
  check(run(['scripts/import.php',exportFile],importEnv).includes('validation-only'),'Import defaults to validation-only');
  check(run(['scripts/import.php',exportFile,'--apply'],importEnv).includes('Import committed'),'Transactional source-data import');
  const inspect=run(['-r',`$a=require 'bootstrap.php';$s=$a['db']->one('SELECT * FROM users WHERE id=?',['${importedId}']);$f=$a['db']->one('SELECT * FROM users WHERE id=?',['${importedFacultyId}']);$t=$a['db']->one('SELECT * FROM theses');echo json_encode([$s['id'],$s['registered_at'],$s['password_hash'],$f['role'],$t['id'],(int)$t['views'],strlen($t['duplicate_authors_hash'])]);`],importEnv);
  assert.deepEqual(JSON.parse(inspect),[importedId,'2026-01-01 00:00:00.000000',null,'faculty',thesisId,7,64]);checks++;
  const retry=spawnSync(php,['scripts/import.php',exportFile,'--apply'],{cwd:root,env:importEnv,encoding:'utf8'});check(retry.status!==0,'Import refuses a populated destination');
  const installerDb=config.database.name+'_installer';run(['-r',`$c=require getenv('THESISLINK_CONFIG');$d=$c['database'];$pdo=new PDO('mysql:host='.$d['host'].';port='.$d['port'].';charset=utf8mb4',$d['username'],$d['password']);$pdo->exec('CREATE DATABASE ${installerDb} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');`],env);
  const setupRoot=path.join(testDir,'setup-app');fs.mkdirSync(path.join(setupRoot,'config'),{recursive:true});fs.mkdirSync(path.join(setupRoot,'database'),{recursive:true});fs.copyFileSync(path.join(root,'database/schema.sql'),path.join(setupRoot,'database/schema.sql'));
  const installCode='one-time-test-code';fs.writeFileSync(path.join(setupRoot,'config/install-code.php'),`<?php return '${crypto.createHash('sha256').update(installCode).digest('hex')}';`);fs.writeFileSync(path.join(setupRoot,'INSTALL-CODE.txt'),installCode);
  const setupInput={installationCode:installCode,appUrl:config.app_url,databaseHost:config.database.host,databasePort:config.database.port,databaseName:installerDb,databaseUsername:config.database.username,databasePassword:config.database.password,r2Endpoint:config.r2.endpoint,r2Bucket:config.r2.bucket,r2AccessKey:config.r2.access_key_id,r2SecretKey:config.r2.secret_access_key,mailEncryption:'tls',mailFrom:'thesislink@example.test',googleClientId:'test.apps.googleusercontent.com',adminName:'Installed Admin',adminEmail:'installed.admin@isu.edu.ph',adminPassword:'Password1!'};
  const setupPayload=Buffer.from(JSON.stringify(setupInput)).toString('base64'),setupRootPayload=Buffer.from(setupRoot).toString('base64');
  const installed=await runAsync(['-r',`require 'vendor/autoload.php';$input=json_decode(base64_decode('${setupPayload}'),true);$result=ThesisLink\\Installer::install($input,base64_decode('${setupRootPayload}'),true);echo json_encode($result);`],env);check(JSON.parse(installed).adminEmail===setupInput.adminEmail,'One-time installer completes from validated settings');
  check(fs.existsSync(path.join(setupRoot,'config/config.local.php'))&&fs.existsSync(path.join(setupRoot,'config/installed.lock'))&&!fs.existsSync(path.join(setupRoot,'config/install-code.php'))&&!fs.existsSync(path.join(setupRoot,'INSTALL-CODE.txt')),'Installer writes private configuration, locks setup, and removes its code');
  const installedConfig=path.join(setupRoot,'config/config.local.php'),installedEnv={...env,THESISLINK_CONFIG:installedConfig};const installedAdmin=run(['-r',`$a=require 'bootstrap.php';$u=$a['db']->one("SELECT role,email FROM users");echo json_encode($u);`],installedEnv);check(JSON.parse(installedAdmin).role==='admin'&&JSON.parse(installedAdmin).email===setupInput.adminEmail,'Installer creates the first administrator');
  check(run(['scripts/import.php',exportFile,'--apply','--replace-setup-admin'],installedEnv).includes('Import committed'),'Migration import transactionally replaces the temporary setup administrator');
  const migratedAdmin=run(['-r',`$a=require 'bootstrap.php';$u=$a['db']->one("SELECT role,email FROM users WHERE role='admin'");echo json_encode($u);`],installedEnv);check(JSON.parse(migratedAdmin).email==='imported.admin@isu.edu.ph','Imported administrator replaces the setup account');
  console.log(`PASS: ${checks} PHP/MySQL/R2 integration assertions. No live services were used.`);
 }catch(error){console.error('PHP log:',fs.existsSync(path.join(testDir,'php.log'))?fs.readFileSync(path.join(testDir,'php.log'),'utf8').slice(-2000):'not started');throw error;}
 finally{server?.kill();database.kill();storage.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
