const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');globalThis.crypto||=crypto.webcrypto;
const modulePromise=import('../supabase/functions/manage-users/service.mjs');
const actor={id:crypto.randomUUID(),role:'principal',school_id:crypto.randomUUID(),account_status:'Active'};
const fields={first_name:'Thabo',last_name:'Mokoena',email:'THABO@school.test',phone:'082 123 4567',role:'teacher',account_status:'Active'};
test('live schools reject test-domain accounts while explicit demo and QA schools permit fixtures',async()=>{
 const {validateFields}=await modulePromise;
 assert.throws(()=>validateFields({fields},{...actor,school_mode:'live'}),/test/i);
 for(const school_mode of ['demo','qa'])assert.equal(validateFields({fields},{...actor,school_mode}).email,'thabo@school.test');
 assert.equal(validateFields({fields:{...fields,email:'teacher@example.org'}},{...actor,school_mode:'live'}).email,'teacher@example.org');
});
function harness(options={}){
 const calls=[];const target=crypto.randomUUID();let saved,invitation;
 const ok=data=>({data});
 const admin={auth:{admin:{createUser:async body=>{calls.push(['createAuth',body]);return ok({user:{id:body.id}})},getUserById:async()=>ok({user:{id:target,app_metadata:{},email_confirmed_at:options.confirmed?'now':null}}),updateUserById:async(id,body)=>{calls.push(['updateAuth',body]);return ok({user:{id}})},inviteUserByEmail:async(email,body)=>{calls.push(['email',email,body]);return options.emailFailure?{error:{message:'Mailer unavailable'}}:ok({user:{id:target}})},generateLink:async body=>{calls.push(['link',body]);return ok({user:{id:target},properties:{hashed_token:'secure-hash'}})}},resetPasswordForEmail:async(email,body)=>{calls.push(['recovery',email,body]);return ok({})}},
 from(table){let body;const builder={select(){return this},eq(){return this},insert(v){body=v;calls.push([table,'insert',v]);return this},update(v){body=v;calls.push([table,'update',v]);return this},single:async()=>ok(table==='schools'?{code:'SCHOOL',name:'School'}:table==='profiles'?saved:{id:'invitation',...body}),then(resolve){resolve(ok({}));}};return builder},
 rpc:async(name,args)=>{calls.push([name,args]);if(name==='finish_user_management'){if(options.finishFailure)return {error:{message:'Database failed'}};saved={id:target,...fields,email:fields.email.toLowerCase(),phone:'+27821234567',display_name:'Thabo Mokoena'};return ok(saved)}return ok(null)}};
 const actorClient={rpc:async(name,args)=>{calls.push([name,args]);if(options.denied)return {error:{message:'Access denied'}};return ok({id:args.p_operation,target_id:target,school_id:actor.school_id,fields:args.p_fields,status:options.replay?'Completed':'Pending'});}};
 const env=name=>({SCHOOLSHIELD_ACCOUNT_SETUP_URL:'https://school.test/SchoolShield/account-setup.html'})[name];
 return {admin,actorClient,actor,env,calls,body:{action:'create',operation_id:crypto.randomUUID(),delivery:'email',fields}};
}
test('all seven real roles validate and normalize mobile/email; only Principal assigns management roles',async()=>{
 const {roles,validateFields}=await modulePromise;
 for(const role of roles){const f=validateFields({fields:{...fields,role}},actor);assert.equal(f.role,role);assert.equal(f.phone,'+27821234567');assert.equal(f.email,'thabo@school.test');assert.equal(f.school_id,actor.school_id);}
 for(const role of ['principal','deputy','clerk'])assert.throws(()=>validateFields({fields:{...fields,role}},{...actor,role:'clerk'}),/Only Principal/);
 for(const input of [{phone:'0212223333'},{school_id:crypto.randomUUID()},{email:'invalid'},{first_name:' '}])assert.throws(()=>validateFields({fields:{...fields,...input}},actor));
});
test('Auth and profile commit precede actual email request and success; metadata is server-derived',async()=>{
 const {manageUser}=await modulePromise;const h=harness();const result=await manageUser(h);assert.equal(result.ok,true);
 const names=h.calls.map(c=>c[0]);assert.ok(names.indexOf('begin_user_management')<names.indexOf('createAuth'));assert.ok(names.indexOf('finish_user_management')<names.indexOf('email'));
 const auth=h.calls.find(c=>c[0]==='createAuth')[1];assert.equal(auth.password,undefined);assert.equal(auth.app_metadata.role,'teacher');assert.equal(auth.app_metadata.school_code,'SCHOOL');assert.equal(h.calls.find(c=>c[0]==='email')[2].redirectTo,'https://school.test/SchoolShield/account-setup.html');
});
test('unauthorized, inactive and incomplete management accounts never reach Auth',async()=>{
 const {manageUser}=await modulePromise;for(const patch of [{role:'teacher'},{role:'sgb'},{role:'parent'},{role:'security'},{account_status:'Inactive'},{requires_setup:true}]){const h=harness();h.actor={...actor,...patch};await assert.rejects(manageUser(h),/access denied/);assert.equal(h.calls.length,0);}
 const h=harness({denied:true});await assert.rejects(manageUser(h),/Access denied/);assert.equal(h.calls.some(c=>c[0]==='createAuth'),false);
});
test('failed persistence or email delivery reports failure, retains Auth identity, and never deletes users',async()=>{
 const {manageUser}=await modulePromise;for(const opts of [{finishFailure:true},{emailFailure:true}]){const h=harness(opts);await assert.rejects(manageUser(h),/Request incomplete/);assert.ok(h.calls.some(c=>c[0]==='fail_user_management'));assert.equal(h.calls.some(c=>c[0]==='deleteUser'),false);if(opts.finishFailure)assert.equal(h.calls.some(c=>c[0]==='email'),false);else assert.ok(h.calls.some(c=>c[0]==='user_invitations'&&c[2].status==='Failed'));}
});
test('idempotent replay creates no duplicate Auth account or email; SMS without provider fails before Auth',async()=>{
 const {manageUser}=await modulePromise;const h=harness({replay:true});assert.equal((await manageUser(h)).ok,true);assert.equal(h.calls.some(c=>c[0]==='createAuth'),false);
 const sms=harness();sms.body.delivery='sms';await assert.rejects(manageUser(sms),/not configured/);assert.equal(sms.calls.length,0);
});
test('manual links use real Auth tokens; confirmed unfinished users receive recovery invitation',async()=>{
 const {manageUser}=await modulePromise;const h=harness();h.body.delivery='setup_link';const result=await manageUser(h);assert.match(result.setup_link,/token_hash=secure-hash&type=invite/);assert.equal(h.calls.some(c=>c[0]==='email'),false);
 const recovery=harness({confirmed:true});await manageUser(recovery);assert.ok(recovery.calls.some(c=>c[0]==='recovery'));assert.equal(recovery.calls.some(c=>c[0]==='email'),false);
});
