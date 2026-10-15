-- Real accounts: Auth identity is unique, profiles own school/role/status, and
-- all writes affecting trusted identity go through the admin backend.
alter table public.profiles add column first_name text not null default '';
alter table public.profiles add column last_name text not null default '';
alter table public.profiles add column email text;
alter table public.profiles add column employee_id text;
alter table public.profiles add column account_status text not null default 'Active' check(account_status in ('Active','Inactive'));
alter table public.profiles add column requires_setup boolean not null default false;
alter table public.profiles add column management_revision integer not null default 1;
update public.profiles p set email=lower(u.email),first_name=split_part(p.display_name,' ',1),last_name=btrim(substring(p.display_name from position(' ' in p.display_name)+1)) from auth.users u where u.id=p.id;
create unique index profiles_unique_auth_email on public.profiles(lower(email)) where email is not null;
create unique index profiles_school_employee_id on public.profiles(school_id,employee_id) where employee_id is not null;
revoke insert,update,delete on public.profiles from authenticated,anon;

create function public.account_is_active() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles where id=auth.uid() and account_status='Active')
$$;
create function public.account_is_ready() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles where id=auth.uid() and account_status='Active' and (not requires_setup or onboarding_completed_at is not null))
$$;
create or replace function public.current_school_id() returns uuid language sql stable security definer set search_path=public as $$
 select school_id from profiles where id=auth.uid() and account_status='Active' and (not requires_setup or onboarding_completed_at is not null)
$$;
create or replace function public.current_app_role() returns public.app_role language sql stable security definer set search_path=public as $$
 select role from profiles where id=auth.uid() and account_status='Active' and (not requires_setup or onboarding_completed_at is not null)
$$;
create or replace function public.can_manage_teacher_performance(p_school uuid) returns boolean language sql stable security definer set search_path=public as $$
 select account_is_ready() and exists(select 1 from profiles where id=auth.uid() and school_id=p_school and role in ('principal','deputy'))
$$;
create function public.assert_account_access() returns void language plpgsql stable security definer set search_path=public as $$
begin if not account_is_ready() then raise exception 'Account is inactive or setup is incomplete'; end if; end $$;
revoke all on function public.account_is_active(),public.account_is_ready(),public.assert_account_access() from public,anon;
grant execute on function public.account_is_active(),public.account_is_ready(),public.assert_account_access() to authenticated;

-- Restrictive policies also protect still-valid JWTs after an Auth ban. A
-- pending invited user may read its own profile for setup, nothing else.
do $$ declare t record; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity loop
  if t.relname='profiles' then
   execute 'create policy active_account_required on profiles as restrictive for all to authenticated using(account_is_active()) with check(account_is_ready())';
  else
   execute format('create policy active_account_required on public.%I as restrictive for all to authenticated using(public.account_is_ready()) with check(public.account_is_ready())',t.relname);
  end if;
 end loop;
end $$;
-- Storage policies may not use current_school_id (e.g. owner-only deletion).
do $$ begin
 if to_regclass('storage.objects') is not null then
  execute 'create policy active_schoolshield_account on storage.objects as restrictive for all to authenticated using(public.account_is_ready()) with check(public.account_is_ready())';
 end if;
end $$;

