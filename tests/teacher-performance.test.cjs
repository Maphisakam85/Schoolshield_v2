const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'');
const feature=fs.readFileSync('SchoolShield/teacher-performance.js','utf8');
function harness(selectedRole='principal') {
 const context=vm.createContext({window:{},document:{},sessionStorage:{getItem:()=>null}});vm.runInContext(app,context);
 Object.assign(context,{role:()=>selectedRole,generic:(title,section,description,body)=>description+body,table:(headers,rows)=>rows.join('')});
 vm.runInContext(feature,context);return {context,feature:context.window.SchoolShieldTeacherPerformance};
}
const data={teachers:[{id:'A',name:'Teacher A',employeeId:'EMP1',department:'Languages'},{id:'B',name:'Teacher B',employeeId:'EMP2',department:'Science'}],
 subjects:[{id:'Maths',name:'Mathematics'},{id:'English',name:'English'}],classes:[{id:'8A',class_ref:'8A',grade:'Grade 8'},{id:'9B',class_ref:'9B',grade:'Grade 9'}],
 contexts:[{id:'C1',teacher_id:'A',subject_id:'Maths',class_id:'8A'},{id:'C2',teacher_id:'A',subject_id:'English',class_id:'9B'},{id:'C3',teacher_id:'B',subject_id:'Maths',class_id:'9B'}],
 reviews:[{id:'R1',teaching_context_id:'C1',term:1,status:'Completed',updated_at:'2026-10-07T10:00:00Z'},{id:'R2',teaching_context_id:'C2',term:1,status:'In Progress',updated_at:'2026-10-07T11:00:00Z'},{id:'R3',teaching_context_id:'C1',term:2,status:'Not Started',updated_at:'2026-10-08T11:00:00Z'}]};
test('only Principal and Deputy have the management route and navigation permission',()=>{
 for(const role of ['principal','deputy','teacher','clerk','security','sgb','parent']) {
  const h=harness(role);assert.equal(h.context.allowed('teacher-performance'),['principal','deputy'].includes(role));
  if(!['principal','deputy'].includes(role)) assert.match(h.feature.view(),/Only the Principal and Deputy/);
 }
});
test('all six requested filters operate on separate teacher/subject/grade/class/term contexts',()=>{
 const {feature}=harness();feature.state.data=structuredClone(data);feature.state.filters.term='1';
 assert.equal(feature.roster()[0].latest,'In Progress');
 for(const [key,value,expected] of [['teacher','B','B'],['department','Science','B'],['grade','Grade 8','A'],['subject','English','A'],['status','Completed','A']]) {
  feature.state.filters[key]=value;assert.equal(feature.roster().length,1);assert.equal(feature.roster()[0].id,expected);feature.state.filters[key]='';
 }
 feature.state.filters.term='2';assert.equal(feature.roster()[0].latest,'Not Started');assert.equal(feature.roster()[0].overall,'Not assessed');
});
test('teacher detail keeps subject and grade/class sections separate without numeric performance scores',()=>{
 const {feature}=harness();Object.assign(feature.state,{data:structuredClone(data),selected:'A'});feature.state.filters.term='1';
 const html=feature.view();for(const text of ['Mathematics','English','Grade 8','Grade 9','8A','9B','Term 1','Completed','In Progress','Not assessed']) assert.ok(html.includes(text));
 assert.match(html,/does not replace the formal DBE\/ELRC QMS appraisal process/);assert.ok(!html.includes('Overall academic score'));assert.ok(!html.includes('Acknowledge review'));
});
