const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{for(const width of [1366,390])for(const viewer of ['principal','deputy','clerk','teacher','parent','sgb','security']){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<aside class="sidebar"><nav></nav></aside><details id="contentDetails" open><summary>Unrelated page content</summary></details>');
 await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
 await page.evaluate(viewer=>{role=()=>viewer;page=()=>viewer==='sgb'?'visitors':'notifications';navHasNewUpdates=()=>true;document.querySelector('nav').innerHTML=nav();initSidebarAccordion(document.querySelector('.sidebar'));initSidebarAccordion(document.querySelector('.sidebar'));},viewer);
 const opened=()=>page.locator('.sidebar details[open]').count();assert.ok(await opened()<=1);
 const summaries=page.locator('.sidebar details summary');for(let i=0;i<await summaries.count();i++){await summaries.nth(i).click();assert.ok(await opened()<=1);}
 await summaries.first().focus();await page.keyboard.press('Enter');assert.ok(await opened()<=1);await page.keyboard.press('Space');assert.ok(await opened()<=1);
 // Remove native grouped-details support and test the fallback with restored state.
 await page.evaluate(()=>{const groups=[...document.querySelectorAll('.sidebar details')];groups.forEach(g=>{g.removeAttribute('name');g.open=true;});});await page.waitForFunction(()=>document.querySelectorAll('.sidebar details[open]').length<=1);
 for(let i=0;i<await summaries.count();i++){await summaries.nth(i).click();assert.ok(await opened()<=1);}
 // A portal may replace its navigation without replacing the sidebar node.
 await page.evaluate(()=>{document.querySelector('nav').innerHTML=nav();document.querySelectorAll('.sidebar details').forEach(g=>g.removeAttribute('name'));});await summaries.first().click();if(await summaries.count()>1)await summaries.nth(1).click();assert.ok(await opened()<=1);
 assert.equal(await page.locator('#contentDetails').evaluate(e=>e.open),true);assert.deepEqual(errors,[]);await page.close();
 }console.log('PASS all seven portal sidebars: single-open accordion, pointer/keyboard, no native grouping, restored/programmatic state, repeated binding and replaced menus at desktop/mobile sizes.');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
