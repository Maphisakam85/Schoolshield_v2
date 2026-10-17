const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const id=()=>crypto.randomUUID();globalThis.crypto||=crypto.webcrypto;
test('platform adapter rejects family/assignment/privilege and cross-school edits before Auth mutation',async()=>{
 const {managePlatformAccount}=await import('../supabase/functions/manage-users/platform-service.mjs');const school=id(),calls=[];
 const admin={from:()=>({select(){return this},eq(){return this},single:async()=>({data:{id:school,data_mode:'qa'}})}),rpc:async(name)=>{calls.push(name);return {error:{message:'User is not in the selected school'}};},auth:{}};
 const base={admin,actorId:id(),env:()=>undefined,body:{school_id:school,action:'edit',operation_id:id(),fields:{first_name:'QA',last_name:'Teacher',email:'qa@fictional.example.test',phone:'0821234567',role:'teacher',account_status:'Active'}}};
 for(const field of ['learner_ids','staff_id','app_metadata'])await assert.rejects(managePlatformAccount({...base,body:{...base.body,fields:{...base.body.fields,[field]:[]}}}),/not editable/);
 await assert.rejects(managePlatformAccount({...base,body:{...base.body,fields:{...base.body.fields,school_id:id()}}}),/Cross-school/);assert.equal(calls.length,0);
});
test('reset uses canonical recovery route, real Auth API and no default password',async()=>{
 const {manageUser,recoveryUrl}=await import('../supabase/functions/manage-users/service.mjs');const target=id(),school=id(),calls=[];const profile={id:target,email:'qa@fictional.example.test',display_name:'QA Teacher',account_status:'Active'};
 const admin={auth:{admin:{getUserById:async()=>({data:{user:{id:target,email_confirmed_at:'now'}}})},resetPasswordForEmail:async(email,args)=>{calls.push({email,...args});return {data:{}};}},from(table){let body;return {select(){return this},eq(){return this},upsert(value){body=value;return this},update(){return this},single:async()=>({data:table==='schools'?{code:'QA-SCHOOL',name:'Fictional QA'}:table==='profiles'?profile:{id:'invitation',...body}}),then(resolve){resolve({data:{}});}};},rpc:async()=>({data:profile})};
 const actorClient={rpc:async(name,args)=>({data:{id:args.p_operation,target_id:target,school_id:school,fields:args.p_fields,status:'Pending'}})};
 const result=await manageUser({admin,actorClient,actor:{id:id(),role:'platform',platform_admin_authorized:true,school_id:school,account_status:'Active'},body:{action:'reset',operation_id:id(),user_id:target,delivery:'email'},env:name=>name==='SCHOOLSHIELD_PASSWORD_RESET_URL'?'https://school.example.test/login.html':undefined});
 assert.equal(result.ok,true);assert.equal(calls[0].redirectTo,'https://school.example.test/login.html');assert.equal(JSON.stringify(calls).includes('password'),false);
 assert.throws(()=>recoveryUrl('http://localhost/login.html'),/valid HTTPS/);
});
test('ordinary JWTs cannot opt into platform account access and forged actors are ignored',async()=>{
 let handler,actorPassed,denied=true;const actor=id();let n=0;
 const source=fs.readFileSync('supabase/functions/manage-users/index.ts','utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('(body: unknown,status=200)','(body,status=200)').replaceAll('(name: string)','(name)').replaceAll('(name:string)','(name)').replaceAll("get('SUPABASE_URL')!","get('SUPABASE_URL')");
 const context=vm.createContext({Response,Error,Deno:{env:{get:()=>''},serve:fn=>handler=fn},createClient:()=>n++%2===0?{auth:{getUser:async()=>({data:{user:{id:actor}}})}}:{rpc:async()=>denied?{error:{message:'Denied'}}:{data:{user_id:actor}}},managePlatformAccount:async args=>{actorPassed=args.actorId;return {ok:true};}});vm.runInContext(source,context);
 const request=()=>new Request('https://school.example.test/manage-users',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({platform:true,actor_id:id(),school_id:id()})});
 assert.equal((await handler(request())).status,403);assert.equal(actorPassed,undefined);denied=false;assert.equal((await handler(request())).status,200);assert.equal(actorPassed,actor);
});
test('partial account invitation failure resumes the same Auth UUID without creating a duplicate',async()=>{
 const {managePlatformAccount}=await import('../supabase/functions/manage-users/platform-service.mjs');const school=id(),actor=id(),operation=id();let op,user,profile,creates=0,mailAttempts=0;
 const ok=data=>({data});const admin={auth:{admin:{
  createUser:async fields=>{creates++;user={id:fields.id,email:fields.email,app_metadata:fields.app_metadata};assert.equal(fields.password,undefined);return ok({user});},
  getUserById:async()=>user?ok({user}):{error:{status:404}},
  inviteUserByEmail:async()=>++mailAttempts===1?{error:{message:'QA mail provider unavailable'}}:ok({user}),
 }},from(table){let value;return {select(){return this},eq(){return this},upsert(v){value=v;return this},update(){return this},single:async()=>ok(table==='schools'?{id:school,code:'QA-ONE',name:'Fictional QA One',data_mode:'qa'}:table==='profiles'?profile:{id:'invitation',...value}),then(resolve){resolve(ok({}));}};},rpc:async(name,args)=>{
  if(name==='begin_platform_account'){op={...op,id:operation,target_id:op?.target_id||args.p_target,school_id:school,fields:args.p_fields,status:'Pending',resume_auth:Boolean(user)};return ok(op);}
  if(name==='finish_platform_account'){profile||={id:user.id,...op.fields,display_name:'QA Teacher',requires_setup:true,account_status:'Active'};return ok(profile);}
  if(name==='platform_account_result'){if(!args.p_success)op.status='Failed';else op.status='Completed';return ok(null);}
  throw Error('Unexpected platform RPC');
 }};
 const options={admin,actorId:actor,body:{school_id:school,operation_id:operation,action:'create',delivery:'email',confirmed:true,reason:'QA partial invitation recovery',fields:{first_name:'QA',last_name:'Teacher',email:'teacher@fictional.example.test',phone:'0821234567',role:'teacher',account_status:'Active'}},env:name=>name==='SCHOOLSHIELD_ACCOUNT_SETUP_URL'?'https://school.example.test/account-setup.html':undefined};
 await assert.rejects(managePlatformAccount(options),/incomplete/);const original=user.id;const result=await managePlatformAccount(options);assert.equal(result.user_id,original);assert.equal(creates,1);assert.equal(mailAttempts,2);assert.equal(op.status,'Completed');
});
