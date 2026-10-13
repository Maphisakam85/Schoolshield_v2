const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}}),consoleErrors=[];page.on('pageerror',error=>consoleErrors.push(error.message));page.on('console',message=>{if(message.type()==='error') consoleErrors.push(message.text());});await page.setContent('<html><body><div id="app"></div></body></html>');
  await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
  for(const file of ['teacher-targets.js','teacher-review-workflow.js','teacher-my-performance.js','teacher-performance-dashboard.js','teacher-performance.js']) await page.addScriptTag({content:fs.readFileSync('SchoolShield/'+file,'utf8')});
  await page.evaluate(()=>{
   window.currentRole='teacher';window.role=()=>window.currentRole;window.generic=(a,b,c,body)=>`<h1>${a}</h1><p>${b}</p>${body}`;
   window.render=()=>{if(window.homeMode){document.querySelector('#app').innerHTML=SchoolShieldTeacherDashboard.renderHome();SchoolShieldTeacherDashboard.bindHome();return;}const module=currentRole==='teacher'?SchoolShieldMyPerformance:SchoolShieldTeacherPerformance;document.querySelector('#app').innerHTML=module.view();currentRole==='teacher'?module.bindOwn():module.bind();};
   window.review={id:'R',teaching_context_id:'CTX',academic_year:2026,term:2,revision:2,status:'Awaiting Teacher Acknowledgement',internal_rating:3,review_content:{strengths:'Positive teaching environment',concerns:'LTSM shortages',contextualFactors:['Overcrowding'],contextNotes:'Large class',recommendedSupport:'Peer observation',supportActions:[{description:'Plan support visit'}]},evidence_snapshot:{metrics:{current_average:61,curriculum_coverage:70,assessments_planned:3,assessments_completed:2}},updated_at:'2026-10-13T10:00:00Z'};
   window.targets=[{id:'T',subject:'Science',target_category:'Learner Achievement',description:'Improve from baseline',baseline:54,target_value:65,actual_value:61,margin:-4,status:'Below Target',measurement_type:'Percentage',measurement_source:'current_average',direction:'Higher is better',near_tolerance:0,due_date:'2026-12-01',priority:'Medium'}];
   window.actions=[];window.ackCalls=0;
   window.directory=()=>({teachers:[{id:'A',name:'Teacher A',employeeId:'EMP1',department:'Science'}],subjects:[{id:'S',name:'Science'}],classes:[{id:'C',class_ref:'8A',grade:'Grade 8'}],contexts:[{id:'CTX',teacher_id:'A',subject_id:'S',class_id:'C',academic_year:2026}],reviews:[structuredClone(window.review)]});
   window.schoolshieldSupabase={from:()=>({select:()=>({eq:()=>({order:async()=>({data:structuredClone(window.actions)})})})}),rpc:async(name,args)=>{
    if(name==='get_my_teacher_performance') return {data:args.p_term===2?[{id:'CTX',subject:'Science',grade:'Grade 8',class:'8A',review:structuredClone(window.review),metrics:window.review.evidence_snapshot.metrics,targets:structuredClone(window.targets),supportActions:structuredClone(window.actions)}]:[]};
    if(name==='acknowledge_teacher_review') {
     window.ackCalls++;window.lastAck=args;if(window.failAck) return {error:{message:'Offline'}};
     await new Promise(resolve=>window.releaseAck=resolve);
     Object.assign(window.review,{status:'Completed',teacher_acknowledged_at:'2026-10-13T12:00:00Z',teacher_comment:args.p_comment,revision:3});return {data:structuredClone(window.review)};
    }
    if(name==='sync_teacher_review_catalogue') return {data:null};
    if(name==='get_teacher_performance_directory') return {data:window.directory()};
    if(name==='get_teacher_performance_overview'||name==='get_teacher_performance_history') {
     const context={id:'CTX',teacherId:'A',subject:'Science',subjectId:'S',grade:'Grade 8',class:'8A',classId:'C',review:structuredClone(window.review),metrics:window.review.evidence_snapshot.metrics,targets:window.targets,supportActions:window.actions};
     if(name==='get_teacher_performance_overview') return {data:{teachers:window.directory().teachers,contexts:args.p_term===2?[context]:[]}};
     return {data:{teacher:{id:'A',display_name:'Teacher A'},years:[2026,2025],terms:[1,2,3,4].map(term=>({term,contexts:term===2&&args.p_year===2026?[context]:[]})),events:[{event:'Teacher acknowledged',term:2,changed_at:'2026-10-13T12:00:00Z',changed_by:'A',previous_value:{status:'Awaiting Teacher Acknowledgement'},new_value:window.review}],reviewHistory:[]}};
    }
    if(name==='get_teacher_targets') return {data:window.targets};
    if(name==='save_teacher_support_action') {
     window.lastSupport=args;if(window.failSupport) return {error:{message:'Connection interrupted'}};
     await new Promise(resolve=>window.releaseSupport=resolve);
     const value={...args.p_details,id:args.p_id,review_id:args.p_review,revision:(args.p_expected_revision||0)+1};window.actions=[value];return {data:value};
    }throw Error(name);
   }};render();
  });
  await page.waitForSelector('[data-teacher-ack]');assert.match(await page.textContent('#app'),/does not mean agreement/);assert.match(await page.textContent('#app'),/-4 percentage points/);assert.match(await page.textContent('#app'),/70%/);assert.match(await page.textContent('#app'),/Overcrowding/);
  assert.equal(await page.locator('[data-target-edit],[data-review-rating],[data-support-new]').count(),0);
  await page.fill('[data-teacher-response]','I received the review but disagree with the rating.');
  await page.evaluate(()=>window.failAck=true);await page.click('[data-teacher-ack] button');await page.waitForFunction(()=>document.querySelector('[data-ack-feedback]').textContent.includes('Not saved'));
  assert.equal(await page.inputValue('[data-teacher-response]'),'I received the review but disagree with the rating.');
  await page.evaluate(()=>window.failAck=false);await page.click('[data-teacher-ack] button');assert.equal(await page.locator('[data-teacher-ack] button').isDisabled(),true);assert.match(await page.textContent('[data-ack-feedback]'),/Saving/);
  await page.evaluate(()=>window.releaseAck());await page.waitForFunction(()=>!document.querySelector('[data-teacher-ack]'));assert.match(await page.textContent('#app'),/I received the review but disagree/);assert.match(await page.textContent('#app'),/Acknowledgement saved/);
  assert.deepEqual(Object.keys(await page.evaluate(()=>window.lastAck)).sort(),['p_comment','p_expected_revision','p_review']);
  await page.selectOption('[data-own-performance-term]','3');await page.waitForFunction(()=>document.querySelector('#app').textContent.includes('No subjects/classes'));await page.selectOption('[data-own-performance-term]','2');await page.waitForFunction(()=>document.querySelector('#app').textContent.includes('Science'));
  for(const managementRole of ['principal','deputy']) {
   await page.evaluate(role=>{window.currentRole=role;SchoolShieldTeacherPerformance.state.loaded=false;SchoolShieldTeacherPerformance.state.selected=null;render();},managementRole);
   await page.waitForSelector('[data-performance-open]');await page.waitForFunction(()=>document.querySelector('#app').textContent.includes('Teachers requiring support'));assert.equal(await page.locator('[data-performance-filter="class"]').count(),1);
   await page.click('[data-performance-history]');await page.waitForSelector('[data-history-year]');assert.equal(await page.locator('.modal-body > details').count(),5);assert.match(await page.textContent('.modal-body'),/Teacher acknowledgement/);assert.match(await page.textContent('.modal-body'),/Teacher acknowledged/);
   await page.selectOption('[data-history-year]','2025');await page.waitForFunction(()=>document.querySelector('.modal-body').textContent.includes('Not enough data'));await page.evaluate(()=>document.querySelector('.modal-backdrop').remove());
   await page.click('[data-performance-open]');await page.waitForSelector('[data-support-new]');assert.match(await page.textContent('#app'),/Teacher response/);
   await page.click('[data-support-new]');await page.fill('[name="support_area"]','Assessment design');await page.fill('[name="responsible_person"]','Head of Department');await page.fill('[name="intervention"]','Peer review assessment');await page.fill('[name="due_date"]','2026-11-01');await page.fill('[name="follow_up_date"]','2026-11-08');
   await page.click('[data-support-form] button[type="submit"]');assert.match(await page.textContent('[data-support-feedback]'),/Saving/);await page.evaluate(()=>window.releaseSupport());await page.waitForFunction(()=>document.querySelector('[data-support-feedback]').textContent==='Support action saved.');
   assert.equal((await page.evaluate(()=>window.lastSupport)).p_expected_revision,null);await page.evaluate(()=>document.querySelector('.modal-backdrop').remove());await page.click('[data-support-edit]');
   await page.selectOption('[name="status"]','Completed');await page.fill('[name="outcome"]','Revised assessment approved');await page.evaluate(()=>window.failSupport=true);await page.click('[data-support-form] button[type="submit"]');await page.waitForFunction(()=>document.querySelector('[data-support-feedback]').textContent.includes('Not saved'));assert.equal(await page.inputValue('[name="outcome"]'),'Revised assessment approved');
   await page.evaluate(()=>window.failSupport=false);await page.click('[data-support-form] button[type="submit"]');await page.evaluate(()=>window.releaseSupport());await page.waitForFunction(()=>document.querySelector('[data-support-feedback]').textContent==='Support action saved.');assert.equal((await page.evaluate(()=>window.lastSupport)).p_expected_revision,1);
   await page.evaluate(()=>document.querySelector('.modal-backdrop').remove());assert.match(await page.textContent('#app'),/Revised assessment approved/);
  }
  await page.evaluate(()=>{window.currentRole='principal';window.homeMode=true;render();});await page.waitForFunction(()=>document.querySelector('#app').textContent.includes('Total teachers'));assert.equal(await page.locator('a[href="teacher-performance.html"]').count(),1);
  await page.evaluate(()=>{window.homeMode=false;window.currentRole='teacher';SchoolShieldMyPerformance.load();});await page.waitForFunction(()=>document.querySelector('#app').textContent.includes('Revised assessment approved'));assert.equal(await page.locator('[data-support-edit]').count(),0);
  for(const role of ['parent','sgb','security']) {const html=await page.evaluate(role=>{window.currentRole=role;return SchoolShieldMyPerformance.view();},role);assert.match(html,/Access restricted/);assert.ok(!html.includes('Revised assessment approved'));assert.equal(await page.evaluate(()=>SchoolShieldTeacherDashboard.renderHome()),'');}
  assert.deepEqual(consoleErrors,[]);
  console.log('PASS browser: own performance, acknowledgement, Principal/Deputy summaries/history/support, failed-save retention, role restrictions and clean browser console.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
