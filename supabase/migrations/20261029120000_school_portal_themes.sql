create table public.school_portal_themes (
 school_id uuid primary key references public.schools(id),
 primary_color text not null check(primary_color ~ '^#[0-9A-F]{6}$'),
 navigation_color text not null check(navigation_color ~ '^#[0-9A-F]{6}$'),
 revision integer not null default 1,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.school_portal_themes enable row level security;
revoke all on public.school_portal_themes from public,anon,authenticated;

create function public.school_theme_settings(p_school uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select to_jsonb(t) from public.school_portal_themes t where school_id=p_school),
 jsonb_build_object('school_id',p_school,'primary_color','#0A8F62','navigation_color','#082C36','revision',0))
$$;
create function public.platform_admin_theme(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.require_platform_administrator();
 if not exists(select 1 from public.schools where id=p_school) then raise exception 'School not found'; end if;
 return public.school_theme_settings(p_school);
end $$;
create function public.get_my_school_theme() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare tenant uuid:=public.current_school_id(); begin
 perform public.assert_account_access();
 if tenant is null then raise exception 'School access denied' using errcode='42501'; end if;
 return public.school_theme_settings(tenant);
end $$;
create function public.save_platform_school_theme(p_school uuid,p_revision integer,p_primary text,p_navigation text,p_operation uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous jsonb; result jsonb; prior public.platform_admin_audit%rowtype;
 primary_hex text:=upper(btrim(p_primary)); navigation_hex text:=upper(btrim(p_navigation)); reason_text text:=btrim(p_reason);
begin
 perform public.require_platform_administrator();
 if p_operation is null or primary_hex is null or primary_hex !~ '^#[0-9A-F]{6}$'
 or navigation_hex is null or navigation_hex !~ '^#[0-9A-F]{6}$'
 or reason_text is null or length(reason_text) not between 5 and 500 then raise exception 'Valid colours, operation and reason are required'; end if;
 perform 1 from public.schools where id=p_school for update;
 if not found then raise exception 'School not found'; end if;
 select * into prior from public.platform_admin_audit where actor_id=auth.uid() and operation_id=p_operation;
 if found then
  if prior.action<>'school_theme_saved' or prior.school_id is distinct from p_school or prior.reason is distinct from reason_text
  or prior.new_value->>'primary_color' is distinct from primary_hex or prior.new_value->>'navigation_color' is distinct from navigation_hex
  or (prior.previous_value->>'revision')::integer is distinct from p_revision then raise exception 'Operation belongs to another request'; end if;
  return prior.new_value;
 end if;
 previous:=public.school_theme_settings(p_school);
 if p_revision is distinct from (previous->>'revision')::integer then raise exception 'Colours changed. Refresh before saving.' using errcode='40001'; end if;
 insert into public.school_portal_themes(school_id,primary_color,navigation_color,revision,updated_by)
 values(p_school,primary_hex,navigation_hex,p_revision+1,auth.uid())
 on conflict(school_id) do update set primary_color=excluded.primary_color,navigation_color=excluded.navigation_color,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 result:=public.school_theme_settings(p_school);
 insert into public.platform_admin_audit(actor_id,action,school_id,target_id,operation_id,previous_value,new_value,reason)
 values(auth.uid(),'school_theme_saved',p_school,p_school,p_operation,previous,result,reason_text);
 return result;
end $$;
revoke all on function public.school_theme_settings(uuid),public.platform_admin_theme(uuid),public.get_my_school_theme(),public.save_platform_school_theme(uuid,integer,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.platform_admin_theme(uuid),public.get_my_school_theme(),public.save_platform_school_theme(uuid,integer,text,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
