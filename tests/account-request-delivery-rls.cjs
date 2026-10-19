const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};try{
 await db.exec(`create role anon;create role authenticated;
 create type app_role as enum('principal','deputy','clerk','teacher','parent','security','sgb');
 create table schools(id uuid primary key,code text,lifecycle_status text default 'active');
 create table profiles(id uuid primary key,school_id uuid,email text);
 create table account_requests(id uuid primary key default gen_random_uuid(),school_id uuid references schools(id),email text,display_name text,requested_role app_role,status text default 'pending',approved_role app_role,reviewed_by uuid,reviewed_at timestamptz,created_at timestamptz default now(),unique(school_id,email));
 alter table account_requests enable row level security;
 grant usage on schema public to anon,authenticated;
 create function school_access_enabled(p_school uuid) returns boolean language sql stable security definer as $$select exists(select 1 from schools where id=p_school and lifecycle_status<>'suspended')$$;
 create function request_school_account(p_school_code text,p_email text,p_display_name text,p_requested_role app_role default 'parent') returns uuid language sql as $$select null::uuid$$;
 insert into schools(id,code) values('00000000-0000-4000-8000-000000000001','QA-A'),('00000000-0000-4000-8000-000000000002','QA-B');`);
 const migration=fs.readFileSync('supabase/migrations/20261019100000_restore_account_request_delivery.sql','utf8');await db.exec(migration);await db.exec(migration);
 const call=async(email,method='email',phone=null,role='parent',school='QA-A')=>{await db.exec('set role anon');try{return (await db.query('select request_school_account($1,$2,$3,$4,$5,$6) as id',[school,email,'QA Applicant',role,method,phone])).rows[0].id;}finally{await db.exec('reset role');}};
 const first=await call('email@example.test');equal(typeof first,'string');let row=(await db.query('select * from account_requests where id=$1',[first])).rows[0];equal(row.invitation_method,'email');equal(row.status,'pending');equal(row.phone,null);
 for(const phone of ['0672250563','+27 67 225 0563','27672250563','0027672250563']){const id=await call('sms@example.test','sms',phone);equal((await db.query('select phone from account_requests where id=$1',[id])).rows[0].phone,'+27672250563');}
 for(const phone of [null,'0211234567','123','abc0672250563']){await assert.rejects(call('invalid@example.test','sms',phone),/cellphone/);checks++;}
 const elevated=await call('escalate@example.test','email',null,'principal');equal((await db.query('select requested_role from account_requests where id=$1',[elevated])).rows[0].requested_role,'parent');
 await db.exec('set role anon');const legacy=(await db.query("select request_school_account('QA-A','legacy@example.test','Legacy Applicant') as id")).rows[0].id;await assert.rejects(db.query('select * from account_requests'),/permission denied/);checks++;await db.exec('reset role');equal((await db.query('select invitation_method from account_requests where id=$1',[legacy])).rows[0].invitation_method,'email');
 const other=await call('other@example.test','email',null,'teacher','QA-B');equal((await db.query('select school_id from account_requests where id=$1',[other])).rows[0].school_id,'00000000-0000-4000-8000-000000000002');
 await db.query("update account_requests set status='approved' where id=$1",[first]);await assert.rejects(call('email@example.test'),/approved account/);checks++;
 await db.exec("insert into profiles values(gen_random_uuid(),'00000000-0000-4000-8000-000000000001','existing@example.test')");await assert.rejects(call('existing@example.test'),/Sign in or reset/);checks++;
 await db.exec("update schools set lifecycle_status='suspended' where code='QA-B'");await assert.rejects(call('blocked@example.test','email',null,'parent','QA-B'),/unavailable/);checks++;
 await assert.rejects(call('not-an-email'),/valid email/);checks++;
 console.log(checks+' account request delivery SQL assertions passed: Email/SMS, legacy RPC, permissions, approved/duplicate protection, tenant selection and suspension');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exit(1)});
