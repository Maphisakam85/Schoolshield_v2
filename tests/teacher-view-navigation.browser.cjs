const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {for(const [width,height] of [[360,800],[390,844],[412,915]]) {
  const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const mock=`window.role=()=> 'teacher';window.generic=(a,b,c,body)=>'<h1>'+a+'</h1>'+body;window.schoolshieldSupabase={rpc:async name=>{if(window.holdRefresh)await new Promise(resolve=>window.releaseRefresh=resolve);return {data:name==='get_teacher_targets'?[]:[{id:'CTX',subject:'Science',grade:'Grade 8',class:'8A',metrics:null,targets:[],supportActions:[],review:{id:'R',revision:2,status:'Awaiting Teacher Acknowledgement',review_content:{}}}]};}};window.render=()=>{const own=document.body.dataset.page==='my-performance',module=own?SchoolShieldMyPerformance:SchoolShieldTeacherTargets;document.querySelector('#app').innerHTML=own?module.view():module.viewOwn();own?module.bindOwn():module.bindOwn();};render();`;
  await page.route('http://schoolshield.test/**',route=>{
   const file=new URL(route.request().url()).pathname.slice(1);
   if(file.endsWith('.html')) {const type=file==='my-performance.html'?'my-performance':'teacher-targets';return route.fulfill({contentType:'text/html',body:`<body data-page="${type}"><div id="app"></div>${['app.js','teacher-targets.js','teacher-my-performance.js','teacher-view-navigation.js','button-feedback.js','mock.js'].map(s=>`<script src="/${s}"></script>`).join('')}</body>`});}
   const body=file==='mock.js'?mock:fs.readFileSync('SchoolShield/'+file,'utf8').replace(/startWorkspace\(\);\s*$/,'');return route.fulfill({contentType:'application/javascript',body});
  });
  await page.goto('http://schoolshield.test/teacher-targets.html');await page.waitForSelector('.teacher-view-tabs a[aria-current="page"]');assert.equal(await page.textContent('[aria-current="page"]'),'Targets');
  await page.click('[data-teacher-view="1"]');await page.waitForURL('**/my-performance.html');await page.waitForSelector('[data-teacher-response]');assert.equal(await page.textContent('[aria-current="page"]'),'Performance');
  await page.fill('[data-teacher-response]','Unsaved response');await page.click('[data-teacher-view="0"]');assert.ok(page.url().endsWith('my-performance.html'));assert.match(await page.textContent('[data-teacher-view-feedback]'),/not saved/);await page.fill('[data-teacher-response]','');
  const swipe=async(dx,dy=0)=>page.evaluate(({dx,dy})=>{const target=document.querySelector('h1'),x=dx<0?270:90;const touch=(xx,yy)=>new Touch({identifier:1,target,clientX:xx,clientY:yy});target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(x,250)]}));target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[touch(x+dx,250+dy)]}));},{dx,dy});
  await swipe(0,150);assert.ok(page.url().endsWith('my-performance.html'));
  await swipe(160);await page.waitForURL('**/teacher-targets.html');await page.waitForSelector('[data-my-targets-refresh]');await swipe(-160);await page.waitForURL('**/my-performance.html');await page.waitForSelector('[data-teacher-response]');
  await page.evaluate(()=>window.holdRefresh=true);await page.click('[data-own-performance-refresh]');assert.equal(await page.locator('[data-own-performance-refresh]').isDisabled(),true);assert.equal(await page.getAttribute('[data-own-performance-refresh]','aria-busy'),'true');assert.match(await page.textContent('[data-own-performance-refresh]'),/Loading/);await page.evaluate(()=>{window.holdRefresh=false;window.releaseRefresh();});await page.waitForFunction(()=>!document.querySelector('[data-own-performance-refresh]').disabled);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS toggle/swipe navigation, active state, unsaved-response guard, vertical-scroll preservation and loading feedback at 360, 390 and 412px.');
 } finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
