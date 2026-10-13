const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(selectedRole='teacher') {
 const context=vm.createContext({window:{},document:{},sessionStorage:{getItem:()=>null}});
 vm.runInContext(fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,''),context);
 Object.assign(context,{role:()=>selectedRole,generic:(a,b,c,body)=>b+body,table:(headers,rows)=>rows.join('')});
 for(const file of ['teacher-targets.js','teacher-my-performance.js']) vm.runInContext(fs.readFileSync('SchoolShield/'+file,'utf8'),context);
 return {context,feature:context.window.SchoolShieldMyPerformance};
}
test('My Performance route is teacher-only and other roles receive no performance body',()=>{
 for(const role of ['teacher','principal','deputy','clerk','parent','sgb','security']) {
  const {context,feature}=harness(role);assert.equal(context.allowed('my-performance'),role==='teacher');
  if(role!=='teacher') assert.match(feature.view(),/Access restricted/);
 }
});
test('own published review displays response without management controls and does not fabricate missing metrics',()=>{
 const {feature}=harness();feature.state.data=[{id:'CTX',subject:'Mathematics',grade:'Grade 8',class:'8A',metrics:null,targets:[],supportActions:[{support_area:'Peer observation',intervention:'Visit a colleague',responsible_person:'HOD',due_date:'2026-11-01',status:'Planned',outcome:''}],review:{id:'R',status:'Completed',internal_rating:3,teacher_acknowledged_at:'2026-10-13T12:00:00Z',teacher_comment:'Received; I disagree.',review_content:{contextualFactors:['Overcrowding'],strengths:'Supportive classroom'}}}];
 const html=feature.view();for(const text of ['Not enough data','Received; I disagree.','does not mean agreement','Overcrowding','Supportive classroom','Peer observation','3 — Good']) assert.ok(html.includes(text));
 for(const control of ['data-review-rating','data-target-edit','data-support-edit','data-teacher-ack=']) assert.ok(!html.includes(control));
});
