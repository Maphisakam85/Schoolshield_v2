const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {for(const currentRole of ['principal','deputy']) {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.setContent('<html><body><div id="app"></div></body></html>');
  await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
  for(const file of ['button-feedback.js','teacher-targets.js','teacher-performance-metrics.js','teacher-review-workflow.js','teacher-performance.js']) await page.addScriptTag({content:fs.readFileSync('SchoolShield/'+file,'utf8')});
  await page.evaluate(currentRole=>{
   window.role=()=>currentRole;window.generic=(a,b,c,body)=>`<h1>${a}</h1>${body}`;
   window.render=()=>{document.querySelector('#app').innerHTML=SchoolShieldTeacherPerformance.view();SchoolShieldTeacherPerformance.bind();};
   window.directory={teachers:[{id:'A',name:'Teacher A',employeeId:'EMP1',department:'Science'}],subjects:[{id:'S',name:'Science'}],classes:[{id:'C',class_ref:'8A',grade:'Grade 8'}],contexts:[{id:'CTX',teacher_id:'A',subject_id:'S',class_id:'C',academic_year:2026}],reviews:[{id:'R',teaching_context_id:'CTX',term:2,status:'Not Started',revision:1,review_content:{},updated_at:'2026-10-13T10:00:00Z'}]};
   window.reviewHistory=[];window.saveCalls=0;
   window.schoolshieldSupabase={from:()=>({select:()=>({eq:()=>({order:async()=>({data:structuredClone(window.reviewHistory)})})})}),rpc:async(name,args)=>{
    if(name==='sync_teacher_review_catalogue') return {data:null};
    if(name==='get_teacher_performance_directory') return {data:structuredClone(window.directory)};
    if(name==='set_teacher_term_review_status') return {data:'R'};
    if(name==='refresh_teacher_subject_performance') return {data:{current_average:61,baseline_average:54,improvement_percentage_points:7,baseline_candidates:[]}};
    if(name==='get_teacher_targets') return {data:[]};
    if(name==='save_teacher_review') {
     window.saveCalls++;window.lastArgs=args;
     if(window.failSave) return {error:{message:'Connection interrupted'}};
     await new Promise(resolve=>window.releaseSave=resolve);
     const old=structuredClone(window.directory.reviews[0]),r=window.directory.reviews[0];
     Object.assign(r,{review_content:args.p_content,internal_rating:args.p_rating,revision:r.revision+1,status:args.p_action==='draft'?'In Progress':'Awaiting Teacher Acknowledgement'});
     if(args.p_action==='submit') r.evidence_snapshot={metrics:{current_average:61,baseline_average:54,improvement_percentage_points:7},targets:[]};
     window.reviewHistory.push({action:args.p_action,previous_value:old,new_value:structuredClone(r),changed_by:currentRole,changed_at:'2026-10-13T12:00:00Z',reason:args.p_reason});return {data:structuredClone(r)};
    }throw Error(name);
   }};render();
  },currentRole);
  await page.waitForSelector('[data-performance-open]');assert.equal(await page.locator('[data-performance-filter]').count(),7);
  await page.click('[data-performance-open]');assert.equal(await page.locator('[data-review-status]').count(),0);
  const open=async()=>{await page.click('[data-workflow-open]');await page.waitForSelector('[data-review-form]');};
  const close=async()=>{await page.evaluate(()=>document.querySelectorAll('.modal-backdrop').forEach(el=>el.remove()));};
  await open();assert.equal(await page.locator('[data-area-comment]').count(),5);
  await page.fill('[data-area-comment="0"]','Positive environment observed');await page.check('[data-review-factor][value="LTSM shortages"]');
  await page.click('[data-review-action="draft"]');assert.match(await page.textContent('[data-review-feedback]'),/Saving/);assert.equal(await page.locator('[data-review-action="draft"]').isDisabled(),true);
  await page.evaluate(()=>window.releaseSave());await page.waitForFunction(()=>!document.querySelector('[data-review-feedback]').textContent.startsWith('Saving'));assert.equal(await page.textContent('[data-review-feedback]'),'Draft saved.');
  await close();await open();assert.equal(await page.inputValue('[data-area-comment="0"]'),'Positive environment observed');assert.equal(await page.locator('[data-review-factor][value="LTSM shortages"]').isChecked(),true);
  await page.click('[data-review-action="submit"]');assert.match(await page.textContent('[data-review-feedback]'),/each of the five/);
  for(let i=1;i<5;i++) await page.fill(`[data-area-comment="${i}"]`,'Evidence considered for this area');
  await page.selectOption('[data-review-rating]','3');await page.click('[data-support-add]');await page.fill('[data-support-description="0"]','Arrange LTSM support');
  await page.evaluate(()=>window.failSave=true);await page.click('[data-review-action="submit"]');await page.waitForFunction(()=>document.querySelector('[data-review-feedback]').textContent.includes('Not saved'));
  assert.equal(await page.inputValue('[data-support-description="0"]'),'Arrange LTSM support');
  await page.evaluate(()=>window.failSave=false);await page.click('[data-review-action="submit"]');await page.evaluate(()=>window.releaseSave());await page.waitForFunction(()=>document.querySelector('[data-review-feedback]').textContent.includes('Saved —'));
  await close();await open();assert.equal(await page.locator('[data-area-comment="0"]').isDisabled(),true);assert.equal(await page.locator('[data-review-action="draft"]').count(),0);
  assert.equal(await page.locator('[data-metrics-save]').count(),0);assert.equal(await page.locator('[data-target-new]').count(),0);assert.match(await page.textContent('#app'),/Locked submission evidence/);
  assert.equal(await page.inputValue('[data-review-rating]'),'3');await page.click('[data-review-amend]');await page.selectOption('[data-review-rating]','4');
  await page.click('[data-review-action="amend"]');assert.match(await page.textContent('[data-review-feedback]'),/reason/);
  await page.fill('[data-amend-reason]','Additional observation evidence');await page.click('[data-review-action="amend"]');await page.evaluate(()=>window.releaseSave());await page.waitForFunction(()=>document.querySelector('[data-review-feedback]').textContent.includes('Saved —'));
  assert.equal((await page.evaluate(()=>window.lastArgs)).p_action,'amend');await close();await open();assert.match(await page.textContent('[data-review-history]'),/Additional observation evidence/);
  await page.close();
 }
 console.log('PASS browser: Principal/Deputy drafts, context, support, rating, validation, confirmed saves, failure retention, locked review and reasoned amendment history.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
