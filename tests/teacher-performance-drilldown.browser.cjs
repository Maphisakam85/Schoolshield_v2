const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const app = fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'');
const feature = fs.readFileSync('SchoolShield/teacher-performance.js','utf8');
const styles=fs.readFileSync('SchoolShield/styles.css','utf8').replace(/@import[^;]+;/g,'');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    for (const width of [1366,390]) for (const role of ['principal','deputy']) {
      const page = await browser.newPage({viewport:{width,height:844}}), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const bootstrap = `
        role=()=>${JSON.stringify(role)};
        generic=(title,section,description,body)=>'<h1>'+title+'</h1>'+body;
        window.fixture={teachers:[{id:'T',name:'Teacher One',employeeId:'EMP1',department:'Science'}],
          subjects:[{id:'M',name:'Mathematics'},{id:'E',name:'English'}],
          classes:[{id:'A',class_ref:'10A',grade:'Grade 10'},{id:'B',class_ref:'10B',grade:'Grade 10'},{id:'C',class_ref:'11A',grade:'Grade 11'}],
          contexts:[{id:'MA',teacher_id:'T',subject_id:'M',class_id:'A'},{id:'MB',teacher_id:'T',subject_id:'M',class_id:'B'},
            {id:'MC',teacher_id:'T',subject_id:'M',class_id:'C'},{id:'EA',teacher_id:'T',subject_id:'E',class_id:'A'}],reviews:[]};
        window.schoolshieldSupabase={rpc:async name=>name==='sync_teacher_review_catalogue'?{data:null}:{data:structuredClone(fixture)}};
        window.SchoolShieldTeacherDashboard={render:()=>'<section id="managementSummary">Management summary</section>',bind(){},invalidate(){}};
        window.lastMetricContexts=[];
        window.SchoolShieldTeacherMetrics={render:(c,t)=>'<section id="academicEvidence" data-context="'+c.id+'" data-term="'+t+'">Academic evidence</section>',bind:contexts=>{window.lastMetricContexts=contexts.map(c=>c.id);}};
        window.render=()=>{document.getElementById('app').innerHTML=SchoolShieldTeacherPerformance.view();SchoolShieldTeacherPerformance.bind();};
        initWorkspaceDraftProtection();render();
      `;
      await page.route('http://schoolshield.test/**',route=>{
        const path=new URL(route.request().url()).pathname;
        const body=path==='/styles.css'?styles:path==='/app.js'?app:path==='/feature.js'?feature+'\n'+bootstrap:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body data-page="teacher-performance"><div id="app"></div><script src="/app.js"></script><script src="/feature.js"></script></body>';
        route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html',body});
      });
      await page.goto('http://schoolshield.test/teacher-performance.html');
      await page.locator('[data-performance-open]').waitFor();
      assert.equal(await page.locator('#managementSummary').count(),1);
      await page.click('[data-performance-open="T"]');
      assert.equal(await page.locator('#managementSummary').count(),0);
      assert.equal(await page.locator('[data-performance-filter],#academicEvidence').count(),0);
      assert.equal(await page.locator('[data-performance-subject]').count(),2);
      await page.click('[data-performance-subject="M"]');
      assert.equal(await page.locator('[data-performance-grade]').count(),2);
      await page.click('[data-performance-grade="Grade 10"]');
      assert.equal(await page.locator('[data-performance-context]').count(),2);
      await page.click('[data-performance-context="MA"]');
      assert.equal(await page.locator('[data-performance-term]').count(),4);
      assert.equal(await page.locator('#academicEvidence').count(),0);
      await page.click('[data-performance-term="2"]');
      assert.equal(await page.locator('#academicEvidence').getAttribute('data-context'),'MA');
      assert.equal(await page.locator('#academicEvidence').getAttribute('data-term'),'2');
      assert.deepEqual(await page.evaluate(()=>lastMetricContexts),['MA']);
      assert.equal(new URL(page.url()).searchParams.get('context'),'MA');
      await page.reload();await page.locator('#academicEvidence').waitFor();
      assert.equal(await page.locator('#academicEvidence').getAttribute('data-context'),'MA');
      await page.goBack();await page.locator('[data-performance-term]').first().waitFor();
      assert.equal(await page.locator('#academicEvidence').count(),0);
      await page.click('[data-performance-term="1"]');
      await page.evaluate(()=>modal('Draft review','<form><textarea id="unsavedReview"></textarea></form>'));
      await page.fill('#unsavedReview','Unsaved reviewer comment');
      page.once('dialog',dialog=>dialog.dismiss());
      await page.evaluate(()=>document.querySelector('[data-performance-step="teacher"]').click());
      assert.equal(await page.inputValue('#unsavedReview'),'Unsaved reviewer comment');
      assert.equal(await page.locator('#academicEvidence').count(),1);
      page.once('dialog',dialog=>dialog.accept());
      await page.evaluate(()=>document.querySelector('[data-performance-step="teacher"]').click());
      assert.equal(await page.locator('#unsavedReview,#academicEvidence').count(),0);
      assert.equal(await page.locator('[data-performance-subject]').count(),2);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
      await page.close();
      console.log(`PASS ${role} ${width}: subject/grade/class/term isolation, URLs, reload, Back, draft cancellation/discard`);
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
