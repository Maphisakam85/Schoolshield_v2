const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.setContent('<html><body><div id="app"></div></body></html>');
  await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
  for(const module of ['teacher-performance-metrics.js','teacher-performance.js']) await page.addScriptTag({content:fs.readFileSync('SchoolShield/'+module,'utf8')});
  await page.evaluate(()=>{
   window.role=()=> 'principal';window.generic=(title,section,description,body)=>`<h1>${title}</h1>${body}`;
   window.render=()=>{document.getElementById('app').innerHTML=window.SchoolShieldTeacherPerformance.view();window.SchoolShieldTeacherPerformance.bind();};
   const directory={teachers:[{id:'A',name:'Teacher A',employeeId:'EMP1',department:'Languages'}],subjects:[{id:'S1',name:'English'},{id:'S2',name:'Mathematics'}],classes:[{id:'CL1',class_ref:'8A',grade:'Grade 8'},{id:'CL2',class_ref:'9B',grade:'Grade 9'}],contexts:[{id:'C1',teacher_id:'A',subject_id:'S1',class_id:'CL1'},{id:'C2',teacher_id:'A',subject_id:'S2',class_id:'CL2'}],reviews:[]};
   window.schoolshieldSupabase={rpc:async(name,args)=>{
    if(name==='sync_teacher_review_catalogue') return {data:null};if(name==='get_teacher_performance_directory') return {data:directory};
    if(window.failMetrics&&args.p_update_review_fields) return {error:{message:'Save interrupted'}};
    const selected=args.p_update_review_fields&&args.p_baseline_id==='BASE',missing=args.p_term===3;
    window.lastMetricArgs=args;
    return {data:{baseline_average:selected?54:null,current_average:missing?null:selected?61:57.5,previous_term_average:missing?null:50,pass_rate:missing?null:100,number_of_learners:2,learners_with_marks:missing?0:2,learners_improving:selected?2:null,learners_declining:selected?0:null,learners_at_risk:missing?null:0,comparable_learners:selected?2:0,comparison_baseline_average:selected?54:null,comparison_current_average:selected?61:null,improvement_percentage_points:selected?7:null,baseline_assessment_id:selected?'BASE':null,curriculum_coverage:args.p_curriculum_coverage??null,reviewer_comment:args.p_reviewer_comment??'',assessments_planned:missing?null:2,assessments_completed:missing?null:2,marks_outstanding:missing?null:0,baseline_candidates:missing?[]:[{id:'BASE',title:'Baseline test'},{id:'NOW',title:'Current test'}],calculation_details:{}}};
   }};render();
  });
  await page.waitForSelector('[data-performance-open]');await page.click('[data-performance-open="A"]');await page.selectOption('[data-performance-filter="term"]','2');
  await page.waitForSelector('[data-metrics-save="C1:2"]');assert.equal(await page.locator('[data-metrics-card]').count(),2);
  assert.match(await page.locator('[data-metrics-card="C1:2"]').textContent(),/Not enough data/);
  await page.selectOption('[data-metrics-baseline="C1:2"]','BASE');await page.fill('[data-metrics-coverage="C1:2"]','72.5');await page.fill('[data-metrics-comment="C1:2"]','Improvement despite a low starting point.');
  await page.click('[data-metrics-save="C1:2"]');await page.waitForFunction(()=>document.querySelector('[data-metrics-card="C1:2"]').textContent.includes('+7 percentage points'));
  const text=await page.locator('[data-metrics-card="C1:2"]').textContent();assert.match(text,/54%/);assert.match(text,/61%/);assert.match(text,/72.5%/);
  assert.match(await page.locator('[data-metrics-card="C1:2"] [role="status"]').textContent(),/Saved/);
  await page.evaluate(()=>window.failMetrics=true);await page.fill('[data-metrics-comment="C1:2"]','Unsaved evidence note');await page.click('[data-metrics-save="C1:2"]');await page.waitForFunction(()=>document.querySelector('[data-metrics-card="C1:2"]').textContent.includes('Not saved'));
  assert.equal(await page.inputValue('[data-metrics-comment="C1:2"]'),'Unsaved evidence note');
  await page.selectOption('[data-performance-filter="term"]','3');await page.waitForSelector('[data-metrics-save="C1:3"]');assert.match(await page.locator('[data-metrics-card="C1:3"]').textContent(),/Not enough data/);
  console.log('PASS metrics browser: separate subject/class cards, baseline selection, +7 pp improvement, curriculum/comment save, retained failed-save draft and missing-term data.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
