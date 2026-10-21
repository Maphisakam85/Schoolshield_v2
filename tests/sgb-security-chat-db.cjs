// Optional isolated PostgreSQL check: PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/sgb-security-chat-db.cjs
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
  create table public.schools(id uuid primary key);
  create table public.profiles(id uuid primary key,school_id uuid,role text,account_status text,requires_setup boolean,onboarding_completed_at timestamptz,display_name text);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261021100000_sgb_security_chat.sql','utf8'));
  const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  await db.query('insert into schools values ($1),($2)',[uuid(100),uuid(200)]);
  for(const [id,school,role,status]of [[1,100,'sgb','Active'],[2,100,'security','Active'],[3,100,'sgb','Active'],[4,200,'security','Active'],[5,100,'principal','Active'],[6,100,'security','Inactive']])await db.query('insert into profiles values($1,$2,$3,$4,false,now(),$3)',[uuid(id),uuid(school),role,status]);
  const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uuid(id)]);await db.exec('set role authenticated');};
  const chat=async(peer=null,body=null,id=null)=>(await db.query('select sgb_security_chat($1,$2,$3) as data',[peer&&uuid(peer),body,id&&uuid(id)])).rows[0].data;
  await as(1);assert.equal((await chat()).contacts.length,1);
  await chat(2,'Hello',10);await chat(2,'Hello',10);assert.equal((await chat(2)).messages.length,1);
  await assert.rejects(()=>chat(2,'Changed',10));await assert.rejects(()=>chat(4,'Cross school',11));await assert.rejects(()=>chat(3,'Same role',12));await assert.rejects(()=>chat(6,'Inactive',13));
  await assert.rejects(()=>db.query('select * from sgb_security_messages'));await assert.rejects(()=>db.query("insert into sgb_security_messages values(gen_random_uuid(),$1,$2,$3,'forged',now())",[uuid(100),uuid(1),uuid(2)]));
  await as(2);assert.equal((await chat(1)).messages[0].body,'Hello');await chat(1,'Reply',14);
  await as(3);assert.equal((await chat(2)).messages.length,0);await assert.rejects(()=>chat(2,'Hello',10));
  await as(5);await assert.rejects(()=>chat());
  await as(1);assert.equal((await chat(2)).messages.length,2);
  await db.exec('reset role');await db.query('update profiles set requires_setup=true,onboarding_completed_at=null where id=$1',[uuid(1)]);await as(1);await assert.rejects(()=>chat());
  console.log('PASS PostgreSQL migration, bidirectional messaging, idempotent retries, participant isolation, role/school/status/setup checks and denied direct table access.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
