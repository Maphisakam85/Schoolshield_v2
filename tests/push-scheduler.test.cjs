const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('push schedule starts disabled, skips empty queues and protects its Vault credential',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE),db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema vault;create schema cron;create schema net;
 create table vault.decrypted_secrets(name text,decrypted_secret text);create table web_push_outbox(status text,available_at timestamptz,attempts int);
 create table cron.job(jobid bigint generated always as identity,jobname text,schedule text,command text,active boolean default true);
 create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare result bigint;begin insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid into result;return result;end$$;
 create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
 create table net.requests(url text,headers jsonb,body jsonb);create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$begin insert into net.requests values($1,$2,$3);return 1;end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261109150000_web_push_scheduler.sql','utf8').replace(/^create extension.*;\r?\n/gm,''));
 assert.equal((await db.query('select active from cron.job')).rows[0].active,false);await db.query('select dispatch_school_web_push()');assert.equal((await db.query('select count(*) count from net.requests')).rows[0].count,0);
 await db.exec("insert into web_push_outbox values('pending',now(),0)");await db.query('select dispatch_school_web_push()');assert.equal((await db.query('select count(*) count from net.requests')).rows[0].count,0);
 await db.exec("insert into vault.decrypted_secrets values('schoolshield_push_project_url','https://aaaaaaaaaaaaaaaaaaaa.supabase.co'),('schoolshield_push_dispatch_secret','fixture-scoped-secret')");await db.query('select dispatch_school_web_push()');const request=(await db.query('select * from net.requests')).rows[0];assert.equal(request.headers.Authorization,'Bearer fixture-scoped-secret');assert.match(request.url,/functions\/v1\/push-dispatch$/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select dispatch_school_web_push()'),/permission denied/);await db.exec('reset role');}
 assert.doesNotMatch((await db.query('select command from cron.job')).rows[0].command,/fixture|Bearer/);
 }finally{await db.close();}
});
