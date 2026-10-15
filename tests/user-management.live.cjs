// Creates real, clearly labelled QA Auth accounts; retains them Inactive after testing.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const password=process.env.PILOT_TEST_PASSWORD;if(!password)throw Error('Set PILOT_TEST_PASSWORD');
 const config=fs.readFileSync('SchoolShield/supabase-config.js','utf8'),url=/url:\s*"([^"]+)/.exec(config)[1],key=/publishableKey:\s*"([^"]+)/.exec(config)[1];
 const run=Date.now().toString(36),newPassword=crypto.randomBytes(22).toString('base64url')+'!a1',created=[];let checks=0;
 const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
 async function request(path,session,body,method=body?'POST':'GET'){
  const res=await fetch(url+path,{method,headers:{apikey:key,'Content-Type':'application/json',...(session?.access_token?{Authorization:'Bearer '+session.access_token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json().catch(()=>({}));return {ok:res.ok,status:res.status,data};
 }
 async function login(email,pass=password){const r=await request('/auth/v1/token?grant_type=password',null,{email,password:pass});if(!r.ok)throw Error('Login failed: '+(r.data.msg||r.data.error_description));return r.data;}
 const principal=await login('principal@setjhabasemaketse.test');
 const rpc=async(name,session,args={})=>{const r=await request('/rest/v1/rpc/'+name,session,args);if(!r.ok)throw Error(name+': '+r.data.message);return r.data;};
 const list=()=>rpc('list_school_users',principal);
 const initial=await list(),school=initial.school.id;
 async function manage(session,body){const r=await request('/functions/v1/manage-users',session,{operation_id:crypto.randomUUID(),...body});if(!r.ok||!r.data.ok)throw Error('Management '+body.action+': '+r.data.error);return r.data;}
 try{
  for(const role of ['principal','deputy','clerk','teacher','parent','sgb','security']){
   const email='qa.users.'+run+'.'+role+'@schoolshield.test';
   const result=await manage(principal,{action:'create',delivery:'setup_link',fields:{first_name:'QA '+run,last_name:role,email,phone:'0821234567',role,school_id:school,account_status:'Active',employee_id:'QA-'+run+'-'+role}});
   created.push({id:result.user_id,role,email});
   assert.ok(result.setup_link);checks++;
   const duplicate=await request('/functions/v1/manage-users',principal,{action:'create',operation_id:crypto.randomUUID(),delivery:'setup_link',fields:{first_name:'Duplicate',last_name:'QA',email,phone:'0821234567',role,school_id:school}});check(duplicate.ok,false);
   const link=new URL(result.setup_link);const verified=await request('/auth/v1/verify',null,{token_hash:link.searchParams.get('token_hash'),type:link.searchParams.get('type')});if(!verified.ok)throw Error('Invitation verification failed: '+verified.data.msg);const invited=verified.data;check(invited.user.id,result.user_id);
   const pending=await request('/rest/v1/rpc/read_school_dataset',invited,{});check(pending.ok,false);
   const updated=await request('/auth/v1/user',invited,{password:newPassword},'PUT');if(!updated.ok)throw Error('Password creation failed');checks++;
   await rpc('complete_my_profile',invited,{p_display_name:'QA '+run+' '+role,p_phone:'+27821234567'});
   const reused=await request('/auth/v1/verify',null,{token_hash:link.searchParams.get('token_hash'),type:link.searchParams.get('type')});check(reused.ok,false);
   await request('/auth/v1/logout',invited,{},'POST');const session=await login(email,newPassword);created.at(-1).session=session;check(session.user.id,result.user_id);
   const p=await request('/rest/v1/profiles?id=eq.'+result.user_id+'&select=id,role,school_id,account_status,onboarding_completed_at',session);check(p.data[0].role,role);check(p.data[0].school_id,school);assert.ok(p.data[0].onboarding_completed_at);checks++;
   if(role==='parent'){const own=await request('/functions/v1/parent-workspace',session,{});check(own.ok,true);}else await rpc('read_school_dataset',session);
   if(role!=='principal') {
    const escalation=await request('/functions/v1/manage-users',session,{action:'create',delivery:'setup_link',operation_id:crypto.randomUUID(),fields:{first_name:'Forbidden',last_name:'Admin',email:'qa.forbidden.'+run+'@schoolshield.test',phone:'0821234567',role:'principal',school_id:school}});check(escalation.ok,false);
   }
   console.log('PASS real '+role+': invite, password/setup, first login, UUID/school/role, logout/login, reused link rejection');
  }
  const teacher=created.find(u=>u.role==='teacher'),deputy=created.find(u=>u.role==='deputy'),clerk=created.find(u=>u.role==='clerk');
  let current=(await list()).users.find(u=>u.id===teacher.id);
  await manage(clerk.session,{action:'edit',user_id:teacher.id,fields:{first_name:'QA Updated',last_name:run,email:teacher.email,phone:'0831234567',role:'teacher',school_id:school,account_status:'Active',employee_id:current.employee_id,revision:current.management_revision}});
  const canonical=await rpc('read_school_dataset',principal);const staff=canonical.payload.staff.find(s=>s.profileId===teacher.id);check(staff.name,'QA Updated '+run);check(staff.phone,'+27831234567');
  current=(await list()).users.find(u=>u.id===teacher.id);
  await manage(deputy.session,{action:'status',user_id:teacher.id,account_status:'Inactive',revision:current.management_revision});
  const stale=await request('/rest/v1/rpc/get_teacher_targets',teacher.session,{});check(stale.ok,false);
  const banned=await request('/auth/v1/token?grant_type=password',null,{email:teacher.email,password:newPassword});check(banned.ok,false);
  current=(await list()).users.find(u=>u.id===teacher.id);await manage(deputy.session,{action:'status',user_id:teacher.id,account_status:'Active',revision:current.management_revision});check((await login(teacher.email,newPassword)).user.id,teacher.id);
  const other=await login('principal@lenyoralathuto.test');const denied=await request('/functions/v1/manage-users',other,{action:'status',operation_id:crypto.randomUUID(),user_id:teacher.id,account_status:'Inactive',revision:current.management_revision});check(denied.ok,false);
  const cross=(await rpc('list_school_users',other)).users;check(cross.some(u=>u.id===teacher.id),false);
  const forged=await request('/functions/v1/manage-users',principal,{action:'create',operation_id:crypto.randomUUID(),delivery:'setup_link',fields:{first_name:'Cross',last_name:'School',email:'cross.'+run+'@schoolshield.test',phone:'0821234567',role:'teacher',school_id:crypto.randomUUID()}});check(forged.ok,false);
  console.log('PASS real profile propagation, Clerk edit, Deputy deactivate/reactivate, banned login, old-JWT denial, cross-school denial');
 }finally{
  for(const item of created){try{const p=(await list()).users.find(u=>u.id===item.id);if(p?.account_status==='Active')await manage(principal,{action:'status',user_id:item.id,account_status:'Inactive',revision:p.management_revision});}catch(e){console.error('QA cleanup requires deactivation for '+item.id+': '+e.message);}}
  console.log('QA Auth accounts retained Inactive: '+created.length);
 }
 console.log(checks+' real Auth/backend assertions passed');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
