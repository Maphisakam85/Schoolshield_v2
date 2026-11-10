const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
test('owner notifications expose safe school-scoped action items and remove recovered failures',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE),db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create function require_platform_administrator() returns void language plpgsql as $$begin if current_setting('qa.owner',true) is distinct from 'yes' then raise exception 'Access denied' using errcode='42501';end if;end$$;
 create table schools(id uuid,name text,code text);create table platform_support_tickets(id uuid,school_id uuid,title text,priority text,status text,updated_at timestamptz default now(),origin text);
 create table user_invitations(id uuid,school_id uuid,user_id uuid,operation_id uuid,status text,created_at timestamptz default now(),error text);
 create table platform_account_operations(id uuid,school_id uuid,status text,created_at timestamptz default now(),last_error text);
 create table platform_school_provisions(id uuid,school_id uuid,status text,updated_at timestamptz default now(),fields jsonb);
 insert into schools values('00000000-0000-4000-8000-000000000001','QA One','QAA-001'),('00000000-0000-4000-8000-000000000002','QA Two','QAB-002');
 insert into platform_support_tickets values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','QA Report','High','Open',now(),'School-reported');
 insert into user_invitations values('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000013','Failed',now(),'PRIVATE TOKEN');
 insert into platform_account_operations values('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000002','Failed',now(),'PRIVATE TOKEN'),('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001','Failed',now(),'PRIVATE TOKEN');
 insert into platform_school_provisions values('00000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000002','Failed',now(),'{"password":"PRIVATE TOKEN"}');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261110110000_platform_notifications.sql','utf8'));
 await db.exec('set role anon');await assert.rejects(db.query('select platform_admin_notifications()'),/permission denied/);await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select platform_admin_notifications()'),/Access denied/);await db.exec("set qa.owner='yes'");
 const get=async offset=>(await db.query('select platform_admin_notifications($1) as result',[offset||0])).rows[0].result;let result=await get();assert.equal(result.total,4);assert.deepEqual(new Set(result.items.map(i=>i.kind)),new Set(['report','invitation','account','provisioning']));assert.doesNotMatch(JSON.stringify(result),/PRIVATE|password|last_error/);for(const i of result.items)assert.equal(i.school_code,i.school_id.endsWith('1')?'QAA-001':'QAB-002');assert.deepEqual(await get(),result);await assert.rejects(db.query('select platform_admin_notifications(-1)'),/Invalid/);
 await db.exec("reset role;update platform_support_tickets set status='In Progress';set role authenticated");assert.equal((await get()).total,4);
 await db.exec("reset role;update platform_support_tickets set status='Resolved';update platform_account_operations set status='Completed';update platform_school_provisions set status='Completed';insert into user_invitations(id,school_id,user_id,status,created_at) select gen_random_uuid(),school_id,user_id,'Sent',now()+interval '1 second' from user_invitations;set role authenticated");assert.equal((await get()).total,0);
 await db.exec("reset role;insert into platform_support_tickets select gen_random_uuid(),'00000000-0000-4000-8000-000000000001','QA Report','High','Open',now(),'School-reported' from generate_series(1,30);set role authenticated");assert.equal((await get()).items.length,25);assert.equal((await get(25)).items.length,5);
 }finally{await db.close();}
});
