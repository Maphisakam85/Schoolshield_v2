const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const school='00000000-0000-4000-8000-000000000001';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 for(const width of [1366,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(school=>{
   window.savedTheme={school_id:school,revision:0,primary_color:'#0A8F62',navigation_color:'#082C36'};window.saves=0;
   window.mock={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}}),getSession:async()=>({data:{session:{}}})},rpc:async(name,args)=>{
    if(name==='platform_admin_context')return {data:{user_id:'owner',email:'owner@example.test'}};
    if(name==='open_platform_admin_portal')return {data:null};
    if(name==='platform_admin_school')return {data:{school:{id:school,name:'Fictional School',code:'QA-001'},provision:null,audit:[]}};
    if(name==='platform_admin_branding')return {data:{school_id:school,revision:0,object_path:null}};
    if(name==='platform_admin_theme')return {data:savedTheme};
    if(name==='save_platform_school_theme'){saves++;if(window.failSave)return {error:{message:'Simulated failure'}};savedTheme={school_id:args.p_school,primary_color:args.p_primary,navigation_color:args.p_navigation,revision:savedTheme.revision+1};return {data:savedTheme};}
    return {error:{message:'Unexpected RPC'}};
   }})};
  },school);
  await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:'window.supabase=window.mock;'}));
  await page.route('https://theme.example.test/**',r=>{const file=new URL(r.request().url()).pathname.slice(1);if(file==='supabase-config.js')return r.fulfill({contentType:'text/javascript',body:'window.SCHOOLSHIELD_SUPABASE_CONFIG={url:"https://api.example.test",publishableKey:"public"}'});const local=path.join('SchoolShield',file);return fs.existsSync(local)?r.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(local)}):r.abort();});
  await page.goto('https://theme.example.test/super-admin-branding.html?school='+school);await page.waitForSelector('#platformContent:not([hidden])');
  await page.selectOption('#themePreset','blue');assert.equal(await page.inputValue('#themePrimary'),'#1c4c97');assert.equal(await page.evaluate(()=>document.documentElement.dataset.schoolTheme),undefined);
  await page.fill('#themeReason','Match school colours');await page.click('#themeForm [type=submit]');await page.waitForFunction(()=>document.getElementById('platformStatus').textContent.includes('colours saved'));
  assert.equal(await page.evaluate(()=>savedTheme.primary_color),'#1C4C97');assert.equal(await page.evaluate(()=>saves),1);
  await page.evaluate(()=>window.failSave=true);await page.selectOption('#themePreset','burgundy');await page.fill('#themeReason','Retain failed selection');await page.click('#themeForm [type=submit]');await page.waitForFunction(()=>document.getElementById('platformStatus').textContent.includes('retained'));assert.equal(await page.inputValue('#themePrimary'),'#8b2443');assert.equal(await page.evaluate(()=>savedTheme.primary_color),'#1C4C97');
  page.on('dialog',d=>d.accept());await page.click('#themeReload');await page.waitForFunction(()=>document.getElementById('themePrimary').value==='#1c4c97');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#themePreview').screenshot({path:'supabase/.temp/theme-preview-'+width+'.png'});assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS school colour presets, scoped preview, save, failed-save retention, reload and mobile layout.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