-- Protect existing privileged RPCs too: their definer can bypass table RLS.
-- Preserve signatures, defaults, return types and volatility; private bases
-- retain their implementation but cannot be invoked by a browser.
do $$ declare f record; private_name text; arguments text; invocation text; body text; result_type text; volatility text; begin
 for f in select p.*,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and p.prokind='f' and p.prorettype<>'trigger'::regtype
   and has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute')
   and p.proname not in ('current_school_id','current_app_role','account_is_active','account_is_ready','assert_account_access','can_manage_teacher_performance','complete_my_profile') loop
  private_name:='_um_'||f.oid::text||'_'||left(f.proname,35);
  arguments:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  select coalesce(string_agg('$'||i::text,',' order by i),'') into invocation from generate_series(1,f.pronargs) i;
  execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),private_name);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',private_name,pg_get_function_identity_arguments(f.oid));
  body:='begin perform public.assert_account_access(); ';
  if f.proretset then body:=body||format('return query select * from public.%I(%s);',private_name,invocation);
  elsif f.prorettype='void'::regtype then body:=body||format('perform public.%I(%s); return;',private_name,invocation);
  else body:=body||format('return public.%I(%s);',private_name,invocation); end if;
  body:=body||' end';volatility:=case f.provolatile when 's' then 'stable' when 'i' then 'stable' else 'volatile' end;
  execute format('create function public.%I(%s) returns %s language plpgsql %s security definer set search_path=public as %L',f.proname,arguments,result_type,volatility,body);
  execute format('revoke all on function public.%I(%s) from public,anon',f.proname,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
end $$;

create table public.user_management_operations (
 id uuid primary key,school_id uuid not null references schools(id),actor_id uuid not null references profiles(id),
 target_id uuid not null,action text not null check(action in ('create','edit','status','invite')),
 fields jsonb not null,previous_value jsonb,status text not null default 'Pending' check(status in ('Pending','Completed','Failed')),
 error text,created_at timestamptz not null default now(),completed_at timestamptz
);
create unique index one_pending_user_operation on public.user_management_operations(target_id) where status='Pending';
create table public.user_invitations (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references schools(id),user_id uuid not null references profiles(id),
 operation_id uuid not null unique,delivery text not null check(delivery in ('email','sms','setup_link')),
 status text not null check(status in ('Pending','Sent','Link generated','Failed','Accepted')),
 sent_at timestamptz,accepted_at timestamptz,provider_reference text,error text,created_at timestamptz not null default now()
);
create table public.user_management_audit (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references schools(id),user_id uuid not null references profiles(id),
 actor_id uuid not null references profiles(id),action text not null,previous_value jsonb,new_value jsonb,
 operation_id uuid,created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['user_management_operations','user_invitations','user_management_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy management_reads on public.%I for select to authenticated using(public.account_is_ready() and school_id=public.current_school_id() and public.current_app_role() in (''principal'',''deputy'',''clerk''))',t);
 end loop;
end $$;

create function public.assert_user_management(p_actor uuid,p_school uuid,p_old_role app_role,p_new_role app_role) returns void
language plpgsql stable security definer set search_path=public as $$
declare a profiles%rowtype;
begin
 select * into a from profiles where id=p_actor;
 if a.id is null or a.account_status<>'Active' or a.requires_setup and a.onboarding_completed_at is null or a.school_id is distinct from p_school or a.role not in ('principal','deputy','clerk') then raise exception 'User management access denied'; end if;
 if a.role<>'principal' and (p_old_role in ('principal','deputy','clerk') or p_new_role in ('principal','deputy','clerk')) then raise exception 'Only Principal may manage administrative roles'; end if;
end $$;
revoke all on function public.assert_user_management(uuid,uuid,app_role,app_role) from public,anon,authenticated;

create function public.begin_user_management(p_operation uuid,p_action text,p_target uuid,p_fields jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a profiles%rowtype;t profiles%rowtype;o user_management_operations%rowtype;requested_role app_role;desired_status text;
begin
 select * into a from profiles where id=auth.uid();
 perform assert_user_management(a.id,a.school_id,null,null);
 perform 1 from schools where id=a.school_id for update;
 update user_management_operations set status='Failed',error='Previous attempt timed out. Refresh and repair the retained account before resending.',completed_at=now()
 where school_id=a.school_id and status='Pending' and created_at<now()-interval '20 minutes';
 select * into o from user_management_operations where id=p_operation;
 if found then
  if o.actor_id<>a.id or o.school_id<>a.school_id or o.action<>p_action then raise exception 'Operation belongs to another request'; end if;
  return to_jsonb(o)||jsonb_build_object('replayed',true);
 end if;
 if p_action not in ('create','edit','status','invite') then raise exception 'Invalid management action'; end if;
 if nullif(p_fields->>'school_id','') is not null and p_fields->>'school_id'<>a.school_id::text then raise exception 'Cross-school user management denied'; end if;
 select * into t from profiles where id=p_target;
 if p_action='create' then
  if t.id is not null then raise exception 'An account already exists for this UUID'; end if;
 else
  if t.id is null or t.school_id<>a.school_id then raise exception 'User is not in your school'; end if;
  if p_action in ('edit','status') and coalesce((p_fields->>'revision')::integer,0)<>t.management_revision then raise exception 'User changed. Refresh before editing'; end if;
 end if;
 requested_role:=case when p_action in ('create','edit') then (p_fields->>'role')::app_role else t.role end;
 desired_status:=case when p_action in ('create','edit','status') then coalesce(p_fields->>'account_status','Active') else t.account_status end;
 perform assert_user_management(a.id,a.school_id,t.role,requested_role);
 if desired_status not in ('Active','Inactive') then raise exception 'Invalid account status'; end if;
 if p_action in ('create','edit') then
  if length(btrim(coalesce(p_fields->>'first_name',''))) not between 1 and 60 or length(btrim(coalesce(p_fields->>'last_name',''))) not between 1 and 60 or requested_role is null then raise exception 'First name, last name and role are required'; end if;
  if coalesce(p_fields->>'email','') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_fields->>'email')>254 then raise exception 'A valid email is required'; end if;
  if coalesce(p_fields->>'phone','') !~ '^\+27[6-8][0-9]{8}$' then raise exception 'A valid South African mobile number is required'; end if;
  if exists(select 1 from profiles where lower(email)=lower(p_fields->>'email') and id<>p_target) then raise exception 'An account already exists for this email'; end if;
  if length(coalesce(p_fields->>'employee_id',''))>50 then raise exception 'Employee ID is too long'; end if;
  if nullif(p_fields->>'employee_id','') is not null and exists(select 1 from profiles where school_id=a.school_id and employee_id=p_fields->>'employee_id' and id<>p_target) then raise exception 'Employee ID is already assigned in this school'; end if;
 end if;
 if nullif(p_fields->>'staff_id','') is not null then
  if a.role not in ('principal','deputy') then raise exception 'Only leadership may link an existing staff identity'; end if;
  if not exists(select 1 from school_staff where school_id=a.school_id and id=(p_fields->>'staff_id')::uuid and (profile_id is null or profile_id=p_target)) then raise exception 'Staff identity is not available in this school'; end if;
 end if;
 if p_fields ? 'learner_ids' and exists(select 1 from jsonb_array_elements_text(p_fields->'learner_ids') ref where not exists(select 1 from school_learners where school_id=a.school_id and id::text=ref)) then raise exception 'Learner is not in your school'; end if;
 if t.id=a.id and (requested_role<>t.role or desired_status<>t.account_status) then raise exception 'You cannot deactivate yourself or change your own role'; end if;
 if t.role='principal' and t.account_status='Active' and (desired_status='Inactive' or requested_role<>'principal') and not exists(select 1 from profiles where school_id=a.school_id and role='principal' and account_status='Active' and id<>t.id) then raise exception 'Preserve an active Principal'; end if;
 if p_action='invite' and (t.account_status<>'Active' or not t.requires_setup or t.onboarding_completed_at is not null) then raise exception 'Only active accounts awaiting setup can be invited'; end if;
 insert into user_management_operations(id,school_id,actor_id,target_id,action,fields,previous_value) values(p_operation,a.school_id,a.id,p_target,p_action,p_fields || jsonb_build_object('role',requested_role,'account_status',desired_status),to_jsonb(t)) returning * into o;
 -- Fail closed before banning or changing permissions in the external Auth API.
 if t.id is not null and (desired_status='Inactive' or requested_role<>t.role) then update profiles set account_status='Inactive' where id=t.id; end if;
 return to_jsonb(o);
end $$;

create function public.finish_user_management(p_operation uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o user_management_operations%rowtype;t profiles%rowtype;u record;body jsonb;previous jsonb;requested_role app_role;school_code text;guardian uuid;ref text;
begin
 select * into o from user_management_operations where id=p_operation for update;
 if o.id is null then raise exception 'Operation not found'; end if;
 if o.status='Completed' then return (select to_jsonb(p) from profiles p where id=o.target_id); end if;
 if o.status<>'Pending' then raise exception 'Operation is not pending'; end if;
 requested_role:=(o.fields->>'role')::app_role;
 select * into t from profiles where id=o.target_id;
 perform assert_user_management(o.actor_id,o.school_id,case when o.action='create' then null else t.role end,requested_role);
 select * into u from auth.users where id=o.target_id;
 select code into school_code from schools where id=o.school_id;
 if u.id is null or u.raw_app_meta_data->>'school_code' is distinct from school_code or u.raw_app_meta_data->>'role' is distinct from requested_role::text then raise exception 'Auth assignment has not been confirmed'; end if;
 if t.school_id is distinct from o.school_id then raise exception 'Profile is not in this school'; end if;
 if o.fields->>'account_status'='Active' and u.banned_until>now() or o.fields->>'account_status'='Inactive' and (u.banned_until is null or u.banned_until<=now()) then raise exception 'Auth activation status has not been confirmed'; end if;
 perform set_config('request.jwt.claim.sub',o.actor_id::text,true);
 previous:=coalesce(o.previous_value,to_jsonb(t));body:=o.fields;
 if o.action in ('create','edit','status') then
  update profiles set
   first_name=case when o.action in ('create','edit') then btrim(body->>'first_name') else first_name end,
   last_name=case when o.action in ('create','edit') then btrim(body->>'last_name') else last_name end,
   display_name=case when o.action in ('create','edit') then btrim(body->>'first_name')||' '||btrim(body->>'last_name') else display_name end,
   email=lower(u.email),phone=case when o.action in ('create','edit') then body->>'phone' else phone end,
   employee_id=case when o.action in ('create','edit') then nullif(btrim(body->>'employee_id'),'') else employee_id end,
   role=requested_role,account_status=body->>'account_status',management_revision=management_revision+1,
   requires_setup=case when o.action='create' then true else requires_setup end
  where id=o.target_id returning * into t;
 end if;
 if nullif(body->>'staff_id','') is not null then
  update school_staff set name=t.display_name where id=(body->>'staff_id')::uuid and school_id=o.school_id;
  perform link_school_staff_account((body->>'staff_id')::uuid,t.id);
 end if;
 if requested_role='parent' and body ? 'learner_ids' then
  insert into school_guardians(school_id,profile_id,name,phone) values(o.school_id,t.id,t.display_name,t.phone) on conflict(school_id,profile_id) do update set name=excluded.name,phone=excluded.phone returning id into guardian;
  for ref in select jsonb_array_elements_text(body->'learner_ids') loop
   insert into school_learner_guardians(school_id,learner_id,guardian_id) values(o.school_id,ref::uuid,guardian) on conflict do nothing;
  end loop;
 end if;
 insert into user_management_audit(school_id,user_id,actor_id,action,previous_value,new_value,operation_id) values(o.school_id,o.target_id,o.actor_id,o.action,previous,to_jsonb(t),o.id);
 update user_management_operations set status='Completed',completed_at=now() where id=o.id;
 return to_jsonb(t);
end $$;
create function public.fail_user_management(p_operation uuid,p_error text) returns void language sql security definer set search_path=public as $$
 update user_management_operations set status='Failed',error=left(p_error,400),completed_at=now() where id=p_operation and status='Pending'
$$;
revoke all on function public.begin_user_management(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.begin_user_management(uuid,text,uuid,jsonb) to authenticated;
revoke all on function public.finish_user_management(uuid),public.fail_user_management(uuid,text) from public,anon,authenticated;
grant execute on function public.finish_user_management(uuid),public.fail_user_management(uuid,text) to service_role;

create function public.list_school_users() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a profiles%rowtype;
begin
 select * into a from profiles where id=auth.uid();perform assert_user_management(a.id,a.school_id,null,null);
 return jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('invitation', (select to_jsonb(i) from user_invitations i where i.user_id=p.id order by i.created_at desc limit 1)) order by p.display_name) from profiles p where school_id=a.school_id),'[]'),
  'school',(select jsonb_build_object('id',id,'name',name,'code',code) from schools where id=a.school_id),
  'learners',coalesce((select jsonb_agg(jsonb_build_object('id',id,'legacy_ref',legacy_ref,'name',name)) from school_learners where school_id=a.school_id),'[]'),
  'staff',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from school_staff where school_id=a.school_id and profile_id is null),'[]'));
