const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function moduleHarness() {const ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('SchoolShield/teacher-performance-metrics.js','utf8'),ctx);return ctx.window.SchoolShieldTeacherMetrics;}
test('missing metrics show Not enough data while valid zero remains zero',()=>{
 const module=moduleHarness();assert.equal(module.value(null,'%'),'Not enough data');assert.equal(module.value(undefined),'Not enough data');assert.equal(module.value(0,'%'),'0%');
});
test('context cards show baseline, current and improvement separately, without a teacher score',()=>{
 const module=moduleHarness();module.cache.set('C1:2',{baseline_average:54,current_average:61,previous_term_average:50,improvement_percentage_points:7,pass_rate:100,number_of_learners:2,learners_with_marks:2,comparable_learners:2,comparison_baseline_average:54,comparison_current_average:61,learners_improving:2,learners_declining:0,learners_at_risk:0,baseline_candidates:[],calculation_details:{}});
 const html=module.render({id:'C1'},2);assert.match(html,/54%/);assert.match(html,/61%/);assert.match(html,/\+7 percentage points/);assert.match(html,/not a teacher rating/);assert.match(html,/Curriculum coverage/);assert.match(html,/Assessments planned/);assert.match(html,/Marks outstanding/);
 assert.ok(!html.includes('Overall teacher score'));
});
