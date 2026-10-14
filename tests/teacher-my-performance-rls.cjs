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
  for(const file of ['20261013110000_teacher_term_performance.sql','20261013120000_teacher_subject_performance.sql','20261013130000_teacher_targets.sql','20261013140000_teacher_term_review_workflow.sql','20261013150000_teacher_acknowledgement_support.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
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
  let review=await save('draft',1);
  const own=async(year=2026,term=2)=>(await db.query('select get_my_teacher_performance($1,$2) as d',[year,term])).rows[0].d;
  const ack=async(id,revision,comment='I acknowledge receipt but disagree with the rating.')=>(await db.query('select acknowledge_teacher_review($1,$2,$3) as r',[id,revision,comment])).rows[0].r;
  const details={support_area:'Assessment design',intervention:'Peer review the next assessment',responsible_person:'Head of Department',due_date:'2026-11-01',follow_up_date:'2026-11-08',status:'Planned',outcome:''};
  const support=async(id,reviewId,body=details,revision=null)=>(await db.query('select save_teacher_support_action($1,$2,$3,$4) as a',[id,reviewId,JSON.stringify(body),revision])).rows[0].a;
  let action=await support(uid(100),review.id);equal(action.teacher_id,uid(5));equal(action.school_id,school);equal(action.revision,1);equal(action.created_by,uid(3));equal(action.status,'Planned');
  await deny(support(uid(101),review.id,{...details,created_by:uid(4)}),/Invalid support fields/);
  await deny(support(uid(101),review.id,{...details,intervention:'  '}),/check constraint/);
  await login('deputy');action=await support(action.id,review.id,{...details,status:'In Progress',outcome:'Peer observation booked'},action.revision);
  equal(action.revision,2);equal(action.created_by,uid(3));equal(action.updated_by,uid(4));equal(action.outcome,'Peer observation booked');
  await deny(support(action.id,review.id,details,1),/changed/);
  await login('teacher');let data=await own();equal(data.length,2);equal(data.every(c=>['Mathematics','English'].includes(c.subject)),true);
  let math=data.find(c=>c.subject==='Mathematics');equal(math.review,null);equal(math.metrics.current_average,61);equal('reviewer_comment' in math.metrics,false);equal(math.supportActions[0].id,action.id);
  await deny(ack(review.id,review.revision),/Completed own review required/);
  await deny(support(uid(102),review.id));await deny(db.query('update teacher_support_actions set outcome=$1 where id=$2',['tampered',action.id]),/permission denied/);
  await login('principal');review=await save('submit',review.revision,content,3);const reviewerId=review.reviewer_id,completedAt=review.completed_at;
  await deny(ack(review.id,review.revision),/access denied/);
  const bId=(await db.query("select set_teacher_term_review_status($1,2,'Not Started') as id",[teacherBContext])).rows[0].id;
  await support(uid(103),bId);await deny(support(action.id,bId,details,action.revision),/scope cannot change/);
  await login('teacherB');equal((await own()).length,1);equal((await db.query('select * from teacher_support_actions')).rows.map(a=>a.id),[uid(103)]);await deny(ack(review.id,review.revision),/Completed own review required/);
  await login('teacher');data=await own();math=data.find(c=>c.subject==='Mathematics');equal(math.review.internal_rating,3);equal(math.review.review_content.strengths,content.strengths);equal(math.supportActions[0].outcome,'Peer observation booked');
  await deny(ack(review.id,1),/changed/);await deny(ack(review.id,review.revision,'x'.repeat(6001)),/too long/);
  const priorRevision=review.revision;review=await ack(review.id,review.revision);equal(review.status,'Completed');equal(!!review.teacher_acknowledged_at,true);equal(review.teacher_comment,'I acknowledge receipt but disagree with the rating.');equal(review.internal_rating,3);equal(review.reviewer_id,reviewerId);equal(review.completed_at,completedAt);equal(review.revision,priorRevision+1);
  await deny(ack(review.id,review.revision),/already acknowledged/);
  await deny(db.query('update teacher_performance_reviews set internal_rating=4 where id=$1',[review.id]),/permission denied/);await deny(save('amend',review.revision,content,4,'Override teacher rating'));
  await deny(db.query("select save_teacher_target($1,$2,2,'{}',null)",[uid(120),mathContext]));
  equal((await db.query('select * from teacher_support_actions')).rows.length,1);equal((await db.query('select * from teacher_review_history')).rows.length,0);
  await login('principal');let history=(await db.query("select * from teacher_review_history where review_id=$1 and action='Teacher acknowledged'",[review.id])).rows;
  equal(history.length,1);equal(history[0].changed_by,uid(5));equal(history[0].previous_value.teacher_acknowledged_at,null);equal(history[0].new_value.teacher_comment,review.teacher_comment);equal(history[0].reason.includes('does not mean agreement'),true);
  review=await save('amend',review.revision,{...content,strengths:'Updated evidence'},4,'Additional observation evidence');equal(review.status,'Awaiting Teacher Acknowledgement');equal(review.teacher_acknowledged_at,null);equal(review.teacher_comment,'');
  history=(await db.query("select * from teacher_review_history where review_id=$1 and action='Review amended'",[review.id])).rows;equal(history[0].previous_value.teacher_comment,'I acknowledge receipt but disagree with the rating.');equal(!!history[0].previous_value.teacher_acknowledged_at,true);
  // Follow-up remains editable independently of the immutable review snapshot.
  action=await support(action.id,review.id,{...details,status:'Completed',outcome:'Revised assessment approved'},action.revision);equal(action.status,'Completed');equal(action.revision,3);
  await login('teacher');review=await ack(review.id,review.revision,'Received the amended review.');equal(review.status,'Completed');equal(review.teacher_comment,'Received the amended review.');equal((await own()).find(c=>c.subject==='Mathematics').supportActions[0].outcome,'Revised assessment approved');
  for(const role of ['parent','sgb','security','clerk','other']) {await login(role);await deny(own());await deny(ack(review.id,review.revision));await deny(support(uid(150),review.id),/access denied|not in your school/);equal((await db.query('select * from teacher_support_actions')).rows.length,0);}
  await db.exec('reset role');await db.query('insert into profiles values($1,$2,$3,$4)',[uid(20),other,'teacher','Other-school Teacher']);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(20)]);await db.exec('set role authenticated');
  equal(await own(),[]);await deny(ack(review.id,review.revision),/Completed own review required/);equal((await db.query('select * from teacher_support_actions')).rows.length,0);
  await login(null);await deny(own(),/permission denied/);await deny(ack(review.id,review.revision),/permission denied/);
  console.log(`PASS My Performance: ${checks} PostgreSQL assertions (own-only data, receipt/response, amendment re-acknowledgement, support lifecycle, management isolation and roles/tenants).`);
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
