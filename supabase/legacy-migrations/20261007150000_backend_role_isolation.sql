-- RLS cannot filter properties inside the single workspace JSON row.
-- Leadership may read it; all browser writes use checked, scoped RPCs.
drop policy if exists "staff read their workspace" on public.school_workspaces;
drop policy if exists "staff update their workspace" on public.school_workspaces;
drop policy if exists "managers create a workspace" on public.school_workspaces;
create policy "leadership read school workspace" on public.school_workspaces for select to authenticated
  using(school_id=public.current_school_id() and public.current_app_role() in ('principal','deputy'));
revoke insert,update,delete on public.school_workspaces from authenticated,anon;
grant select on public.school_workspaces to authenticated;

-- Class assignment is an authorization fact, never a client-editable name.
create table public.teacher_class_access (
  school_id uuid not null references public.schools(id),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_ref text not null,
  primary key(school_id,teacher_id,class_ref)
);
insert into public.teacher_class_access
select w.school_id,p.id,c->>'id' from public.school_workspaces w
cross join lateral jsonb_array_elements(coalesce(w.payload->'classes','[]')) c
join public.profiles p on p.school_id=w.school_id and p.role='teacher'
  and (c->>'teacherId'=p.id::text or (coalesce(c->>'teacherId','')='' and c->>'teacher'=p.display_name
    and (select count(*) from public.profiles other where other.school_id=p.school_id and other.role='teacher' and other.display_name=p.display_name)=1))
where coalesce(c->>'id','')<>'' on conflict do nothing;
alter table public.teacher_class_access enable row level security;
create policy "assigned teachers and managers read class access" on public.teacher_class_access for select to authenticated
  using(school_id=public.current_school_id() and (teacher_id=auth.uid() or public.is_school_manager()));
grant select on public.teacher_class_access to authenticated;
revoke insert,update,delete on public.teacher_class_access from authenticated,anon;

create function public.can_access_school_class(p_school uuid,p_class text) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(p_school=public.current_school_id() and exists(
    select 1 from public.school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'classes','[]')) c
      where w.school_id=p_school and c->>'id'=p_class) and (
    public.current_app_role() in ('principal','deputy','clerk') or
    (public.current_app_role()='teacher' and exists(select 1 from public.teacher_class_access
      where school_id=p_school and teacher_id=auth.uid() and class_ref=p_class))),false)
$$;
create function public.can_access_school_learner(p_school uuid,p_learner text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles%rowtype; learner jsonb;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.school_id is distinct from p_school then return false; end if;
  select l into learner from public.school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'learners','[]')) l
    where w.school_id=p_school and l->>'id'=p_learner;
  if learner is null then return false; end if;
  if actor.role in ('principal','deputy','clerk') then return true; end if;
  if actor.role='parent' then return exists(select 1 from public.parent_learner_links where school_id=p_school and parent_id=actor.id and learner_ref=p_learner); end if;
  return public.can_access_school_class(p_school,learner->>'class');
end;
$$;
create function public.set_teacher_class_access(p_teacher uuid,p_class text,p_allowed boolean) returns void
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id();
begin
  if not coalesce(public.is_school_manager(),false) then raise exception 'Class assignment access denied'; end if;
  if not exists(select 1 from public.profiles where id=p_teacher and school_id=tenant and role='teacher') or
     not exists(select 1 from public.school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'classes','[]')) c where w.school_id=tenant and c->>'id'=p_class)
    then raise exception 'Teacher or class is not in your school'; end if;
  if p_allowed then insert into public.teacher_class_access values(tenant,p_teacher,p_class) on conflict do nothing;
  else delete from public.teacher_class_access where school_id=tenant and teacher_id=p_teacher and class_ref=p_class; end if;
end;
$$;

