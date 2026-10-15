const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const plan=JSON.parse(fs.readFileSync('tests/fixtures/pilot-teacher-allocations-20261014.json','utf8'));
(async()=>{
  if(!process.env.PILOT_TEST_PASSWORD)throw Error('Set PILOT_TEST_PASSWORD');
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://schoolshieldv2.vercel.app/login.html');await page.fill('#email','principal@setjhabasemaketse.test');await page.fill('#password',process.env.PILOT_TEST_PASSWORD);await page.fill('#schoolCode','SMM-001');
    await page.click('#loginForm button[type=submit]');await page.waitForURL('**/dashboard.html',{timeout:60000});await page.goto('https://schoolshieldv2.vercel.app/teacher-performance.html');await page.locator('[data-performance-inactive]').waitFor({timeout:60000});
    for(const allocation of plan.allocations){
      const row=page.locator('tr').filter({has:page.locator('[data-performance-open="'+allocation.teacherId+'"]')});
      const text=await row.textContent();for(const value of [allocation.staffRef,allocation.department,allocation.className,'Mathematics','English'])assert.ok(text.includes(value),allocation.name+': '+value);
      assert.ok(!/Staff ID not captured|Not linked|Department not set/.test(text));
    }
    assert.equal(await page.locator('[data-performance-open="a80110e8-969c-49da-b008-bdd25d916b2d"]').count(),0);
    await page.check('[data-performance-inactive]');assert.equal(await page.locator('[data-performance-open="a80110e8-969c-49da-b008-bdd25d916b2d"]').count(),1);await page.uncheck('[data-performance-inactive]');
    const allocation=plan.allocations[0];await page.click('[data-performance-open="'+allocation.teacherId+'"]');await page.click('[data-performance-subject="'+allocation.subjects[0].id+'"]');await page.locator('[data-performance-grade]').first().click();await page.locator('[data-performance-context]').first().click();await page.click('[data-performance-term="2"]');await page.locator('[data-workflow-open]').waitFor({timeout:30000});
    assert.deepEqual(errors,[]);console.log('PASS live populated staff directory, inactive toggle and assigned teacher -> subject -> grade/class -> Term 2 review.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
