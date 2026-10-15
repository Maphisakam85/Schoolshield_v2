// Explicit, operator-run demo configuration. Never runs at login/bootstrap.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const config=fs.readFileSync('SchoolShield/supabase-config.js','utf8');
const url=/url:\s*"([^"]+)/.exec(config)[1],key=/publishableKey:\s*"([^"]+)/.exec(config)[1];
const planPath='tests/fixtures/pilot-teacher-allocations-20261014.json';
const teachers=['06fb9e64-52cc-4be8-9b4d-ea9eba8b4f5c','6106f980-77d2-49ad-bac4-8b414560ffd4','0da24200-4dc5-48a9-855b-0d5b58510522','8036da1f-0edc-40a2-8f74-50642aa38eca'];
const originalTeacher='fa135e0b-7f5b-4f4f-98bc-fcd9ff2b3e79';
const shuffle=items=>{const result=[...items];for(let i=result.length-1;i>0;i--){const j=crypto.randomInt(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;};
(async()=>{
  if(!process.env.PILOT_TEST_PASSWORD)throw Error('Set PILOT_TEST_PASSWORD for the existing demo Principal.');
  const auth=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:'principal@setjhabasemaketse.test',password:process.env.PILOT_TEST_PASSWORD})}).then(r=>r.json());
  if(!auth.access_token)throw Error('Demo Principal authentication failed.');
  const headers={apikey:key,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'};
  const rpc=async(name,args={})=>{const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args)});const body=await response.text();const data=body?JSON.parse(body):null;if(!response.ok)throw Error(name+': '+(data?.message||'Request failed'));return data;};
  const records=await rpc('get_school_records'),directory=await rpc('get_teacher_performance_directory',{p_year:2026});
  const schools=await fetch(url+'/rest/v1/schools?select=id,code,data_mode&id=eq.'+records.school.id,{headers}).then(r=>r.json());
  assert.equal(schools[0]?.code,'SMM-001');assert.equal(schools[0]?.data_mode,'demo','Random allocations are forbidden for live schools.');
  let plan;
  if(fs.existsSync(planPath))plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
  else{
    const grades=shuffle([9,10,11,12]);
    const allocation=(teacherId,grade)=>{
      const teacher=directory.teachers.find(t=>t.id===teacherId);assert.ok(teacher?.staffRef&&teacher.staffRevision,'Canonical linked staff record required.');assert.equal(teacher.accountStatus,'Active');
      const subjects=['Mathematics','English'].map(name=>records.subjects.find(s=>s.name===name));assert.ok(subjects.every(Boolean),'Existing Mathematics and English subjects required.');
      const candidates=records.classes.filter(c=>Number(String(c.grade).match(/\d+/)?.[0])===grade&&c.record?.status!=='Inactive'&&(!c.academic_year||c.academic_year===2026)&&subjects.every(s=>records.class_subjects.some(cs=>cs.class_id===c.id&&cs.subject_id===s.id))&&subjects.every(s=>!records.assignments.some(a=>a.academic_year===2026&&a.class_id===c.id&&a.subject_id===s.id&&a.teacher_id!==teacherId)));
      const schoolClass=teacherId===originalTeacher?candidates.find(c=>c.class_ref==='8A')||shuffle(candidates)[0]:shuffle(candidates)[0];assert.ok(schoolClass,'No free valid class for Grade '+grade);
      return {teacherId,name:teacher.name,staffRef:teacher.staffRef,revision:teacher.staffRevision,operation:crypto.randomUUID(),employeeId:teacher.employeeId||null,department:grade<=9?'Senior Phase':'FET Phase',grade,classId:schoolClass.id,className:schoolClass.class_ref,subjects:subjects.map(s=>({id:s.id,name:s.name}))};
    };
    plan={schoolId:records.school.id,schoolCode:records.school.code,mode:'demo',academicYear:2026,reason:'Random demo teaching allocations explicitly requested by the pilot administrator on 14 October 2026. Not real staffing.',startDate:'2026-01-14',endDate:'2026-12-09',allocations:[...teachers.map((id,i)=>allocation(id,grades[i])),allocation(originalTeacher,8)]};
    fs.mkdirSync('tests/fixtures',{recursive:true});fs.writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n');
  }
  assert.equal(plan.schoolId,records.school.id);assert.equal(plan.mode,'demo');
  // Published DBE 2026 learner term dates; preserve any existing school dates.
  const terms=[[1,'2026-01-14','2026-03-27'],[2,'2026-04-08','2026-06-26'],[3,'2026-07-21','2026-09-23'],[4,'2026-10-06','2026-12-09']];
  for(const [term,start,end]of terms)if(!(directory.termPeriods||[]).some(t=>t.term===term))await rpc('set_teacher_review_term_dates',{p_year:2026,p_term:term,p_start:start,p_end:end});
  for(const allocation of plan.allocations){
    await rpc('save_teacher_staff_details',{p_operation:allocation.operation,p_teacher:allocation.teacherId,p_revision:allocation.revision,p_department:allocation.department,p_employee_id:allocation.employeeId});
    const current=await rpc('get_teacher_assignments',{p_year:2026});
    for(const subject of allocation.subjects)if(!current.some(a=>a.teacher_id===allocation.teacherId&&a.class_id===allocation.classId&&a.subject_id===subject.id))await rpc('assign_teacher_subject_class',{p_teacher:allocation.teacherId,p_subject:subject.id,p_class:allocation.classId,p_year:2026,p_start:plan.startDate,p_end:plan.endDate,p_notes:plan.reason});
    console.log(allocation.name+' | '+allocation.staffRef+' | '+allocation.department+' | '+allocation.className+' | '+allocation.subjects.map(s=>s.name).join(', '));
  }
  const confirmed=await rpc('get_teacher_performance_directory',{p_year:2026});
  for(const allocation of plan.allocations){const teacher=confirmed.teachers.find(t=>t.id===allocation.teacherId);assert.equal(teacher.staffRef,allocation.staffRef);assert.equal(teacher.department,allocation.department);for(const subject of allocation.subjects)assert.ok(confirmed.contexts.some(c=>c.teacher_id===teacher.id&&c.class_id===allocation.classId&&c.subject_id===subject.id));}
  console.log('Verified five linked staff references/departments and ten subject/class demo allocations.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