end $$;
revoke all on function public.list_school_users() from public,anon;
grant execute on function public.list_school_users() to authenticated;

-- Keep personal contact/setup information out of the school-wide directory.
create policy confidential_profile on public.profiles as restrictive for select to authenticated
using (id=auth.uid() or (school_id=current_school_id() and current_app_role() in ('principal','deputy','clerk')));
create function public.get_school_leadership() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'role',role) order by created_at,id),'[]')
 from profiles where school_id=current_school_id() and role='principal' and account_status='Active' and account_is_ready()
$$;
revoke all on function public.get_school_leadership() from public,anon;
grant execute on function public.get_school_leadership() to authenticated;

-- Auth is authoritative for login email. Client-editable user_metadata never
-- controls school, role, status, or profile membership.
create function public.sync_auth_login_email() returns trigger language plpgsql security definer set search_path=public as $$
begin update profiles set email=lower(new.email) where id=new.id;return new;end $$;
create trigger sync_auth_login_email after update of email on auth.users for each row execute function public.sync_auth_login_email();
create function public.initialize_managed_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
 select lower(email),case when raw_app_meta_data->>'onboarding_required'='true' then true else new.requires_setup end into new.email,new.requires_setup from auth.users where id=new.id;
 if new.requires_setup then new.account_status:='Inactive'; end if;
 return new;
