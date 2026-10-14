const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function moduleUnderTest() {const context=vm.createContext({window:{},role:()=> 'principal'});vm.runInContext(fs.readFileSync('SchoolShield/teacher-performance-dashboard.js','utf8'),context);return context.window.SchoolShieldTeacherDashboard;}
test('dashboard counts reviews and targets per context without ranking or assuming missing targets mean on track',()=>{
 const feature=moduleUnderTest(),data={teachers:[{id:'A'},{id:'B'},{id:'C'},{id:'D'}],contexts:[
 {teacherId:'A',review:{status:'Awaiting Teacher Acknowledgement'},targets:[{status:'Target Achieved'},{status:'Near Target'}],supportActions:[]},
 {teacherId:'A',review:{status:'Completed'},targets:[{status:'Target Exceeded'}],supportActions:[]},
 {teacherId:'B',review:{status:'In Progress'},targets:[{status:'Below Target'},{status:'Not Yet Measured'}],supportActions:[]},
 {teacherId:'C',review:null,targets:[],supportActions:[]}]};
 const counts=feature.summaries(data);assert.equal(counts.teachers,4);assert.equal(counts.completed,2);assert.equal(counts.outstanding,2);assert.equal(counts.onTrack,1);assert.equal(counts.support,1);assert.equal(counts.unassigned,1);assert.equal(counts.targets,5);assert.equal(counts.achieved,2);assert.equal(counts.near,1);assert.equal(counts.below,1);assert.equal(counts.unmeasured,1);
});
test('support flags reflect recorded support/context judgement rather than academic average',()=>{
 const feature=moduleUnderTest();const data={teachers:[{id:'A'},{id:'B'}],contexts:[{teacherId:'A',review:{review_content:{recommendedSupport:'Peer observation'}},metrics:{current_average:95},targets:[{status:'Target Achieved'}],supportActions:[]},{teacherId:'B',review:null,metrics:{current_average:30},targets:[],supportActions:[]}]};
 assert.equal(feature.summaries(data).support,1);assert.equal(feature.summaries(data).onTrack,0);
});
