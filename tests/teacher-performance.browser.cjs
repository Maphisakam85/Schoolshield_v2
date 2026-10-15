const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {
  for(const currentRole of ['principal','deputy']) {
   const page=await browser.newPage({viewport:{width:1280,height:900}});
   await page.setContent('<html><body><div id="app"></div></body></html>');
   await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
   await page.addScriptTag({content:fs.readFileSync('SchoolShield/teacher-performance.js','utf8')});
   await page.evaluate(currentRole=>{
    window.role=()=>currentRole;
    window.generic=(title,section,description,body)=>`<h1>${title}</h1>${body}`;
    window.render=()=>{document.getElementById('app').innerHTML=window.SchoolShieldTeacherPerformance.view();window.SchoolShieldTeacherPerformance.bind();};
    window.directory={teachers:[{id:'A',name:'Teacher A',employeeId:'EMP1',department:'Languages'},{id:'B',name:'Teacher B',employeeId:'EMP2',department:'Science'}],subjects:[{id:'S1',name:'English'},{id:'S2',name:'Mathematics'}],classes:[{id:'CL1',class_ref:'8A',grade:'Grade 8'},{id:'CL2',class_ref:'9B',grade:'Grade 9'}],contexts:[{id:'CTX1',teacher_id:'A',subject_id:'S1',class_id:'CL1'}],reviews:[]};
    window.schoolshieldSupabase={rpc:async(name,args)=>{
     if(name==='sync_teacher_review_catalogue') return {data:null};
     if(name==='get_teacher_performance_directory') return {data:structuredClone(window.directory)};
     if(window.failSave) return {error:{message:'Network unavailable'}};
     await new Promise(resolve=>{window.releaseSave=resolve;});
     const context=window.directory.contexts.find(c=>c.id===args.p_context);
     window.directory.reviews.push({id:'R'+args.p_term,teaching_context_id:context.id,teacher_id:'A',term:args.p_term,status:args.p_status,updated_at:'2026-10-13T10:00:00Z'});
     return {data:'saved'};
    }};
    render();
   },currentRole);
   await page.waitForSelector('[data-performance-open]');assert.equal(await page.locator('[data-performance-filter]').count(),7);
   await page.selectOption('[data-performance-filter="department"]','Science');assert.equal(await page.locator('[data-performance-open]').count(),1);
   await page.selectOption('[data-performance-filter="department"]','');await page.click('[data-performance-open="A"]');
   await page.evaluate(()=>{window.directory.reviews=[{id:'R1',teaching_context_id:'CTX1',teacher_id:'A',term:1,status:'In Progress',updated_at:'2026-10-13T10:00:00Z'}];});
   await page.evaluate(()=>window.SchoolShieldTeacherPerformance.load(false));
   await page.click('[data-performance-subject="S1"]');await page.click('[data-performance-grade]');await page.click('[data-performance-context="CTX1"]');assert.match(await page.locator('#app').textContent(),/In Progress/);
   assert.equal(await page.locator('[data-review-status]').count(),0);assert.equal(await page.locator('[data-review-save]').count(),0);
   assert.match(await page.locator('[data-performance-term="2"]').textContent(),/Not Started/);assert.match(await page.locator('#app').textContent(),/Not Started/);
   await page.close();
  }
  console.log('PASS browser: Principal/Deputy page, seven filters, teacher detail, term separation and read-only status display.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
