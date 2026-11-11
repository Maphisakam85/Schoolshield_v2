const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const dataDir=fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'schoolshield-consistency-'));let{db,id,school,other,login}=await require('./helpers/platform-db.cjs')({dataDir});let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};const denied=async fn=>{await assert.rejects(fn,/denied|permission|match|another session|another school|already exists|checked conversation/);checks++;};
try{
 await db.exec(fs.readFileSync('supabase/migrations/20261111140000_cross_portal_consistency.sql','utf8'));
 const read=async()=>(await db.query('select read_school_dataset() as d')).rows[0].d.payload;
 const save=async(before,after)=>(await db.query('select save_school_dataset($1,$2) as d',[before,after])).rows[0].d.payload;
 const parentPayload=(await import('../supabase/functions/parent-workspace/projection.mjs')).parentPayload;
 const family=async()=>{const data=(await db.query('select payload from school_workspaces where school_id=$1',[school])).rows[0].payload;return parentPayload(data,new Set(['L1']),id(14));};
 // Security -> management: same persisted record identity, tenant and counters.
 await login(16);let before=await read(),after=structuredClone(before);after.visitors.push({id:'V-CROSS',name:'Fictional visitor',status:'On site'});after.incidents.push({id:'I-CROSS',title:'Fictional incident',status:'Open',priority:'High'});await save(before,after);
 for(const n of [10,11,15]){await login(n);const data=await read();equal(data.visitors.filter(v=>v.id==='V-CROSS').length,1);equal(data.incidents.filter(v=>v.id==='I-CROSS'&&v.status==='Open').length,1);}
 await login(15);before=await read();after=structuredClone(before);after.incidents[0].status='Resolved';await denied(save(before,after));
 await login(30);equal((await read()).visitors.some(v=>v.id==='V-CROSS'),false);
 // Clerk -> teacher and parent compatibility projection; stable identity retained.
 await login(12);before=await read();after=structuredClone(before);after.learners[0].name='Updated fictional learner';const changed=await save(before,after);const entity=changed.learners[0].entityId;
 await login(13);equal((await read()).learners[0].name,'Updated fictional learner');
 await db.exec('reset role');equal((await family()).learners[0].entityId,entity);equal((await family()).learners[0].name,'Updated fictional learner');
 // Same baseline cannot overwrite a concurrent edit; unrelated mutations merge.
 await login(10);before=await read();after=structuredClone(before);after.visitors.find(v=>v.id==='V-CROSS').name='Confirmed edit';await save(before,after);const stale=structuredClone(before);stale.visitors.find(v=>v.id==='V-CROSS').name='Stale overwrite';await denied(save(before,stale));const unrelated=structuredClone(before);unrelated.incidents.push({id:'I-OTHER',title:'Second issue',status:'Open'});await save(before,unrelated);equal((await read()).visitors.find(v=>v.id==='V-CROSS').name,'Confirmed edit');
 // Academic evidence is calculated before role projection, and teacher
 // attendance saves never require editing protected learner records.
 await db.exec('reset role');const classId=(await db.query('select id from teacher_review_classes where school_id=$1 and class_ref=$2',[school,'10A'])).rows[0].id;
 await db.query('insert into teacher_review_subjects(id,school_id,name) values($1,$2,$3)',[id(910),school,'Consistency Mathematics']);
 await db.query('insert into teacher_class_subjects(school_id,class_id,subject_id,source) values($1,$2,$3,$4)',[school,classId,id(910),'management']);
 await login(10);const year=(await db.query('select extract(year from current_date)::int as y')).rows[0].y;await db.query('select assign_teacher_subject_class($1,$2,$3,$4,$5)',[id(13),id(910),classId,year,year+'-01-01']);
 before=await read();after=structuredClone(before);after.assessments=[{id:'A-CROSS',class:'10A',subject:'Consistency Mathematics',academic_year:year,term:'Term 2',scores:{L1:40},status:'draft'}];await save(before,after);
 await login(13);before=await read();equal(before.learners[0].average,40);after=structuredClone(before);after.assessments.find(a=>a.id==='A-CROSS').scores.L1=80;await save(before,after);
 for(const n of [10,11,12,13]){await login(n);equal((await read()).learners[0].average,80);}
 await db.exec('reset role');equal((await family()).learners[0].average,80);
 await login(13);before=await read();after=structuredClone(before);const registerDate=(await db.query('select current_date::text as d')).rows[0].d;after.attendanceRegisters=[{id:'R-CROSS',class:'10A',date:registerDate,entries:{L1:'Absent'}}];await save(before,after);equal((await read()).learners[0].attendance,0);
 await login(13);before=await read();after=structuredClone(before);after.attendanceRegisters.push({...after.attendanceRegisters[0],id:'R-DUPLICATE'});await denied(save(before,after));
 before=await read();after=structuredClone(before);after.parentChat.push({id:'FORGED',learnerId:'L1',messages:[]});await denied(save(before,after));
 // Parent notice -> staff workflows and per-person notification reads, retry once.
 await login(14);const date=(await db.query('select current_date::text as d')).rows[0].d;
 const notice={id:'SN-CROSS',learnerId:'L1',date,reason:'Fictional local test only'};
 await db.query('select persist_parent_document_notice($1)',[notice]);await db.query('select persist_parent_document_notice($1)',[notice]);
 for(const n of [10,11,12,13]){await login(n);const data=await read();equal(data.sickNotices.filter(v=>v.id==='SN-CROSS').length,1);const alerts=data.notifications.filter(v=>v.sickNoticeId==='SN-CROSS');equal(alerts.filter(v=>v.recipientId===id(n)).length,1);const alert=alerts.find(v=>v.recipientId===id(n));await db.query('select mark_notifications_read($1)',[[alert.id]]);await db.query('select mark_notifications_read($1)',[[alert.id]]);equal((await db.query('select get_notification_reads() as r')).rows[0].r.filter(r=>r.notification_id===alert.id).length,1);equal(data.attendanceRegisters.find(r=>r.date===date).entries.L1,'Sick');}
 await login(30);await denied(db.query('select send_parent_chat_message($1,$2,$3)',[id(901),'MISSING','Forbidden']));
 // Separate parent/teacher transactions append, retry is idempotent and never
 // replaces visitor/incident edits. Permission revocation takes effect per call.
 await login(14);await db.query('select send_parent_chat_message($1,$2,$3)',[id(902),'L1','Parent message']);await db.query('select send_parent_chat_message($1,$2,$3)',[id(902),'L1','Parent message']);
 await login(13);await db.query('select send_parent_chat_message($1,$2,$3)',[id(903),'L1','Teacher reply']);await denied(db.query('select send_parent_chat_message($1,$2,$3)',[id(902),'L1','Forged retry']));
 await db.exec('reset role');const persisted=(await db.query('select payload from school_workspaces where school_id=$1',[school])).rows[0].payload;equal(persisted.parentChat[0].messages.length,2);equal(persisted.visitors.find(v=>v.id==='V-CROSS').name,'Confirmed edit');
 equal((await family()).parentChat[0].messages.length,2);
 await db.query('delete from parent_learner_links where school_id=$1 and parent_id=$2',[school,id(14)]);await login(14);await denied(db.query('select send_parent_chat_message($1,$2,$3)',[id(904),'L1','Revoked']));
 await login(15);await denied(db.query('select send_parent_chat_message($1,$2,$3)',[id(905),'L1','Read only']));
 await db.exec('reset role');const version=(await db.query('select version from school_dataset_versions where school_id=$1',[school])).rows[0].version;assert.ok(Number(version)>0);checks++;
 // Close and reopen the actual PostgreSQL data directory: records and policies
 // survive a new server/client session, not merely a browser cache read.
 await db.close();const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');db=new PGlite(dataDir);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(10)]);await db.exec('set role authenticated');const reloaded=await read();equal(reloaded.learners[0].average,80);equal(reloaded.visitors.find(v=>v.id==='V-CROSS').name,'Confirmed edit');equal(reloaded.parentChat.length,0);await denied(db.query('select payload from school_workspaces'));await denied(db.query('select * from school_workspaces')); 
 console.log(checks+' isolated database cross-role persistence, routing, retry, conflict and isolation assertions passed');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exit(1)});
