const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://schoolshield.test/**',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));await page.goto('http://schoolshield.test/teacher-performance.html');
  await page.setContent('<body data-page="teacher-performance"><div id="app"></div><button id="globalBell"></button><aside id="notificationCenter" style="display:none"></aside></body>');
  await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
  for(const file of ['button-feedback.js','teacher-targets.js','teacher-assignments.js','teacher-performance.js']) await page.addScriptTag({content:fs.readFileSync('SchoolShield/'+file,'utf8')});
  await page.evaluate(()=>{
   window.currentRole='principal';window.role=()=>window.currentRole;window.generic=(a,b,c,body)=>`<h1>${a}</h1>${body}`;
   window.assignmentRows=[];window.notices=[];window.rpcCalls=[];
   window.catalogue={teachers:[{id:'T1',name:'Teacher One',employeeId:'EMP1',department:'Science'},{id:'T2',name:'Teacher Two',employeeId:'EMP2',department:'Languages'}],subjects:[{id:'M',name:'Mathematics'},{id:'N',name:'Natural Sciences'},{id:'E',name:'English'}],classes:[{id:'C1',class_ref:'8A',grade:'Grade 8'},{id:'C2',class_ref:'8B',grade:'Grade 8'},{id:'C3',class_ref:'9B',grade:'Grade 9'},{id:'C4',class_ref:'10A',grade:'Grade 10'}],classSubjects:[{class_id:'C1',subject_id:'M'},{class_id:'C2',subject_id:'M'},{class_id:'C3',subject_id:'N'},{class_id:'C4',subject_id:'E'}],termPeriods:[{term:2,start_date:'2026-04-08',end_date:'2026-06-26'}],reviews:[]};
   window.render=()=>{const own=currentRole==='teacher',module=own?SchoolShieldMyPerformance:SchoolShieldTeacherPerformance;document.querySelector('#app').innerHTML=module.view();own?module.bindOwn():module.bind();};
   window.schoolshieldSupabase={rpc:async(name,args)=>{
    window.rpcCalls.push({name,args});
    if(name==='sync_teacher_review_catalogue') return {data:null};
    if(name==='get_notification_reads') return {data:Object.entries(window.testNotificationReads||{}).map(([notification_id,read_at])=>({notification_id,read_at}))};
    if(name==='mark_notifications_read') {window.testNotificationReads||={};for(const id of args.p_ids)window.testNotificationReads[id]=new Date().toISOString();return {data:{ids:args.p_ids,read_at:new Date().toISOString()}};}
    if(name==='get_teacher_performance_directory') return {data:{...structuredClone(window.catalogue),contexts:structuredClone(window.assignmentRows)}};
    if(name==='assign_teacher_subject_class') {
     window.lastAssignment=args;if(window.assignmentRows.some(a=>a.teacher_id===args.p_teacher&&a.subject_id===args.p_subject&&a.class_id===args.p_class&&a.academic_year===args.p_year)) return {error:{message:'This exact teaching assignment already exists'}};
     await new Promise(resolve=>window.releaseAssignment=resolve);
     const c=window.catalogue.classes.find(c=>c.id===args.p_class),s=window.catalogue.subjects.find(s=>s.id===args.p_subject),id='A'+(window.assignmentRows.length+1);
     const assignment={id,teacher_id:args.p_teacher,subject_id:args.p_subject,class_id:args.p_class,academic_year:args.p_year,start_date:args.p_start,end_date:args.p_end,notes:args.p_notes,assignment_grade:c.grade,grade:c.grade,class:c.class_ref,subject:s.name,status:'Active',revision:1,eligibleTerms:[2]};window.assignmentRows.push(assignment);
     window.notices.push({id:'N'+id,assignment_id:id,recipient_id:args.p_teacher,school_id:'SCHOOL',read_at:null,created_at:'2026-10-13T12:00:00Z',payload:{title:'New Teaching Assignment',description:`You have been assigned to teach ${s.name} — ${c.grade} / Class ${c.class_ref} for the ${args.p_year} academic year.`,subject:s.name,grade:c.grade,class:c.class_ref,academicYear:args.p_year,assignedBy:currentRole,assignedById:currentRole,assignmentDate:'2026-10-13T12:00:00Z'}});
     return {data:id};
    }
    if(name==='get_teacher_assignments') return {data:structuredClone(window.assignmentRows.filter(a=>a.teacher_id==='T1'&&a.academic_year===args.p_year))};
    if(name==='get_my_teacher_performance') return {data:window.assignmentRows.filter(a=>a.teacher_id==='T1'&&a.academic_year===args.p_year&&a.eligibleTerms.includes(args.p_term)).map(a=>({id:a.id,subject:a.subject,grade:a.grade,class:a.class,review:null,metrics:null,targets:[],supportActions:[]}))};
    if(name==='end_teacher_assignment') {const a=window.assignmentRows.find(a=>a.id===args.p_assignment);a.end_date=args.p_end;a.revision++;a.status='Ended';a.eligibleTerms=[1,2];return {data:structuredClone(a)};}
    if(name==='set_teacher_review_term_dates') return {data:null};
    throw Error('Unexpected RPC '+name);
   },from:()=>{
    const filters=[];let update=null;
    const execute=()=>{let data=window.notices.filter(row=>filters.every(([k,v])=>k==='notification_type'||(Array.isArray(v)?v.includes(row[k]):row[k]===v)));if(update) data.forEach(row=>Object.assign(row,update));return {data:structuredClone(data),error:null};};
    const builder={select:()=>builder,eq:(k,v)=>{filters.push([k,v]);return builder;},in:(k,v)=>{filters.push([k,v]);return builder;},order:()=>builder,limit:()=>builder,update:value=>{update=value;return builder;},single:async()=>{const result=execute();return {...result,data:result.data[0]};},then:(resolve,reject)=>Promise.resolve(execute()).then(resolve,reject)};return builder;
   }};render();
  });
  await page.waitForSelector('[data-performance-open="T1"]');await page.click('[data-performance-open="T1"]');await page.waitForSelector('[data-assignment-new]');assert.match(await page.textContent('#app'),/No teaching assignments found for this teacher/);
  async function fill(grade,classId,subject) {
   await page.click('[data-assignment-new]');await page.selectOption('[name="grade"]',grade);await page.selectOption('[name="class"]',classId);await page.selectOption('[name="subject"]',subject);await page.fill('[name="start"]','2026-01-15');await page.fill('[name="notes"]','Approved teaching allocation');
  }
  async function save() {await page.click('[data-assignment-form] button[type="submit"]');assert.match(await page.textContent('[data-assignment-feedback]'),/Saving/);assert.equal(await page.locator('[data-assignment-form] button[type="submit"]').isDisabled(),true);await page.evaluate(()=>window.releaseAssignment());await page.waitForFunction(()=>document.querySelector('[data-assignment-feedback]').textContent.includes('teacher has been notified'));await page.evaluate(()=>document.querySelector('.modal-backdrop').remove());}
  await fill('Grade 8','C1','M');assert.equal(await page.locator('[name="class"] option[value="C3"]').count(),0);assert.equal(await page.locator('[name="subject"] option[value="N"]').count(),0);await save();assert.equal((await page.evaluate(()=>window.lastAssignment)).p_teacher,'T1');assert.match(await page.textContent('#app'),/Mathematics/);
  await fill('Grade 8','C1','M');await page.click('[data-assignment-form] button[type="submit"]');await page.waitForFunction(()=>document.querySelector('[data-assignment-feedback]').textContent.includes('already exists'));assert.equal(await page.inputValue('[name="notes"]'),'Approved teaching allocation');assert.equal(await page.locator('[data-assignment-form] button[type="submit"]').isDisabled(),false);await page.evaluate(()=>document.querySelector('.modal-backdrop').remove());
  await fill('Grade 8','C2','M');await save();assert.match(await page.textContent('#app'),/8A/);assert.match(await page.textContent('#app'),/8B/);
  await page.evaluate(async()=>{window.currentRole='deputy';await SchoolShieldTeacherPerformance.load(false);});await fill('Grade 9','C3','N');await save();assert.match(await page.textContent('#app'),/Natural Sciences/);assert.match(await page.textContent('#app'),/Grade 9/);
  await page.click('[data-assignment-term-dates]');await page.fill('[data-assignment-term-form] [name="start"]','2026-04-08');await page.fill('[data-assignment-term-form] [name="end"]','2026-06-26');await page.click('[data-assignment-term-form] button');await page.waitForFunction(()=>document.querySelector('[data-assignment-term-form] [role="status"]').textContent==='Term dates saved.');await page.evaluate(()=>document.querySelector('.modal-backdrop').remove());
  await page.click('[data-assignment-end="A3"]');await page.fill('[data-assignment-end-form] [name="end"]','2026-06-26');await page.fill('[data-assignment-end-form] [name="reason"]','Moved to another class in the next term');await page.click('[data-assignment-end-form] button');await page.waitForFunction(()=>document.querySelector('[data-assignment-end-form] [role="status"]').textContent.includes('Historical reviews'));await page.evaluate(()=>document.querySelector('.modal-backdrop').remove());assert.match(await page.textContent('#app'),/Ended/);
  await page.addScriptTag({content:fs.readFileSync('SchoolShield/teacher-my-performance.js','utf8')});
  await page.evaluate(()=>{window.currentRole='teacher';document.body.dataset.page='my-performance';sessionStorage.setItem('schoolshieldSession',JSON.stringify({userId:'T1',schoolId:'SCHOOL',role:'teacher',displayName:'Teacher One'}));render();});
  await page.waitForSelector('#myTeachingAssignments tbody tr');assert.equal(await page.locator('#myTeachingAssignments tbody tr').count(),3);assert.equal(await page.locator('[data-assignment-new],[data-assignment-end]').count(),0);
  await page.evaluate(()=>loadTeachingAssignmentNotifications());assert.equal(await page.evaluate(()=>notificationsForRole().filter(n=>n.assignmentNotificationId).length),3);assert.equal(await page.getAttribute('#globalBell','data-unread'),'3');
  await page.evaluate(()=>toggleNotificationCenter());assert.match(await page.textContent('#notificationCenter'),/New Teaching Assignment/);await page.click('#notificationCenter .notification-center-item:first-child');await page.waitForFunction(()=>document.querySelector('#assignmentNoticeReadState')?.textContent==='Notification marked read.');assert.match(await page.textContent('.modal-body'),/Academic year/);assert.match(await page.textContent('.modal-body'),/Assigned by/);assert.equal(await page.getAttribute('#globalBell','data-unread'),'2');
  await page.evaluate(()=>document.querySelector('.modal-backdrop').remove());await page.evaluate(()=>markVisibleNotificationsRead());assert.equal(await page.getAttribute('#globalBell','data-unread'),'0');
  for(const role of ['parent','sgb','security','clerk']) {const result=await page.evaluate(role=>{window.currentRole=role;return {own:SchoolShieldTeacherAssignments.ownCard(2026),manage:SchoolShieldTeacherAssignments.managementCard({id:'T1'}),notices:notificationsForRole().filter(n=>n.assignmentNotificationId).length};},role);assert.equal(result.own,'');assert.equal(result.manage,'');assert.equal(result.notices,0);}
  assert.deepEqual(errors,[]);console.log('PASS browser: empty state, Principal/Deputy assignment forms, valid grade/class/subject selection, multi-class/grade, duplicate retention, teacher own read-only assignments and existing bell/read notifications.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
