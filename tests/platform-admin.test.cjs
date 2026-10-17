const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const actor='00000000-0000-4000-8000-000000000080',operation='00000000-0000-4000-8000-000000009100';
const fields={name:'Fictional QA School',code:'QA-FICTIONAL',purpose:'qa',principal_first_name:'QA',principal_last_name:'Principal',principal_email:'principal@fictional.example.test',principal_phone:'0821234567'};
async function serviceHarness(failAt) {
 const {provisionPlatformSchool}=await import('../supabase/functions/provision-school/platform-service.mjs');
 const calls=[],users=new Map();let failed=false;
 const op={id:operation,school_id:'00000000-0000-4000-8000-000000009101',principal_id:'00000000-0000-4000-8000-000000009102'};
 const admin={rpc:async(name,args)=>{calls.push({name,args});if(name==='reserve_platform_school')return {data:op};if(name==='finish_platform_school')return {data:{id:op.principal_id,requires_setup:true,account_status:'Active'}};return {data:null};},auth:{admin:{
 getUserById:async id=>users.has(id)?{data:{user:users.get(id)}}:{error:{status:404}},
 createUser:async input=>{calls.push({name:'createUser',input});if(failAt==='auth'&&!failed){failed=true;return {error:{message:'QA simulated Auth failure'}};}const user={id:input.id,email:input.email};users.set(user.id,user);return {data:{user}};},
 generateLink:async()=>{if(failAt==='link'&&!failed){failed=true;return {error:{message:'QA simulated link failure'}};}return {data:{user:{id:op.principal_id},properties:{hashed_token:'fixture-token'}}};},
 }}};
 const run=(overrides={})=>provisionPlatformSchool({admin,actorId:actor,body:{action:'create',operation_id:operation,fields,...overrides},env:key=>({SCHOOLSHIELD_ACCOUNT_SETUP_URL:'https://school.example.test/account-setup.html',SCHOOLSHIELD_ALLOW_QA_PROVISIONING:'true'})[key]});
 return {run,calls,op};
}
test('platform provisioning reuses canonical reservations after Auth and setup-link failures',async()=>{
 for(const stage of ['auth','link']){
  const {run,calls,op}=await serviceHarness(stage);await assert.rejects(run(),/failed/);
  assert.equal(calls.find(c=>c.name==='record_platform_provision_result').args.p_success,false);
  const result=await run();assert.equal(result.school_id,op.school_id);assert.equal(result.user_id,op.principal_id);assert.match(result.setup_link,/account-setup.html\?token_hash=/);
  assert.ok(calls.filter(c=>c.name==='reserve_platform_school').every(c=>c.args.p_operation===operation));
  if(stage==='link')assert.equal(calls.filter(c=>c.name==='createUser').length,1);
  assert.equal(calls.at(-1).args.p_success,true);
 }
});
test('live provisioning rejects fictional email and validates mode before creating records',async()=>{
 const {run,calls}=await serviceHarness();await assert.rejects(run({fields:{...fields,purpose:'live'}}),/verified real/);assert.equal(calls.length,0);
 await assert.rejects(run({fields:{...fields,purpose:'invalid'}}),/valid school mode/);assert.equal(calls.length,0);
});
async function edge({denied=false,token=true,spoof=false}={}) {
 let handler,provisions=0,args;let clients=0;
 const source=fs.readFileSync('supabase/functions/provision-school/index.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace('(data:unknown,status=200)','(data,status=200)').replace('(name:string)','(name)').replaceAll('key!','key').replace("get('SUPABASE_URL')!","get('SUPABASE_URL')");
 const ctx=vm.createContext({Response,Error,JSON,Deno:{env:{get:()=>''},serve:fn=>handler=fn},createClient:()=>clients++===0?{auth:{getUser:async()=>({data:{user:{id:actor}}})}}:{rpc:async()=>denied?{error:{message:'Denied'}}:{data:{user_id:actor}}},provisionPlatformSchool:async input=>{provisions++;args=input;return {ok:true};}});
 vm.runInContext(source,ctx);
 const result=await handler(new Request('https://school.example.test/functions/v1/provision-school',{method:'POST',headers:token?{Authorization:'Bearer fixture'}:{},body:JSON.stringify({action:'create',actor_id:spoof?'OTHER':actor,operation_id:operation,fields})}));
 return {result,provisions,args};
}
test('Edge Function requires verified platform access and ignores a forged actor ID',async()=>{
 const noToken=await edge({token:false});assert.equal(noToken.result.status,401);assert.equal(noToken.provisions,0);
 const denied=await edge({denied:true});assert.equal(denied.result.status,403);assert.equal(denied.provisions,0);
 const allowed=await edge({spoof:true});assert.equal(allowed.result.status,200);assert.equal(allowed.args.actorId,actor);
});
