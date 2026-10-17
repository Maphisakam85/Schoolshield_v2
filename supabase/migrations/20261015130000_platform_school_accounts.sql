create table public.platform_account_operations(id uuid primary key,actor_id uuid not null,school_id uuid not null references schools(id),target_id uuid not null,action text not null,fields jsonb not null,previous_value jsonb,reason text not null,status text not null default 'Pending',profile_committed boolean not null default false,lease_until timestamptz,last_error text,created_at timestamptz not null default now());
alter table public.platform_account_operations enable row level security;
revoke all on public.platform_account_operations from public,anon,authenticated;
create function public.platform_admin_accounts(p_school uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform require_platform_administrator();if not exists(select 1 from schools where id=p_school) then raise exception 'School not found';end if;
 return jsonb_build_object('school_id',p_school,'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'school_id',p.school_id,'first_name',p.first_name,'last_name',p.last_name,'display_name',p.display_name,'email',p.email,'phone',p.phone,'employee_id',p.employee_id,'role',p.role,'account_status',p.account_status,'management_revision',p.management_revision,'requires_setup',p.requires_setup,'onboarding_completed_at',p.onboarding_completed_at,'invitation',(select to_jsonb(i) from user_invitations i where i.user_id=p.id order by i.created_at desc limit 1),'pending_operation',(select jsonb_build_object('id',o.id,'action',o.action,'status',o.status,'error',o.last_error,'fields',o.fields,'reason',o.reason) from platform_account_operations o where o.target_id=p.id and o.school_id=p_school and o.status<>'Completed' order by o.created_at desc limit 1)) order by p.display_name) from profiles p where p.school_id=p_school),'[]'),'operations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'actor_id',o.actor_id,'target_id',o.target_id,'action',o.action,'fields',o.fields,'reason',o.reason,'error',o.last_error) order by o.created_at) from platform_account_operations o where o.school_id=p_school and o.status<>'Completed'),'[]'));
