-- Canonical shift records cannot be changed through generic workspace saves.
-- Bind unambiguous existing officer profiles to stable account IDs.
update public.school_workspaces w set payload=jsonb_set(w.payload,'{security}',
  (select jsonb_agg(case when coalesce(o.value->>'userId','')='' and
    (select count(*) from public.profiles p where p.school_id=w.school_id and p.role='security' and p.display_name=o.value->>'name')=1 and
    (select count(*) from jsonb_array_elements(w.payload->'security') other where other->>'name'=o.value->>'name')=1
    then o.value||jsonb_build_object('userId',(select p.id from public.profiles p where p.school_id=w.school_id and p.role='security' and p.display_name=o.value->>'name'))
    else o.value end) from jsonb_array_elements(w.payload->'security') o(value)))
where jsonb_typeof(w.payload->'security')='array' and jsonb_array_length(w.payload->'security')>0;
create table public.security_shift_attendance (
  school_id uuid not null references public.schools(id),
  officer_id text not null,
  id text not null,
  record jsonb not null,
  active boolean not null,
  primary key(school_id,id)
);
create unique index security_one_active_shift on public.security_shift_attendance(school_id,officer_id) where active;
alter table public.security_shift_attendance enable row level security;
create policy security_shift_school_read on public.security_shift_attendance for select to authenticated
  using(school_id=public.current_school_id() and public.current_app_role() in ('security','principal','deputy'));
grant select on public.security_shift_attendance to authenticated;

create function public.preserve_security_shift_audit() returns trigger
language plpgsql security definer set search_path=public as $$
declare records jsonb; actor public.profiles%rowtype; officers jsonb;
begin
  select coalesce(jsonb_agg(record order by record->>'actualCheckInAt' desc),'[]') into records
    from public.security_shift_attendance where school_id=new.school_id;
  records := records || coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(old.payload->'securityAttendance','[]'))
    where not exists(select 1 from public.security_shift_attendance a where a.school_id=new.school_id and a.id=value->>'id')),'[]');
  new.payload := jsonb_set(new.payload,'{securityAttendance}',records);
  select * into actor from public.profiles where id=auth.uid();
  if actor.role='security' then
    -- Keep identity assignments and other officers unchanged during browser saves.
    select coalesce(jsonb_agg(case when o.value->>'userId'=actor.id::text or
      (coalesce(o.value->>'userId','')='' and o.value->>'name'=actor.display_name)
      then coalesce((select n.candidate from jsonb_array_elements(coalesce(new.payload->'security','[]')) n(candidate) where n.candidate->>'id'=o.value->>'id' limit 1),o.value)
        || jsonb_build_object('id',o.value->>'id','name',o.value->>'name','userId',o.value->'userId')
      else o.value end),'[]') into officers from jsonb_array_elements(coalesce(old.payload->'security','[]')) o(value);
    officers:=officers || coalesce((select jsonb_agg(n.value-'userId') from jsonb_array_elements(coalesce(new.payload->'security','[]')) n(value)
      where not exists(select 1 from jsonb_array_elements(coalesce(old.payload->'security','[]')) o(value) where o.value->>'id'=n.value->>'id')),'[]');
    new.payload:=jsonb_set(new.payload,'{security}',officers);
  end if;
  return new;
end;
$$;
create trigger preserve_security_shift_audit before update on public.school_workspaces
  for each row execute function public.preserve_security_shift_audit();

