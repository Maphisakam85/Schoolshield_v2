const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{for(const width of [1366,390]){
 const context=await browser.newContext({viewport:{width,height:844}});
 await context.addInitScript(({A,B})=>{
  window.owner='00000000-0000-4000-8000-000000000080';window.calls=[];
  window.schools=[{id:A,name:'Mmulakgoro QA (fictional)',code:'QA-MMU',data_mode:'qa'},{id:B,name:'Ntebaleng QA (fictional)',code:'QA-NTE',data_mode:'qa'}];
  window.controls=Object.fromEntries(schools.map(s=>[s.id,{school_id:s.id,status:'active',features:{announcements:true,appointments:true},revision:1}]));window.tickets=[];
  window.platformMock={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:owner}}}),signOut:async()=>({})},rpc:async(name,args)=>{
   calls.push({name,args});if(window.deny)return {error:{message:'Denied'}};
   if(name==='platform_admin_context')return {data:{user_id:owner,email:'owner@example.test'}};
   if(name==='open_platform_admin_portal')return {data:null};if(name==='platform_admin_school')return {data:{school:schools.find(s=>s.id===args.p_school),audit:[]}};
   if(name==='platform_admin_directory')return {data:{schools,audit:[]}};if(name==='platform_admin_school_access')return {data:controls[args.p_school]};
   if(name==='platform_admin_support')return {data:{school_id:args.p_school,tickets:tickets.filter(t=>t.school_id===args.p_school),diagnostics:{account_operations:[{operation_id:'QA-safe-reference',action:'invite',status:'Failed'}],provisioning:[]}}};
   if(name==='platform_admin_audit_history')return {data:{events:[{id:'qa-event',school_name:'QA school',school_code:'QA',actor_id:owner,action:'school_access_changed',operation_id:'QA-audit-reference',created_at:'2026-10-17T08:00:00Z'}]}};
   if(name==='platform_admin_set_school_access'){
    if(window.fail)return {error:{message:'secret token=DO-NOT-DISPLAY <img src=x onerror=alert(1)>'}};
    if(window.pause)await new Promise(resolve=>window.release=resolve);
    return {data:controls[args.p_school]={school_id:args.p_school,revision:args.p_revision+1,status:args.p_status,features:args.p_features}};
   }
   if(name==='platform_admin_save_support'){const t={...args.p_fields,id:args.p_id,school_id:args.p_school,revision:args.p_revision+1};tickets=tickets.filter(x=>x.id!==t.id);tickets.push(t);return {data:t};}
   return {error:{message:'Unexpected RPC'}};
  }})};
 },{A,B});
 await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:'window.supabase=window.platformMock'}));
 await context.route('https://platform.example.test/**',r=>{const name=new URL(r.request().url()).pathname.slice(1);if(name==='supabase-config.js')return r.fulfill({contentType:'text/javascript',body:'window.SCHOOLSHIELD_SUPABASE_CONFIG={url:"https://api.example.test",publishableKey:"fixture"}'});const file=path.join('SchoolShield',name);return r.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://platform.example.test/super-admin-operations.html?school='+A);await page.waitForSelector('#platformContent:not([hidden])');
 assert.equal(await page.textContent('#selectedSchoolCode'),'QA-MMU');assert.match(await page.textContent('#diagnosticRows'),/QA-safe-reference/);
 await page.selectOption('#accessForm [name=status]','suspended');await page.fill('#accessForm [name=reason]','QA suspension confirmation');await page.check('#accessForm [name=confirm]');await page.evaluate(()=>window.pause=true);
 await page.click('#accessForm [type=submit]');assert.equal(await page.locator('#accessForm [type=submit]').isDisabled(),true);await page.evaluate(()=>document.querySelector('#accessForm').requestSubmit());assert.equal(await page.evaluate(()=>calls.filter(c=>c.name==='platform_admin_set_school_access').length),1);
 await page.evaluate(()=>{window.pause=false;window.release()});await page.waitForFunction(()=>document.querySelector('#platformStatus').textContent.includes('saved and audited'));
 assert.equal(await page.evaluate(B=>controls[B].status,B),'active');
 await page.selectOption('#accessForm [name=status]','active');await page.fill('#accessForm [name=reason]','QA recovery confirmation');await page.check('#accessForm [name=confirm]');await page.evaluate(()=>window.fail=true);await page.click('#accessForm [type=submit]');await page.waitForFunction(()=>document.querySelector('#platformStatus').textContent.includes('could not be confirmed'));assert.equal((await page.textContent('body')).includes('DO-NOT-DISPLAY'),false);assert.equal(await page.inputValue('#accessForm [name=reason]'),'QA recovery confirmation');
 await page.evaluate(()=>window.fail=false);await page.click('#accessForm [type=submit]');await page.waitForFunction(()=>document.querySelector('#platformStatus').textContent.includes('saved and audited'));
 await page.locator('#newTicket').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#supportDialog').evaluate(e=>e.open),true);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.getElementById('supportDialog').contains(document.activeElement)),true);await page.fill('#supportForm [name=title]','<img src=x onerror="window.injected=true">');await page.fill('#supportForm [name=description]','Owner-created QA operational issue');await page.click('#supportForm [type=submit]');await page.waitForSelector('#supportRows tr');assert.equal(await page.locator('#supportRows img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
 await page.selectOption('#auditSchool',B);await page.fill('#auditFilters [name=action]','support_created');await page.click('#auditFilters [type=submit]');await page.waitForFunction(B=>calls.some(c=>c.name==='platform_admin_audit_history'&&c.args.p_school===B&&c.args.p_action==='support_created'),B);
 await page.click('#newTicket');await page.fill('#supportForm [name=title]','Unsaved school A ticket');
 page.once('dialog',d=>d.dismiss());await page.goto('https://platform.example.test/super-admin-operations.html?school='+B).catch(()=>null);assert.match(page.url(),new RegExp(A));assert.equal(await page.inputValue('#supportForm [name=title]'),'Unsaved school A ticket');
 page.once('dialog',d=>d.accept());await page.goto('https://platform.example.test/super-admin-operations.html?school='+B);await page.waitForSelector('#platformContent:not([hidden])');assert.equal(await page.textContent('#selectedSchoolCode'),'QA-NTE');assert.equal(await page.locator('#supportRows tr').count(),0);assert.equal(await page.locator('#supportEmpty').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await context.close();
 }console.log('Platform lifecycle/support/audit desktop and mobile browser checks passed');}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
