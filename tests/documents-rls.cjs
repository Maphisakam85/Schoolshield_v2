/* Uses an isolated PostgreSQL runtime; set PGLITE_MODULE to its module path. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.schools(id uuid primary key);
      create table public.profiles(id uuid primary key,school_id uuid,role text,display_name text);
      create table public.school_workspaces(school_id uuid primary key,payload jsonb,updated_by uuid);
      create table public.parent_learner_links(school_id uuid,parent_id uuid,learner_ref text);
      create table public.sick_notice_attachments(id uuid primary key,school_id uuid,sick_notice_id text,storage_path text,submitted_by uuid);
      create table storage.objects(id uuid primary key,bucket_id text,name text,owner_id text);
      create table storage.buckets(id text primary key,public boolean);
      insert into storage.buckets values ('school-documents',false);
      create function public.current_school_id() returns uuid language sql stable security definer as $$select school_id from public.profiles where id=auth.uid()$$;
      create function public.current_app_role() returns text language sql stable security definer as $$select role from public.profiles where id=auth.uid()$$;
      alter table storage.objects enable row level security;
      create policy "school members read categorised documents" on storage.objects for select using(true);
      create policy "school members upload categorised documents" on storage.objects for insert with check(true);
      create policy "uploaders delete categorised documents" on storage.objects for delete using(true);
      alter table public.sick_notice_attachments enable row level security;
      create policy legacy_read on public.sick_notice_attachments for select using(school_id=public.current_school_id() and (public.current_app_role()<>'parent' or submitted_by=auth.uid()));
      grant usage on schema auth,storage,public to authenticated;
      grant select,insert,delete on storage.objects to authenticated;
      grant select on public.sick_notice_attachments to authenticated;
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20261007130000_document_attachments.sql','utf8'));
    const school='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
    const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
    const users={security:uid(1),principal:uid(2),teacher:uid(3),parent:uid(4),sgb:uid(5),clerk:uid(6),other:uid(7)};
    await db.query('insert into public.schools values ($1),($2)',[school,other]);
    for (const [role,id] of Object.entries(users)) {
      await db.query('insert into auth.users values ($1)',[id]);
      await db.query('insert into public.profiles values ($1,$2,$3,$4)',[id,role==='other'?other:school,role==='other'?'principal':role,role==='teacher'?'Teacher A':role]);
    }
    const payload={ visitors:[{id:'VIS-1'}],incidents:[{id:'INC-1',reporter:'security',learnerId:'L1'},{id:'INC-2',reporter:'Other teacher',learnerId:'L2'}],sickNotices:[{id:'SN-1',learnerId:'L1',submittedById:users.parent}],learners:[{id:'L1',name:'Learner One',class:'8A'},{id:'L2',name:'Learner Two',class:'8B'}],classes:[{id:'8A',teacher:'Teacher A'},{id:'8B',teacher:'Teacher B'}] };
    await db.query('insert into public.school_workspaces values ($1,$2,null)',[school,JSON.stringify(payload)]);
    await db.query('insert into public.parent_learner_links values ($1,$2,$3)',[school,users.parent,'L1']);
    async function login(role) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[role]]); await db.exec('set role authenticated'); }
    async function access(role,entity,record,write=false) { await login(role); return (await db.query('select public.can_access_document_record($1,$2,$3,$4) as allowed',[school,entity,record,write])).rows[0].allowed; }
    assert.equal(await access('security','visitor','VIS-1',true),true);
    assert.equal(await access('clerk','visitor','VIS-1',true),true);
    assert.equal(await access('principal','visitor','VIS-1'),true);
    assert.equal(await access('parent','visitor','VIS-1'),false);
    assert.equal(await access('other','visitor','VIS-1'),false);
    assert.equal(await access('teacher','incident','INC-1'),true);
    assert.equal(await access('teacher','incident','INC-2'),false);
    assert.equal(await access('sgb','incident','INC-1',true),false);
    assert.equal(await access('parent','sick-notice','SN-1',true),true);
    assert.equal(await access('security','sick-notice','SN-1'),false);
    const attachment=uid(100),path=`${school}/visitor-documents/VIS-1/${attachment}.pdf`;
    await login('security');
    await db.query('insert into public.document_attachments(id,school_id,entity_type,record_id,category,storage_path,filename,content_type,size_bytes,submitted_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[attachment,school,'visitor','VIS-1','visitor-documents',path,'inspection.pdf','application/pdf',12,users.security]);
    await assert.rejects(db.query('select public.complete_document_attachment($1)',[attachment]),/Uploaded file is missing/);
    await db.query('insert into storage.objects values ($1,$2,$3,$4)',[uid(101),'school-documents',path,users.security]);
    await login('principal'); assert.equal((await db.query('select * from public.document_attachments')).rows.length,0);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await login('security'); await db.query('select public.complete_document_attachment($1)',[attachment]);
    // New authorised session reads exactly the same durable object path.
    await login('principal'); assert.equal((await db.query('select storage_path from public.document_attachments')).rows[0].storage_path,path);
    assert.equal((await db.query('select name from storage.objects')).rows[0].name,path);
    for (const role of ['parent','other']) {
      await login(role); assert.equal((await db.query('select * from public.document_attachments')).rows.length,0); assert.equal((await db.query('select * from storage.objects')).rows.length,0);
      await assert.rejects(db.query('insert into storage.objects values ($1,$2,$3,$4)',[uid(102),'school-documents',path+'x',users[role]]),/row-level security/);
    }
    await login('parent');
    const notice={id:'SN-persistent',learnerId:'L1',date:'2026-01-01',reason:'Medical certificate',letter:'certificate.pdf'};
    const saved=(await db.query('select public.persist_parent_document_notice($1) as notice',[JSON.stringify(notice)])).rows[0].notice;
    assert.equal(saved.submittedById,users.parent);
    await assert.rejects(db.query('select public.persist_parent_document_notice($1)',[JSON.stringify({...notice,id:'SN-unlinked',learnerId:'L2'})]),/Learner access denied/);
    assert.equal(await access('teacher','sick-notice','SN-persistent'),true);
    await db.exec('reset role'); assert.equal((await db.query("select public from storage.buckets where id='school-documents'")).rows[0].public,false);
    console.log('PASS PostgreSQL migration: private bucket; staged upload/finalization; cross-role/new-session reads; denied role, tenant and unrelated class; parent linked-record persistence.');
  } finally { await db.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
