const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('SchoolShield/app.js','utf8');const startup=source.slice(source.indexOf('async function workspaceStartupRequest('),source.indexOf('// SOS display initialization'));
async function run({failProfile=false,hangDataset=false}={}){
 let rendered=0,failed=0,redirect='',signedOut=0;const school={id:'school-qa',code:'ABC-001',name:'Fictional QA school'},profile={role:'principal',display_name:'QA Principal',school};
 const query={select(){return this;},eq(){return this;},maybeSingle:async()=>failProfile?{error:{message:'offline'}}:{data:profile},is:async()=>({count:2})};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'qa-user',email:'qa@example.test'}}}}),signOut:async()=>{signedOut++;return{};}},from:()=>query};
 const window={schoolshieldSupabase:client};const storage=new Map(),retry={};
 const context=vm.createContext({window,document:{getElementById:id=>id==='app'?{replaceChildren:()=>failed++}:id==='workspaceStartupFailure'?{content:{cloneNode:()=>({})}}:retry},location:{replace:url=>redirect=url,reload(){}},sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)},setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,20)),clearTimeout,activeSchool:()=>school,connectCloudWorkspace:()=>hangDataset?new Promise(()=>{}):Promise.resolve(window.schoolshieldCloudWorkspaceReady=true),loadTeachingAssignmentNotifications:async()=>{},startWorkspaceRealtime(){},startWorkspaceAutoRefresh(){},render:()=>rendered++});
 vm.runInContext(startup,context);await new Promise(r=>setTimeout(r,60));return{rendered,failed,redirect,signedOut};
}
test('workspace succeeds only after authenticated profile and shared dataset load',async()=>{const r=await run();assert.equal(r.rendered,1);assert.equal(r.failed,0);assert.equal(r.redirect,'');});
test('failed profile lookup exits the loading screen without discarding a valid session',async()=>{const r=await run({failProfile:true});assert.equal(r.failed,1);assert.equal(r.rendered,0);assert.equal(r.signedOut,0);});
test('stalled dataset request presents retry instead of an endless loading screen',async()=>{const r=await run({hangDataset:true});assert.equal(r.failed,1);assert.equal(r.rendered,0);});
