-- Install missing operational RPCs using the canonical school identities.
-- Append/update announcements atomically in the existing workspace payload.
create or replace function public.publish_school_announcement(
  p_id text, p_title text, p_body text, p_audience_id text,
  p_audience text, p_delivery text, p_recipients integer default 0,
  p_action text default 'create'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles%rowtype;
  workspace jsonb;
  items jsonb;
  item jsonb;
  class_ids jsonb := '[]';
  saved jsonb;
  notices jsonb;
begin
  perform assert_account_access();
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('principal','deputy','clerk','teacher') then
    raise exception 'You are not permitted to publish announcements';
  end if;
  if p_action not in ('create','update','delete') or p_action is null then raise exception 'Invalid announcement action'; end if;
  if p_id is null or length(p_id) not between 5 and 100 then raise exception 'Invalid announcement ID'; end if;
  if p_action <> 'delete' and (p_title is null or length(btrim(p_title, E' \t\r\n')) not between 1 and 140 or p_body is null or length(btrim(p_body, E' \t\r\n')) not between 1 and 2000) then
    raise exception 'Enter a title and a message (maximum 140 and 2000 characters)';
  end if;
  select payload into workspace from public.school_workspaces where school_id = actor.school_id for update;
  if workspace is null then raise exception 'School workspace is unavailable'; end if;
  items := coalesce(workspace->'announcements','[]'::jsonb);
  select value into item from jsonb_array_elements(items) where value->>'id' = p_id;
  if item is not null then
    if item->>'authorId' is distinct from actor.id::text then raise exception 'Only the author can change this announcement'; end if;
    if p_action = 'create' then return item; end if; -- idempotent retry
  elsif p_action <> 'create' then raise exception 'Announcement not found';
  end if;
  if p_action = 'create' then
    if p_delivery is distinct from 'In-app notification' then raise exception 'Only in-app announcement delivery is available; email/SMS announcement delivery is not implemented'; end if;
    if actor.role = 'teacher' and p_audience_id is distinct from 'my-classes-parents' then raise exception 'Teachers may only contact their class parents'; end if;
    if actor.role = 'clerk' and (p_audience_id is null or p_audience_id not in ('all-parents','whole-school','all-staff')) then raise exception 'Audience is not permitted'; end if;
    if actor.role in ('principal','deputy') and (p_audience_id is null or not (
      p_audience_id in ('whole-school','all-parents','all-learners','all-staff','teachers','leadership','sgb','security','administration')
      or exists (select 1 from jsonb_array_elements(coalesce(workspace->'classes','[]')) c where p_audience_id = 'class-' || (c->>'id') or p_audience_id = 'grade-' || replace(c->>'grade',' ','-'))
    )) then raise exception 'Audience is not permitted'; end if;
    if p_audience_id = 'my-classes-parents' then
      select coalesce(jsonb_agg(c->>'id'),'[]') into class_ids from jsonb_array_elements(coalesce(workspace->'classes','[]')) c where c->>'teacherProfileId'=actor.id::text or coalesce(c->'teacherProfileIds','[]') ? actor.id::text;
      if jsonb_array_length(class_ids) = 0 then raise exception 'No teaching classes are assigned'; end if;
    end if;
    saved := jsonb_build_object('id',p_id,'school_id',actor.school_id,'entityId',school_alias(actor.school_id,'announcements',p_id),'title',btrim(p_title,E' \t\r\n'),'body',btrim(p_body,E' \t\r\n'),
      'audienceId',p_audience_id,'audience',p_audience,'classIds',class_ids,'recipients',greatest(coalesce(p_recipients,0),0),
      'delivery',p_delivery,'author',actor.display_name,'authorId',actor.id,
      'date',to_char(now() at time zone 'Africa/Johannesburg','DD Mon YYYY'),'createdAt',now());
    items := jsonb_build_array(saved) || items;
  else
    saved := item || jsonb_build_object('title',btrim(p_title,E' \t\r\n'),'body',btrim(p_body,E' \t\r\n'));
    select coalesce(jsonb_agg(case when value->>'id' = p_id then saved else value end),'[]') into items from jsonb_array_elements(items) where p_action <> 'delete' or value->>'id' <> p_id;
  end if;
  notices := coalesce(workspace->'notifications','[]'::jsonb);
  if p_action = 'create' then
    notices := jsonb_build_array(saved || jsonb_build_object('id','NOTICE-' || p_id,'entityId',school_alias(actor.school_id,'notifications','NOTICE-'||p_id),'announcementId',p_id,
      'description',btrim(p_body,E' \t\r\n'),'reporter',actor.display_name,'category','Announcement','priority','Medium','read',false)) || notices;
  else
    select coalesce(jsonb_agg(case when value->>'announcementId' = p_id then value || jsonb_build_object('title',p_title,'description',p_body) else value end),'[]') into notices
      from jsonb_array_elements(notices) where p_action <> 'delete' or value->>'announcementId' is distinct from p_id;
  end if;
  update public.school_workspaces set payload = jsonb_set(jsonb_set(workspace,'{announcements}',items),'{notifications}',notices), version=version+1, updated_by = actor.id where school_id = actor.school_id;
  return saved;
end;
$$;
revoke all on function public.publish_school_announcement(text,text,text,text,text,text,integer,text) from public;
grant execute on function public.publish_school_announcement(text,text,text,text,text,text,integer,text) to authenticated;

create table if not exists public.security_shift_attendance (
  school_id uuid not null references public.schools(id),
  officer_id text not null,
  id text not null,
  record jsonb not null,
  active boolean not null,
  primary key(school_id,id)
);
create unique index if not exists security_one_active_shift on public.security_shift_attendance(school_id,officer_id) where active;
alter table public.security_shift_attendance enable row level security;
drop policy if exists security_shift_school_read on public.security_shift_attendance;
create policy security_shift_school_read on public.security_shift_attendance for select to authenticated
  using(school_id=public.current_school_id() and public.current_app_role() in ('security','principal','deputy'));
grant select on public.security_shift_attendance to authenticated;

create or replace function public.preserve_security_shift_audit() returns trigger
language plpgsql security definer set search_path=public as $$
declare records jsonb; actor public.profiles%rowtype; officers jsonb;
begin
  select coalesce(jsonb_agg(record order by record->>'actualCheckInAt' desc),'[]') into records
    from public.security_shift_attendance where school_id=new.school_id;
  records := records || coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(old.payload->'securityAttendance','[]'))
    where not exists(select 1 from public.security_shift_attendance a where a.school_id=new.school_id and a.id=value->>'id')),'[]');
  new.payload := jsonb_set(new.payload,'{securityAttendance}',records);
  select * into actor from public.profiles where id=auth.uid();
  -- Canonical core projection already protects officer UUIDs and names.
  return new;
