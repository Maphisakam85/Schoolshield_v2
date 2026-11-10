const fs=require('fs'),assert=require('node:assert/strict');const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 for(const width of [1366,900,390])for(const viewer of ['principal','deputy','clerk','teacher','parent','sgb','security']){
 const p=await b.newPage({viewport:{width,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('https://rail.example.test/**',r=>r.fulfill({contentType:'text/html',body:'<body data-page="dashboard"><div id="app"></div></body>'}));await p.goto('https://rail.example.test/dashboard.html');await p.addStyleTag({content:fs.readFileSync('SchoolShield/styles.css','utf8').replace(/@import[^;]+;/g,'')});await p.evaluate(viewer=>sessionStorage.setItem('schoolshieldSession',JSON.stringify({role:viewer,schoolName:'Fictional QA school',schoolCode:'QAA-001'})),viewer);
 await p.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});await p.evaluate(viewer=>{role=()=>viewer;userName=()=> 'QA User';isLeadership=()=>['principal','deputy'].includes(viewer);navHasNewUpdates=()=>false;notificationsForRole=()=>[];document.getElementById('app').innerHTML=shell('<p>QA content</p>','Dashboard');initWorkspaceChrome();},viewer);
 if(width<=700){await p.locator('#sidebarToggle').click();assert.equal(await p.locator('.sidebar').evaluate(e=>e.classList.contains('rail')),false);assert.equal(await p.locator('.nav-group-label').first().isVisible(),true);}
 else{
  if(width>980)await p.locator('#sidebarToggle').click();assert.equal(await p.locator('.sidebar').evaluate(e=>e.classList.contains('rail')),true);
  const icons=p.locator('.nav-group-icon');assert.ok(await icons.count()>0);for(let i=0;i<await icons.count();i++){assert.equal(await icons.nth(i).isVisible(),true);assert.equal(await icons.nth(i).locator('svg').count(),1);assert.equal(await icons.nth(i).locator('svg').getAttribute('stroke-width'),'1.8');assert.ok(await icons.nth(i).locator('path').getAttribute('d'));}
  assert.equal(await p.locator('.nav-group-label').first().isVisible(),false);const sidebar=await p.locator('.sidebar').boundingBox();for(const box of await icons.evaluateAll(items=>items.map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))))assert.ok(box.left>=sidebar.x&&box.right<=sidebar.x+sidebar.width+1);
  if(width===1366&&viewer==='principal')await p.screenshot({path:process.env.TEMP+'/schoolshield-restored-sidebar-icons.png',clip:{x:0,y:0,width:100,height:844}});
  await p.locator('.nav-group summary').first().click();assert.equal(await p.locator('.sidebar').evaluate(e=>e.classList.contains('rail')),false);assert.equal(await p.locator('.nav-group-label').first().isVisible(),true);assert.equal(await p.locator('.nav-group[open]').count(),1);assert.equal(await p.locator('#sidebarToggle').getAttribute('aria-expanded'),'true');
  if(width===1366&&viewer==='principal'){
   await p.screenshot({path:process.env.TEMP+'/schoolshield-outline-expanded.png',clip:{x:0,y:0,width:340,height:844}});
   const handle=p.locator('.sidebar-resize');await handle.focus();await handle.press('ArrowRight');assert.equal(Math.round((await p.locator('.sidebar').boundingBox()).width),262);
   const edge=await handle.boundingBox();await p.mouse.move(edge.x+2,edge.y+100);await p.mouse.down();await p.mouse.move(320,100);await p.mouse.up();assert.equal(Math.round((await p.locator('.sidebar').boundingBox()).width),320);assert.equal(await p.locator('.main').evaluate(e=>e.style.marginLeft),'320px');
   await p.locator('#sidebarToggle').click();await p.locator('#sidebarToggle').click();assert.equal(Math.round((await p.locator('.sidebar').boundingBox()).width),320);
  }

 }
 for(const svg of await p.locator('.sidebar .nav-item .icon svg').all()){assert.equal(await svg.getAttribute('stroke'),'currentColor');assert.equal(await svg.getAttribute('fill'),'none');}assert.equal(await p.locator('#globalBell svg').count(),1);assert.equal(await p.locator('#refreshWorkspace svg').count(),1);assert.equal(await p.locator('#sidebarToggle svg').count(),1);assert.deepEqual(errors,[]);await p.close();
 }console.log('PASS all seven roles: visible compact icons, bounded rail, tooltip labels, expand-to-menu, single-open accordion and mobile labels.');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
