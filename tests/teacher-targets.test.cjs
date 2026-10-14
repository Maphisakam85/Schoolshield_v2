const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(role='principal') {
 const context=vm.createContext({window:{},document:{},sessionStorage:{getItem:()=>null}});
 vm.runInContext(fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,''),context);
 Object.assign(context,{role:()=>role,generic:(title,section,description,body)=>description+body});
 vm.runInContext(fs.readFileSync('SchoolShield/teacher-targets.js','utf8'),context);return {context,targets:context.window.SchoolShieldTeacherTargets};
}
test('numeric margins retain raw sign and use percentage points for percentage targets',()=>{
 const {targets}=harness();assert.equal(targets.margin({measurement_type:'Percentage',margin:-4}),'-4 percentage points');
 assert.equal(targets.margin({measurement_type:'Percentage',margin:4}),'+4 percentage points');
 assert.equal(targets.margin({measurement_type:'Number',margin:0}),'0');assert.equal(targets.margin({measurement_type:'Number',margin:null}),'Not Yet Measured');
});
test('qualitative, completion and Yes/No targets never display a numeric margin',()=>{
 const {targets}=harness();for(const type of ['Qualitative','Completion','Yes / No']) assert.equal(targets.margin({measurement_type:type,margin:99}),'Not applicable');
 assert.equal(targets.categories.length,12);assert.equal(targets.types.length,6);
});
test('only Teachers have the My Targets route; management retains the performance route',()=>{
 for(const role of ['principal','deputy','teacher','parent','security','sgb','clerk']) {
  const {context,targets}=harness(role);assert.equal(context.allowed('teacher-targets'),role==='teacher');
  if(role!=='teacher') assert.match(targets.viewOwn(),/Only Teacher accounts/);
 }
});
