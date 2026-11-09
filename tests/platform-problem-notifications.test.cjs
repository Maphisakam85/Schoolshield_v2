const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('problem notifications are owner-only, school-specific, paginated and persistent until resolution',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE),db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;
   create function require_platform_administrator() returns void language plpgsql as $$begin if current_setting('qa.owner',true) is distinct from 'yes' then raise exception 'Platform access denied' using errcode='42501';end if;end$$;
   create table schools(id uuid primary key,name text,code text);
   create table platform_support_tickets(id uuid primary key,school_id uuid,title text,priority text,status text,updated_at timestamptz default now(),origin text,description text,internal_notes text);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261109130000_platform_problem_notifications.sql','utf8'));
  await db.exec(`insert into schools values('00000000-0000-4000-8000-000000000001','QA One','QAA-001'),('00000000-0000-4000-8000-000000000002','QA Two','QAB-002');
   insert into platform_support_tickets(id,school_id,title,priority,status,origin,description,internal_notes)
   select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,case when i%2=0 then '00000000-0000-4000-8000-000000000002'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end,'QA Report '||i,'High','Open','School-reported','PRIVATE DESCRIPTION','PRIVATE NOTE' from generate_series(10,39) i;
   insert into platform_support_tickets values('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001','Owner ticket','Low','Open',now(),'Owner-created','','');`);
  await db.exec('set role anon');await assert.rejects(db.query('select platform_admin_problem_notifications()'),/permission denied/);
  await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select platform_admin_problem_notifications()'),/access denied/);
  await db.exec("set qa.owner='yes'");let result=(await db.query('select platform_admin_problem_notifications() result')).rows[0].result;
  assert.equal(result.total,30);assert.equal(result.items.length,25);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);assert.equal((await db.query('select platform_admin_problem_notifications(25) result')).rows[0].result.items.length,5);
  for(const item of result.items)assert.equal(item.school_code,item.school_id.endsWith('2')?'QAB-002':'QAA-001');
  assert.deepEqual((await db.query('select platform_admin_problem_notifications() result')).rows[0].result,result,'reading does not dismiss');
  await assert.rejects(db.query('select platform_admin_problem_notifications(-1)'),/Invalid/);
  await db.exec("reset role;update platform_support_tickets set status='In Progress' where id='00000000-0000-4000-8000-000000000010';set role authenticated");assert.equal((await db.query('select platform_admin_problem_notifications() result')).rows[0].result.total,30);
  await db.exec("reset role;update platform_support_tickets set status='Resolved' where id='00000000-0000-4000-8000-000000000010';set role authenticated");assert.equal((await db.query('select platform_admin_problem_notifications() result')).rows[0].result.total,29);
  await db.exec("reset role;update platform_support_tickets set status='Open' where id='00000000-0000-4000-8000-000000000010';set role authenticated");assert.equal((await db.query('select platform_admin_problem_notifications() result')).rows[0].result.total,30);
 }finally{await db.close();}
});
