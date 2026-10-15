const fs=require('node:fs'),assert=require('node:assert/strict');
const config=fs.readFileSync('SchoolShield/supabase-config.js','utf8'),url=/url:\s*"([^"]+)/.exec(config)[1],key=/publishableKey:\s*"([^"]+)/.exec(config)[1];
const plan=JSON.parse(fs.readFileSync('tests/fixtures/pilot-teacher-allocations-20261014.json','utf8'));
(async()=>{
  if(!process.env.PILOT_TEST_PASSWORD)throw Error('Set PILOT_TEST_PASSWORD');
  for(const role of ['principal','deputy','clerk','teacher','parent','sgb','security']){
    const auth=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:role+'@setjhabasemaketse.test',password:process.env.PILOT_TEST_PASSWORD})}).then(r=>r.json());
    if(!auth.access_token)throw Error('Test role authentication failed');
    const headers={apikey:key,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'};
    const rpc=async(name,args={})=>{const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args)});return {ok:response.ok,data:await response.json()};};
    if(['principal','deputy'].includes(role)){
      const {ok,data}=await rpc('get_teacher_performance_directory',{p_year:2026});assert.equal(ok,true);
      for(const allocation of plan.allocations){const teacher=data.teachers.find(t=>t.id===allocation.teacherId);assert.equal(teacher.staffRef,allocation.staffRef);assert.equal(teacher.department,allocation.department);assert.ok(teacher.staffId);for(const subject of allocation.subjects)assert.ok(data.contexts.some(c=>c.teacher_id===teacher.id&&c.subject_id===subject.id&&c.class_id===allocation.classId));}
    }else if(role==='clerk'){
      const {ok,data}=await rpc('get_school_records');assert.equal(ok,true);
      for(const allocation of plan.allocations){const staff=data.staff.filter(s=>s.profile_id===allocation.teacherId);assert.equal(staff.length,1);assert.equal(staff[0].staff_ref,allocation.staffRef);assert.equal(staff[0].record.staffRef,allocation.staffRef);assert.equal(staff[0].record.department,allocation.department);}
    }else{
      const denied=await rpc('get_teacher_performance_directory',{p_year:2026});assert.equal(denied.ok,false);
      if(role==='teacher'){
        const {ok,data}=await rpc('get_teacher_assignments',{p_year:2026});assert.equal(ok,true);assert.ok(data.every(a=>a.teacher_id===auth.user.id));
        const own=plan.allocations.find(a=>a.teacherId===auth.user.id);for(const subject of own.subjects)assert.ok(data.some(a=>a.class_id===own.classId&&a.subject_id===subject.id));
      }
    }
    console.log('PASS shared staff/assignment consistency and permission scope: '+role);
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