create function public.record_security_shift(p_officer_id text,p_action text,p_date date default null,p_start time default null,p_end time default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; workspace jsonb; officer jsonb; item jsonb;
  records jsonb; stamp timestamptz:=clock_timestamp(); minutes integer; start_at timestamp; end_at timestamp;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.role not in ('security','principal','deputy') then raise exception 'Security attendance access denied'; end if;
  if p_action is null or p_action not in ('check-in','check-out') then raise exception 'Invalid shift action'; end if;
  select payload into workspace from public.school_workspaces where school_id=actor.school_id for update;
  if workspace is null then raise exception 'School workspace unavailable'; end if;
  select value into officer from jsonb_array_elements(coalesce(workspace->'security','[]')) where value->>'id'=p_officer_id;
  if officer is null then raise exception 'Officer not found in your school'; end if;
  if actor.role='security' and not coalesce((
    officer->>'userId'=actor.id::text or
    (coalesce(officer->>'userId','')='' and officer->>'name'=actor.display_name
      and (select count(*) from public.profiles where school_id=actor.school_id and role='security' and display_name=actor.display_name)=1
      and (select count(*) from jsonb_array_elements(workspace->'security') where value->>'name'=actor.display_name)=1)
  ),false) then raise exception 'You may only record your own shift'; end if;
  records:=coalesce(workspace->'securityAttendance','[]');
  select value into item from jsonb_array_elements(records) where value->>'officerId'=p_officer_id and value->>'status'='Clocked In';
  if actor.role='security' and exists(select 1 from public.security_shift_attendance where school_id=actor.school_id and officer_id=p_officer_id and record->>'officerUserId' is not null and record->>'officerUserId'<>actor.id::text) then
    raise exception 'Officer account assignment does not match';
  end if;
  if p_action='check-in' then
    if item is not null then raise exception 'An active shift already exists. Clock out before starting another shift'; end if;
    if p_date is null or p_start is null or p_end is null or p_start=p_end
      or p_start >= time '24:00' or p_end >= time '24:00'
      or extract(second from p_start)<>0 or extract(second from p_end)<>0 then raise exception 'Select shift date and different start/end times'; end if;
    start_at:=p_date+p_start; end_at:=p_date+p_end;
    if end_at<start_at then end_at:=end_at+interval '1 day'; end if;
    minutes:=extract(epoch from (end_at-start_at))/60;
    item:=jsonb_build_object('id','SEC-ATT-'||gen_random_uuid(),'officerId',p_officer_id,'officerName',officer->>'name',
      'employeeId',officer->>'employee','site',officer->>'site','date',p_date,'scheduledDate',p_date,
      'scheduledStart',to_char(p_start,'HH24:MI'),'scheduledEnd',to_char(p_end,'HH24:MI'),
      'scheduledEndDate',end_at::date,'scheduledDurationMinutes',minutes,'shift',to_char(p_start,'HH24:MI')||'–'||to_char(p_end,'HH24:MI'),
      'actualCheckInAt',stamp,'actualCheckOutAt',null,'clockIn',to_char(stamp at time zone 'Africa/Johannesburg','HH24:MI'),
      'clockOut','','status','Clocked In','checkedInBy',actor.id,'officerUserId',case when actor.role='security' then actor.id::text else officer->>'userId' end);
  else
    if item is null then raise exception 'No active shift to clock out'; end if;
    item:=item||jsonb_build_object('actualCheckOutAt',stamp,'clockOut',to_char(stamp at time zone 'Africa/Johannesburg','HH24:MI'),'status','Completed','checkedOutBy',actor.id);
  end if;
  insert into public.security_shift_attendance values(actor.school_id,p_officer_id,item->>'id',item,p_action='check-in')
    on conflict(school_id,id) do update set record=excluded.record,active=excluded.active;
  -- The audit trigger merges canonical records with untouched legacy history.
  update public.school_workspaces set payload=jsonb_set(workspace,'{security}',
    (select jsonb_agg(case when value->>'id'=p_officer_id then value||jsonb_build_object('status',case when p_action='check-in' then 'On Duty' else 'Off Duty' end) else value end) from jsonb_array_elements(workspace->'security'))),
    updated_by=actor.id where school_id=actor.school_id;
  return item;
end;
$$;
revoke all on function public.record_security_shift(text,text,date,time,time) from public;
grant execute on function public.record_security_shift(text,text,date,time,time) to authenticated;
