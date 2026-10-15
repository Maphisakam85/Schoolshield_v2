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

test('already-persisted drafts clear despite unrelated newer server rows',async()=>{
 const {ctx,stored}=harness();const before={visitors:[],incidents:[]},after={visitors:[{id:'V',name:'Saved visitor'}],incidents:[]};
 stored.set(ctx.workspaceCacheKey()+':pending',JSON.stringify({before,after}));ctx.window.schoolshieldWorkspaceSaveQueue=Promise.resolve(false);
 ctx.window.schoolshieldSupabase={rpc:async()=>({data:{payload:{visitors:[{id:'V',name:'Saved visitor',revision:2},{id:'NEW',name:'Other user'}],incidents:[{id:'I'}]}}})};
 await ctx.refreshCloudWorkspace();assert.equal(stored.has(ctx.workspaceCacheKey()+':pending'),false);assert.equal(await ctx.window.schoolshieldWorkspaceSaveQueue,true);assert.equal(ctx.getState().visitors.length,2);
});
test('conflicting drafts survive reload and retain their intended edits',async()=>{
 const {ctx,stored}=harness();const before={visitors:[{id:'V',name:'Old'}]},after={visitors:[{id:'V',name:'My edit'}]};
 stored.set(ctx.workspaceCacheKey()+':pending',JSON.stringify({before,after}));ctx.window.schoolshieldSupabase={rpc:async()=>({data:{payload:{visitors:[{id:'V',name:'Someone else'}]}}})};
 await ctx.connectCloudWorkspace();assert.equal(ctx.getState().visitors[0].name,'My edit');assert.equal(ctx.window.schoolshieldWorkspaceConfirmed.visitors[0].name,'Someone else');assert.equal(stored.has(ctx.workspaceCacheKey()+':pending'),true);
});
test('a failed save does not poison the next save and the original baseline is retained',async()=>{
 const {ctx,stored}=harness();let calls=0;const payload={visitors:[]};
 ctx.window.schoolshieldSupabase={rpc:async(name,args)=>{if(name==='read_school_dataset')return {data:{payload}};calls++;if(calls===1)return {error:{message:'Offline'}};assert.equal(args.p_before.visitors.length,0);return {data:{payload:args.p_after}};}};
 await ctx.connectCloudWorkspace();const state=ctx.getState();state.visitors.push({id:'V',name:'First'});assert.equal(await ctx.save(state),false);state.visitors[0].name='Retried';assert.equal(await ctx.save(state),true);assert.equal(calls,2);assert.equal(stored.has(ctx.workspaceCacheKey()+':pending'),false);
});

test('saving one collection does not rewrite IDs in untouched legacy collections',async()=>{
 const {ctx}=harness();const payload={staff:[{name:'Legacy staff'}],visitors:[]};
 ctx.window.schoolshieldSupabase={rpc:async(name,args)=>{if(name==='read_school_dataset')return {data:{payload}};assert.equal(args.p_after.staff[0].id,undefined);return {data:{payload:args.p_after}};}};
 await ctx.connectCloudWorkspace();const state=ctx.getState();state.visitors.push({name:'New visitor'});assert.equal(await ctx.save(state),true);assert.ok(ctx.getState().visitors[0].id);
});
test('score submission never shows success before confirmation and preserves failed drafts',async()=>{
 const {ctx}=harness();let release;const messages=[];ctx.modal=(title)=>messages.push(title);ctx.render=()=>{};ctx.resetWorkspaceDraftState=()=>{throw new Error('Failed draft cleared');};ctx.document.querySelectorAll=selector=>selector==='[data-score]'?[{value:'60',dataset:{score:'L'}}]:[];ctx.userName=()=> 'Teacher';ctx.notificationTimestamp=()=> '2026-10-15T10:00:00Z';ctx.localDateIso=()=> '2026-10-15';
 const state={reports:[],assessments:[{id:'A',class:'C',scores:{},subject:'Mathematics'}],learners:[],classes:[{id:'C'}],notifications:[]};ctx.persist=fn=>{fn(state);ctx.window.schoolshieldWorkspaceSaveQueue=new Promise(resolve=>release=resolve);};
 const saving=ctx.saveTestScores('C','teacher');assert.equal(messages.length,0);release(false);await saving;assert.deepEqual(messages,['Scores not saved']);
});

test('stalled draft requests terminate instead of leaving Saving forever',async()=>{
 const {ctx}=harness();ctx.setTimeout=setTimeout;ctx.clearTimeout=clearTimeout;ctx.window.schoolshieldSupabase={rpc:()=>new Promise(()=>{})};
 await assert.rejects(ctx.schoolDraftRequest('save_school_dataset',{},5),/server did not respond in time/);
});

test('retry failures retain the draft and always release Saving state',async()=>{
 const {ctx,stored}=harness();const button={disabled:false,textContent:'Retry changes',hasAttribute:()=>true},message={textContent:''},messages=[];
 ctx.document.querySelectorAll=()=>[button];ctx.document.querySelector=()=>message;ctx.modal=title=>messages.push(title);ctx.window.schoolshieldSupabase={};ctx.schoolDraftRequest=async()=>{throw new Error('upstream request timeout');};
 const pending=JSON.stringify({before:{visitors:[]},after:{visitors:[{id:'V'}]}});stored.set(ctx.workspaceCacheKey()+':pending',pending);
 await ctx.retrySchoolDraft();assert.equal(button.disabled,false);assert.equal(button.textContent,'Retry changes');assert.equal(ctx.window.schoolshieldDraftRetrying,false);assert.equal(stored.get(ctx.workspaceCacheKey()+':pending'),pending);assert.match(message.textContent,/upstream request timeout/);assert.deepEqual(messages,['Draft not saved']);
});
