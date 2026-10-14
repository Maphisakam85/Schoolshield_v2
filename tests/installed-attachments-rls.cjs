const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
try {
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create type app_role as enum('principal','deputy','clerk','teacher','parent','sgb','security');
 create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid references schools(id),role app_role,display_name text);
 create table school_workspaces(school_id uuid primary key,payload jsonb,version integer default 13,updated_by uuid);
 create table parent_learner_links(school_id uuid,parent_id uuid,learner_ref text);
 grant select on parent_learner_links to authenticated;
 create function current_school_id() returns uuid language sql stable security definer as $$select school_id from profiles where id=auth.uid()$$;
 create function current_app_role() returns app_role language sql stable security definer as $$select role from profiles where id=auth.uid()$$;
 grant usage on schema public,auth to anon,authenticated;
 alter table school_workspaces enable row level security;grant select,insert,update on school_workspaces to authenticated;
 create policy broad_legacy on school_workspaces for all to authenticated using(school_id=current_school_id());`);
 for(const file of ['20261013110000_teacher_term_performance.sql','20261013120000_teacher_subject_performance.sql','20261013130000_teacher_targets.sql','20261013140000_teacher_term_review_workflow.sql','20261013150000_teacher_acknowledgement_support.sql','20261013160000_teacher_performance_dashboard_history.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec('create table auth.users(id uuid primary key);create table account_requests(id uuid primary key,school_id uuid,status text);');
 await db.exec(fs.readFileSync('supabase/migrations/20260924_account_request_alerts.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261013170000_teacher_teaching_assignments.sql','utf8'));
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,school=id(1),other=id(2),roles=['principal','deputy','clerk','teacher','parent','sgb','security'];
 await db.query('insert into schools values($1),($2)',[school,other]);
 for(let n=0;n<roles.length;n++) await db.query('insert into profiles values($1,$2,$3,$4)',[id(n+10),school,roles[n],roles[n]]);
 await db.query("insert into profiles values($1,$2,'principal','Other')",[id(30),other]);
 const seed={classes:[{id:'10A',grade:'Grade 10',teacher:'teacher'}],staff:[{id:'EMP1',name:'teacher',role:'Teacher'},{id:'EMP1',name:'Conflicting pilot teacher',role:'Teacher'},{id:'EMP1',name:'teacher',role:'Teacher'}],learners:[{id:'L1',name:'Learner',class:'10A',parent:'Legacy label',phone:'0710000000'}],visitors:[{id:'V1',name:'Visitor'}],incidents:[],announcements:[],security:[],notifications:[]};
 await db.query('insert into school_workspaces(school_id,payload) values($1,$2),($3,$2)',[school,JSON.stringify(seed),other]);
 await db.query('insert into parent_learner_links values($1,$2,$3)',[school,id(14),'L1']);
 await db.exec(fs.readFileSync('supabase/migrations/20261013180000_authoritative_school_entities.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261013190000_school_identity_reconciliation.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261013200000_bind_school_dataset_snapshots.sql','utf8'));

 await db.exec("create role service_role;alter table schools add column code text default 'SCHOOL',add column name text default 'School';alter table profiles add column phone text,add column address text,add column emergency_contact text,add column onboarding_completed_at timestamptz,add column created_at timestamptz default now();alter table auth.users add column email text,add column raw_app_meta_data jsonb default '{}',add column banned_until timestamptz;alter table profiles enable row level security;grant select on profiles to authenticated;create policy profile_read on profiles for select to authenticated using(id=auth.uid() or school_id=current_school_id());");
 await db.exec(fs.readFileSync('supabase/migrations/20261014100000_real_user_management.sql','utf8'));


 await db.exec(fs.readFileSync('supabase/migrations/20261014110000_managed_auth_profile_recovery.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261014130000_school_record_management.sql','utf8'));

 await db.exec("create schema storage;create table storage.buckets(id text primary key,public boolean,file_size_limit bigint,allowed_mime_types text[]);insert into storage.buckets values('school-documents',false,null,null);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;create policy \"school members read categorised documents\" on storage.objects for select to authenticated using(true);create policy \"school members upload categorised documents\" on storage.objects for insert to authenticated with check(true);create policy \"uploaders delete categorised documents\" on storage.objects for delete to authenticated using(true);create table sick_notice_attachments(id uuid primary key,school_id uuid,sick_notice_id text,storage_path text,submitted_by uuid);alter table sick_notice_attachments enable row level security;grant select on sick_notice_attachments to authenticated;");
 await db.exec(fs.readFileSync('supabase/migrations/20261014120000_install_private_attachments.sql','utf8'));
 await db.exec('insert into auth.users(id) select id from profiles on conflict do nothing');
 const login=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated');};
 const path=school+'/visitor-documents/V1/'+id(88)+'.jpg';
 await login(16);await db.query("insert into document_attachments(id,school_id,entity_type,record_id,category,storage_path,filename,content_type,size_bytes,submitted_by) values($1,$2,'visitor','V1','visitor-documents',$3,'photo.jpg','image/jpeg',4,$4)",[id(88),school,path,id(16)]);
 await assert.rejects(db.query('select complete_document_attachment($1)',[id(88)]),/missing/);checks++;
 await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('school-documents',$1,$2,$3)",[path,id(16),JSON.stringify({size:4,mimetype:'image/jpeg'})]);await db.query('select complete_document_attachment($1)',[id(88)]);
 for(const [n,visible]of [[10,1],[16,1],[15,1],[13,0],[14,0],[30,0]]){await login(n);equal((await db.query('select * from document_attachments')).rows.length,visible);equal((await db.query('select * from storage.objects')).rows.length,visible);}
 await login(13);await assert.rejects(db.query("insert into document_attachments(id,school_id,entity_type,record_id,category,storage_path,filename,content_type,size_bytes,submitted_by) values($1,$2,'visitor','V1','visitor-documents',$3,'photo.jpg','image/jpeg',4,$4)",[id(89),school,school+'/visitor-documents/V1/'+id(89)+'.jpg',id(13)]),/row-level security/);checks++;
 await db.exec('reset role');await db.query("update profiles set account_status='Inactive' where id=$1",[id(16)]);await login(16);equal((await db.query('select * from storage.objects')).rows.length,0);equal((await db.query('select * from document_attachments')).rows.length,0);
 console.log(checks+' installed attachment metadata/private Storage assertions passed');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exit(1)});