create function public.can_access_school_incident(p_school uuid,p_record text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles%rowtype; item jsonb;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.school_id is distinct from p_school then return false; end if;
  select i into item from public.school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'incidents','[]')) i where w.school_id=p_school and i->>'id'=p_record;
  if item is null then return false; end if;
  if actor.role in ('principal','deputy','security','sgb') then return true; end if;
  if actor.role<>'teacher' then return false; end if;
  return coalesce(item->>'reporterId'=actor.id::text or item->>'staffId'=actor.id::text
    or (item->>'reporterId' is null and item->>'reporter'=actor.display_name and
      (select count(*) from public.profiles where school_id=p_school and display_name=actor.display_name)=1)
    or item->>'scope' in ('teachers','whole-school')
    or public.can_access_school_learner(p_school,item->>'learnerId')
    or public.can_access_school_class(p_school,item->>'class'),false);
end;
$$;
create function public.can_access_school_notice(p_school uuid,p_record text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles%rowtype; item jsonb; learner_id text; owner_id text;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.school_id is distinct from p_school then return false; end if;
  select learner_ref,submitted_by::text into learner_id,owner_id from public.sick_notices where school_id=p_school and id::text=p_record;
  if learner_id is null then
    select n into item from public.school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'sickNotices','[]')) n where w.school_id=p_school and n->>'id'=p_record;
    if item is null then return false; end if;
    learner_id:=item->>'learnerId'; owner_id:=item->>'submittedById';
    if learner_id is null then
      select case when count(*)=1 then min(l->>'id') end into learner_id from public.school_workspaces w
        cross join lateral jsonb_array_elements(coalesce(w.payload->'learners','[]')) l where w.school_id=p_school and l->>'name'=item->>'person';
    end if;
  end if;
  if actor.role in ('principal','deputy','clerk') then return true; end if;
  if actor.role='parent' then return coalesce(owner_id=actor.id::text and public.can_access_school_learner(p_school,learner_id),false); end if;
  if actor.role='teacher' then return public.can_access_school_learner(p_school,learner_id); end if;
  return false;
end;
$$;

-- Personal profile fields are not a school-wide staff directory.
drop policy if exists "members read school profiles" on public.profiles;
create policy "managers read school profiles" on public.profiles for select to authenticated
  using(school_id=public.current_school_id() and public.is_school_manager());
revoke insert,update,delete on public.profiles from authenticated,anon;
drop policy if exists "parents read their learner links" on public.parent_learner_links;
create policy "parent accounts read own school learner links" on public.parent_learner_links for select to authenticated
  using(public.current_app_role()='parent' and school_id=public.current_school_id() and parent_id=auth.uid());
drop policy if exists "staff read school learner links" on public.parent_learner_links;
create policy "academic staff read permitted learner links" on public.parent_learner_links for select to authenticated
  using(public.current_app_role() in ('principal','deputy','clerk','teacher') and public.can_access_school_learner(school_id,learner_ref));
drop policy if exists "parents submit a linked learner notice" on public.sick_notices;
create policy "parents submit linked pending notices" on public.sick_notices for insert to authenticated
  with check(public.current_app_role()='parent' and submitted_by=auth.uid() and status='pending_review'
    and reviewed_by is null and reviewed_at is null and public.can_access_school_learner(school_id,learner_ref));
drop policy if exists "parents read their own notices" on public.sick_notices;
drop policy if exists "staff read school notices" on public.sick_notices;
create policy "permitted users read medical notices" on public.sick_notices for select to authenticated
  using(public.can_access_school_learner(school_id,learner_ref) and (public.current_app_role()<>'parent' or submitted_by=auth.uid()));
drop policy if exists "staff review school notices" on public.sick_notices;
create policy "academic staff review permitted notices" on public.sick_notices for update to authenticated
  using(public.current_app_role() in ('principal','deputy','clerk','teacher') and public.can_access_school_learner(school_id,learner_ref))
  with check(public.current_app_role() in ('principal','deputy','clerk','teacher') and public.can_access_school_learner(school_id,learner_ref)
    and status='reviewed' and reviewed_by=auth.uid() and reviewed_at is not null);
