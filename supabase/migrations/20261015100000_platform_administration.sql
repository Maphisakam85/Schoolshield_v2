-- Platform ownership is independent of app_role/profiles and school membership.
-- Bootstrap only from the trusted SQL console using a verified Auth UUID.
create table public.platform_administrators (
 user_id uuid primary key references auth.users(id) on delete restrict,
 active boolean not null default true,
 reason text not null check(length(btrim(reason)) between 5 and 500),
 created_at timestamptz not null default now()
);
create table public.platform_admin_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid,
 database_actor text not null default session_user,
 action text not null,
 school_id uuid,
 target_id uuid,
 operation_id uuid,
 previous_value jsonb,
 new_value jsonb,
 reason text not null,
 created_at timestamptz not null default now(),
 unique(actor_id,operation_id)
);
create index platform_admin_audit_recent on public.platform_admin_audit(created_at desc,id);
alter table public.platform_administrators enable row level security;
alter table public.platform_admin_audit enable row level security;
revoke all on public.platform_administrators,public.platform_admin_audit from public,anon,authenticated;

create function public.platform_administrator_allowed(p_user uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.platform_administrators a join auth.users u on u.id=a.user_id
 where a.user_id=p_user and a.active and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until<=now()) and u.deleted_at is null)
$$;
create function public.is_platform_administrator() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select public.platform_administrator_allowed(auth.uid())$$;
create function public.require_platform_administrator() returns void
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.is_platform_administrator() then
  raise exception 'Platform administrator access denied' using errcode='42501';
 end if;
end $$;
grant select on public.platform_administrators,public.platform_admin_audit to authenticated;
create policy platform_administrators_read on public.platform_administrators for select to authenticated using(public.is_platform_administrator());
create policy platform_audit_read on public.platform_admin_audit for select to authenticated using(public.is_platform_administrator());

create function public.audit_platform_administrator_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Deactivate platform administrators; retain their history'; end if;
 if not exists(select 1 from auth.users where id=new.user_id and email_confirmed_at is not null and deleted_at is null) then
  raise exception 'A verified Auth user UUID is required';
 end if;
 if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'Administrator identity is immutable'; end if;
 insert into public.platform_admin_audit(actor_id,action,target_id,previous_value,new_value,reason)
 values(auth.uid(),case when tg_op='INSERT' then 'administrator_granted' else 'administrator_updated' end,
 new.user_id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),new.reason);
 return new;
end $$;
create trigger platform_administrator_history before insert or update or delete on public.platform_administrators
 for each row execute function public.audit_platform_administrator_change();
create function public.keep_platform_audit_immutable() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'Platform audit history is append-only'; end $$;
create trigger platform_audit_immutable before update or delete on public.platform_admin_audit
 for each row execute function public.keep_platform_audit_immutable();

create function public.platform_admin_context() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.require_platform_administrator();
 return (select jsonb_build_object('user_id',u.id,'email',u.email) from auth.users u where u.id=auth.uid());
end $$;
create function public.platform_admin_directory() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare schools_json jsonb; audit_json jsonb;
begin
 perform public.require_platform_administrator();
 -- Explicit metadata projection: no workspace payload, learners or academic joins.
 select coalesce(jsonb_agg(to_jsonb(s) order by s.name,s.id),'[]') into schools_json
 from (select id,code,name,data_mode,created_at from public.schools) s;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id),'[]') into audit_json
 from (select id,actor_id,database_actor,action,school_id,target_id,previous_value,new_value,reason,created_at
 from public.platform_admin_audit order by created_at desc,id limit 100) a;
 return jsonb_build_object('schools',schools_json,'audit',audit_json);
end $$;
create function public.open_platform_admin_portal(p_operation uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.require_platform_administrator();
 if p_operation is null then raise exception 'Operation ID is required'; end if;
 if exists(select 1 from public.platform_admin_audit where actor_id=auth.uid() and operation_id=p_operation and action<>'portal_opened') then
  raise exception 'Operation belongs to another action';
 end if;
 insert into public.platform_admin_audit(actor_id,action,operation_id,reason)
 values(auth.uid(),'portal_opened',p_operation,'Authenticated platform portal access') on conflict(actor_id,operation_id) do nothing;
end $$;

revoke all on function public.platform_administrator_allowed(uuid),public.is_platform_administrator(),public.require_platform_administrator(),public.audit_platform_administrator_change(),public.keep_platform_audit_immutable(),public.platform_admin_context(),public.platform_admin_directory(),public.open_platform_admin_portal(uuid) from public,anon,authenticated;
grant execute on function public.is_platform_administrator(),public.platform_admin_context(),public.platform_admin_directory(),public.open_platform_admin_portal(uuid) to authenticated;
-- No new grant on schools, profiles, workspaces, Storage or academic tables.
