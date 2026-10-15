const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const deny=async(promise,pattern=/access denied|not in your school|permission denied|units do not match|Invalid target|changed/)=>{await assert.rejects(promise,pattern);checks++;};
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create type app_role as enum('principal','deputy','clerk','teacher','parent','sgb','security');
    create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid references schools(id),role app_role,display_name text);
    create table school_workspaces(school_id uuid primary key,payload jsonb);
    create function current_school_id() returns uuid language sql stable security definer as $$select school_id from profiles where id=auth.uid()$$;
    create function current_app_role() returns app_role language sql stable security definer as $$select role from profiles where id=auth.uid()$$;
    grant usage on schema public,auth to anon,authenticated;`);
  for(const file of ['20261013110000_teacher_term_performance.sql','20261013120000_teacher_subject_performance.sql','20261013130000_teacher_targets.sql','20261013140000_teacher_term_review_workflow.sql','20261013150000_teacher_acknowledgement_support.sql','20261013160000_teacher_performance_dashboard_history.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,school=uid(1),other=uid(2);
  await db.query('insert into schools values($1),($2)',[school,other]);
  const users={principal:[3,'principal',school],deputy:[4,'deputy',school],teacher:[5,'teacher',school],teacherB:[6,'teacher',school],other:[7,'principal',other],parent:[8,'parent',school],sgb:[9,'sgb',school],security:[10,'security',school],clerk:[11,'clerk',school]};
  for(const [name,[id,role,tenant]] of Object.entries(users)) await db.query('insert into profiles values($1,$2,$3,$4)',[uid(id),tenant,role,name]);
  const payload={classes:[{id:'8A',grade:'Grade 8'}],learners:[{id:'L1',class:'8A'},{id:'L2',class:'8A'}],assessments:[
    {id:'BASE',class:'8A',subject:'Mathematics',term:'Term 2',academic_year:2026,status:'submitted',scores:{L1:50,L2:58}},
    {id:'NOW',class:'8A',subject:'Mathematics',term:'Term 2',academic_year:2026,status:'submitted',scores:{L1:60,L2:62}},
    {id:'ENG',class:'8A',subject:'English',term:'Term 2',academic_year:2026,status:'submitted',scores:{L1:80,L2:100}}]};
  await db.query('insert into school_workspaces values($1,$2),($3,$2)',[school,JSON.stringify(payload),other]);
  const login=async name=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?uid(users[name][0]):'']);await db.exec(name?'set role authenticated':'set role anon');};
  await login('principal');await db.query('select sync_teacher_review_catalogue()');
  const directory=(await db.query('select get_teacher_performance_directory(2026) as d')).rows[0].d;
  const classId=directory.classes[0].id,maths=directory.subjects.find(s=>s.name==='Mathematics').id,english=directory.subjects.find(s=>s.name==='English').id;
  const context=async(teacher,subject)=>(await db.query('select link_teacher_review_context($1,$2,$3,2026) as id',[teacher,subject,classId])).rows[0].id;
  const mathContext=await context(uid(5),maths),englishContext=await context(uid(5),english),teacherBContext=await context(uid(6),english);
  await db.query('select refresh_teacher_subject_performance($1,2,$2,null,null,true)',[mathContext,'BASE']);await db.query('select refresh_teacher_subject_performance($1,2)',[englishContext]);
  const areas=['Positive learning and teaching environment','Curriculum knowledge, planning and presentation','Learner assessment and achievement','Professional development','Extra/co-curricular participation'];
  const content={areas:areas.map(area=>({area,comment:'Reviewer observed practice and reviewed the evidence.',evidence:'Observation notes and recorded assessments'})),strengths:'Supportive teaching',concerns:'Resource constraints',recommendedSupport:'Provide LTSM',nextTermFocus:'Assessment feedback',contextNotes:'LTSM needs recorded',contextualFactors:['LTSM shortages','Overcrowding'],supportActions:[{description:'Arrange support meeting'}]};
  const get=async(scope=mathContext,term=2)=>(await db.query('select get_teacher_performance_directory(2026) as d')).rows[0].d.reviews.find(r=>r.teaching_context_id===scope&&r.term===term);
  const save=async(action,revision,body=content,rating=null,reason='',scope=mathContext,term=2)=>(await db.query('select save_teacher_review($1,$2,$3,$4,$5,$6,$7) as r',[scope,term,JSON.stringify(body),rating,action,revision,reason])).rows[0].r;
  // Install the real existing notification migration, then upgrade existing links.
  await db.exec('reset role;create table auth.users(id uuid primary key);insert into auth.users select id from profiles;create table account_requests(id uuid primary key,school_id uuid,status text);');
  await db.exec(fs.readFileSync('supabase/migrations/20260924_account_request_alerts.sql','utf8'));
  await db.exec('grant select,insert,update,delete on account_request_notifications to authenticated');
  const beforePayload=JSON.stringify(payload);await db.exec(fs.readFileSync('supabase/migrations/20261013170000_teacher_teaching_assignments.sql','utf8'));
  await login('principal');await db.query('select sync_teacher_review_catalogue()');
  const assignments=async(year=2026)=>(await db.query('select get_teacher_assignments($1) as a',[year])).rows[0].a;
  let rows=await assignments();equal(rows.length,3);equal(rows.find(a=>a.id===mathContext).start_date,null);equal(rows.find(a=>a.id===mathContext).grade,'Grade 8');
  await db.exec('reset role');equal((await db.query('select payload from school_workspaces where school_id=$1',[school])).rows[0].payload,JSON.parse(beforePayload));
  payload.classes.push({id:'8B',grade:'Grade 8'},{id:'9B',grade:'Grade 9'},{id:'10A',grade:'Grade 10'});
  payload.teacherAssignments=[{id:'APP1',teacherId:uid(5),class:'8B',subject:'Mathematics',academicYear:2026,startDate:'2026-01-15',status:'Approved'},
   {id:'APP2',teacherId:uid(5),class:'10A',subject:'Mathematical Literacy',academicYear:2026,startDate:'2026-01-15',status:'Approved'},
   {id:'OVERLAPPING-APPROVAL',teacherId:uid(6),class:'8A',subject:'Mathematics',academicYear:2026,startDate:'2026-01-15',status:'Approved'},
   {id:'CLASS-ONLY',teacherId:uid(5),class:'9B',status:'Approved'},
   {id:'PENDING',teacherId:uid(5),class:'9B',subject:'English',academicYear:2026,startDate:'2026-01-15',status:'Pending'}];
  await db.query('update school_workspaces set payload=$1 where school_id=$2',[JSON.stringify(payload),school]);const sourcePayload=JSON.stringify(payload);
  await login('principal');await db.query('select sync_teacher_review_catalogue()');let assignmentDirectory=(await db.query('select get_teacher_performance_directory(2026) as d')).rows[0].d;
  equal(assignmentDirectory.unmappedClassApprovals,1);equal(assignmentDirectory.unmappedSubjectApprovals,1);equal(assignmentDirectory.contexts.length,5);const imported=assignmentDirectory.contexts.find(a=>a.class==='8B');equal(imported.teacher_id,uid(5));equal(imported.subject,'Mathematics');equal(imported.start_date,'2026-01-15');equal(assignmentDirectory.contexts.some(a=>a.class==='10A'&&a.subject==='Mathematical Literacy'),true);
  await db.query('select sync_teacher_review_catalogue()');equal((await assignments()).length,5);
  const notices=async()=>(await db.query('select * from account_request_notifications order by created_at,id')).rows;
  await login('teacher');let alerts=await notices();equal(alerts.length,2);const importedNotice=alerts.find(a=>a.assignment_id===imported.id);equal(importedNotice.payload.title,'New Teaching Assignment');equal(importedNotice.payload.class,'8B');equal(importedNotice.recipient_id,uid(5));equal(importedNotice.payload.assignedById,uid(3));equal(!!importedNotice.payload.assignmentDate,true);
  await db.query('update account_request_notifications set read_at=now() where id=$1',[alerts[0].id]);equal(!!(await notices())[0].read_at,true);
  await deny(db.query("update account_request_notifications set payload='{}' where id=$1",[alerts[0].id]),/permission denied/);
  const class9=assignmentDirectory.classes.find(c=>c.class_ref==='9B').id,class10=assignmentDirectory.classes.find(c=>c.class_ref==='10A').id,science=assignmentDirectory.subjects.find(s=>s.name==='Natural Sciences').id;
  const assign=async(teacher,subject,cl,year=2026,start='2026-01-15',end=null)=>(await db.query('select assign_teacher_subject_class($1,$2,$3,$4,$5,$6,$7) as id',[teacher,subject,cl,year,start,end,'Support teaching allocation'])).rows[0].id;
  await deny(assign(uid(5),maths,class9));await deny(db.query('update teacher_teaching_contexts set notes=$1 where id=$2',['self edit',imported.id]),/permission denied/);
  await login('principal');await deny(assign(uid(5),maths,classId),/already exists/);await deny(assign(uid(6),maths,classId),/Another teacher/);
  await deny(assign(uid(5),science,class10),/not valid for this class/);await deny(assign(uid(8),maths,class9),/Teacher is not assigned/);
  await deny(assign(uid(5),maths,class9,2026,'2025-12-01'),/dates must be/);await deny(assign(uid(5),maths,class9,2026,'2026-06-01','2026-05-01'),/assignment_dates/);
  const ninth=await assign(uid(5),maths,class9);equal((await assignments()).find(a=>a.id===ninth).grade,'Grade 9');
  await login('deputy');const tenth=await assign(uid(5),english,class10);equal((await assignments()).find(a=>a.id===tenth).assigned_by,uid(4));
  await deny(db.query("select set_teacher_term_review_status($1,3,'Not Started')",[ninth]),/configure the school term dates/);
  for(const [term,start,end] of [[1,'2026-01-14','2026-03-27'],[2,'2026-04-08','2026-06-26'],[3,'2026-07-21','2026-10-02'],[4,'2026-10-13','2026-12-09']]) await db.query('select set_teacher_review_term_dates(2026,$1,$2,$3)',[term,start,end]);
  await deny(db.query("select set_teacher_review_term_dates(2026,2,'2026-03-01','2026-06-26')"),/cannot overlap/);
  const header=(await db.query("select set_teacher_term_review_status($1,1,'Not Started') as id",[ninth])).rows[0].id;
  const futurePlaceholder=(await db.query("select set_teacher_term_review_status($1,3,'Not Started') as id",[ninth])).rows[0].id;
  let ninthReview=(await db.query('select save_teacher_review($1,1,$2,3,$3,1,$4) as r',[ninth,JSON.stringify(content),'submit',''])).rows[0].r;equal(ninthReview.assignment_snapshot.grade,'Grade 9');equal(ninthReview.assignment_snapshot.class,'9B');
  const snapshot=JSON.stringify(ninthReview.assignment_snapshot);
  let record=(await assignments()).find(a=>a.id===ninth);
  await deny(db.query('select end_teacher_assignment($1,$2,$3,$4)',[ninth,'2026-06-26',record.revision,'']),/reason is required/);
  record=(await db.query('select end_teacher_assignment($1,$2,$3,$4) as a',[ninth,'2026-06-26',record.revision,'Moved to a new grade/class'])).rows[0].a;
  await deny(db.query('select end_teacher_assignment($1,$2,1,$3)',[ninth,'2026-06-25','Stale end date']),/changed/);
  const ended=(await assignments()).find(a=>a.id===ninth);equal(ended.eligibleTerms,[1,2]);equal(ended.end_date,'2026-06-26');
  equal((await db.query('select status from teacher_performance_reviews where id=$1',[futurePlaceholder])).rows[0].status,'Not Started');
  await deny(db.query("select set_teacher_term_review_status($1,3,'Not Started')",[ninth]),/does not cover the selected term/);
  equal(JSON.stringify((await db.query('select assignment_snapshot from teacher_performance_reviews where id=$1',[header])).rows[0].assignment_snapshot),snapshot);
  const history=(await db.query('select * from teacher_assignment_history where assignment_id=$1 order by changed_at,id',[ninth])).rows;equal(history.length,2);equal(history.find(h=>h.action==='Assignment ended/updated').previous_value.end_date,null);equal(history.find(h=>h.action==='Assignment ended/updated').new_value.end_date,'2026-06-26');
  await deny(db.query('delete from teacher_teaching_contexts where id=$1',[ninth]),/permission denied/);
  // A replacement teacher can take the subject/class after the original ends.
  const replacement=await assign(uid(6),maths,class9,2026,'2026-07-21');equal((await assignments()).find(a=>a.id===replacement).eligibleTerms,[3,4]);
  const overview=(await db.query('select get_teacher_performance_overview(2026,3,$1) as d',[JSON.stringify({teacher:uid(5)})])).rows[0].d;equal(overview.contexts.some(c=>c.id===ninth),false);equal(overview.contexts.some(c=>c.id===tenth),true);
  const historical=(await db.query('select get_teacher_performance_history($1,2026) as d',[uid(5)])).rows[0].d;equal(historical.terms[0].contexts.some(c=>c.id===ninth),true);equal(historical.terms[2].contexts.some(c=>c.id===ninth),false);
  await login('teacher');rows=await assignments();equal(rows.every(a=>a.teacher_id===uid(5)),true);equal(rows.some(a=>a.id===replacement),false);equal((await notices()).length,4);
  const own=(await db.query('select get_my_teacher_performance(2026,3) as d')).rows[0].d;equal(own.some(c=>c.id===ninth),false);equal(own.some(c=>c.id===tenth),true);
  await deny(db.query("select end_teacher_assignment($1,'2026-12-01',1,'Self assignment end')",[tenth]));
  await deny(db.query("select set_teacher_review_term_dates(2026,1,'2026-01-01','2026-03-01')"));
  await login('teacherB');equal((await assignments()).every(a=>a.teacher_id===uid(6)),true);equal((await notices()).length,1);
  // Legacy workspace writes must not let a teacher forge an approved mapping.
  await db.exec('reset role;grant select,update on school_workspaces to authenticated');await login('teacher');
  const forged=structuredClone(payload);forged.teacherAssignments.push({id:'FORGED',teacherId:uid(5),class:'10A',subject:'English',academicYear:2026,status:'Approved'});
  await deny(db.query('update school_workspaces set payload=$1 where school_id=$2',[JSON.stringify(forged),school]),/Only Principal\/Deputy/);
  await login('clerk');await db.exec('begin');const pending=structuredClone(payload);pending.teacherAssignments.push({id:'REQUEST',class:'8A',teacher:'teacherB',status:'Pending'});await db.query('update school_workspaces set payload=$1 where school_id=$2',[JSON.stringify(pending),school]);await db.exec('rollback');
  await deny(db.query('update school_workspaces set payload=$1 where school_id=$2',[JSON.stringify(forged),school]),/Only Principal\/Deputy/);
  await login('principal');const future=await assign(uid(5),maths,class9,2099,'2099-01-15');equal((await assignments(2099))[0].id,future);equal((await assignments(2099))[0].status,'Upcoming');
  await db.exec('reset role');users.unassigned=[30,'teacher',school];await db.query('insert into auth.users values($1)',[uid(30)]);await db.query('insert into profiles values($1,$2,$3,$4)',[uid(30),school,'teacher','Teacher with no assignments']);
  await login('unassigned');equal(await assignments(),[]);equal((await db.query('select get_my_teacher_performance(2026,2) as d')).rows[0].d,[]);await deny(assign(uid(30),maths,class9));
  for(const role of ['parent','sgb','security','clerk']) {await login(role);await deny(assign(uid(5),maths,class9));await deny(assignments());equal((await db.query('select * from teacher_teaching_contexts')).rows.length,0);equal((await notices()).length,0);}
  await login('other');await db.query('select sync_teacher_review_catalogue()');await deny(assign(uid(5),maths,classId),/not in your school/);await deny(db.query("select end_teacher_assignment($1,'2026-12-01',1,'Other school edit')",[tenth]),/not in your school/);equal(await assignments(),[]);equal((await notices()).length,0);
  await login(null);await deny(assignments(),/permission denied/);await deny(assign(uid(5),maths,class9),/permission denied/);
  await db.exec('reset role');equal((await db.query('select payload from school_workspaces where school_id=$1',[school])).rows[0].payload,JSON.parse(sourcePayload));
  console.log(`PASS teaching assignments: ${checks} PostgreSQL assertions (imports, multi-subject/class/grade, exact duplicates, overlaps, notification privacy, own view, dates/history, replacements, roles/tenants and unchanged source data).`);
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