revoke update on public.sick_notices from authenticated;
grant update(status,reviewed_by,reviewed_at) on public.sick_notices to authenticated;

-- Safe workspace projection. No role, school, learner or family supplied by caller.
create function public.get_authorised_workspace() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles%rowtype; workspace jsonb; result jsonb:='{}'; key text; keys text[]; items jsonb; item jsonb; scores jsonb;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null then raise exception 'Sign in required'; end if;
  select payload into workspace from public.school_workspaces where school_id=actor.school_id;
  if workspace is null then raise exception 'School workspace unavailable'; end if;
  keys:=case actor.role
    when 'principal' then array['classes','learners','assessments','reports','visitors','incidents','staff','staffChangeRequests','security','securityAttendance','sickNotices','appointments','attendanceRegisters','attendanceWeeks','reportRequests','teacherAssignments']
    when 'deputy' then array['classes','learners','assessments','reports','visitors','incidents','staff','staffChangeRequests','security','securityAttendance','sickNotices','appointments','attendanceRegisters','attendanceWeeks','reportRequests','teacherAssignments']
    when 'clerk' then array['classes','learners','assessments','reports','staff','staffChangeRequests','sickNotices','appointments','attendanceRegisters','attendanceWeeks','reportRequests','teacherAssignments','visitors']
    when 'teacher' then array['classes','learners','assessments','reports','sickNotices','attendanceRegisters','attendanceWeeks','reportRequests','incidents']
    when 'security' then array['visitors','incidents','security','securityAttendance']
    when 'sgb' then array['visitors','incidents']
    when 'parent' then array['classes','learners','assessments','reports','attendanceRegisters','sickNotices']
    else array[]::text[] end;
  foreach key in array keys loop
    items:='[]';
    for item in select value from jsonb_array_elements(coalesce(workspace->key,'[]')) loop
      if actor.role in ('principal','deputy','clerk','security','sgb') then null;
      elsif key='learners' then if not public.can_access_school_learner(actor.school_id,item->>'id') then continue; end if;
      elsif key='incidents' then if not public.can_access_school_incident(actor.school_id,item->>'id') then continue; end if;
      elsif key='sickNotices' then if not public.can_access_school_notice(actor.school_id,item->>'id') then continue; end if;
      elsif actor.role='teacher' then
        if not public.can_access_school_class(actor.school_id,case when key='classes' then item->>'id' else item->>'class' end) then continue; end if;
      elsif actor.role='parent' then
        if not exists(select 1 from jsonb_array_elements(coalesce(workspace->'learners','[]')) l where public.can_access_school_learner(actor.school_id,l->>'id') and l->>'class'=case when key='classes' then item->>'id' else item->>'class' end) then continue; end if;
        if key='classes' then item:=jsonb_build_object('id',item->>'id','grade',item->>'grade','teacher',item->>'teacher');
        elsif key in ('assessments','reports','attendanceRegisters') then
          select coalesce(jsonb_object_agg(e.key,e.value),'{}') into scores from jsonb_each(coalesce(item->case key when 'assessments' then 'scores' when 'reports' then 'releasedLearners' else 'entries' end,'{}')) e
            where public.can_access_school_learner(actor.school_id,e.key);
          item:=case key
            when 'assessments' then jsonb_build_object('id',item->>'id','class',item->>'class','subject',item->>'subject','title',item->>'title','scores',scores)
            when 'reports' then jsonb_build_object('id',item->>'id','class',item->>'class','term',item->>'term','status',item->>'status','releasedLearners',scores)
            else jsonb_build_object('class',item->>'class','date',item->>'date','entries',scores) end;
        end if;
      end if;
      items:=items||jsonb_build_array(item);
    end loop;
    result:=jsonb_set(result,array[key],items);
  end loop;
  -- Communications keep their dedicated services; they are not exposed here.
  return result||jsonb_build_object('__v',coalesce(workspace->'__v','13'));
