const assert=require('node:assert/strict'),fs=require('node:fs');const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://schoolshield.test/**',route=>route.fulfill({contentType:'text/html',body:'<body data-page="notifications"><div id="app"></div></body>'}));await page.goto('https://schoolshield.test/notifications.html');
 await page.addStyleTag({content:fs.readFileSync('SchoolShield/styles.css','utf8').replace(/@import\s+url\([^)]*\);/g,'')});await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
 await page.evaluate(()=>{
  window.currentUser='P1';window.currentRole='principal';window.role=()=>currentRole;window.ledger={};
  window.signIn=(id,role)=>{currentUser=id;currentRole=role;sessionStorage.setItem('schoolshieldSession',JSON.stringify({userId:id,schoolId:'S1',role,displayName:'Same name'}));};signIn('P1','principal');
  const today=localDateIso();window.state={incidents:[],notifications:[{id:'N1',scope:'whole-school',category:'Visitor',priority:'Low',title:'Gate arrival',description:'Today',createdAt:localDateTime(),read:true},{id:'N2',scope:'whole-school',category:'System',priority:'High',title:'Old system notice',description:'History',createdAt:'2020-01-01T00:00:00Z'},{id:'N3',scope:'whole-school',category:'Emergency',priority:'Critical',title:'Emergency drill',description:'Today',createdAt:localDateTime()}]};
  window.getState=()=>state;window.schoolshieldSupabase={rpc:async(name,args)=>{
   if(name==='get_notification_reads')return{data:Object.entries(ledger[currentUser]||{}).map(([notification_id,read_at])=>({notification_id,read_at}))};
   if(name==='get_account_request_alerts')return{data:[{id:currentUser,request_id:'REQUEST',created_at:localDateTime(),read_at:ledger[currentUser]?.['account-request:'+currentUser]||null}]};
   if(name==='mark_notifications_read'){if(window.failRead)return{error:{message:'Offline read failure'}};if(window.holdRead)await new Promise(r=>window.releaseRead=r);ledger[currentUser]||={};for(const id of args.p_ids)ledger[currentUser][id]=localDateTime();return{data:{ids:args.p_ids,read_at:localDateTime()}};}throw Error(name);
  },from:()=>{const b={select:()=>b,eq:()=>b,order:async()=>({data:[{id:'REQUEST',display_name:'Applicant',email:'applicant@example.org',requested_role:'teacher',invitation_method:'email',created_at:localDateTime()}]})};return b;}};
  window.render=()=>{document.getElementById('app').innerHTML=notifications();bindNotificationFilters(document);updateTeachingAssignmentBadge();document.getElementById('markRead').onclick=async()=>{if(await markVisibleNotificationsRead())render();};};
 });
 await page.evaluate(async()=>{await loadPersonalNotificationReads();render();});
 assert.equal(await page.locator('.notice-stack [data-notification]:visible').count(),4);
 await page.selectOption('[data-notification-filter="type"]','Security');assert.equal(await page.locator('.notice-stack [data-notification]:visible').count(),1);
 await page.selectOption('[data-notification-filter="priority"]','High');assert.equal(await page.locator('.notice-stack [data-notification]:visible').count(),0);assert.equal(await page.locator('[data-notification-filter-empty]').isVisible(),true);
 await page.selectOption('[data-notification-filter="type"]','');await page.selectOption('[data-notification-filter="period"]','today');assert.equal(await page.locator('.notice-stack [data-notification]:visible').count(),0);
 await page.selectOption('[data-notification-filter="priority"]','');assert.equal(await page.locator('.notice-stack [data-notification]:visible').count(),3);
 await page.evaluate(()=>{window.schoolshieldNotificationFilters={type:'',priority:'',period:'',search:''};window.failRead=true;});await page.click('#markRead');await page.waitForSelector('.modal-backdrop');assert.equal(await page.evaluate(()=>notificationIsRead('N1')),false);await page.evaluate(()=>{document.querySelector('.modal-backdrop').remove();window.failRead=false;});await page.click('#markRead');await page.waitForFunction(()=>notificationIsRead('N1'));assert.equal(await page.getAttribute('#globalBell','data-unread'),'0');
 await page.evaluate(async()=>{signIn('C1','clerk');await loadPersonalNotificationReads();render();});assert.equal(await page.evaluate(()=>notificationIsRead('N1')),false);
 await page.evaluate(()=>{document.getElementById('app').innerHTML=accountRequests();});await page.evaluate(()=>loadAccountRequests());assert.equal(await page.evaluate(()=>notificationIsRead('account-request:C1')),true);
 await page.evaluate(async()=>{signIn('P2','principal');await loadPersonalNotificationReads();});assert.equal(await page.evaluate(()=>window.schoolshieldPendingAccountAlerts),1);assert.equal(await page.evaluate(()=>notificationIsRead('account-request:P2')),false);
 assert.deepEqual(errors,[]);console.log('PASS notification browser: functional combined filters/empty states, failed-save retention, confirmed counts, per-user reads and independent Principal/Clerk account-request alerts.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

