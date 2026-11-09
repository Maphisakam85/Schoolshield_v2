const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('canonical parent notices enforce lifecycle and preserve tenant links; raw anonymous ACLs are removed',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE),db=new PGlite();
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table schools(id uuid primary key);
   create table profiles(id uuid primary key,school_id uuid,role text,display_name text,account_status text default 'Active',requires_setup boolean default false,onboarding_completed_at timestamptz);
   create table school_workspaces(school_id uuid primary key,payload jsonb,updated_by uuid);
   create table parent_learner_links(school_id uuid,parent_id uuid,learner_ref text);
   create table platform_admin_audit(action text,reason text);
   grant usage on schema public,auth to anon,authenticated;
   grant select,insert,update,delete on school_workspaces to anon;
   grant update(payload) on school_workspaces to anon;
   grant select(payload) on school_workspaces to public;`);
  const lifecycle=fs.readFileSync('supabase/migrations/20261017100000_school_lifecycle_features.sql','utf8');
  await db.exec(lifecycle.slice(0,lifecycle.indexOf('create or replace function public.current_school_id')));
  await db.exec(lifecycle.slice(lifecycle.indexOf('create or replace function public.assert_account_access'),lifecycle.indexOf('create function public.school_feature_enabled')));
  const canonical=fs.readFileSync('supabase/migrations/20261014120000_install_private_attachments.sql','utf8');
  await db.exec(canonical.slice(canonical.indexOf('create or replace function public.persist_parent_document_notice'),canonical.indexOf('revoke all on function public.persist_parent_document_notice')));
  await db.exec('grant execute on function persist_parent_document_notice(jsonb) to anon,authenticated');
  await db.exec(fs.readFileSync('supabase/migrations/20261109120000_parent_notice_access_hardening.sql','utf8'));
  await db.query('insert into schools(id,lifecycle_status) values($1,\'active\'),($2,\'active\')',[id(1),id(2)]);
  await db.query("insert into profiles(id,school_id,role,display_name) values($1,$2,'parent','QA Parent'),($3,$4,'parent','Other QA Parent'),($5,$2,'teacher','QA Teacher')",[id(11),id(1),id(12),id(2),id(13)]);
  for(const [school,learner] of [[id(1),'L1'],[id(2),'L2']])await db.query('insert into school_workspaces values($1,$2,null)',[school,{learners:[{id:learner,name:'Fictional QA Learner',class:'8A'}],classes:[{id:'8A',teacher:'QA Teacher'}]}]);
  await db.query('insert into parent_learner_links values($1,$2,\'L1\'),($3,$4,\'L2\')',[id(1),id(11),id(2),id(12)]);
  const login=async(role,user='')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);};
  const record={id:'SN-QA-1',learnerId:'L1',reason:'Fictional QA notice',date:'2026-01-01'};
  const call=()=>db.query('select persist_parent_document_notice($1) result',[record]);
  await login('anon');await assert.rejects(call(),/permission denied/);await assert.rejects(db.query('update school_workspaces set payload=\'{}\''),/permission denied/);await assert.rejects(db.query('select payload from school_workspaces'),/permission denied/);
  await login('authenticated',id(11));assert.equal((await call()).rows[0].result.submittedById,id(11));assert.equal((await call()).rows[0].result.id,record.id);
  await assert.rejects(db.query('select persist_parent_document_notice_account_base($1)',[record]),/permission denied/);
  await login('authenticated',id(12));await assert.rejects(call(),/Learner access denied/);
  await login('authenticated',id(13));await assert.rejects(call(),/Parent sign-in required/);
  for(const change of ["update profiles set account_status='Inactive' where id=$1","update profiles set requires_setup=true where id=$1","update schools set lifecycle_status='suspended' where id=$1"]){
   await db.exec('reset role');await db.query("update profiles set account_status='Active',requires_setup=false where id=$1",[id(11)]);await db.query('update schools set lifecycle_status=\'active\' where id=$1',[id(1)]);await db.query(change,[change.includes('update schools')?id(1):id(11)]);
   await login('authenticated',id(11));await assert.rejects(call(),/suspended.*inactive.*incomplete/);
  }
  await db.exec('reset role');await db.query("update schools set lifecycle_status='active' where id=$1",[id(1)]);await login('authenticated',id(11));assert.equal((await call()).rows[0].result.id,record.id);
  await db.exec('reset role');assert.equal((await db.query("select has_table_privilege('anon','school_workspaces','UPDATE') or has_any_column_privilege('anon','school_workspaces','UPDATE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query('select payload->\'sickNotices\' notices from school_workspaces where school_id=$1',[id(2)])).rows[0].notices,null);
 }finally{await db.close();}
});
