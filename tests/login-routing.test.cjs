const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness({admin=true,authorized=true,badPassword=false,gateError=false,contextError=false,schoolError=false,hangPassword=false,timeoutMs=15000,ownerCode='ADMIN'}={}) {
 const calls=[],storage=new Map([['schoolshieldSession','old'],['schoolshieldRole','old']]);
 storage.removeItem=key=>storage.delete(key);
 const session={access_token:'access',refresh_token:'refresh'},user={id:'owner'};
 const client=kind=>({auth:{signInWithPassword:async()=>{calls.push('password');if(hangPassword)return new Promise(()=>{});return badPassword?{error:{message:'bad'}}:{data:{session,user}};},setSession:async tokens=>{assert.deepEqual(JSON.parse(JSON.stringify(tokens)),session);calls.push(kind+':session');return {};},signOut:async()=>calls.push(kind+':signout')},rpc:async(name,args)=>{
  calls.push(name);if(name==='authorize_platform_login'){assert.equal(args.p_access_code,admin?ownerCode:'ABC-123');return gateError?{error:{message:'offline'}}:{data:{platform_admin:admin,authorized}};}
  return contextError?{error:{message:'denied'}}:{data:{user_id:user.id}};
 }});
 const ctx=vm.createContext({setTimeout,clearTimeout});vm.runInContext(fs.readFileSync('SchoolShield/login-routing.js','utf8'),ctx);
 const run=()=>ctx.SchoolShieldLogin.signIn({supabase:{createClient:(_u,_k,o)=>client(o.auth.storageKey?'platform':'temporary')},config:{},schoolClient:client('school'),storage,email:'owner@example.com',password:'secret',accessCode:admin?ownerCode.toLowerCase():'abc-123',timeoutMs,createSchoolSession:async(u,code)=>{calls.push('school-profile');assert.equal(code,'ABC-123');if(schoolError)throw Error('Wrong school');}});
 return {run,calls,storage};
}
test('correct admin code and credentials route into isolated platform session',async()=>{const h=harness();assert.equal(await h.run(),'super-admin.html');assert.ok(h.calls.includes('platform:session'));assert.ok(h.calls.includes('platform_admin_context'));assert.ok(!h.calls.includes('school-profile'));assert.equal(h.storage.size,0);});
test('wrong code never persists a platform session or falls back to school access',async()=>{const h=harness({authorized:false});await assert.rejects(h.run(),/code is incorrect/);assert.ok(!h.calls.includes('platform:session'));assert.ok(!h.calls.includes('school-profile'));});
test('wrong password never reaches access-code authorization',async()=>{const h=harness({badPassword:true});await assert.rejects(h.run(),/credentials/);assert.ok(!h.calls.includes('authorize_platform_login'));});
test('ordinary users remain subject to school profile and school code checks',async()=>{const h=harness({admin:false});assert.equal(await h.run(),'dashboard.html');assert.ok(h.calls.includes('school-profile'));assert.ok(!h.calls.includes('platform:session'));const denied=harness({admin:false,schoolError:true});await assert.rejects(denied.run(),/Wrong school/);assert.ok(denied.calls.includes('school:signout'));});
test('gate failures and revoked membership fail closed',async()=>{for(const options of [{gateError:true},{contextError:true}]){const h=harness(options);await assert.rejects(h.run(),/verified|denied/);assert.equal(h.storage.size,0);}});

test('stalled authentication terminates with retry guidance and no access request',async()=>{const h=harness({hangPassword:true,timeoutMs:10});await assert.rejects(h.run(),/Sign in timed out/);assert.ok(!h.calls.includes('authorize_platform_login'));assert.ok(h.calls.includes('temporary:signout'));});
test('owner identifier formats still require server-authorized platform access',async()=>{for(const ownerCode of ['A0A-ABC','ABC-001']){const allowed=harness({ownerCode});assert.equal(await allowed.run(),'super-admin.html');const denied=harness({ownerCode,authorized:false});await assert.rejects(denied.run(),/incorrect/);assert.ok(!denied.calls.includes('platform:session'));}});
