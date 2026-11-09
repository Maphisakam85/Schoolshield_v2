const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
test('database enforces new school codes while preserving established legacy codes',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE),db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create table schools(id integer generated always as identity primary key,code text unique,name text);insert into schools(code,name) values('QA-LEGACY','Existing QA school');create table platform_admin_audit(action text,reason text);create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('00000000-0000-0000-0000-000000000080'),('00000000-0000-0000-0000-000000000011');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select '{"session_id":"00000000-0000-0000-0000-000000000090"}'::jsonb$$;
 create function platform_administrator_allowed(uuid) returns boolean language sql stable as $$select $1='00000000-0000-0000-0000-000000000080'::uuid$$;create function crypt(text,text) returns text language sql as $$select 'mock-digest/'||$1$$;create function gen_salt(text) returns text language sql as $$select 'mock-salt'$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261029100000_platform_access_code.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261109110000_access_code_format.sql','utf8'));
 await db.query('update schools set name=$1 where code=$2',['Preserved school','QA-LEGACY']);
 assert.equal((await db.query("select code from schools where name='Preserved school'")).rows[0].code,'QA-LEGACY');
 await db.query('insert into schools(code,name) values($1,$2)',[' abc-001 ','New QA school']);assert.equal((await db.query("select code from schools where name='New QA school'")).rows[0].code,'ABC-001');
 for(const code of [null,'ADMIN','QA-NEW','ABC001','AB-123','ABCD-123','ABC-12','ABC-1234','ABC-12X'])await assert.rejects(db.query('insert into schools(code,name) values($1,$2)',[code,'Invalid QA school']),/School code must/);
 await assert.rejects(db.query("update schools set code='DEF-001' where code='ABC-001'"),/read-only/);
 assert.equal((await db.query('select code_hash from platform_login_secret')).rows[0].code_hash,'mock-digest/ADMIN');
 await db.exec("set role authenticated;set qa.uid='00000000-0000-0000-0000-000000000080'");
 assert.equal((await db.query("select authorize_platform_login('ADMIN') result")).rows[0].result.authorized,true);
 assert.equal((await db.query("select authorize_platform_login('admin') result")).rows[0].result.authorized,false);
 await db.exec("set qa.uid='00000000-0000-0000-0000-000000000011'");
 const denied=(await db.query("select authorize_platform_login('ADMIN') result")).rows[0].result;assert.equal(denied.platform_admin,false);assert.equal(denied.authorized,false);
 await assert.rejects(db.query('select * from platform_login_secret'),/permission denied/);
 for(const code of ['A0A-ABC','ABC-001']){
  await db.exec('reset role');await db.query('update platform_login_secret set code_hash=$1',['mock-digest/'+code]);
  await db.exec("set role authenticated;set qa.uid='00000000-0000-0000-0000-000000000080'");
  assert.equal((await db.query('select authorize_platform_login($1) result',[code])).rows[0].result.authorized,true);
  await db.exec("set qa.uid='00000000-0000-0000-0000-000000000011'");assert.equal((await db.query('select authorize_platform_login($1) result',[code])).rows[0].result.authorized,false);
 }
 }finally{await db.close();}
});
