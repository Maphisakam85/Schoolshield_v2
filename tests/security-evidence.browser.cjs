const assert=require('node:assert/strict'), fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const source=fs.readFileSync('SchoolShield/app.js','utf8');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({content:source.slice(source.indexOf('function photoCaptureField('),source.indexOf('function modal('))});
    await page.evaluate(()=>{
      window.role=()=> 'security';window.$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
      window.inputValue=id=>document.getElementById(id)?.value.trim()||'';
      document.body.innerHTML=`<div id="form"><div class="form-grid"><select id="incidentCategory"><option>Medical</option><option>Missing Property</option><option>Theft / Stolen Items</option><option>Property Damage / Broken Items</option></select>${photoCaptureField('incident')}<label>Existing photo<input id="incidentPhotos" type="file" accept="image/jpeg,image/png" multiple data-photo-input></label></div></div>`;
      bindIncidentEvidenceForm(document.getElementById('form'));
    });
    assert.equal(await page.locator('#incidentCamera').getAttribute('capture'),'environment');
    assert.equal(await page.locator('#incidentPhotos').getAttribute('capture'),null);
    assert.equal(await page.locator('#affectedItemsSection').isVisible(),false);
    await page.selectOption('#incidentCategory','Missing Property');assert.equal(await page.locator('#affectedItemsSection').isVisible(),true);
    await page.locator('[data-item="description"]').fill('Laptop');
    await page.click('#addAffectedItem');await page.locator('[data-item="description"]').nth(1).fill('Phone');
    assert.equal((await page.evaluate(()=>readAffectedItems())).length,2);
    await page.locator('.affected-item button').nth(1).click();assert.equal((await page.evaluate(()=>readAffectedItems())).length,1);
    await page.selectOption('#incidentCategory','Medical');assert.equal(await page.locator('#affectedItemsSection').isVisible(),false);
    await page.locator('#incidentPhotos').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=','base64')});
    await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===1);
    await page.locator('#incidentCamera').setInputFiles({name:'capture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=','base64')});
    assert.equal(await page.locator('img').count(),2);
    await page.locator('#incidentPhotos').setInputFiles({name:'bad.gif',mimeType:'image/gif',buffer:Buffer.from('bad')});
    assert.match(await page.locator('#incidentPhotos').locator('..').textContent(),/JPEG or PNG/);
    console.log('Mobile camera input, gallery preview, invalid photo rejection, affected category visibility and add/remove rows passed. Physical camera hardware was not exercised.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
