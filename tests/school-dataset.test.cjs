const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'');
function harness() {
 const stored=new Map([['schoolshieldSession',JSON.stringify({schoolId:'S',schoolCode:'S',userId:'T',role:'teacher',displayName:'Teacher'})]]);
 const ctx=vm.createContext({window:{},document:{},console,crypto:require('node:crypto').webcrypto,sessionStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)}});
 vm.runInContext(source,ctx);return {ctx,stored};
}
test('reading an empty or legacy cache never seeds, patches or persists records',()=>{
 const {ctx,stored}=harness();ctx.save=()=>{throw new Error('read attempted persistence');};
 assert.equal(ctx.getState().learners.length,0);
 stored.set(ctx.workspaceCacheKey(),JSON.stringify({security:[{id:'SEC-001',name:'Sello Ndlovu'}],notifications:[{id:'N',time:'Now'}]}));
 const state=ctx.getState();assert.equal(state.security[0].phone,undefined);assert.equal(state.notifications[0].createdAt,undefined);
});
test('login replaces role caches with the authoritative dataset and never upserts cached seed data',async()=>{
 const {ctx,stored}=harness();const calls=[];
 stored.set(ctx.workspaceCacheKey(),JSON.stringify({learners:[{id:'STALE'}]}));
 ctx.window.schoolshieldSupabase={rpc:async name=>{calls.push(name);return {data:{payload:{classes:[],learners:[{id:'L',entityId:'shared-uuid'}]}}};},from:()=>{throw new Error('browser attempted direct workspace access');}};
 await ctx.connectCloudWorkspace();assert.deepEqual(calls,['read_school_dataset']);assert.equal(ctx.getState().learners[0].entityId,'shared-uuid');
 assert.equal(ctx.window.schoolshieldCloudWorkspaceReady,true);
});
test('failed school reads cannot initialize a workspace from cached data',async()=>{
 const {ctx}=harness();ctx.window.schoolshieldSupabase={rpc:async()=>({error:{message:'Offline'}}),from:()=>{throw new Error('unexpected bootstrap');}};
 await ctx.connectCloudWorkspace();assert.equal(ctx.window.schoolshieldCloudWorkspaceReady,false);assert.equal(ctx.window.schoolshieldLastSyncError,'Offline');
});
test('teacher and family relationships use UUIDs even when names collide or change',()=>{
 const {ctx}=harness();ctx.classes=()=>[{id:'A',teacher:'Teacher',teacherProfileId:'OTHER'},{id:'B',teacher:'Renamed',teacherProfileId:'T'}];
 assert.deepEqual(Array.from(ctx.teacherClasses('Teacher'),c=>c.id),['B']);
 ctx.learners=()=>[{id:'L1',parent:'Teacher',parentProfileId:'OTHER'},{id:'L2',parent:'Renamed',parentProfileIds:['T']}];
 assert.equal(ctx.parentLearner().id,'L2');ctx.learners=()=>[{id:'L1',parent:'Teacher'}];assert.equal(ctx.parentLearner(),null);
});
test('writes send a confirmed baseline delta, retain failed drafts, and never claim confirmed success',async()=>{
 const {ctx,stored}=harness();const payload={classes:[],staff:[],learners:[],visitors:[]};
 ctx.window.schoolshieldSupabase={rpc:async(name,params)=>name==='read_school_dataset'?{data:{payload}}:{error:{message:'Conflict'}}};
 await ctx.connectCloudWorkspace();const changed=ctx.getState();changed.visitors.push({id:'V',name:'Visitor'});
 assert.equal(await ctx.save(changed),false);assert.equal(ctx.window.schoolshieldWorkspaceConfirmed.visitors.length,0);
 assert.equal(JSON.parse(stored.get(ctx.workspaceCacheKey()+':pending')).after.visitors[0].id,'V');
 assert.equal(await ctx.refreshCloudWorkspace(),false);assert.equal(ctx.getState().visitors.length,1);
});
test('optional demo bootstrap cannot reset accounts, guess families or provision other schools',()=>{
 const bootstrap=fs.readFileSync('supabase/functions/bootstrap-demo-masters/index.ts','utf8');
 assert.match(bootstrap,/ALLOW_DEMO_BOOTSTRAP/);assert.match(bootstrap,/DEMO_BOOTSTRAP_PASSWORD/);assert.match(bootstrap,/eq\("id", caller.school_id\)/);
 assert.doesNotMatch(bootstrap,/updateUserById|Test@123|learners\?\.\[0\]/);
  assert.doesNotMatch(source,/Good morning\. Please submit your class marks|Welcome to the SGB channel|Mr Naidoo/);
});
test('queued edits cannot be sent under another account or school session',async()=>{
  const {ctx,stored}=harness();let writes=0;
  ctx.window.schoolshieldSupabase={rpc:async name=>{if(name==='save_school_dataset')writes++;return {data:{payload:{staff:[],classes:[],learners:[],visitors:[]}}};}};
  await ctx.connectCloudWorkspace();const state=ctx.getState();state.visitors.push({id:'V',name:'Visitor'});
  const pending=ctx.save(state);
  stored.set('schoolshieldSession',JSON.stringify({userId:'OTHER',schoolId:'OTHER',schoolCode:'OTHER',role:'principal'}));
  assert.equal(await pending,false);assert.equal(writes,0);assert.equal(ctx.getState().visitors.length,0);
});
