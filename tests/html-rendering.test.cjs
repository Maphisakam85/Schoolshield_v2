const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'');
const payloads=['<script>window.__xss=1</script>','<img src=x onerror="window.__xss=1">','" autofocus onfocus="window.__xss=1','\' & < > "','</textarea><svg onload="window.__xss=1">'];
function harness(value){
 const session={userId:'U1',role:'sgb',schoolName:value,schoolCode:'S1'};
 const ctx=vm.createContext({window:{},document:{},URL,sessionStorage:{getItem:()=>JSON.stringify(session)}});vm.runInContext(app,ctx);
 const record={id:value,name:value,type:value,host:value,purpose:value,date:value,time:value,status:value,category:value,location:value,officer:value,priority:value,title:value,body:value,author:value,audience:value,delivery:value,description:value,grade:value,class:value,parent:value,relation:value,role:value,department:value,email:value,phone:value,employee:value,attendance:90,average:60};
 const state={visitors:[record],incidents:[record],notifications:[record],announcements:[record],staff:[record],learners:[record],security:[],sickNotices:[],studentReports:[]};
 Object.assign(ctx,{getState:()=>state,role:()=> 'sgb',userName:()=>value,shell:body=>body,generic:(_a,_b,_c,body)=>body,incidentsForRole:()=>state.incidents,notificationsForRole:()=>state.notifications,parentDirectory:()=>[record],learners:()=>state.learners,daysAbsent:()=>0,notificationTime:()=>value,param:()=>null,page:()=> 'teacher-chat',chatSender:()=>value,chatTimestamp:()=>value,classById:()=>({teacher:value}),subjectsForGrade:()=>[value],reportTerms:()=>['Term 1'],learnerSickNotices:()=>[{date:value,reason:value}],reportMark:()=>60,reportTermAverage:()=>60,standingFor:()=>value});
 record.classes=[value];record.children=[value];
 Object.assign(ctx,{classes:()=>[record],parentRecords:()=>[record],gradeGroups:()=>[{grade:value,classes:[record]}]});
 return {ctx,record,state};
}
function renderExamples(value){const{ctx,record}=harness(value);return {visitor:ctx.visitors(),incident:ctx.incidents(),announcement:ctx.announcements(),notification:ctx.notifications(),staff:ctx.staff(),learner:ctx.studentRecords(),parent:ctx.parents(),report:ctx.learnerReportMarkup(record),chat:ctx.chatLayout('Chat','','',[{id:value,initials:value,role:value,messages:[{sender:value,text:value}]}],'teacherChat'),badge:ctx.badge(value)};}
test('central helper preserves literal data and escapes all five HTML-sensitive characters',()=>{
 const{ctx}=harness('');assert.equal(ctx.escapeHtml(null),'');assert.equal(ctx.escapeHtml(0),'0');assert.equal(ctx.escapeHtml(false),'false');assert.equal(ctx.escapeHtml(`&<>"'`),'&amp;&lt;&gt;&quot;&#39;');
});
test('visitor, incident, announcement, notification, staff, learner, parent, report and chat render data as text',()=>{
 for(const value of payloads){const{ctx,record}=harness(value);const before=JSON.stringify(record);for(const[area,html]of Object.entries(renderExamples(value))){assert.ok(html.includes(ctx.escapeHtml(value)),area+' contains escaped data');assert.ok(!html.includes(value),area+' never inserts raw HTML');}assert.equal(JSON.stringify(record),before,'rendering does not mutate data');}
});
test('executable URL schemes are rejected independently of attribute escaping',()=>{
 const{ctx}=harness('');for(const value of ['javascript:alert(1)','java\nscript:alert(1)','data:text/html,<script>alert(1)</script>']){assert.equal(ctx.safeLinkUrl(value),'#');assert.equal(ctx.safeImageUrl(value),'');}assert.equal(ctx.safeLinkUrl('https://example.org/?a=1&b=2'),'https://example.org/?a=1&b=2');assert.equal(ctx.safeImageUrl('data:image/png;base64,YQ=='),'data:image/png;base64,YQ==');
});
module.exports={payloads,renderExamples};
