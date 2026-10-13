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
  for(const file of ['20261013110000_teacher_term_performance.sql','20261013120000_teacher_subject_performance.sql','20261013130000_teacher_targets.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
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
  let counter=100;
  const details=extra=>({targetCategory:'Learner Achievement',description:'Improve subject performance using baseline and current evidence.',baseline:54,targetValue:65,measurementType:'Percentage',measurementSource:'current_average',nearTolerance:0,direction:'Higher is better',dueDate:'2026-12-01',priority:'High',status:'Not Yet Measured',...extra});
  const save=async(scope,body,id=uid(counter++),revision=null,term=2)=>(await db.query('select save_teacher_target($1,$2,$3,$4,$5) as target',[id,scope,term,JSON.stringify(body),revision])).rows[0].target;
  let target=await save(mathContext,details());equal(target.actual_value,61);equal(target.margin,-4);equal(target.status,'Below Target');equal(target.teacher_id,uid(5));equal(target.academic_year,2026);equal(target.subject,'Mathematics');equal(target.created_by,uid(3));equal(target.revision,1);
  const targetId=target.id;target=await save(mathContext,details({nearTolerance:5}),targetId,target.revision);equal(target.status,'Near Target');equal(target.margin,-4);equal(target.created_by,uid(3));
  const achieved=await save(mathContext,details({targetValue:61}));equal(achieved.status,'Target Achieved');equal(achieved.margin,0);
  const englishTarget=await save(englishContext,details({baseline:null,targetValue:65}));equal(englishTarget.actual_value,90);equal(englishTarget.margin,25);equal(englishTarget.subject,'English');
  const rate=await save(mathContext,details({targetCategory:'Pass Rate',targetValue:80,baseline:null,measurementSource:'manual',actualValue:84}));equal(rate.margin,4);equal(rate.status,'Target Exceeded');
  const improvement=await save(mathContext,details({targetCategory:'Learner Improvement',measurementType:'Percentage Point Improvement',measurementSource:'improvement_percentage_points',targetValue:10}));equal(improvement.actual_value,7);equal(improvement.margin,-3);
  const unknown=await save(mathContext,details({measurementSource:'manual'}));equal(unknown.actual_value,null);equal(unknown.margin,null);equal(unknown.status,'Not Yet Measured');
  const lower=await save(mathContext,details({targetCategory:'Marks Submission',baseline:10,targetValue:5,measurementType:'Number',measurementSource:'manual',actualValue:1,direction:'Lower is better'}));equal(lower.margin,-4);equal(lower.status,'Target Exceeded');
  for(const type of ['Qualitative','Completion','Yes / No']) {
    const value=await save(mathContext,details({targetCategory:'Professional Development',baseline:'Not begun',measurementType:type,measurementSource:'manual',targetValue:type==='Yes / No'?'Yes':'Complete the agreed activity',status:'In Progress',actualText:'Workshop booked'}));
    equal(value.margin,null);equal(value.actual_value,null);equal(value.status,'In Progress');
  }
  await deny(save(mathContext,details({createdBy:uid(7)})),/Invalid target fields/);
  await deny(save(mathContext,details({measurementType:'Number',measurementSource:'pass_rate'})));
  await deny(save(mathContext,details({actualValue:100})),/cannot be supplied/);
  await deny(save(mathContext,details({measurementType:'Qualitative',measurementSource:'manual',targetValue:'Plan',actualValue:1})),/cannot use numeric/);
  await login('deputy');await deny(save(mathContext,details({targetValue:70}),targetId,1),/changed/);
  const edited=await save(mathContext,details({targetValue:70}),targetId,target.revision);equal(edited.created_by,uid(3));equal(edited.updated_by,uid(4));equal(edited.margin,-9);
  // Mark-derived targets update when authoritative subject metrics change.
  await db.exec('reset role');payload.assessments.find(a=>a.id==='NOW').scores={L1:80,L2:88};await db.query('update school_workspaces set payload=$1 where school_id=$2',[JSON.stringify(payload),school]);
  await login('principal');await db.query('select refresh_teacher_subject_performance($1,2)',[mathContext]);
  const refreshed=(await db.query('select get_teacher_targets($1,2) as targets',[mathContext])).rows[0].targets.find(t=>t.id===targetId);equal(refreshed.actual_value,84);equal(refreshed.margin,14);equal(refreshed.status,'Target Exceeded');
  const b=await save(teacherBContext,details({measurementSource:'manual'}));equal(b.teacher_id,uid(6));
  const term3=await save(mathContext,details({measurementSource:'manual',targetValue:70}),undefined,null,3);equal(term3.term,3);
  await login('teacher');const own=(await db.query('select get_teacher_targets() as targets')).rows[0].targets;equal(own.every(t=>t.teacher_id===uid(5)),true);equal(own.some(t=>t.id===b.id),false);
  equal((await db.query('select * from teacher_targets where teacher_id=$1',[uid(6)])).rows.length,0);
  await deny(save(mathContext,details()));await deny(db.query('update teacher_targets set target_value=$1 where id=$2',['100',targetId]));
  await login('teacherB');equal((await db.query('select get_teacher_targets() as targets')).rows[0].targets.map(t=>t.id),[b.id]);
  for(const role of ['parent','sgb','security','clerk']) {await login(role);equal((await db.query('select * from teacher_targets')).rows.length,0);await deny(db.query('select get_teacher_targets()'));await deny(save(mathContext,details()));}
  await login('other');equal((await db.query('select get_teacher_targets() as targets')).rows[0].targets,[]);await deny(save(mathContext,details()));
  await login(null);await deny(db.query('select get_teacher_targets()'));
  console.log(`PASS ${checks} target SQL assertions: numeric/qualitative margins, near tolerance, lower-is-better, sourced updates, subject/term isolation, creator/revision protection, own-Teacher visibility and cross-school denial.`);
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
