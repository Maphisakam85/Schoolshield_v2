const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try{for(const width of [1366,390]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://schoolshield.test/**',r=>r.fulfill({contentType:'text/html',body:'<body data-page="teacher-performance"><div id="app"></div></body>'}));await page.goto('https://schoolshield.test/teacher-performance.html');
    await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
    await page.addScriptTag({content:fs.readFileSync('SchoolShield/teacher-performance.js','utf8')});
    await page.evaluate(()=>{
      role=()=> 'principal';generic=(a,b,c,body)=>body;
      window.fixture={teachers:[{id:'A',name:'Teacher A',staffRef:'STAFF-101',employeeId:null,department:null,staffRevision:1,accountStatus:'Active'},
        {id:'Q',name:'Inactive QA',staffRef:'STAFF-102',department:'QA',accountStatus:'Inactive'}],subjects:[],classes:[],contexts:[],reviews:[]};
      window.schoolshieldSupabase={rpc:async(name,args)=>{
        if(name==='sync_teacher_review_catalogue')return {data:null};
        if(name==='get_teacher_performance_directory')return {data:structuredClone(fixture)};
        if(name==='save_teacher_staff_details'){window.savedArgs=args;await new Promise(resolve=>window.releaseStaff=resolve);if(window.failStaff)return {error:{message:'Connection failed'}};Object.assign(fixture.teachers[0],{department:args.p_department,employeeId:args.p_employee_id,staffRevision:2});return {data:{id:'staff-A'}};}
      }};
      render=()=>{document.getElementById('app').innerHTML=SchoolShieldTeacherPerformance.view();SchoolShieldTeacherPerformance.bind();};initWorkspaceDraftProtection();render();
    });
    await page.locator('[data-performance-staff="A"]').waitFor();assert.match(await page.textContent('#app'),/STAFF-101/);assert.ok(!(await page.textContent('#app')).includes('Inactive QA'));
    await page.check('[data-performance-inactive]');assert.match(await page.textContent('#app'),/Inactive QA/);await page.uncheck('[data-performance-inactive]');
    await page.click('[data-performance-staff="A"]');await page.fill('[name=department]','Mathematics <img src=x onerror=window.__staffXss=1>');await page.fill('[name=employee]','EMP-101');
    await page.evaluate(()=>window.failStaff=true);await page.click('[data-teacher-staff-form] button[type=submit]');assert.match(await page.textContent('[data-teacher-staff-feedback]'),/Saving/);assert.equal(await page.locator('[data-teacher-staff-form] button').isDisabled(),true);
    await page.evaluate(()=>window.releaseStaff());await page.waitForFunction(()=>document.querySelector('[data-teacher-staff-feedback]').textContent.startsWith('Not saved'));
    assert.equal(await page.inputValue('[name=employee]'),'EMP-101');await page.evaluate(()=>window.failStaff=false);await page.click('[data-teacher-staff-form] button[type=submit]');await page.evaluate(()=>window.releaseStaff());await page.locator('[data-teacher-staff-form]').waitFor({state:'detached'});
    assert.match(await page.textContent('#app'),/EMP-101/);assert.match(await page.textContent('#app'),/Mathematics <img/);assert.equal(await page.locator('#app img').count(),0);assert.equal(await page.evaluate(()=>window.__staffXss),undefined);
    assert.deepEqual(Object.keys(await page.evaluate(()=>savedArgs)).sort(),['p_department','p_employee_id','p_operation','p_revision','p_teacher']);assert.deepEqual(errors,[]);
    await page.close();console.log('PASS staff reference, inactive filter, confirmed/failing edits and literal department text '+width);
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