end;
$$;

-- Replaces one permitted collection, never an arbitrary workspace envelope.
create function public.save_authorised_collection(p_collection text,p_records jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; workspace jsonb; permitted text[]; record jsonb; existing jsonb; records jsonb; key text;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null then raise exception 'Sign in required'; end if;
  permitted:=case actor.role
    when 'principal' then array['classes','learners','assessments','reports','visitors','incidents','staff','staffChangeRequests','security','sickNotices','appointments','attendanceRegisters','attendanceWeeks','reportRequests','teacherAssignments']
    when 'deputy' then array['classes','learners','assessments','reports','visitors','incidents','staff','staffChangeRequests','security','sickNotices','appointments','attendanceRegisters','attendanceWeeks','reportRequests','teacherAssignments']
    when 'clerk' then array['classes','learners','assessments','reports','staff','staffChangeRequests','sickNotices','appointments','attendanceRegisters','attendanceWeeks','reportRequests','teacherAssignments','visitors']
    when 'teacher' then array['assessments','attendanceRegisters','attendanceWeeks','reportRequests']
    when 'security' then array['visitors','incidents'] else array[]::text[] end;
  if p_collection is null or not p_collection=any(permitted) then raise exception 'Collection write access denied'; end if;
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Records must be an array'; end if;
  select payload into workspace from public.school_workspaces where school_id=actor.school_id for update;
  if workspace is null then raise exception 'School workspace unavailable'; end if;
  for record in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(record)<>'object' then raise exception 'Invalid record'; end if;
    if actor.role='teacher' then
      if not public.can_access_school_class(actor.school_id,record->>'class') then raise exception 'Class write access denied'; end if;
      if p_collection in ('assessments','attendanceRegisters') then
        key:=case p_collection when 'assessments' then 'scores' else 'entries' end;
        if jsonb_typeof(coalesce(record->key,'{}'))<>'object' or exists(select 1 from jsonb_object_keys(coalesce(record->key,'{}')) learner_id
          where not exists(select 1 from jsonb_array_elements(coalesce(workspace->'learners','[]')) l where l->>'id'=learner_id and l->>'class'=record->>'class')) then raise exception 'Learner write access denied'; end if;
      end if;
      if record->>'id' is not null and exists(select 1 from jsonb_array_elements(coalesce(workspace->p_collection,'[]')) old_record
        where old_record->>'id'=record->>'id' and not public.can_access_school_class(actor.school_id,old_record->>'class')) then raise exception 'Record write access denied'; end if;
    end if;
  end loop;
  records:=p_records;
  if actor.role='teacher' then
    select coalesce(jsonb_agg(value),'[]') into existing from jsonb_array_elements(coalesce(workspace->p_collection,'[]'))
      where not public.can_access_school_class(actor.school_id,value->>'class');
    records:=records||existing;
  end if;
  update public.school_workspaces set payload=jsonb_set(workspace,array[p_collection],records),updated_by=actor.id where school_id=actor.school_id;
  return public.get_authorised_workspace();
end;
$$;

revoke all on function public.can_access_school_class(uuid,text),public.can_access_school_learner(uuid,text),public.can_access_school_incident(uuid,text),public.can_access_school_notice(uuid,text),public.set_teacher_class_access(uuid,text,boolean),public.get_authorised_workspace(),public.save_authorised_collection(text,jsonb) from public,anon;
grant execute on function public.can_access_school_class(uuid,text),public.can_access_school_learner(uuid,text),public.can_access_school_incident(uuid,text),public.can_access_school_notice(uuid,text),public.set_teacher_class_access(uuid,text,boolean),public.get_authorised_workspace(),public.save_authorised_collection(text,jsonb) to authenticated;
