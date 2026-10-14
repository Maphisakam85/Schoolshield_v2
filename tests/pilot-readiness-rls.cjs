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

 await db.exec("create table sick_notices(id uuid primary key default gen_random_uuid(),school_id uuid,learner_ref text,submitted_by uuid);grant select on sick_notices to authenticated;");
 for(const file of ['20261014140000_pilot_school_provisioning.sql','20261014160000_prevent_duplicate_staff_accounts.sql','20261014170000_school_dataset_invalidations.sql','20261014180000_live_demo_isolation_and_integrity.sql','20261014190000_restore_live_operational_rpcs.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.query("update auth.users u set email=p.id::text||'@qa.test',raw_app_meta_data=jsonb_build_object('school_code',s.code,'role',p.role) from profiles p join schools s on s.id=p.school_id where p.id=u.id");
 for(const file of ['20261014210000_personal_notification_reads.sql','20261014220000_canonical_shift_records.sql','20261014230000_operational_identity_dates.sql','20261014240000_notification_reader_tenant_fk.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const login=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated');};
 await db.query("insert into sick_notices(school_id,learner_ref,submitted_by) values($1,'L1',$2)",[school,id(14)]);
 for(const [n,count]of [[10,1],[11,1],[12,1],[13,1],[14,1],[15,0],[16,0],[30,0]]){await login(n);equal((await db.query('select * from parent_learner_links')).rows.length,count);equal((await db.query('select * from sick_notices')).rows.length,count);}
 await login(10);const audit=(await db.query('select school_integrity_report() as d')).rows[0].d;equal(audit.critical_issue_count,0);equal(audit.data_mode,'live');assert.ok(audit.warnings.unresolved_legacy_identities>0);checks++;
 for(const n of [13,14,15,16]){await login(n);await assert.rejects(db.query('select school_integrity_report()'),/access denied/);checks++;}
 await db.exec('reset role');const empty=id(900),fields={code:'REAL-QA',name:'Real blank school',first_name:'Real',last_name:'Principal',email:'principal@real.school',phone:'+27821234567',purpose:'pilot'};
 await db.query('select reserve_pilot_school($1,$2,$3)',[id(10),empty,JSON.stringify(fields)]);equal((await db.query('select data_mode from schools where id=$1',[empty])).rows[0].data_mode,'live');
 const blank=(await db.query('select payload from school_workspaces where school_id=$1',[empty])).rows[0].payload;for(const key of ['learners','staff','visitors','incidents','parentChat','teacherChat','sgbPrincipalChat'])equal((blank[key]||[]).length,0);
 await login(16);const officer=(await db.query('select read_school_dataset() as d')).rows[0].d.payload.security.find(o=>o.userId===id(16));
 const shift=(await db.query("select record_security_shift($1,'check-in','2026-10-14','18:00','06:00') as s",[officer.id])).rows[0].s;equal(shift.scheduledDurationMinutes,720);assert.ok(shift.actualCheckInAt);checks++;
 await assert.rejects(db.query("select record_security_shift($1,'check-in','2026-10-14','18:00','06:00')",[officer.id]),/active shift/);checks++;
 equal((await db.query("select record_security_shift($1,'check-out') as s",[officer.id])).rows[0].s.status,'Completed');
 await login(10);const args=['ANN-QA','QA announcement','Real persisted body','whole-school','Whole school','In-app notification',1,'create'];const announcement=(await db.query('select publish_school_announcement($1,$2,$3,$4,$5,$6,$7,$8) as a',args)).rows[0].a;equal(announcement.school_id,school);equal(announcement.authorId,id(10));
 await assert.rejects(db.query('select publish_school_announcement($1,$2,$3,$4,$5,$6,$7,$8)',['ANN-EMPTY','Title','   ','whole-school','Whole school','In-app notification',1,'create']),/title and a message/);checks++;
 await assert.rejects(db.query('select publish_school_announcement($1,$2,$3,$4,$5,$6,$7,$8)',['ANN-SMS','Title','Body','whole-school','Whole school','In-app + SMS',1,'create']),/not implemented/);checks++;
 await db.exec('reset role');await db.query("update profiles set account_status='Inactive' where id=$1",[id(16)]);await login(16);await assert.rejects(db.query("select record_security_shift($1,'check-in','2026-10-14','18:00','06:00')",[officer.id]),/inactive/);checks++;
 await db.exec('reset role');await db.query("update profiles set account_status='Inactive' where id=$1",[id(10)]);await login(10);await assert.rejects(db.query('select publish_school_announcement($1,$2,$3,$4,$5,$6,$7,$8)',args),/inactive/);checks++;
 console.log(checks+' live/demo isolation, integrity, privacy and operational RPC assertions passed');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exit(1)});
