-- Explicit compatibility: established schools remain active with both modules on.
alter table public.schools add column lifecycle_status text not null default 'active'
 check(lifecycle_status in ('onboarding','pilot','active','suspended'));
alter table public.schools alter column lifecycle_status set default 'onboarding';
alter table public.schools add column enabled_features jsonb not null default '{"announcements":true,"appointments":true}'
 check(jsonb_typeof(enabled_features)='object' and enabled_features ?& array['announcements','appointments']
 and (enabled_features-array['announcements','appointments'])='{}' and jsonb_typeof(enabled_features->'announcements')='boolean' and jsonb_typeof(enabled_features->'appointments')='boolean');

create function public.school_access_enabled(p_school uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from schools where id=p_school and lifecycle_status<>'suspended')
$$;
create or replace function public.account_is_active() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles where id=auth.uid() and account_status='Active' and school_access_enabled(school_id))
$$;
create or replace function public.account_is_ready() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles where id=auth.uid() and account_status='Active' and (not requires_setup or onboarding_completed_at is not null) and school_access_enabled(school_id))
$$;
create or replace function public.current_school_id() returns uuid language sql stable security definer set search_path=public,pg_temp as $$
 select school_id from profiles where id=auth.uid() and account_is_ready()
$$;
create or replace function public.current_app_role() returns public.app_role language sql stable security definer set search_path=public,pg_temp as $$
 select role from profiles where id=auth.uid() and account_is_ready()
