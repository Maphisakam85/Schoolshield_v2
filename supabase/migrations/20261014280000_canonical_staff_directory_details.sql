-- A durable school reference is distinct from an optional payroll/employee ID.
alter table public.school_staff add column staff_number bigint generated always as identity unique;
alter table public.school_staff add column staff_ref text generated always as ('STAFF-' || staff_number::text) stored;
create unique index school_staff_reference_unique on public.school_staff(staff_ref);
create function public.attach_school_staff_reference() returns trigger
language plpgsql set search_path=public as $$
begin
  if TG_OP='UPDATE' and new.staff_number is distinct from old.staff_number then
    raise exception 'School staff reference is immutable';
  end if;
  new.record:=new.record||jsonb_build_object('staffRef','STAFF-'||new.staff_number::text);
  return new;
end $$;
revoke all on function public.attach_school_staff_reference() from public,anon,authenticated;
create trigger attach_school_staff_reference before insert or update on public.school_staff
for each row execute function public.attach_school_staff_reference();
alter table public.school_staff disable trigger project_staff_change;
update public.school_staff set record=record||jsonb_build_object('staffRef',staff_ref);
alter table public.school_staff enable trigger project_staff_change;

alter function public.get_teacher_performance_directory(integer) rename to get_teacher_performance_directory_before_staff_details;
revoke all on function public.get_teacher_performance_directory_before_staff_details(integer) from public,anon,authenticated;
create function public.get_teacher_performance_directory(p_year integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  result:=get_teacher_performance_directory_before_staff_details(p_year);
  -- Use the actual UUID link. Never select a similarly named staff member.
  return jsonb_set(result,'{teachers}',coalesce((select jsonb_agg(t||jsonb_build_object(
    'staffId',s.id,'staffRef',s.staff_ref,'profileId',p.id,
    'employeeId',coalesce(nullif(btrim(p.employee_id),''),nullif(btrim(s.record->>'employeeId'),'')),
    'department',nullif(btrim(s.record->>'department'),''),
    'accountStatus',p.account_status,'staffRevision',s.revision
  ) order by p.display_name)
  from jsonb_array_elements(result->'teachers') t
  join profiles p on p.id::text=t->>'id' and p.school_id=current_school_id()
  left join school_staff s on s.profile_id=p.id and s.school_id=p.school_id),'[]'));
end $$;
revoke all on function public.get_teacher_performance_directory(integer) from public,anon;
grant execute on function public.get_teacher_performance_directory(integer) to authenticated;

create function public.save_teacher_staff_details(p_operation uuid,p_teacher uuid,p_revision integer,p_department text,p_employee_id text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant uuid:=current_school_id(); person profiles%rowtype; staff school_staff%rowtype;
  op school_record_operations%rowtype; request jsonb; previous jsonb; result jsonb; employee text:=nullif(btrim(p_employee_id),'');
begin
  if not can_manage_teacher_performance(tenant) then raise exception 'Teacher staff management access denied';end if;
  if p_operation is null or p_teacher is null or p_revision is null then raise exception 'Missing staff edit identity';end if;
  if length(btrim(coalesce(p_department,''))) not between 1 and 120 or length(coalesce(employee,''))>50 then raise exception 'Enter a department and a valid optional employee ID';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
  select * into person from profiles where id=p_teacher and school_id=tenant and role='teacher' for update;
  if person.id is null then raise exception 'Teacher is not in your school';end if;
  select * into staff from school_staff where school_id=tenant and profile_id=person.id for update;
  if staff.id is null then raise exception 'Link this account to its staff record in User Management first';end if;
  request:=jsonb_build_object('teacher',p_teacher,'revision',p_revision,'department',btrim(p_department),'employeeId',employee);
  select * into op from school_record_operations where id=p_operation;
  if found then
    if op.school_id<>tenant or op.actor_id<>auth.uid() or op.kind<>'teacher-details' or op.record_id<>staff.id or op.request is distinct from request then raise exception 'Operation belongs to another edit';end if;
    return op.result;
  end if;
  if staff.revision<>p_revision then raise exception 'Staff details changed. Reload before editing' using errcode='40001';end if;
  if employee is not null and (exists(select 1 from profiles where school_id=tenant and id<>person.id and employee_id=employee)
    or exists(select 1 from school_staff where school_id=tenant and id<>staff.id and record->>'employeeId'=employee)) then raise exception 'Employee ID is already assigned in this school';end if;
  previous:=jsonb_build_object('staff',to_jsonb(staff),'employeeId',person.employee_id);
  if person.employee_id is distinct from employee then
    update profiles set employee_id=employee,management_revision=management_revision+1 where id=person.id;
  end if;
  update school_staff set record=record||jsonb_build_object('department',btrim(p_department),'employeeId',employee)
  where id=staff.id and school_id=tenant returning to_jsonb(school_staff.*) into result;
  insert into school_record_audit(school_id,kind,record_id,previous_value,new_value,changed_by)
  values(tenant,'teacher-details',staff.id,previous,result,auth.uid());
  insert into school_record_operations(id,school_id,actor_id,kind,record_id,request,result)
  values(p_operation,tenant,auth.uid(),'teacher-details',staff.id,request,result);
  return result;
end $$;
revoke all on function public.save_teacher_staff_details(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.save_teacher_staff_details(uuid,uuid,integer,text,text) to authenticated;

update public.school_workspaces set payload=school_core_payload(school_id,payload),version=version+1;
