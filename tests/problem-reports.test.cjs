const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modulePath=process.env.PGLITE_MODULE;
test('problem reports enforce required data, tenant identity, idempotency and private notes',{skip:!modulePath},async()=>{
 const {PGlite}=require(modulePath);const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''qa.uid'',true),'''')::uuid';
 create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,active boolean);
 create function current_school_id() returns uuid language sql stable security definer as 'select school_id from profiles where id=auth.uid()';
 create function assert_account_access() returns void language plpgsql security definer as $$begin if not exists(select 1 from profiles where id=auth.uid() and active) then raise exception 'Access denied';end if;end$$;
 create table platform_admin_audit(actor_id uuid,school_id uuid,target_id uuid,action text,operation_id uuid,reason text);
 create table platform_support_tickets(id uuid primary key,school_id uuid references schools, title text,category text,description text,priority text,status text,origin text constraint platform_support_tickets_origin_check check(origin='Owner-created'),created_by uuid,updated_by uuid,created_at timestamptz default now(), internal_notes text default '');alter table platform_support_tickets enable row level security;
 insert into schools values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
 insert into auth.users values('00000000-0000-0000-0000-000000000011'),('00000000-0000-0000-0000-000000000012');
 insert into profiles values('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',true),('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002',true);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261109100000_school_problem_reports.sql','utf8'));
 await db.exec(`set role authenticated;set qa.uid='00000000-0000-0000-0000-000000000011'`);
 const id='00000000-0000-0000-0000-000000000099',args=[id,'Broken save','Branding','Colours fail to save','Normal'];
 const call=()=>db.query('select report_school_problem($1,$2,$3,$4,$5) as t',args);
 assert.equal((await call()).rows[0].t.id,id);assert.equal((await call()).rows[0].t.id,id);
 for(const index of [1,2,3,4]){const invalid=[...args];invalid[0]='00000000-0000-0000-0000-000000000098';invalid[index]=index===1||index===3?'   ':null;await assert.rejects(db.query('select report_school_problem($1,$2,$3,$4,$5)',invalid),/required/);}
 await assert.rejects(db.query('select * from platform_support_tickets'),/permission denied/);
 await assert.rejects(db.query('select * from support_email_queue'),/permission denied/);
 await db.exec(`set qa.uid='00000000-0000-0000-0000-000000000012'`);await assert.rejects(call(),/already used/);
 await db.exec('reset role');const rows=await db.query('select school_id from platform_support_tickets');assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].school_id,'00000000-0000-0000-0000-000000000001');assert.equal((await db.query('select count(*)::int n from platform_admin_audit')).rows[0].n,1);
 await db.exec(`set role anon`);await assert.rejects(call(),/permission denied/);
 }finally{await db.close();}
});
