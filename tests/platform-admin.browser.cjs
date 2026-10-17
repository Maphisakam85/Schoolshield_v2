const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 for(const width of [1366,390]){
  const context=await browser.newContext({viewport:{width,height:844}}),errors=[];
  await context.addInitScript(({A,B})=>{
   window.calls=[];window.owner='00000000-0000-4000-8000-000000000080';
   sessionStorage.setItem('schoolshieldRole','principal');
   window.fixtureSchools=[{id:A,code:'QA-ALPHA',name:'Fictional QA Alpha',data_mode:'qa',revision:1,email:'office@alpha.example.test',emis_number:'900000001'},
    {id:B,code:'QA-BETA',name:'<img src=x onerror="window.injected=true"> QA Beta',data_mode:'qa',revision:1}];
   window.platformMock={createClient:(url,key,options)=>{
    window.clientOptions=options;
    return {auth:{getUser:async()=>({data:{user:{id:owner}}}),getSession:async()=>({data:{session:{access_token:'fixture-token'}}}),signOut:async()=>({}),signInWithPassword:async()=>({data:{user:{id:owner}}})},
     rpc:async(name,args)=>{
      calls.push({name,args});
      if(sessionStorage.getItem('denyPlatform'))return {error:{message:'Platform administrator access denied'}};
      if(name==='platform_admin_context')return {data:{user_id:owner,email:'owner@example.test'}};
      if(name==='open_platform_admin_portal')return {data:null};
      if(name==='platform_admin_directory')return {data:{schools:fixtureSchools,audit:[]}};
      if(name==='platform_admin_school')return {data:{school:fixtureSchools.find(s=>s.id===args.p_school),provision:null,audit:[]}};
      if(name==='platform_admin_save_school'){
       if(window.failSave)return {error:{message:'QA simulated save failure'}};
       if(window.pauseSave)await new Promise(resolve=>window.releaseSave=resolve);
       const s=fixtureSchools.find(s=>s.id===args.p_school);Object.assign(s,args.p_fields,{revision:s.revision+1});return {data:s};
      }
      return {error:{message:'Unexpected RPC'}};
     }};
   }};
  },{A,B});
  await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:'window.supabase=window.platformMock;'}));
  await context.route('https://platform.example.test/**',r=>{
   const name=new URL(r.request().url()).pathname.slice(1);
   if(name==='supabase-config.js')return r.fulfill({contentType:'text/javascript',body:'window.SCHOOLSHIELD_SUPABASE_CONFIG={url:"https://api.example.test",publishableKey:"public-fixture"};'});
   const file=path.join('SchoolShield',name);if(!fs.existsSync(file))return r.fulfill({status:404,body:''});
   return r.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'image/png',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://platform.example.test/super-admin.html');await page.waitForSelector('#platformContent:not([hidden])');
  assert.equal(await page.evaluate(()=>clientOptions.auth.storageKey),'schoolshield-platform-auth');
  assert.equal(await page.locator('#schoolRows tr').count(),2);assert.equal(await page.locator('#schoolRows img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  await page.fill('#platformSearch','qa-alpha');assert.equal(await page.locator('#schoolRows tr').count(),1);
  await page.locator('[data-school-link]').click();await page.waitForSelector('#platformContent:not([hidden])');
  assert.equal(await page.textContent('#selectedSchoolCode'),'QA-ALPHA');assert.equal(await page.locator('[name=code]').getAttribute('readonly'),'');
  await page.fill('[name=physical_address]','Fictional updated address');await page.fill('[name=reason]','QA address correction');await page.evaluate(()=>{window.pauseSave=true;});
  await page.locator('#schoolForm [type=submit]').click();assert.equal(await page.locator('#schoolForm [type=submit]').isDisabled(),true);await page.evaluate(()=>document.querySelector('#schoolForm').requestSubmit());
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.name==='platform_admin_save_school').length),1);
  assert.equal(await page.evaluate(()=>calls.find(c=>c.name==='platform_admin_save_school').args.p_school),A);
  await page.evaluate(()=>releaseSave());await page.waitForFunction(()=>document.getElementById('platformStatus').textContent.includes('Saved school'));
  assert.equal(await page.evaluate(()=>fixtureSchools.find(s=>s.code==='QA-BETA').physical_address),undefined);
  await page.evaluate(()=>{window.failSave=true;window.pauseSave=false;});await page.fill('[name=name]','Retained failed edit');await page.fill('[name=reason]','QA failed save retained');await page.locator('#schoolForm [type=submit]').click();await page.waitForFunction(()=>document.getElementById('platformStatus').textContent.includes('could not be confirmed'));assert.equal(await page.inputValue('[name=name]'),'Retained failed edit');
  await page.evaluate(()=>{window.confirm=()=>true;});page.on('dialog',d=>d.accept());await page.goto('https://platform.example.test/super-admin-school.html?school='+B);await page.waitForSelector('#platformContent:not([hidden])');assert.equal(await page.textContent('#selectedSchoolCode'),'QA-BETA');assert.equal(await page.inputValue('[name=physical_address]'),'');
  await page.evaluate(()=>sessionStorage.setItem('denyPlatform','1'));await page.goto('https://platform.example.test/super-admin.html');await page.waitForFunction(()=>document.getElementById('platformStatus').textContent.includes('could not be verified'));assert.equal(await page.locator('#platformContent').isVisible(),false);assert.equal(await page.evaluate(()=>calls.some(c=>c.name==='platform_admin_directory')),false);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS platform portal desktop/mobile: role denial, separate session, search, canonical school switching, read-only code, safe text, duplicate prevention and failed-save retention.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
