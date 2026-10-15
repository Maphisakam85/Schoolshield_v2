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
 await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/20261014260000_learner_subject_teacher_directory.sql','utf8'));
 await login(10);const reportLearner=(await db.query('select id from school_learners where school_id=$1 limit 1',[school])).rows[0].id;
 equal(Array.isArray((await db.query('select get_learner_subject_teachers($1) as rows',[reportLearner])).rows[0].rows),true);
 for(const denied of [15,16,30]){await login(denied);await assert.rejects(db.query('select get_learner_subject_teachers($1)',[reportLearner]),/denied/);checks++;}
 await login(14);equal(Array.isArray((await db.query('select get_learner_subject_teachers($1) as rows',[reportLearner])).rows[0].rows),true);
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
 await db.exec('reset role');await db.query("update profiles set account_status='Active' where id=$1",[id(10)]);await db.query("update schools set code='SMM-001' where id=$1",[school]);
 const archived='4b9d6875-a34c-4f4d-8fda-d29fd3657b39';const archivedClass=(await db.query('select class_id from school_learners where id=$1',[reportLearner])).rows[0].class_id;
 await db.query("insert into teacher_review_subjects(id,school_id,name) values($1,$2,'Archive fixture subject')",[id(980),school]);
 await db.query("insert into teacher_class_subjects(school_id,class_id,subject_id,source) values($1,$2,$3,'management')",[school,archivedClass,id(980)]);
 await db.query("insert into teacher_teaching_contexts(id,school_id,teacher_id,subject_id,class_id,academic_year,start_date) values($1,$2,$3,$4,$5,1998,'1998-01-01')",[archived,school,id(13),id(980),archivedClass]);
 await db.query("insert into teacher_teaching_contexts(id,school_id,teacher_id,subject_id,class_id,academic_year,start_date) values($1,$2,$3,$4,$5,1997,'1997-01-01')",[id(981),school,id(13),id(980),archivedClass]);
 await login(10);await db.query("select set_teacher_review_term_dates(1998,1,'1998-01-01','1998-03-31')");await db.query("select set_teacher_term_review_status($1,1,'Not Started')",[archived]);await db.exec('reset role');
 await db.exec(fs.readFileSync('supabase/migrations/20261014270000_archive_reported_pilot_performance_context.sql','utf8'));
 await login(10);equal((await db.query('select get_teacher_performance_directory(1998) as d')).rows[0].d.contexts.length,0);
 const archivedHistory=(await db.query('select get_teacher_performance_history($1,1998) as d',[id(13)])).rows[0].d;
 equal(archivedHistory.years.includes(1998),false);equal(archivedHistory.years.includes(1997),true);equal(archivedHistory.terms.every(t=>t.contexts.length===0),true);
 equal((await db.query('select count(*)::int as n from teacher_performance_archives')).rows[0].n,1);
 equal((await db.query('select count(*)::int as n from teacher_performance_reviews where teaching_context_id=$1',[archived])).rows[0].n,1);
 await login(14);equal((await db.query('select count(*)::int as n from teacher_performance_archives')).rows[0].n,0);
 await assert.rejects(db.query('select get_teacher_performance_history($1,1998)',[id(13)]),/access denied/);checks++;
 await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/20261014280000_canonical_staff_directory_details.sql','utf8'));
 await login(10);const staffDirectory=(await db.query('select get_teacher_performance_directory(2026) as d')).rows[0].d;
 const teacherDetails=staffDirectory.teachers.find(t=>t.id===id(13));assert.match(teacherDetails.staffRef,/^STAFF-\d+$/);checks++;
 const detailArgs=[id(9990),id(13),teacherDetails.staffRevision,'Mathematics','EMP-REAL-1'];
 const details=(await db.query('select save_teacher_staff_details($1,$2,$3,$4,$5) as d',detailArgs)).rows[0].d;
 equal((await db.query('select save_teacher_staff_details($1,$2,$3,$4,$5) as d',detailArgs)).rows[0].d,details);
 const refreshed=(await db.query('select get_teacher_performance_directory(2026) as d')).rows[0].d.teachers.find(t=>t.id===id(13));equal(refreshed.department,'Mathematics');equal(refreshed.employeeId,'EMP-REAL-1');equal(refreshed.staffRef,teacherDetails.staffRef);
 equal((await db.query('select employee_id from profiles where id=$1',[id(13)])).rows[0].employee_id,'EMP-REAL-1');
 equal((await db.query("select count(*)::int as n from school_record_audit where kind='teacher-details'")).rows[0].n,1);
 await assert.rejects(db.query('select save_teacher_staff_details($1,$2,$3,$4,$5)',[id(9991),id(13),teacherDetails.staffRevision,'Changed','EMP-REAL-1']),/changed/);checks++;
 for(const n of [12,13,14,15,16,30]){await login(n);await assert.rejects(db.query('select save_teacher_staff_details($1,$2,$3,$4,$5)',[id(9992+n),id(13),refreshed.staffRevision,'Denied',null]),/denied|not in your school/);checks++;}
 await db.exec('reset role');const reference=(await db.query('select staff_ref from school_staff where id=$1',[teacherDetails.staffId])).rows[0].staff_ref;
 await db.query("update school_staff set record=record||'{\"staffRef\":\"FORGED\"}'::jsonb where id=$1",[teacherDetails.staffId]);equal((await db.query("select record->>'staffRef' as ref from school_staff where id=$1",[teacherDetails.staffId])).rows[0].ref,reference);
 await assert.rejects(db.query('update school_staff set staff_number=staff_number+1000 where id=$1',[teacherDetails.staffId]),/immutable|identity column|updated to DEFAULT/);checks++;
 await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/20261015090000_cache_workspace_save_authorization.sql','utf8'));
 await login(12);const baseline=(await db.query('select read_school_dataset() as d')).rows[0].d.payload;const changed=structuredClone(baseline);changed.notifications.push({id:id(9911),title:'Confirmed Clerk notice',scope:'clerk'});
 const saved=(await db.query('select save_school_dataset($1,$2) as d',[baseline,changed])).rows[0].d;equal(saved.payload.notifications.some(n=>n.id===id(9911)),true);
 const stale=structuredClone(changed);stale.notifications.find(n=>n.id===id(9911)).title='Stale edit';await assert.rejects(db.query('select save_school_dataset($1,$2)',[baseline,stale]),/changed in another session/);checks++;
 const denied=structuredClone(saved.payload);denied.security.push({id:id(9912),name:'Denied officer'});await assert.rejects(db.query('select save_school_dataset($1,$2)',[saved.payload,denied]),/denied/i);checks++;
 const foreign=structuredClone(saved.payload);foreign.notifications[0].school_id=other;await assert.rejects(db.query('select save_school_dataset($1,$2)',[saved.payload,foreign]),/another school/);checks++;
 console.log(checks+' live/demo isolation, integrity, privacy and operational RPC assertions passed');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exit(1)});
