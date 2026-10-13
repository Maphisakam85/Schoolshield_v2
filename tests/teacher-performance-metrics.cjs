const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create type app_role as enum('principal','deputy','clerk','teacher','parent','sgb','security');
    create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid references schools(id),role app_role,display_name text);
    create table school_workspaces(school_id uuid primary key,payload jsonb);
    create function current_school_id() returns uuid language sql stable security definer as $$select school_id from profiles where id=auth.uid()$$;
    create function current_app_role() returns app_role language sql stable security definer as $$select role from profiles where id=auth.uid()$$;
    grant usage on schema public,auth to anon,authenticated;`);
  for(const file of ['20261013110000_teacher_term_performance.sql','20261013120000_teacher_subject_performance.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,school=uid(1),other=uid(2);
  await db.query('insert into schools values($1),($2)',[school,other]);
  for(const [n,role,tenant] of [[3,'principal',school],[4,'deputy',school],[5,'teacher',school],[6,'teacher',school],[7,'principal',other],[8,'parent',school]]) await db.query('insert into profiles values($1,$2,$3,$4)',[uid(n),tenant,role,role+' '+n]);
  const task=(id,subject,schoolClass,term,scores,date='2026-05-01',extra={})=>({id,title:id,subject,class:schoolClass,term,date,status:'submitted',scores,weighting:20,...extra});
  const payload={classes:[{id:'8A',grade:'Grade 8'},{id:'8B',grade:'Grade 8'}],learners:[{id:'L1',class:'8A'},{id:'L2',class:'8A'},{id:'L3',class:'8B'}],assessments:[
    task('BASE','Mathematics','8A','Term 2',{L1:50,L2:58}),task('NOW','Mathematics','8A','Term 2',{L1:60,L2:62}),
    task('PREV','Mathematics','8A','Term 1',{L1:40,L2:60}),task('ENG','English','8A','Term 2',{L1:80,L2:100}),
    task('OTHERCLASS','Mathematics','8B','Term 2',{L3:30}),task('UNKNOWNYEAR','Mathematics','8A','Term 2',{L1:100,L2:100},'—')],staff:[]};
  await db.query('insert into school_workspaces values($1,$2),($3,$2)',[school,JSON.stringify(payload),other]);
  const login=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');};
  await login(3);await db.query('select sync_teacher_review_catalogue()');
  const dir=(await db.query('select get_teacher_performance_directory(2026) as d')).rows[0].d;
  const maths=dir.subjects.find(s=>s.name==='Mathematics').id,english=dir.subjects.find(s=>s.name==='English').id,classA=dir.classes.find(c=>c.class_ref==='8A').id,classB=dir.classes.find(c=>c.class_ref==='8B').id;
  const context=async(subject,schoolClass)=>(await db.query('select link_teacher_review_context($1,$2,$3,2026) as id',[uid(5),subject,schoolClass])).rows[0].id;
  const mathA=await context(maths,classA),englishA=await context(english,classA),mathB=await context(maths,classB);
  const refresh=async(id,term=2,baseline=null,update=false,coverage=null,comment=null)=>(await db.query('select refresh_teacher_subject_performance($1,$2,$3,$4,$5,$6) as metrics',[id,term,baseline,coverage,comment,update])).rows[0].metrics;
  let metrics=await refresh(mathA,2,'BASE',true);
  for(const [key,expected] of Object.entries({baseline_average:54,current_average:61,previous_term_average:50,improvement_percentage_points:7,pass_rate:100,number_of_learners:2,learners_with_marks:2,learners_improving:2,learners_declining:0,learners_at_risk:0,comparable_learners:2,assessments_planned:2,assessments_completed:2,marks_outstanding:0,curriculum_coverage:null})) equal(metrics[key],expected);
  equal(metrics.calculation_details.ignored_unscoped_assessments,1);equal(metrics.subject,'Mathematics');equal(metrics.grade,'Grade 8');equal(metrics.class_id,classA);
  equal((await refresh(englishA)).current_average,90);equal((await refresh(mathB)).current_average,30);
  await assert.rejects(refresh(mathA,2,'ENG',true),/Baseline must be/);checks++;
  metrics=await refresh(mathA,2,'BASE',true,72.5,'Evidence of improvement; retain learner context.');equal(metrics.curriculum_coverage,72.5);equal(metrics.reviewer_comment,'Evidence of improvement; retain learner context.');
  const oldId=metrics.id;metrics=await refresh(mathA);equal(metrics.id,oldId);equal(metrics.baseline_assessment_id,'BASE');equal(metrics.curriculum_coverage,72.5);
  // Authoritative server calculations cannot be replaced with client-supplied marks.
  await assert.rejects(db.query('update teacher_performance_subjects set current_average=100'),/permission denied/);checks++;
  const calculate=async(workspace,subject='Mathematics',schoolClass='8A',year=2026,term=2,baseline='BASE')=>{
    await db.exec('reset role');return (await db.query('select calculate_teacher_subject_evidence($1,$2,$3,$4,$5,$6) as result',[JSON.stringify(workspace),schoolClass,subject,year,term,baseline])).rows[0].result;
  };
  const weighted=structuredClone(payload);weighted.assessments.push(task('WEIGHTED','Mathematics','8A','Term 2',{L1:80,L2:40},'2026-05-02',{weighting:60}));
  let result=await calculate(weighted);equal(result.current_average,60.25);equal(result.learners_improving,1);equal(result.learners_declining,1);equal(result.learners_at_risk,1);equal(result.pass_rate,50);equal(result.improvement_percentage_points,6.25);
  const missing=structuredClone(payload);missing.assessments.find(a=>a.id==='NOW').scores={L1:0,L2:''};
  result=await calculate(missing);equal(result.current_average,0);equal(result.pass_rate,0);equal(result.learners_with_marks,1);equal(result.marks_outstanding,1);equal(result.comparable_learners,1);equal(result.comparison_baseline_average,50);equal(result.improvement_percentage_points,-50);
  missing.assessments.find(a=>a.id==='NOW').scores={L1:null,L2:'N/A'};result=await calculate(missing);equal(result.current_average,null);equal(result.learners_improving,null);equal(result.learners_at_risk,null);equal(result.marks_outstanding,2);
  const empty={classes:payload.classes,learners:payload.learners,assessments:[]};result=await calculate(empty,'Mathematics','8A',2026,2,null);equal(result.number_of_learners,2);equal(result.current_average,null);equal(result.baseline_average,null);equal(result.assessments_planned,null);equal(result.pass_rate,null);
  result=await calculate(payload,'Mathematics','8A',2026,2,null);equal(result.baseline_average,null);equal(result.improvement_percentage_points,null);equal(result.learners_improving,null);
  const newYear=structuredClone(payload);newYear.assessments.push(task('LASTYEAR','Mathematics','8A','Term 4',{L1:30,L2:50},'2025-11-01'));
  result=await calculate(newYear,'Mathematics','8A',2026,1,null);equal(result.previous_term_average,40);equal(result.calculation_details.previous_year,2025);equal(result.calculation_details.previous_term,4);
  const noWeight=structuredClone(weighted);delete noWeight.assessments.find(a=>a.id==='WEIGHTED').weighting;result=await calculate(noWeight);equal(result.current_average,60.5);
  await login(4);equal((await refresh(mathA)).current_average,61);await db.query("select set_teacher_term_review_status($1,2,'Completed')",[mathA]);
  await login(5);equal((await db.query('select * from teacher_performance_subjects')).rows.length,1);await assert.rejects(refresh(mathA),/management access denied/);checks++;
  await login(6);equal((await db.query('select * from teacher_performance_subjects')).rows.length,0);
  await login(7);equal((await db.query('select * from teacher_performance_subjects')).rows.length,0);await assert.rejects(refresh(mathA),/not in your school/);checks++;
  await login(8);equal((await db.query('select * from teacher_performance_subjects')).rows.length,0);await assert.rejects(refresh(mathA),/management access denied/);checks++;
  console.log(`PASS ${checks} subject-performance assertions: normalized persistence/RLS, +7 percentage points, matched cohorts, weighted marks, subjects/classes/terms/years, missing data, zero marks, previous-term and curriculum summaries.`);
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
