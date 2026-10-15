const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const source=fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'');
function harness(){let user='P1';const state={incidents:[],notifications:[{id:'N1',scope:'whole-school',title:'Shared',read:true,category:'Security',priority:'High',createdAt:'2026-10-14T08:00:00Z'}]};const stored=new Map();let fail=false,calls=0;
 const ctx=vm.createContext({window:{},document:{getElementById:()=>null},URL,sessionStorage:{getItem:()=>JSON.stringify({userId:user,schoolId:'S1',role:user==='P1'?'principal':'clerk'})}});vm.runInContext(source,ctx);
 Object.assign(ctx,{role:()=>user==='P1'?'principal':'clerk',getState:()=>state,modal(){},page:()=> 'dashboard'});
 ctx.window.schoolshieldSupabase={rpc:async(name,args)=>{calls++;if(fail)return{error:{message:'Offline'}};if(name==='mark_notifications_read'){for(const id of args.p_ids)stored.set(user+':'+id,'2026-10-14T09:00:00Z');return{data:{ids:args.p_ids,read_at:'2026-10-14T09:00:00Z'}};}if(name==='get_account_request_alerts')return{data:[]};return{data:[...stored].filter(([key])=>key.startsWith(user+':')).map(([key,read_at])=>({notification_id:key.slice(user.length+1),read_at}))};}};
 return{ctx,state,user:id=>user=id,fail:value=>fail=value,calls:()=>calls};
}
test('shared read flags do not clear another user; reads persist through reload and repeat safely',async()=>{
 const h=harness();await h.ctx.loadPersonalNotificationReads();assert.equal(h.ctx.notificationsForRole()[0].read,false);assert.equal(await h.ctx.markVisibleNotificationsRead(),true);assert.equal(h.ctx.notificationsForRole()[0].read,true);assert.equal(h.state.notifications[0].read,true,'legacy shared value is untouched');
 h.user('C1');assert.equal(h.ctx.notificationsForRole()[0].read,false);await h.ctx.loadPersonalNotificationReads();assert.equal(h.ctx.notificationsForRole()[0].read,false);await h.ctx.markNotificationIdsRead(['N1']);
 h.user('P1');await h.ctx.loadPersonalNotificationReads();assert.equal(h.ctx.notificationsForRole()[0].read,true);await h.ctx.markNotificationIdsRead(['N1']);assert.equal(h.ctx.notificationsForRole()[0].read,true);
});
test('failed read updates remain unread and return failure instead of false success',async()=>{
 const h=harness();await h.ctx.loadPersonalNotificationReads();h.fail(true);assert.equal(await h.ctx.markNotificationIdsRead(['N1']),false);assert.equal(h.ctx.notificationsForRole()[0].read,false);assert.equal(h.ctx.window.schoolshieldNotificationReadError,'Offline');
});
test('type, priority, period and text filters combine and handle missing/legacy dates',()=>{
 const{ctx}=harness(),now=new Date(2026,9,14,12),notice={category:'Visitor',priority:'Low',title:'Gate arrival',createdAt:'2026-10-14T08:00:00Z'};
 assert.equal(ctx.notificationMatchesFilters(notice,{type:'Security',priority:'Low',period:'today',search:'gate'},now),true);
 for(const f of [{type:'Emergency'},{priority:'High'},{search:'unknown'}])assert.equal(ctx.notificationMatchesFilters(notice,f,now),false);
 assert.equal(ctx.notificationMatchesFilters({...notice,createdAt:'2026-10-11T10:00:00Z'},{period:'week'},now),false);
 assert.equal(ctx.notificationMatchesFilters({...notice,createdAt:null,date:'12 Oct 2026'},{period:'week'},now),true);
 assert.equal(ctx.notificationMatchesFilters({...notice,createdAt:null},{period:'today'},now),false);
 assert.equal(ctx.notificationMatchesFilters({...notice,createdAt:null},{},now),true);
});
test('date helpers avoid UTC date-only shifts, validate leap dates and preserve legacy display',()=>{
 const{ctx}=harness();assert.equal(ctx.localDateIso('29 Feb 2024'),'2024-02-29');assert.equal(ctx.localDateIso('2026-02-29'),'');assert.equal(ctx.localDateIso('03/04/2026'),'');assert.equal(ctx.localDateIso(new Date(2026,9,14,0,5)),'2026-10-14');assert.equal(ctx.formatLocalTime('18:30'),'18:30');assert.equal(ctx.formatLocalDate('unknown legacy date'),'unknown legacy date');assert.match(ctx.localDateTime(new Date('2026-10-14T08:00:00Z')),/2026-10-14T08:00:00\.000Z/);
});
test('attendance Mondays and school days stay correct at midnight and across DST',()=>{
 const snippet=`const fs=require('fs'),vm=require('vm');const c=vm.createContext({window:{},document:{},sessionStorage:{getItem:()=>null}});vm.runInContext(fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\\(\\);\\s*$/,''),c);console.log(JSON.stringify([c.weekStartFor('2026-10-14'),Array.from(c.schoolDaysForWeek('2026-03-09'))]));`;
 for(const TZ of ['Africa/Johannesburg','America/New_York','Pacific/Auckland']){const result=JSON.parse(execFileSync(process.execPath,['-e',snippet],{env:{...process.env,TZ},encoding:'utf8'}));assert.deepEqual(result,['2026-10-12',['2026-03-09','2026-03-10','2026-03-11','2026-03-12','2026-03-13']],TZ);}
});
test('operational ownership uses UUIDs even when names collide or change',()=>{
 const h=harness();h.ctx.role=()=> 'teacher';h.ctx.teacherClasses=()=>[];h.state.incidents=[{id:'A',reporter:'Same name',reporterId:'P1'},{id:'B',reporter:'Same name',reporterId:'C1'}];h.ctx.userName=()=> 'Renamed';assert.deepEqual(Array.from(h.ctx.incidentsForRole(),i=>i.id),['A']);
 assert.ok(!/Date\.now\(\).*slice/.test(source));assert.ok(!source.includes("'ANN-' + crypto.randomUUID()"));
});