end;
$$;
drop trigger if exists preserve_security_shift_audit on public.school_workspaces;
create trigger preserve_security_shift_audit before update on public.school_workspaces
  for each row execute function public.preserve_security_shift_audit();

create or replace function public.record_security_shift(p_officer_id text,p_action text,p_date date default null,p_start time default null,p_end time default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; workspace jsonb; officer jsonb; item jsonb;
  records jsonb; stamp timestamptz:=clock_timestamp(); minutes integer; start_at timestamp; end_at timestamp;
begin
  perform assert_account_access();
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.role not in ('security','principal','deputy') then raise exception 'Security attendance access denied'; end if;
  if p_action is null or p_action not in ('check-in','check-out') then raise exception 'Invalid shift action'; end if;
  select payload into workspace from public.school_workspaces where school_id=actor.school_id for update;
  if workspace is null then raise exception 'School workspace unavailable'; end if;
  select value into officer from jsonb_array_elements(coalesce(workspace->'security','[]')) where value->>'id'=p_officer_id;
  if officer is null then raise exception 'Officer not found in your school'; end if;
  if actor.role='security' and officer->>'userId' is distinct from actor.id::text then raise exception 'You may only record your own shift'; end if;
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
  update school_security_officers set record=record||jsonb_build_object('status',case when p_action='check-in' then 'On Duty' else 'Off Duty' end) where school_id=actor.school_id and legacy_ref=p_officer_id;
  -- The audit trigger merges canonical records with untouched legacy history.
  update public.school_workspaces set payload=jsonb_set(workspace,'{security}',
    (select jsonb_agg(case when value->>'id'=p_officer_id then value||jsonb_build_object('status',case when p_action='check-in' then 'On Duty' else 'Off Duty' end) else value end) from jsonb_array_elements(workspace->'security'))),
    version=version+1,updated_by=actor.id where school_id=actor.school_id;
  return item;
end;
$$;
revoke all on function public.record_security_shift(text,text,date,time,time) from public;
grant execute on function public.record_security_shift(text,text,date,time,time) to authenticated;

revoke insert,update,delete on public.security_shift_attendance from anon,authenticated;
revoke all on function public.preserve_security_shift_audit() from public,anon,authenticated;
