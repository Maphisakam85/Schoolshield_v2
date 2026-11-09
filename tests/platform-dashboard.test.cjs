const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('dashboard is owner-only and summarises administrative counts without private payloads',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE),db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create function require_platform_administrator() returns void language plpgsql as $$begin if current_setting('qa.owner',true) is distinct from 'yes' then raise exception 'Access denied' using errcode='42501';end if;end$$;
 create table schools(id uuid,name text,code text,data_mode text,lifecycle_status text);create table profiles(account_status text,requires_setup boolean,onboarding_completed_at timestamptz);
 create table platform_support_tickets(id uuid,school_id uuid,title text,priority text,status text,origin text,updated_at timestamptz default now(),description text,internal_notes text);
 create table user_invitations(status text,created_at timestamptz default now());create table platform_school_provisions(status text);create table platform_account_operations(status text,created_at timestamptz default now());
 create table support_email_queue(status text);create table web_push_subscriptions(id int);create table web_push_outbox(status text,created_at timestamptz default now());create table platform_admin_audit(created_at timestamptz default now());
 insert into schools values('00000000-0000-4000-8000-000000000001','QA One','QAA-001','qa','active'),('00000000-0000-4000-8000-000000000002','QA Two','QAB-002','live','suspended');
 insert into profiles values('Active',true,null),('Inactive',false,null),('Active',false,now());insert into user_invitations values('Failed',now()),('Failed',now()-interval '60 days');insert into platform_school_provisions values('Failed'),('Completed');insert into platform_account_operations values('Failed',now());insert into support_email_queue values('Pending');insert into web_push_subscriptions values(1);insert into web_push_outbox values('failed',now());insert into platform_admin_audit default values;
 insert into platform_support_tickets values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','QA Problem','Urgent','Open','School-reported',now(),'PRIVATE DESCRIPTION','PRIVATE NOTES');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261109140000_platform_dashboard_summary.sql','utf8'));
 await db.exec('set role anon');await assert.rejects(db.query('select platform_admin_dashboard()'),/permission denied/);await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select platform_admin_dashboard()'),/Access denied/);await db.exec("set qa.owner='yes'");
 const result=(await db.query('select platform_admin_dashboard() result')).rows[0].result;
 for(const [key,value] of Object.entries({schools_total:2,schools_active:1,schools_suspended:1,schools_live:1,schools_test:1,accounts_total:3,accounts_active:2,setup_pending:1,reports_open:1,reports_urgent:1,invitations_failed:1,provisioning_incomplete:1,account_operations_failed:1,email_pending:1,push_devices:1,push_failed:1,audit_today:1}))assert.equal(result.metrics[key],value,key);
 assert.equal(result.reports[0].school_code,'QAA-001');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 }finally{await db.close();}
});