$$;
create or replace function public.assert_account_access() returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
begin if not account_is_ready() then raise exception 'School access is suspended, account is inactive, or setup is incomplete' using errcode='42501'; end if; end $$;
create function public.school_feature_enabled(p_feature text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select account_is_ready() and coalesce((select (enabled_features->>p_feature)::boolean from schools where id=current_school_id()),false)
$$;
create function public.get_my_school_access() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform assert_account_access();
 return (select jsonb_build_object('school_id',id,'status',lifecycle_status,'features',enabled_features) from schools where id=current_school_id());
end $$;

-- Private bases cannot be invoked directly. The canonical dataset preserves
-- disabled collections at rest while omitting them from ordinary projections.
alter function public.read_school_dataset() rename to read_school_dataset_lifecycle_base;
revoke all on function public.read_school_dataset_lifecycle_base() from public,anon,authenticated;
create function public.read_school_dataset() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; k text;
begin
 perform assert_account_access(); result:=read_school_dataset_lifecycle_base();
 foreach k in array array['announcements','appointments'] loop
  if not school_feature_enabled(k) then result:=jsonb_set(result,array['payload',k],'[]'); end if;
 end loop;
 if not school_feature_enabled('announcements') then
  result:=jsonb_set(result,'{payload,notifications}',coalesce((select jsonb_agg(n) from jsonb_array_elements(coalesce(result->'payload'->'notifications','[]')) n where n->>'announcementId' is null and lower(coalesce(n->>'type','')) not like '%announcement%'),'[]'));
 end if;
 return result;
end $$;
alter function public.save_school_dataset(jsonb,jsonb) rename to save_school_dataset_lifecycle_base;
revoke all on function public.save_school_dataset_lifecycle_base(jsonb,jsonb) from public,anon,authenticated;
create function public.save_school_dataset(p_before jsonb,p_after jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare k text;
begin
 perform assert_account_access();
 foreach k in array array['announcements','appointments'] loop
  if not school_feature_enabled(k) and p_before->k is distinct from p_after->k then raise exception 'Module disabled: %',k using errcode='42501'; end if;
 end loop;
 return save_school_dataset_lifecycle_base(p_before,p_after);
end $$;
alter function public.publish_school_announcement(text,text,text,text,text,text,integer,text) rename to publish_school_announcement_lifecycle_base;
revoke all on function public.publish_school_announcement_lifecycle_base(text,text,text,text,text,text,integer,text) from public,anon,authenticated;
create function public.publish_school_announcement(p_id text,p_title text,p_body text,p_audience_id text,p_audience text,p_delivery text,p_recipients integer default 0,p_action text default 'create') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not school_feature_enabled('announcements') then raise exception 'Announcements disabled or school access denied' using errcode='42501'; end if;
 return publish_school_announcement_lifecycle_base(p_id,p_title,p_body,p_audience_id,p_audience,p_delivery,p_recipients,p_action);
end $$;
-- Raw JSON cannot be safely projected with RLS: require the role-projected RPC
-- whenever a collection is disabled. No records are deleted or rewritten.
create policy enabled_workspace_projection on public.school_workspaces as restrictive for all to authenticated
 using(account_is_ready() and school_feature_enabled('announcements') and school_feature_enabled('appointments'))
 with check(account_is_ready() and school_feature_enabled('announcements') and school_feature_enabled('appointments'));
-- Existing owner recovery must work even when their school is suspended or absent.
drop policy if exists active_schoolshield_account on storage.objects;
create policy active_schoolshield_account on storage.objects as restrictive for all to authenticated
 using(account_is_ready() or (bucket_id='school-branding' and is_platform_administrator()))
 with check(account_is_ready());

create function public.platform_admin_school_access(p_school uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform require_platform_administrator();
 return (select jsonb_build_object('school_id',id,'status',lifecycle_status,'features',enabled_features,'revision',platform_revision) from schools where id=p_school);
end $$;
create function public.platform_admin_set_school_access(p_school uuid,p_revision integer,p_status text,p_features jsonb,p_reason text,p_operation uuid,p_confirm boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare old schools%rowtype; previous platform_admin_audit%rowtype;
begin
 perform require_platform_administrator();
 if not coalesce(p_confirm,false) or p_operation is null or length(btrim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Confirm the access change and provide a reason'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_operation::text,0));
 select * into previous from platform_admin_audit where actor_id=auth.uid() and operation_id=p_operation;
 if found then
  if previous.school_id is distinct from p_school or previous.action<>'school_access_changed' or previous.new_value->>'status' is distinct from p_status or previous.new_value->'features' is distinct from p_features or previous.reason is distinct from p_reason then raise exception 'Operation reference already used'; end if;
  return platform_admin_school_access(p_school);
 end if;
 select * into old from schools where id=p_school for update;
 if not found then raise exception 'School not found'; end if;
 if old.platform_revision<>p_revision then raise exception 'School changed; refresh before retrying' using errcode='40001'; end if;
 if p_status is null or p_status not in ('onboarding','pilot','active','suspended') or p_features is null or jsonb_typeof(p_features)<>'object'
 or not p_features ?& array['announcements','appointments'] or (p_features-array['announcements','appointments'])<>'{}'
 or jsonb_typeof(p_features->'announcements')<>'boolean' or jsonb_typeof(p_features->'appointments')<>'boolean' then raise exception 'Unsupported lifecycle or feature controls'; end if;
 -- Neither switch disables notifications/authentication, which remain required.
 -- Future switches must explicitly validate their dependencies here first.
 update schools set lifecycle_status=p_status,enabled_features=p_features,platform_revision=platform_revision+1 where id=p_school;
 insert into platform_admin_audit(actor_id,school_id,target_id,action,operation_id,previous_value,new_value,reason)
 values(auth.uid(),p_school,p_school,'school_access_changed',p_operation,jsonb_build_object('status',old.lifecycle_status,'features',old.enabled_features),jsonb_build_object('status',p_status,'features',p_features),p_reason);
 return platform_admin_school_access(p_school);
end $$;
revoke all on function public.school_access_enabled(uuid),public.school_feature_enabled(text),public.get_my_school_access(),public.platform_admin_school_access(uuid),public.platform_admin_set_school_access(uuid,integer,text,jsonb,text,uuid,boolean),public.read_school_dataset(),public.save_school_dataset(jsonb,jsonb),public.publish_school_announcement(text,text,text,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.school_feature_enabled(text),public.get_my_school_access(),public.platform_admin_school_access(uuid),public.platform_admin_set_school_access(uuid,integer,text,jsonb,text,uuid,boolean),public.read_school_dataset(),public.save_school_dataset(jsonb,jsonb),public.publish_school_announcement(text,text,text,text,text,text,integer,text) to authenticated;

-- Cover school tables added after the earlier inactive-account policy sweep.
do $$ declare t record;begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname not like 'platform_%'
 and c.relname<>'school_branding' and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='school_id' and not a.attisdropped) loop
  execute format('create policy lifecycle_school_required on public.%I as restrictive for all to authenticated using(public.school_access_enabled(school_id)) with check(public.school_access_enabled(school_id))',t.relname);
 end loop;
end $$;
-- RLS policy helpers need execute permission; this discloses only availability,
-- never a school record or platform permission.
grant execute on function public.school_access_enabled(uuid) to authenticated;

-- Definer functions bypass RLS. Guard every browser-callable school RPC,
-- including later additions, while explicitly preserving platform recovery.
do $$ declare f record;private_name text;arguments text;invocation text;body text;result_type text;volatility text;begin
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef and p.prokind='f' and p.prorettype<>'trigger'::regtype
 and has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute')
 and p.proname not like 'platform_%' and p.proname not in ('is_platform_administrator','require_platform_administrator','current_school_id','current_app_role','account_is_active','account_is_ready','assert_account_access','school_access_enabled','school_feature_enabled','can_read_school_branding','can_read_school_logo') loop
  private_name:='_lc_'||f.oid::text||'_'||left(f.proname,35);
  arguments:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  select coalesce(string_agg('$'||i::text,',' order by i),'') into invocation from generate_series(1,f.pronargs) i;
  execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),private_name);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',private_name,pg_get_function_identity_arguments(f.oid));
  body:=case when f.proname='complete_my_profile' then 'begin if not public.account_is_active() then raise exception ''School access is suspended or account is inactive''; end if; ' else 'begin perform public.assert_account_access(); ' end;
  if f.proname in ('get_authorised_workspace','save_authorised_collection') then
   body:=body||'if not public.school_feature_enabled(''announcements'') or not public.school_feature_enabled(''appointments'') then raise exception ''Use the canonical dataset API while modules are disabled'' using errcode=''42501''; end if; ';
  end if;
  if f.proretset then body:=body||format('return query select * from public.%I(%s);',private_name,invocation);
  elsif f.prorettype='void'::regtype then body:=body||format('perform public.%I(%s); return;',private_name,invocation);
  else body:=body||format('return public.%I(%s);',private_name,invocation);end if;
  body:=body||' end';volatility:=case when f.provolatile='v' then 'volatile' else 'stable' end;
  execute format('create function public.%I(%s) returns %s language plpgsql %s security definer set search_path=public,pg_temp as %L',f.proname,arguments,result_type,volatility,body);
  execute format('revoke all on function public.%I(%s) from public,anon',f.proname,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
end $$;
