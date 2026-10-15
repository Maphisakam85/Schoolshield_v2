// Read-only pilot verification. Credentials are supplied only at execution.
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const password=process.env.PILOT_TEST_PASSWORD;if(!password)throw Error('Set PILOT_TEST_PASSWORD');
 const config=fs.readFileSync('SchoolShield/supabase-config.js','utf8');
 const url=/url:\s*"([^"]+)/.exec(config)[1],key=/publishableKey:\s*"([^"]+)/.exec(config)[1];
 const domain=process.env.PILOT_TEST_DOMAIN||'setjhabasemaketse.test';let canonical,school;
 async function login(role,tenant=domain){
  const response=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:role+'@'+tenant,password})});
  const session=await response.json();if(!response.ok||!session.access_token)throw Error(role+' pilot login failed');
  return {uid:session.user.id,headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'}};
 }
 async function request(path,auth,args={}){
  const response=await fetch(url+path,{method:'POST',headers:auth.headers,body:JSON.stringify(args)});
  if(!response.ok)throw Error(path+' returned HTTP '+response.status);return response.json();
 }
 function subset(kind,rows){const byId=new Map(canonical[kind].map(r=>[r.id,r]));for(const r of rows){const shared=byId.get(r.id);assert.ok(shared,kind+' reference absent from canonical dataset');assert.equal(r.entityId,shared.entityId);assert.equal(r.school_id,school);}}
 const principal=await login('principal');canonical=(await request('/rest/v1/rpc/read_school_dataset',principal)).payload;
 school=canonical.learners[0]?.school_id;assert.ok(school);
 for(const kind of ['staff','classes','learners','security','visitors','incidents','announcements']){
  const rows=canonical[kind]||[];assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);for(const r of rows)assert.match(r.entityId,/^[0-9a-f-]{36}$/);
 }
 console.log('PASS live Principal: canonical UUIDs and unique references');
 for(const role of ['deputy','clerk','teacher','sgb','security','parent']){
  const auth=await login(role);let data;
  if(role==='parent'){
   data=(await request('/functions/v1/parent-workspace',auth)).payload;assert.ok(data);
   subset('learners',data.learners);subset('classes',data.classes);
   assert.ok(data.learners.every(l=>l.parentProfileId===auth.uid||(l.parentProfileIds||[]).includes(auth.uid)));
   assert.equal(data.staff.length,0);
  }else{
   data=(await request('/rest/v1/rpc/read_school_dataset',auth)).payload;
   for(const kind of ['staff','classes','learners','security','visitors','incidents','announcements'])subset(kind,data[kind]||[]);
   if(['deputy','clerk'].includes(role))for(const kind of ['staff','classes','learners'])assert.equal(data[kind].length,canonical[kind].length);
   if(role==='teacher')assert.ok(data.classes.every(c=>c.teacherProfileId===auth.uid||(c.teacherProfileIds||[]).includes(auth.uid)));
   if(['security','sgb'].includes(role)){assert.equal(data.learners.length,0);assert.equal(data.classes.length,0);}
   if(role==='security')assert.ok(data.security.some(o=>o.userId===auth.uid));
  }
  const raw=await fetch(url+'/rest/v1/school_workspaces?select=school_id',{headers:auth.headers});
  if(role!=='deputy'){assert.ok(raw.ok);assert.equal((await raw.json()).length,0);}
  console.log('PASS live '+role+': shared permitted UUIDs; '+data.classes.length+' classes; '+data.learners.length+' learners');
 }
 const other=await login('principal',process.env.PILOT_OTHER_DOMAIN||'lenyoralathuto.test');
 const otherData=(await request('/rest/v1/rpc/read_school_dataset',other)).payload;
 const ownIds=new Set(canonical.learners.map(r=>r.entityId));assert.ok(otherData.learners.every(r=>r.school_id!==school&&!ownIds.has(r.entityId)));
 const denied=await fetch(url+'/rest/v1/school_staff?select=id&school_id=eq.'+school,{headers:other.headers});assert.ok(denied.ok);assert.equal((await denied.json()).length,0);
 console.log('PASS live other-school Principal: tenant UUIDs separated; cross-school staff denied');
 const blocked=await fetch(url+'/rest/v1/rpc/save_school_dataset',{method:'POST',headers:principal.headers,body:JSON.stringify({p_before:otherData,p_after:otherData})});
 assert.equal(blocked.ok,false);assert.match((await blocked.json()).message,/another school/);
 console.log('PASS live cached other-school snapshot rejected before persistence');
 const issues=await fetch(url+'/rest/v1/school_identity_issues?select=id',{headers:principal.headers});assert.ok(issues.ok);console.log('Legacy reconciliation issues retained: '+(await issues.json()).length);
})().catch(error=>{console.error(error.message);process.exit(1)});
