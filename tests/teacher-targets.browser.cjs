const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});await page.setContent('<html><body><div id="app"></div></body></html>');
  await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
  for(const file of ['teacher-targets.js','teacher-performance.js']) await page.addScriptTag({content:fs.readFileSync('SchoolShield/'+file,'utf8')});
  await page.evaluate(()=>{
   window.currentRole='principal';window.role=()=>window.currentRole;window.generic=(title,section,description,body)=>`<h1>${title}</h1>${body}`;
   window.currentView='management';window.render=()=>{document.getElementById('app').innerHTML=window.currentView==='management'?window.SchoolShieldTeacherPerformance.view():window.SchoolShieldTeacherTargets.viewOwn();window.currentView==='management'?window.SchoolShieldTeacherPerformance.bind():window.SchoolShieldTeacherTargets.bindOwn();};
   window.directory={teachers:[{id:'A',name:'Teacher A',employeeId:'EMP1',department:'Mathematics'}],subjects:[{id:'S1',name:'Mathematics'}],classes:[{id:'CL1',class_ref:'8A',grade:'Grade 8'}],contexts:[{id:'CTX1',teacher_id:'A',subject_id:'S1',class_id:'CL1',academic_year:2026}],reviews:[]};window.savedTargets=[];
   window.schoolshieldSupabase={rpc:async(name,args)=>{
    if(name==='sync_teacher_review_catalogue') return {data:null};if(name==='get_teacher_performance_directory') return {data:window.directory};if(name==='get_teacher_targets') return {data:structuredClone(window.savedTargets)};
    if(name==='save_teacher_target') {
     window.lastTargetArgs=args;if(window.failTarget) return {error:{message:'Connection interrupted'}};
     await new Promise(resolve=>window.releaseTargetSave=resolve);
     const d=args.p_details,isNumber=['Percentage','Percentage Point Improvement','Number'].includes(d.measurementType);
     const target={id:args.p_id,teacher_id:'A',teaching_context_id:'CTX1',subject:'Mathematics',grade:'Grade 8',class_ref:'8A',academic_year:2026,term:args.p_term,description:d.description,target_category:d.targetCategory,baseline:d.baseline,target_value:d.targetValue,measurement_type:d.measurementType,measurement_source:d.measurementSource,actual_value:isNumber?61:null,actual_text:d.actualText,margin:isNumber?61-d.targetValue:null,status:isNumber?'Near Target':d.status,due_date:d.dueDate,priority:d.priority,direction:d.direction,near_tolerance:d.nearTolerance,revision:(args.p_expected_revision||0)+1};
     window.savedTargets=[target];return {data:target};
    }
    throw new Error('Unexpected RPC '+name);
   }};render();
  });
  await page.waitForSelector('[data-performance-open]');await page.click('[data-performance-open="A"]');await page.waitForSelector('[data-target-new="CTX1:2"]');await page.click('[data-target-new="CTX1:2"]');
  assert.equal(await page.locator('[data-target-field="category"] option').count(),12);assert.equal(await page.locator('[data-target-field="type"] option').count(),6);
  await page.fill('[data-target-field="description"]','Improve Mathematics while recognising baseline progress.');await page.fill('[data-target-field="baseline"]','54');await page.fill('[data-target-field="target"]','65');
  await page.selectOption('[data-target-field="source"]','current_average');await page.fill('[data-target-field="tolerance"]','5');await page.fill('[data-target-field="due"]','2026-12-01');
  await page.click('[data-target-form] button[type="submit"]');assert.match(await page.textContent('[data-target-save-state]'),/Saving/);
  const args=await page.evaluate(()=>window.lastTargetArgs);assert.equal(args.p_details.targetValue,65);assert.equal(args.p_details.actualValue,undefined);assert.equal(args.p_expected_revision,null);
  await page.evaluate(()=>window.releaseTargetSave());await page.waitForSelector('[data-target-edit]');assert.match(await page.locator('#app').textContent(),/-4 percentage points/);assert.match(await page.locator('#app').textContent(),/Near Target/);
  await page.click('[data-target-edit]');await page.selectOption('[data-target-field="type"]','Qualitative');await page.fill('[data-target-field="target"]','Provide consistent learner feedback');await page.selectOption('[data-target-field="status"]','In Progress');
  assert.equal(await page.locator('[data-target-field="actual"]').isVisible(),false);
  await page.evaluate(()=>window.failTarget=true);await page.click('[data-target-form] button[type="submit"]');await page.waitForFunction(()=>document.querySelector('[data-target-save-state]').textContent.includes('Not saved'));
  assert.equal(await page.inputValue('[data-target-field="target"]'),'Provide consistent learner feedback');
  await page.evaluate(()=>window.failTarget=false);await page.click('[data-target-form] button[type="submit"]');await page.waitForFunction(()=>window.lastTargetArgs.p_details.measurementType==='Qualitative');await page.evaluate(()=>window.releaseTargetSave());
  await page.waitForFunction(()=>!document.querySelector('[data-target-form]'));assert.match(await page.textContent('#app'),/Not applicable/);assert.match(await page.textContent('#app'),/In Progress/);
  await page.evaluate(()=>{window.currentRole='teacher';window.currentView='own';render();});await page.waitForFunction(()=>document.getElementById('app').textContent.includes('Provide consistent learner feedback'));
  assert.equal(await page.locator('[data-target-new],[data-target-edit]').count(),0);assert.match(await page.textContent('#app'),/read-only/);
  await page.evaluate(()=>{window.currentRole='deputy';window.currentView='management';render();});await page.click('[data-target-new="CTX1:2"]');assert.equal(await page.locator('[data-target-form]').count(),1);
  console.log('PASS target browser: Principal/Deputy Set Target, 12 categories/6 measurements, confirmed save, numeric margin, qualitative no-margin, retained failure draft and Teacher read-only page.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
