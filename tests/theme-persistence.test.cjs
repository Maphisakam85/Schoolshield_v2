const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('theme migration saves and retries per-school revisions without crossing tenants',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE),db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
 create table schools(id uuid primary key);create table platform_admin_audit(actor_id uuid,action text,school_id uuid,target_id uuid,operation_id uuid,previous_value jsonb,new_value jsonb,reason text);
 create function require_platform_administrator() returns void language plpgsql as $$begin if auth.uid() is distinct from '00000000-0000-0000-0000-000000000080'::uuid then raise exception 'Access denied';end if;end$$;
 create function current_school_id() returns uuid language sql as $$select null::uuid$$;create function assert_account_access() returns void language plpgsql as $$begin end$$;
 insert into auth.users values('00000000-0000-0000-0000-000000000080');insert into schools values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261029120000_school_portal_themes.sql','utf8'));
 await db.exec(`set role authenticated;set qa.uid='00000000-0000-0000-0000-000000000080'`);
 const args=['00000000-0000-0000-0000-000000000001',0,'#1c4c97','#10295b','00000000-0000-0000-0000-000000000099','QA theme save'];const sql='select save_platform_school_theme($1,$2,$3,$4,$5,$6) t';
 const saved=(await db.query(sql,args)).rows[0].t;assert.equal(saved.revision,1);assert.equal(saved.primary_color,'#1C4C97');assert.equal((await db.query(sql,args)).rows[0].t.revision,1);
 assert.equal((await db.query('select platform_admin_theme($1) t',['00000000-0000-0000-0000-000000000002'])).rows[0].t.revision,0);
 const stale=[...args];stale[4]='00000000-0000-0000-0000-000000000098';await assert.rejects(db.query(sql,stale),/changed/);
 for(const index of [2,3,5]){const invalid=[...stale];invalid[index]=null;await assert.rejects(db.query(sql,invalid),/required/);}
 await db.exec(`set qa.uid='00000000-0000-0000-0000-000000000011'`);await assert.rejects(db.query(sql,args),/Access denied/);
 }finally{await db.close();}
});
