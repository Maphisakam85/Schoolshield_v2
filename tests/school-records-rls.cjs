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
 await db.exec(fs.readFileSync('supabase/migrations/20261014160000_prevent_duplicate_staff_accounts.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261014170000_school_dataset_invalidations.sql','utf8'));
 const empty=id(3);await db.query("insert into schools(id,code,name) values($1,'EMPTY-QA','Empty QA School')",[empty]);
 const login=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated');};
 for(const [n,role,name] of [[50,'principal','QA Principal'],[51,'deputy','QA Deputy'],[52,'clerk','QA Clerk'],[53,'teacher','Teacher One'],[54,'teacher','Teacher Two'],[55,'parent','Parent One'],[56,'parent','Parent Two'],[57,'security','QA Officer'],[58,'sgb','QA SGB']]){
  await db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id(n),'qa'+n+'@school.test',JSON.stringify({role,school_code:'EMPTY-QA'})]);
  await db.query('insert into profiles(id,school_id,role,display_name) values($1,$2,$3,$4)',[id(n),empty,role,name]);
 }
 let operation=400;const save=async(kind,n,record,revision=0,op=id(operation++))=>(await db.query('select save_school_record($1,$2,$3,$4,$5) as d',[op,kind,id(n),revision,JSON.stringify(record)])).rows[0].d;
 const records=async()=>(await db.query('select get_school_records() as d')).rows[0].d;
 await login(50);equal((await records()).classes.length,0);equal((await records()).learners.length,0);
 await save('grades',60,{name:'Grade 10'});
 for(const [n,name] of [[61,'Mathematics'],[62,'English'],[63,'Life Sciences']])await save('subjects',n,{name});
 await save('staff',64,{name:'Teacher One',role:'Teacher',department:'Mathematics',status:'Active'});await save('staff',65,{name:'Teacher Two',role:'Teacher',department:'Languages',status:'Active'});
 await db.query('select link_school_staff_account($1,$2)',[id(64),id(53)]);await db.query('select link_school_staff_account($1,$2)',[id(65),id(54)]);
 for(const [n,name,t] of [[66,'10A',64],[67,'10B',65]])await save('classes',n,{class_ref:name,grade_id:id(60),teacher_staff_id:id(t),academic_year:2026,subject_ids:[id(61),id(62),id(63)]});
 await save('guardians',68,{name:'Parent One',profile_id:id(55)});await save('guardians',69,{name:'Parent Two',profile_id:id(56)});
 const parents=(await records()).guardians;equal(parents.length,2);
 for(let i=0;i<5;i++)await save('learners',70+i,{name:'Learner '+(i+1),grade_id:id(60),class_id:id(i<3?66:67),guardian_ids:[parents[i%2].id],status:'Active'});
 const shared=await records();equal(shared.classes.length,2);equal(shared.subjects.length,3);equal(shared.learners.length,5);equal(shared.staff.filter(s=>s.record.role==='Teacher').length,2);
 for(const n of [51,52]){await login(n);const own=await records();equal(own.classes.map(c=>c.id),shared.classes.map(c=>c.id));equal(own.learners.map(c=>c.id),shared.learners.map(c=>c.id));}
 await login(52);const learner=shared.learners[0];const multi=await save('learners',70,{name:learner.name,grade_id:id(60),class_id:id(66),guardian_ids:parents.map(p=>p.id),status:'Active'},learner.revision);equal(multi.id,learner.id);
 await assert.rejects(save('learners',70,{name:'Stale learner',grade_id:id(60)},learner.revision),/changed/);checks++;
 await assert.rejects(save('learners',80,{name:'Cross school',grade_id:id(60),school_id:school}),/Cross-school/);checks++;
 await assert.rejects(save('classes',81,{class_ref:'Foreign',grade_id:(await records()).grades[0].id,teacher_staff_id:shared.staff.find(s=>s.profile_id===id(50)).id,academic_year:2026}),/active school teacher/);checks++;
 const op=id(600),record={name:'Grade 11'};const once=await save('grades',82,record,0,op);equal((await save('grades',82,record,0,op)).id,once.id);
 await login(50);await db.query('select assign_teacher_subject_class($1,$2,$3,$4,$5)',[id(53),id(61),id(66),2026,'2026-01-01']);await db.query('select assign_teacher_subject_class($1,$2,$3,$4,$5)',[id(54),id(62),id(67),2026,'2026-01-01']);
 await db.exec("reset role");equal((await db.query("select count(*)::int as n from account_request_notifications where school_id=$1 and notification_type='teaching_assignment'",[empty])).rows[0].n,2);
 for(const [n,expected] of [[53,['10A']],[54,['10B']]]){await login(n);const data=(await db.query('select read_school_dataset() as d')).rows[0].d.payload;equal(data.classes.map(c=>c.id),expected);await assert.rejects(records(),/management denied/);checks++;}
 for(const n of [55,56]){await login(n);const rows=(await db.query('select id from school_learners')).rows;assert.ok(rows.length>=2);checks++;equal(rows.some(l=>l.id===id(70)),true);}
 for(const n of [57,58]){await login(n);await assert.rejects(records(),/management denied/);checks++;equal((await db.query('select id from school_learners')).rows.length,0);}
 await login(30);equal((await records()).learners.some(l=>l.id===id(70)),false);await assert.rejects(save('learners',70,{name:'Other school overwrite',grade_id:id(60)},multi.revision),/another session/);checks++;
 await login(50);const before=(await records()).staff.find(s=>s.id===id(64));await assert.rejects(save('staff',64,{name:'Forged Name',role:'Teacher',status:'Active'},before.revision),/User Management/);checks++;
 await db.exec('reset role');await db.query("update school_workspaces set payload=jsonb_set(payload,'{assessments}',$1::jsonb) where school_id=$2",[JSON.stringify([{id:'A-MATH',class:'10A',classId:id(66),subject:'Mathematics',subjectId:id(61),date:'2026-05-01',academicYear:2026},{id:'A-ENGLISH',class:'10A',classId:id(66),subject:'English',subjectId:id(62),date:'2026-05-01',academicYear:2026}]),empty]);
 await login(53);const ownAcademic=(await db.query('select read_school_dataset() as d')).rows[0].d.payload;equal(ownAcademic.assessments.map(a=>a.id),['A-MATH']);const forgedAcademic=structuredClone(ownAcademic);forgedAcademic.assessments.push({id:'UNAUTH',class:'10A',classId:id(66),subject:'English',subjectId:id(62),date:'2026-05-01'});await assert.rejects(db.query('select save_school_dataset($1,$2)',[JSON.stringify(ownAcademic),JSON.stringify(forgedAcademic)]),/approved teacher.*assignment/);checks++;
 await login(50);
 const unlinked=await save('staff',83,{name:'Support Staff',role:'Support Staff',status:'Active'});equal((await save('staff',83,{name:'Support Staff',role:'Support Staff',status:'Inactive'},unlinked.revision)).record.status,'Inactive');
 await login(55);equal((await db.query('select school_id from school_dataset_versions')).rows.map(r=>r.school_id),[empty]);await assert.rejects(db.query('update school_dataset_versions set version=100'),/permission denied/);checks++;
 await login(30);equal((await db.query('select school_id from school_dataset_versions where school_id=$1',[empty])).rows.length,0);
 console.log(checks+' school record management SQL/RLS assertions passed');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exit(1)});
