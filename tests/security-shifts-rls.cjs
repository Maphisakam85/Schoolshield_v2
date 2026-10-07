const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();try {
  await db.exec(`create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.schools(id uuid primary key);
    create table public.profiles(id uuid primary key,school_id uuid,role text,display_name text);
    create table public.school_workspaces(school_id uuid primary key,payload jsonb,updated_by uuid);
    create function public.current_school_id() returns uuid language sql stable security definer as $$select school_id from profiles where id=auth.uid()$$;
    create function public.current_app_role() returns text language sql stable security definer as $$select role from profiles where id=auth.uid()$$;
    grant usage on schema public,auth to authenticated;grant select,update on school_workspaces to authenticated;`);
  const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,school=uid(1),other=uid(2);
  await db.query('insert into schools values ($1),($2)',[school,other]);
  for(const [n,role,name,tenant] of [[3,'security','Officer A',school],[4,'security','Officer B',school],[5,'principal','Principal',school],[6,'teacher','Teacher',school],[7,'security','Officer A',other]]) await db.query('insert into profiles values ($1,$2,$3,$4)',[uid(n),tenant,role,name]);
  const legacy={id:'legacy',officerId:'B',date:'2026-09-01',shift:'06:00–14:00',clockIn:'06:02',clockOut:'14:03',status:'Completed'};
  const legacyActive={id:'old-active',officerId:'B',date:'2026-08-01',clockIn:'08:02',status:'Clocked In'};
  const payload={security:[{id:'A',name:'Officer A',shift:'06:00–14:00'},{id:'B',name:'Officer B'}],securityAttendance:[legacy,legacyActive],visitors:[{id:'untouched'}]};
  await db.query('insert into school_workspaces values ($1,$2,null),($3,$4,null)',[school,JSON.stringify(payload),other,JSON.stringify({security:[],securityAttendance:[]})]);
  await db.exec(fs.readFileSync('supabase/migrations/20261007140000_security_shifts.sql','utf8'));
  assert.equal((await db.query('select payload from school_workspaces where school_id=$1',[school])).rows[0].payload.security[0].userId,uid(3));
  const login=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');};
  const shift=async(id,action,date=null,start=null,end=null)=>(await db.query('select record_security_shift($1,$2,$3,$4,$5) as item',[id,action,date,start,end])).rows[0].item;
  await login(3);
  for(const args of [['A','check-in',null,'06:00','14:00'],['A','check-in','2026-10-07','06:00','06:00']]) await assert.rejects(shift(...args),/Select shift/);
  await assert.rejects(shift('B','check-in','2026-10-07','06:00','14:00'),/own shift/);
  const normal=await shift('A','check-in','2026-10-07','06:00','14:00');assert.equal(normal.scheduledDurationMinutes,480);assert.ok(normal.actualCheckInAt);assert.equal(normal.actualCheckOutAt,null);
  await assert.rejects(shift('A','check-in','2026-10-08','18:00','06:00'),/active shift/);
  // A new authenticated session reads the same saved record.
  await login(3);assert.equal((await db.query('select record from security_shift_attendance')).rows[0].record.id,normal.id);
  await assert.rejects(db.query("update security_shift_attendance set record='{}'"),/permission denied/);
  await db.query("update school_workspaces set payload=jsonb_set(payload,'{securityAttendance}','[]') where school_id=$1",[school]);
  let saved=(await db.query('select payload from school_workspaces where school_id=$1',[school])).rows[0].payload;
  assert.equal(saved.securityAttendance.length,3);assert.deepEqual(saved.securityAttendance.find(r=>r.id==='legacy'),legacy);assert.deepEqual(saved.visitors,payload.visitors);
  await db.query("update school_workspaces set payload=jsonb_set(payload,'{security}', $2::jsonb) where school_id=$1",[school,JSON.stringify([{id:'A',name:'Officer A'},{id:'B',name:'Officer A',userId:uid(3),shift:'FAKE'}])]);
  assert.equal((await db.query('select payload from school_workspaces where school_id=$1',[school])).rows[0].payload.security.find(r=>r.id==='B').name,'Officer B');
  const completed=await shift('A','check-out');assert.equal(completed.actualCheckInAt,normal.actualCheckInAt);assert.ok(completed.actualCheckOutAt);assert.equal(completed.status,'Completed');
  await assert.rejects(shift('A','check-out'),/No active/);
  const overnight=await shift('A','check-in','2026-10-06','18:00','06:00');assert.equal(overnight.scheduledEndDate,'2026-10-07');assert.equal(overnight.scheduledDurationMinutes,720);
  await shift('A','check-out'); // check-out locates active record independently of date
  await login(4);await assert.rejects(shift('A','check-in','2026-10-07','06:00','14:00'),/own shift/);
  await login(6);await assert.rejects(shift('A','check-out'),/access denied/);
  await login(7);await assert.rejects(shift('A','check-in','2026-10-07','06:00','14:00'),/not found/);
  await login(5);const oldCompleted=await shift('B','check-out');assert.equal(oldCompleted.clockIn,'08:02');assert.equal(oldCompleted.actualCheckInAt,undefined);assert.ok(oldCompleted.actualCheckOutAt);
  await shift('B','check-in','2026-10-07','08:00','16:00');await shift('B','check-out');
  console.log('PASS shift SQL: normal/overnight, validation, active duplicates, server audit times, new-session persistence, ownership/tenant/role denial, management, immutable legacy history and raw-save protection.');
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