end $$;
create function public.begin_platform_account(p_actor uuid,p_school uuid,p_operation uuid,p_action text,p_target uuid,p_fields jsonb,p_confirm boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o platform_account_operations%rowtype;t profiles%rowtype;desired_role app_role;desired_status text;fields jsonb;begin
 if not platform_administrator_allowed(p_actor) then raise exception 'Platform access denied' using errcode='42501';end if;
 if p_operation is null or p_action not in ('create','edit','status','invite','reset') or length(btrim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Valid action, operation and reason required';end if;
 if p_fields ? 'learner_ids' or p_fields ? 'staff_id' then raise exception 'Teaching and family relationships are not editable here';end if;
 if nullif(p_fields->>'school_id','') is not null and p_fields->>'school_id'<>p_school::text then raise exception 'Cross-school account management denied';end if;
 perform 1 from schools where id=p_school for update;if not found then raise exception 'School not found';end if;
 if exists(select 1 from platform_administrators where user_id=p_target) then raise exception 'Platform administrator identities are managed separately, not through school accounts';end if;
 select * into o from platform_account_operations where id=p_operation;
 if found then
  if o.actor_id<>p_actor or o.school_id<>p_school or o.action<>p_action or o.reason<>p_reason or (p_action<>'create' and o.target_id<>p_target)
   or (o.fields-array['role','account_status']) is distinct from (p_fields-array['role','account_status'])
   or (p_action in ('create','edit') and o.fields->>'role' is distinct from p_fields->>'role')
   or (p_action in ('create','edit','status') and o.fields->>'account_status' is distinct from p_fields->>'account_status') then raise exception 'Operation belongs to another school or request';end if;
  if o.status='Completed' then return to_jsonb(o);end if;
  if o.status='Pending' and o.lease_until>now() then return to_jsonb(o)||'{"replayed":true}'::jsonb;end if;
  update platform_account_operations set status='Pending',lease_until=now()+interval '60 seconds',last_error=null where id=o.id returning * into o;
  return to_jsonb(o)||jsonb_build_object('resume_auth',true);
 end if;
 if exists(select 1 from user_management_operations where id=p_operation) or exists(select 1 from user_invitations where operation_id=p_operation) then raise exception 'Operation UUID belongs to another management request';end if;
 select * into t from profiles where id=p_target;
 if exists(select 1 from user_management_operations where school_id=p_school and target_id=p_target and status='Pending') then raise exception 'A school administrator already has an incomplete operation for this account';end if;
 if p_action='create' then if t.id is not null then raise exception 'Auth identity already has a profile';end if;
 else
  if t.id is null or t.school_id<>p_school then raise exception 'User is not in the selected school';end if;
  if p_action in ('edit','status') and coalesce((p_fields->>'revision')::integer,0)<>t.management_revision then raise exception 'User changed. Refresh before editing';end if;
 end if;
 if exists(select 1 from platform_account_operations where target_id=p_target and school_id=p_school and status<>'Completed') then raise exception 'Repair the existing incomplete account operation before making another change';end if;
 desired_role:=case when p_action in ('create','edit') then (p_fields->>'role')::app_role else t.role end;
 desired_status:=case when p_action in ('create','edit','status') then p_fields->>'account_status' else t.account_status end;
 if desired_role is null or desired_status is null or desired_status not in ('Active','Inactive') then raise exception 'Select a school role and status';end if;
 if p_action='create' or p_action in ('status','invite','reset') or desired_role is distinct from t.role or desired_status is distinct from t.account_status then
  if p_confirm is distinct from true then raise exception 'Confirm this account access change';end if;
 end if;
 if t.role='principal' and t.account_status='Active' and (desired_role<>'principal' or desired_status<>'Active')
 and not exists(select 1 from profiles where school_id=p_school and id<>t.id and role='principal' and account_status='Active') then raise exception 'Preserve the last active Principal';end if;
 if p_action in ('create','edit') then
  if length(btrim(coalesce(p_fields->>'first_name',''))) not between 1 and 60 or length(btrim(coalesce(p_fields->>'last_name',''))) not between 1 and 60
   or coalesce(p_fields->>'email','') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_fields->>'email')>254
   or coalesce(p_fields->>'phone','') !~ '^\+27[6-8][0-9]{8}$' or length(coalesce(p_fields->>'employee_id',''))>50 then raise exception 'Valid identity/contact fields are required';end if;
  if exists(select 1 from profiles where lower(email)=lower(p_fields->>'email') and id<>p_target) then raise exception 'Email already belongs to an account';end if;
  if nullif(p_fields->>'employee_id','') is not null and exists(select 1 from school_staff where school_id=p_school and profile_id is distinct from p_target and record->>'employeeId'=p_fields->>'employee_id') then raise exception 'Existing staff identity uses this employee ID. Link it in the school portal';end if;
 end if;
 if p_action='invite' and (t.account_status<>'Active' or not t.requires_setup or t.onboarding_completed_at is not null) then raise exception 'Only active accounts awaiting setup can be invited';end if;
 if p_action='reset' and (t.account_status<>'Active' or t.requires_setup or t.onboarding_completed_at is null) then raise exception 'Password reset requires an active completed account';end if;
 fields:=p_fields||jsonb_build_object('role',desired_role,'account_status',desired_status,'school_id',p_school);
 insert into platform_account_operations(id,actor_id,school_id,target_id,action,fields,previous_value,reason,lease_until)
 values(p_operation,p_actor,p_school,p_target,p_action,fields,to_jsonb(t),p_reason,now()+interval '60 seconds') returning * into o;
 if t.id is not null and (desired_status='Inactive' or desired_role<>t.role) then update profiles set account_status='Inactive' where id=t.id;end if;
 insert into platform_admin_audit(actor_id,action,school_id,target_id,previous_value,new_value,reason) values(p_actor,'account_change_requested',p_school,p_target,to_jsonb(t),jsonb_build_object('action',p_action,'role',desired_role,'status',desired_status),p_reason);
 return to_jsonb(o);
end $$;
create function public.finish_platform_account(p_actor uuid,p_operation uuid,p_prepare_only boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o platform_account_operations%rowtype;t profiles%rowtype;u record;code text;begin
 if not platform_administrator_allowed(p_actor) then raise exception 'Platform access denied' using errcode='42501';end if;
 select * into o from platform_account_operations where id=p_operation for update;if not found or o.actor_id<>p_actor then raise exception 'Operation not found';end if;
 select * into u from auth.users where id=o.target_id;select s.code into code from schools s where s.id=o.school_id;
 if u.id is null or u.raw_app_meta_data->>'school_code' is distinct from code or u.raw_app_meta_data->>'role' is distinct from o.fields->>'role' then raise exception 'Auth assignment not confirmed';end if;
 if o.action='create' then
  if lower(u.email) is distinct from lower(o.fields->>'email') then raise exception 'Reserved Auth email does not match';end if;
  insert into profiles(id,school_id,role,display_name,first_name,last_name,email,phone,requires_setup,account_status)
  values(o.target_id,o.school_id,(o.fields->>'role')::app_role,(o.fields->>'first_name')||' '||(o.fields->>'last_name'),o.fields->>'first_name',o.fields->>'last_name',lower(u.email),o.fields->>'phone',true,'Inactive') on conflict(id) do nothing;
 end if;
 select * into t from profiles where id=o.target_id;if t.id is null or t.school_id<>o.school_id then raise exception 'Profile is not in selected school';end if;
 if p_prepare_only or o.profile_committed then return to_jsonb(t);end if;
 if o.action in ('edit','status') and t.management_revision is distinct from (o.fields->>'revision')::integer then raise exception 'Account changed during this operation; operator review is required';end if;
 if o.fields->>'account_status'='Active' and u.banned_until>now() or o.fields->>'account_status'='Inactive' and coalesce(u.banned_until,now())<=now() then raise exception 'Auth activation state not confirmed';end if;
 if o.action in ('create','edit','status') then
  if o.action in ('create','edit') and lower(u.email) is distinct from lower(o.fields->>'email') then raise exception 'Auth email change not confirmed';end if;
  update profiles set first_name=case when o.action in ('create','edit') then o.fields->>'first_name' else first_name end,
   last_name=case when o.action in ('create','edit') then o.fields->>'last_name' else last_name end,
   display_name=case when o.action in ('create','edit') then (o.fields->>'first_name')||' '||(o.fields->>'last_name') else display_name end,
   email=lower(u.email),phone=case when o.action in ('create','edit') then o.fields->>'phone' else phone end,
   employee_id=case when o.action in ('create','edit') then nullif(o.fields->>'employee_id','') else employee_id end,
   role=(o.fields->>'role')::app_role,account_status=o.fields->>'account_status',management_revision=management_revision+1,
   requires_setup=case when o.action='create' then true else requires_setup end where id=o.target_id returning * into t;
 end if;
 update platform_account_operations set profile_committed=true where id=o.id;
 insert into platform_admin_audit(actor_id,action,school_id,target_id,previous_value,new_value,reason) values(p_actor,'account_'||o.action,o.school_id,o.target_id,o.previous_value,to_jsonb(t),o.reason);
 return to_jsonb(t);
end $$;
create function public.platform_account_result(p_actor uuid,p_operation uuid,p_success boolean,p_error text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare o platform_account_operations%rowtype;begin
 if not platform_administrator_allowed(p_actor) then raise exception 'Platform access denied';end if;
 select * into o from platform_account_operations where id=p_operation for update;if not found or o.actor_id<>p_actor then raise exception 'Operation not found';end if;
 if o.status='Completed' then return;end if;
 if p_success and not o.profile_committed then raise exception 'Profile persistence is unconfirmed';end if;
 update platform_account_operations set status=case when p_success then 'Completed' else 'Failed' end,lease_until=null,last_error=case when p_success then null else left(p_error,500) end where id=o.id;
 insert into platform_admin_audit(actor_id,action,school_id,target_id,new_value,reason)
 values(p_actor,case when p_success then 'account_operation_completed' else 'account_operation_failed' end,o.school_id,o.target_id,
 (select jsonb_build_object('delivery',delivery,'status',status,'error',error) from user_invitations where operation_id=o.id),o.reason);
end $$;
revoke all on function public.platform_admin_accounts(uuid),public.begin_platform_account(uuid,uuid,uuid,text,uuid,jsonb,boolean,text),public.finish_platform_account(uuid,uuid,boolean),public.platform_account_result(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.platform_admin_accounts(uuid) to authenticated;
grant execute on function public.begin_platform_account(uuid,uuid,uuid,text,uuid,jsonb,boolean,text),public.finish_platform_account(uuid,uuid,boolean),public.platform_account_result(uuid,uuid,boolean,text) to service_role;

create function public.platform_identity_protected(p_target uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from platform_administrators where user_id=p_target)
$$;
revoke all on function public.platform_identity_protected(uuid) from public,anon,authenticated;
grant execute on function public.platform_identity_protected(uuid) to service_role;
create function public.guard_platform_identity_bootstrap() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.active and (exists(select 1 from user_management_operations where target_id=new.user_id and status='Pending') or exists(select 1 from platform_account_operations where target_id=new.user_id and status<>'Completed')) then raise exception 'Finish pending account changes before granting platform access';end if;
 return new;
end $$;
revoke all on function public.guard_platform_identity_bootstrap() from public,anon,authenticated;
create trigger platform_admin_pending_operations_guard before insert or update on platform_administrators for each row execute function public.guard_platform_identity_bootstrap();

-- Keep existing school workflows; serialize them with unfinished platform changes.
alter function public.begin_user_management(uuid,text,uuid,jsonb) rename to begin_user_management_platform_base;
revoke all on function public.begin_user_management_platform_base(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.begin_user_management(p_operation uuid,p_action text,p_target uuid,p_fields jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform assert_account_access();perform 1 from schools where id=current_school_id() for update;
 if exists(select 1 from platform_administrators where user_id=p_target) then raise exception 'Platform administrator identities are managed separately';end if;
 if exists(select 1 from platform_account_operations where id=p_operation) then raise exception 'Operation UUID belongs to platform administration';end if;
 if exists(select 1 from platform_account_operations where target_id=p_target and school_id=current_school_id() and status<>'Completed') then raise exception 'Platform account repair is pending; complete it before another school edit';end if;
 return begin_user_management_platform_base(p_operation,p_action,p_target,p_fields);
end $$;
revoke all on function public.begin_user_management(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.begin_user_management(uuid,text,uuid,jsonb) to authenticated;
