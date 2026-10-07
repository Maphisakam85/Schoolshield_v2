const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<html><body><div id="app"></div></body></html>');
  await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
  await page.evaluate(()=>{
   window.getState=()=>({security:[{id:'A',name:'Officer A',shift:'18:00–06:00'}],securityAttendance:[]});
   window.role=()=> 'security';window.userName=()=> 'Officer A';window.todayIso=()=> '2026-10-07';
   window.canRecordSecurityShift=()=>true;
   window.refreshCloudWorkspace=async()=>true;window.finishForm=()=>document.body.dataset.saved='true';
   window.schoolshieldSupabase={rpc:async(name,params)=>{window.submitted=params;return {data:{id:'saved'}};}};
   clockInSecurityOfficer('A');
  });
  assert.equal(await page.inputValue('#securityShiftDate'),'2026-10-07');
  assert.match(await page.textContent('#securityShiftDuration'),/12h 0m/);
  await page.fill('#securityShiftStart','08:15');await page.fill('#securityShiftEnd','16:45');
  assert.match(await page.textContent('#securityShiftDuration'),/8h 30m/);
  await page.fill('#securityShiftDate','2026-10-06');
  await page.click('[data-action="confirm-security-shift"]');await page.waitForFunction(()=>document.body.dataset.saved==='true');
  const submitted=await page.evaluate(()=>window.submitted);assert.equal(submitted.p_date,'2026-10-06');assert.equal(submitted.p_start,'08:15');assert.equal(submitted.p_end,'16:45');assert.equal(submitted.actualCheckInAt,undefined);
  console.log('PASS browser shift date/start/end controls, live normal/overnight duration and schedule-only submission.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
