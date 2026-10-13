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
  for(const file of ['20261013110000_teacher_term_performance.sql','20261013120000_teacher_subject_performance.sql','20261013130000_teacher_targets.sql','20261013140000_teacher_term_review_workflow.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
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
  let review=await get();equal(review.revision,1);
  review=await save('draft',review.revision);equal(review.status,'In Progress');equal(review.completed_at,null);equal(review.internal_rating,null);equal(review.review_content.contextualFactors,content.contextualFactors);
  await deny(save('draft',1),/changed/);
  await deny(save('submit',review.revision,{...content,areas:content.areas.map(a=>({...a,comment:'  '}))}),/comment/);
  await deny(save('draft',review.revision,{...content,contextualFactors:['Other'],contextNotes:''}),/Explain/);
  await deny(save('draft',review.revision,content,5),/rating/);
  await deny(db.query("select set_teacher_term_review_status($1,2,'Completed')",[mathContext]),/workflow/);
  await deny(db.query("update teacher_performance_reviews set status='Completed' where id=$1",[review.id]),/permission denied/);
  await login('deputy');review=await save('submit',review.revision,content,3);
  equal(review.status,'Awaiting Teacher Acknowledgement');equal(review.internal_rating,3);equal(review.reviewer_id,uid(4));equal(!!review.completed_at,true);equal(review.evidence_snapshot.metrics.current_average,61);equal(review.evidence_snapshot.context.subject,'Mathematics');
  await deny(save('draft',review.revision),/locked/);
  await deny(save('amend',review.revision,content,4,''),/reason/);
  const frozen=JSON.stringify(review.evidence_snapshot),completedAt=review.completed_at;
  await deny(db.query('select refresh_teacher_subject_performance($1,2,null,80,null,true)',[mathContext]),/locked/);
  const metric=(await db.query('select refresh_teacher_subject_performance($1,2) as m',[mathContext])).rows[0].m;equal(metric.locked,true);equal(metric.current_average,61);
  // A locked review cannot acquire or modify targets through the existing RPC.
  await deny(db.query('select save_teacher_target($1,$2,2,$3,null)',[uid(100),mathContext,JSON.stringify({targetCategory:'Professional Development',description:'Attend workshop',baseline:'',targetValue:'Workshop',measurementType:'Qualitative',measurementSource:'manual',dueDate:'2026-12-01',priority:'Medium',status:'Not Started'})]),/locked/);
  await login('principal');review=await save('amend',review.revision,{...content,strengths:'Revised evidence-backed strength'},4,'Correct observation notes');
  equal(review.internal_rating,4);equal(review.reviewer_id,uid(3));equal(review.completed_at,completedAt);equal(JSON.stringify(review.evidence_snapshot),frozen);equal(review.status,'Awaiting Teacher Acknowledgement');
  let history=(await db.query('select * from teacher_review_history where review_id=$1 order by changed_at,id',[review.id])).rows;
  equal(history.length,3);const amendment=history.find(h=>h.action==='Review amended');equal(amendment.previous_value.internal_rating,3);equal(amendment.new_value.internal_rating,4);equal(amendment.changed_by,uid(3));equal(amendment.reason,'Correct observation notes');equal(!!amendment.changed_at,true);
  await deny(db.query('delete from teacher_review_history'),/permission denied/);await deny(db.query('delete from teacher_performance_reviews where id=$1',[review.id]),/permission denied/);
  await deny(db.query('update teacher_review_history set reason=$1',['changed']),/permission denied/);
  await deny(db.query('delete from teacher_teaching_contexts where id=$1',[mathContext]),/cannot be deleted|foreign key/);
  const term3id=(await db.query("select set_teacher_term_review_status($1,3,'Not Started') as id",[mathContext])).rows[0].id;
  const term3=await save('draft',1,content,null,'',mathContext,3);equal(term3.term,3);equal(term3.status,'In Progress');equal(term3id,term3.id);
  // Legacy Completed rows also require a reasoned amendment.
  await db.exec('reset role;alter table teacher_performance_reviews disable trigger guard_teacher_term_review');
  await db.query("update teacher_performance_reviews set status='Completed' where id=$1",[review.id]);
  await db.exec('alter table teacher_performance_reviews enable trigger guard_teacher_term_review');await login('principal');
  await deny(save('draft',review.revision),/locked/);review=await save('amend',review.revision,content,2,'Further evidence recorded');equal(review.status,'Awaiting Teacher Acknowledgement');
  await login('teacher');equal((await db.query('select id from teacher_performance_reviews')).rows.map(r=>r.id),[review.id]);equal((await db.query('select * from teacher_review_history')).rows.length,0);await deny(save('draft',1));
  await login('teacherB');equal((await db.query('select * from teacher_performance_reviews')).rows.length,0);await deny(save('draft',1));
  for(const role of ['clerk','parent','sgb','security','other']) {await login(role);equal((await db.query('select * from teacher_review_history')).rows.length,0);await deny(save('draft',1));}
  await login(null);await deny(save('draft',1),/permission denied/);
  console.log(`PASS workflow: ${checks} PostgreSQL assertions (draft, submit, lock, snapshots, rating, amendments, revisions and role/tenant isolation).`);
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
