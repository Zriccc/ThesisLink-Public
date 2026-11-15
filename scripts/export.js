// Run from the original checkout before cutover. Writes only a private export;
// it never updates Supabase records or R2 objects.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createClient} from '@supabase/supabase-js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw new Error('Set the old Supabase URL and server-only secret in the process environment.');
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const out={users:[],account_extensions:[]};
for(let page=1;;page++){const {data,error}=await client.auth.admin.listUsers({page,perPage:100});if(error)throw error;out.users.push(...data.users);if(data.users.length<100)break;}
for(const table of ['theses','thesis_authors','thesis_files','thesis_reviews','notifications','thesis_views','activity_logs']){
 out[table]=[];for(let offset=0;;offset+=1000){let query=client.from(table).select('*');query=table==='thesis_views'?query.order('thesis_id').order('viewer_hash'):query.order('id');const{data,error}=await query.range(offset,offset+999);if(error)throw error;out[table].push(...data);if(data.length<1000)break;}
}
const directory=path.join(root,'exports');fs.mkdirSync(directory,{recursive:true,mode:0o700});
const destination=path.join(directory,'migration-'+Date.now()+'.json');fs.writeFileSync(destination,JSON.stringify(out),{mode:0o600,flag:'wx'});
console.log('Private export created:',destination);console.log('Counts:',Object.fromEntries(Object.entries(out).map(([table,rows])=>[table,rows.length])));