end $$;
create trigger initialize_managed_profile before insert on public.profiles for each row execute function public.initialize_managed_profile();

create or replace function public.complete_my_profile(p_display_name text,p_phone text,p_address text default null,p_emergency_contact text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not account_is_active() then raise exception 'Account is inactive'; end if;
 if length(btrim(coalesce(p_display_name,''))) not between 2 and 120 or coalesce(p_phone,'') !~ '^\+27[6-8][0-9]{8}$' then raise exception 'Enter a full name and a valid mobile number'; end if;
 update profiles set
  first_name=case when display_name=p_display_name then first_name else split_part(btrim(p_display_name),' ',1) end,
  last_name=case when display_name=p_display_name then last_name else btrim(substring(btrim(p_display_name) from position(' ' in btrim(p_display_name))+1)) end,
  display_name=btrim(p_display_name),phone=p_phone,address=nullif(btrim(p_address),''),emergency_contact=nullif(btrim(p_emergency_contact),''),onboarding_completed_at=now(),requires_setup=false
 where id=auth.uid() and onboarding_completed_at is null;
 if not found then raise exception 'Account setup has already been completed'; end if;
 update user_invitations set status='Accepted',accepted_at=now() where user_id=auth.uid() and status in ('Sent','Link generated','Pending');
end $$;

create function public.sync_managed_personnel() returns trigger language plpgsql security definer set search_path=public as $$
declare w jsonb;k text;r jsonb;rows jsonb;field text;
begin
 update school_staff set name=new.display_name,record=record||jsonb_build_object('name',new.display_name,'phone',new.phone,'email',new.email,'employeeId',new.employee_id,'status',new.account_status,'role',case new.role when 'teacher' then 'Teacher' when 'security' then 'Security Officer' when 'clerk' then 'Clerk' when 'deputy' then 'Deputy Principal' when 'principal' then 'Principal' else new.role::text end) where school_id=new.school_id and profile_id=new.id;
 update school_guardians set name=new.display_name,phone=new.phone where school_id=new.school_id and profile_id=new.id;
 select payload into w from school_workspaces where school_id=new.school_id;
 if w is not null then
  for k in select jsonb_object_keys(w) loop
   if k in ('staff','classes','learners','security','grades','subjects','teacherAssignments') or jsonb_typeof(w->k)<>'array' then continue; end if;
   rows:='[]';
   for r in select value from jsonb_array_elements(w->k) loop
    foreach field in array array['author','reporter','recipient','requestedBy','submittedBy','reviewedBy','approvedBy','teacher','sgbMember','officer'] loop
     if r->>(field||'Id')=new.id::text then r:=r||jsonb_build_object(field,new.display_name); end if;
    end loop;
    rows:=rows||jsonb_build_array(r);
   end loop;
   w:=jsonb_set(w,array[k],rows);
  end loop;
  update school_workspaces set payload=w where school_id=new.school_id;
 end if;
 return new;
end $$;
create trigger sync_managed_personnel after update of display_name,email,phone,employee_id,role,account_status on public.profiles for each row execute function public.sync_managed_personnel();
revoke all on function public.sync_auth_login_email(),public.initialize_managed_profile(),public.sync_managed_personnel() from public,anon,authenticated;
