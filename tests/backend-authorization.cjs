/* Runs actual schema/RLS migrations in isolated PostgreSQL (no live data).
   PGLITE_MODULE points to a temporary installation of @electric-sql/pglite. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();let checks=0;
 const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
 const denied=async(promise,pattern=/permission denied|access denied|row-level security/)=>{await assert.rejects(promise,pattern);checks++;};
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
    create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  const old=['20260920_schoolshield.sql','20260921_account_approval.sql','20260922_profile_self_read.sql',
    '20260923_storage_categories_and_signup_schools.sql','20260924_account_request_alerts.sql','20260925_profile_onboarding.sql',
    '20261007_invitation_delivery.sql','20261007120000_announcement_publishing.sql','20261007130000_document_attachments.sql','20261007140000_security_shifts.sql'];
  for(const file of old) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8').replace('create extension if not exists pgcrypto;',''));
  // Model Supabase default table privileges so RLS (not absent grants) is tested.
  await db.exec('grant select,insert,update,delete on all tables in schema public to authenticated; alter table auth.users disable trigger auth_user_profile_created;');
  const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,school=uid(1),otherSchool=uid(2);
  await db.query('insert into schools(id,code,name) values($1,$2,$3),($4,$5,$6)',[school,'AUTH-ONE','School One',otherSchool,'AUTH-TWO','School Two']);
  const people={principal:[3,'principal','Principal'],deputy:[4,'deputy','Deputy'],clerk:[5,'clerk','Clerk'],teacher:[6,'teacher','Teacher A'],security:[7,'security','Security A'],sgb:[8,'sgb','SGB'],parent:[9,'parent','Parent A'],other:[10,'principal','Other Principal'],teacherB:[11,'teacher','Teacher B'],unlinked:[12,'parent','Unlinked'],unassigned:[13,'teacher','Unassigned']};
  for(const [key,[n,role,name]] of Object.entries(people)) {
    await db.query('insert into auth.users(id,email) values($1,$2)',[uid(n),key+'@auth.test']);
    await db.query('insert into profiles(id,school_id,role,display_name,phone,address) values($1,$2,$3,$4,$5,$6)',[uid(n),key==='other'?otherSchool:school,role,name,'private phone','private address']);
  }
  const learners=[{id:'L1',name:'Child One',class:'8A',grade:'Grade 8'},{id:'L2',name:'Classmate',class:'8A',grade:'Grade 8'},{id:'L3',name:'Unrelated Child',class:'8B',grade:'Grade 8'}];
  const payload={__v:13,classes:[{id:'8A',teacher:'Teacher A'},{id:'8B',teacher:'Teacher B'}],learners,
    assessments:[{id:'A1',class:'8A',scores:{L1:80,L2:60}},{id:'A2',class:'8B',scores:{L3:70}}],
    reports:[{id:'R1',class:'8A',releasedLearners:{L1:'released',L2:'released'},privateRoster:['L2']},{id:'R2',class:'8B'}],
    attendanceRegisters:[{class:'8A',entries:{L1:'Present',L2:'Sick'},pendingSickNoticeIds:['N2']}],
    incidents:[{id:'I1',learnerId:'L1',reporterId:uid(7),scope:'related'},{id:'I3',learnerId:'L3',scope:'related'},{id:'SHARED',scope:'teachers'}],
    visitors:[{id:'V1',name:'Visitor'}],security:[{id:'SEC1',name:'Security A'}],securityAttendance:[],
    sickNotices:[{id:'N1',learnerId:'L1',submittedById:uid(9),person:'Child One'},{id:'N3',learnerId:'L3',submittedById:uid(9),person:'Unrelated Child'}],
    staff:[{id:'STAFF1',medical:'private staff field'}],appointments:[{id:'APT1'}],
    parentChat:[{learnerId:'L3',secret:'excluded feature'}],notifications:[{secret:'excluded feature'}]};
  await db.query('insert into school_workspaces(school_id,payload) values($1,$2),($3,$4)',[school,JSON.stringify(payload),otherSchool,JSON.stringify({...payload,learners:[{id:'L1',name:'Other-school Child',class:'8A'}]})]);
  await db.query('insert into parent_learner_links(school_id,parent_id,learner_ref) values($1,$2,$3)',[school,uid(9),'L1']);
  const notice1=uid(30),notice3=uid(31);
  await db.query('insert into sick_notices(id,school_id,learner_ref,notice_date,reason,submitted_by) values($1,$2,$3,$4,$5,$6),($7,$2,$8,$4,$5,$6)',[notice1,school,'L1','2026-10-07','Medical',uid(9),notice3,'L3']);
  const attachments=[['visitor','V1','visitor-documents'],['incident','I1','incident-evidence'],['incident','I3','incident-evidence'],['sick-notice','N1','sick-notices'],['sick-notice','N3','sick-notices']];
  for(const [index,[entity,record,category]] of attachments.entries()) {
    const id=uid(40+index),path=`${school}/${category}/${record}/${id}.pdf`;
    await db.query('insert into document_attachments(id,school_id,entity_type,record_id,category,storage_path,filename,content_type,size_bytes,submitted_by,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,school,entity,record,category,path,'private.pdf','application/pdf',100,uid(7),'ready']);
    await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['school-documents',path,uid(7)]);
  }
  const legacyPath=`${school}/sick-notices/${notice3}/legacy.pdf`;
  await db.query('insert into sick_notice_attachments(school_id,sick_notice_id,storage_path,submitted_by) values($1,$2,$3,$4)',[school,notice3,legacyPath,uid(9)]);
  await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['school-documents',legacyPath,uid(9)]);
  await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['school-documents',`${school}/orphan.pdf`,uid(7)]);
  for(const migration of ['20261007150000_backend_role_isolation.sql','20261007151000_record_storage_authorization.sql','20261007152000_rpc_authorization_guards.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  const login=async key=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[key?uid(people[key][0]):'']);await db.exec(key?'set role authenticated':'set role anon');};
  const workspace=async()=>(await db.query('select get_authorised_workspace() as payload')).rows[0].payload;
  const save=(collection,records)=>db.query('select save_authorised_collection($1,$2)',[collection,JSON.stringify(records)]);
  for(const role of ['principal','deputy','clerk','teacher','security','sgb','parent']) {
    await login(role);const scoped=await workspace();
    check((await db.query('select * from school_workspaces')).rows.length,['principal','deputy'].includes(role)?1:0);
    await denied(db.query("update school_workspaces set payload='{}' where school_id=$1",[school]));
    await denied(db.query('update profiles set role=$1 where id=$2',['principal',uid(people[role][0])]));
    check((await db.query('select * from schools where id=$1',[otherSchool])).rows.length,0);
    check(await db.query('select can_access_school_learner($1,$2) as allowed',[otherSchool,'L1']).then(r=>r.rows[0].allowed),false);
    if(['principal','deputy','clerk'].includes(role)) check(scoped.learners.length,3);
    if(role==='teacher') {check(scoped.learners.map(l=>l.id),['L1','L2']);check(scoped.assessments.map(a=>a.id),['A1']);check(scoped.incidents.map(i=>i.id),['I1','SHARED']);check(scoped.sickNotices.map(n=>n.id),['N1']);check(scoped.staff,undefined);check(scoped.visitors,undefined);}
    if(role==='security') {check(scoped.learners,undefined);check(scoped.assessments,undefined);check(scoped.staff,undefined);check(scoped.visitors.length,1);}
    if(role==='sgb') {check(scoped.learners,undefined);check(scoped.sickNotices,undefined);await denied(save('incidents',[]));await denied(save('visitors',[]));}
    if(role==='parent') {check(scoped.learners.map(l=>l.id),['L1']);check(scoped.assessments[0].scores,{L1:80});check(scoped.reports[0].releasedLearners,{L1:'released'});check(scoped.reports[0].privateRoster,undefined);check(scoped.attendanceRegisters[0].entries,{L1:'Present'});check(scoped.attendanceRegisters[0].pendingSickNoticeIds,undefined);check(scoped.sickNotices.map(n=>n.id),['N1']);await denied(save('learners',[]));}
    if(!['principal','deputy','clerk'].includes(role)) check((await db.query('select * from profiles')).rows.length,1);
    const expectedFiles={principal:6,deputy:6,clerk:4,teacher:2,security:3,sgb:3,parent:1};
    check((await db.query('select * from storage.objects')).rows.length,expectedFiles[role]);
    check((await db.query('select * from document_attachments')).rows.length,{principal:5,deputy:5,clerk:3,teacher:2,security:3,sgb:3,parent:1}[role]);
  }
  await login('other');check((await db.query('select * from storage.objects')).rows.length,0);check((await db.query('select * from document_attachments')).rows.length,0);check((await workspace()).learners[0].name,'Other-school Child');
  await denied(db.query('select set_teacher_class_access($1,$2,true)',[uid(6),'8A']),/not in your school/);
  await login('unlinked');check((await workspace()).learners,[]);check((await db.query('select * from storage.objects')).rows,[]);
  await denied(db.query('insert into parent_learner_links(school_id,parent_id,learner_ref) values($1,$2,$3)',[school,uid(12),'L3']));
  await login('parent');await denied(db.query('select persist_parent_document_notice($1)',[JSON.stringify({id:'N3',learnerId:'L1'})]),/Notice access denied/);
  await denied(db.query('select persist_parent_document_notice_internal($1)',[JSON.stringify({id:'N3',learnerId:'L1'})]));
  const validNotice=JSON.stringify({id:'SN-AUTH',learnerId:'L1',date:'2020-01-01',reason:'Linked learner medical note'});
  check((await db.query('select persist_parent_document_notice($1) as item',[validNotice])).rows[0].item.submittedById,uid(9));
  await login('unassigned');check((await workspace()).learners,[]);await denied(save('assessments',[{id:'BAD',class:'8A',scores:{L1:100}}]),/Class write access denied/);
  await login('teacher');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'principal',user_metadata:{role:'principal',school_id:otherSchool}})]);
  check((await db.query('select current_app_role() as role')).rows[0].role,'teacher');await denied(save('staff',[]));await denied(save('classes',[]));await denied(save('assessments',[{id:'BAD',class:'8B',scores:{L3:99}}]),/Class write access denied/);
  await denied(save('assessments',[{id:'A2',class:'8A',scores:{L1:99}}]),/Record write access denied/);
  await denied(save('assessments',[{id:'A1',class:'8A',scores:{L3:99}}]),/Learner write access denied/);
  await save('assessments',[{id:'A1',class:'8A',scores:{L1:81,L2:60}}]);
  check((await db.query('select publish_school_announcement($1,$2,$3,$4,$5,$6) as item',['ANN-AUTH','Title','Body','my-classes-parents','Class parents','In-app notification'])).rows[0].item.classIds,['8A']);
  for(const role of ['principal','deputy','clerk']) {await login(role);await save('staff',payload.staff);}
  await login('clerk');await denied(save('incidents',[]));
  await login('principal');check((await workspace()).assessments.find(a=>a.id==='A2').scores,{L3:70});
  await login('teacher');check((await db.query('select learner_ref from parent_learner_links')).rows,[{learner_ref:'L1'}]);check((await db.query('select id from sick_notices')).rows,[{id:notice1}]);
  await denied(db.query('update sick_notices set learner_ref=$1 where id=$2',['L3',notice1]));
  check((await db.query("update sick_notices set status='reviewed',reviewed_by=$1,reviewed_at=now() where id=$2 returning id",[uid(6),notice3])).rows.length,0);
  await db.query("update sick_notices set status='reviewed',reviewed_by=$1,reviewed_at=now() where id=$2",[uid(6),notice1]);
  await denied(db.query('select set_teacher_class_access($1,$2,true)',[uid(6),'8B']));
  await login('principal');await db.query('select set_teacher_class_access($1,$2,false)',[uid(6),'8A']);
  await login('teacher');check((await workspace()).learners,[]);check((await db.query('select * from storage.objects')).rows.length,0);
  await denied(db.query('select publish_school_announcement($1,$2,$3,$4,$5,$6)', ['ANN-NOCLASS','Title','Body','my-classes-parents','Class parents','In-app notification']),/Publishing class access denied/);
  await denied(db.query('select publish_school_announcement_internal($1,$2,$3,$4,$5,$6)', ['ANN-NOCLASS','Title','Body','my-classes-parents','Class parents','In-app notification']));
  await login('security');await denied(save('assessments',[]));await denied(save('securityAttendance',[]));
  await save('visitors',payload.visitors);
  await denied(db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['school-documents',`${school}/rogue.pdf`,uid(7)]));
  await denied(db.query('insert into document_attachments(id,school_id,entity_type,record_id,category,storage_path,filename,content_type,size_bytes,submitted_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[uid(80),school,'sick-notice','N1','sick-notices',`${school}/sick-notices/N1/${uid(80)}.pdf`,'fake.pdf','application/pdf',10,uid(7)]));
  const uploadId=uid(81),uploadPath=`${school}/visitor-documents/V1/${uploadId}.jpg`;
  await db.query('insert into document_attachments(id,school_id,entity_type,record_id,category,storage_path,filename,content_type,size_bytes,submitted_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[uploadId,school,'visitor','V1','visitor-documents',uploadPath,'photo.jpg','image/jpeg',10,uid(7)]);
  await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['school-documents',uploadPath,uid(7)]);
  check((await db.query('select * from storage.objects where name=$1',[uploadPath])).rows.length,0);
  await db.query('select complete_document_attachment($1)',[uploadId]);
  await login('principal');check((await db.query('select * from storage.objects where name=$1',[uploadPath])).rows.length,1);
  await login('teacher');check((await db.query('select * from storage.objects where name=$1',[uploadPath])).rows.length,0);
  await db.exec('reset role');await db.query('delete from parent_learner_links where parent_id=$1',[uid(9)]);
  await login('parent');check((await workspace()).learners,[]);check((await db.query('select * from storage.objects')).rows.length,0);
  await denied(db.query('select persist_parent_document_notice($1)',[validNotice]),/Notice access denied/);
  await login('sgb');await denied(db.query('select record_security_shift($1,$2)', ['SEC1','check-out']));
  await denied(db.query('select publish_school_announcement($1,$2,$3,$4,$5,$6)',['ANN-SGB','Title','Body','whole-school','School','In-app notification']),/Publishing access denied/);
  await login(null);await denied(db.query('select get_authorised_workspace()'));check((await db.query("select has_function_privilege('anon','public.save_authorised_collection(text,jsonb)','EXECUTE') as permitted")).rows[0].permitted,false);
  await db.exec('reset role');check((await db.query("select public from storage.buckets where id='school-documents'")).rows[0].public,false);
  console.log(`PASS ${checks} authorization assertions using actual migrations: all seven roles, tenant isolation, linked family/assigned class projections, spoofed role denial, scoped writes, immutable assignments, medical records and private Storage.`);
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
