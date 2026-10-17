insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('school-branding','school-branding',false,8388608,array['image/png'])
on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['image/png'];
create table public.school_branding(school_id uuid primary key references schools(id),revision integer not null default 0,object_path text,width integer,height integer,updated_by uuid,updated_at timestamptz not null default now());
create table public.school_branding_operations(id uuid primary key,actor_id uuid not null,school_id uuid not null references schools(id),expected_revision integer not null,object_path text,reason text not null,result jsonb not null,created_at timestamptz not null default now());
alter table public.school_branding enable row level security;
alter table public.school_branding_operations enable row level security;
revoke all on public.school_branding,public.school_branding_operations from public,anon,authenticated;
create function public.can_read_school_branding(p_school uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select is_platform_administrator() or (account_is_ready() and current_school_id()=p_school)
$$;
create function public.can_read_school_logo(p_path text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from school_branding where object_path=p_path and can_read_school_branding(school_id))
$$;
grant select on public.school_branding to authenticated;
create policy school_branding_read on public.school_branding for select to authenticated using(can_read_school_branding(school_id));
create policy school_logo_read on storage.objects for select to authenticated using(bucket_id='school-branding' and can_read_school_logo(name));
-- Upload/overwrite/delete are deliberately not granted to browser roles.
create function public.platform_admin_branding(p_school uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform require_platform_administrator();if not exists(select 1 from schools where id=p_school) then raise exception 'School not found';end if;
 return coalesce((select to_jsonb(b) from school_branding b where school_id=p_school),jsonb_build_object('school_id',p_school,'revision',0,'object_path',null));
end $$;
create function public.get_my_school_branding() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare tenant uuid:=current_school_id();begin
 perform assert_account_access();if tenant is null then raise exception 'School access denied';end if;
 return coalesce((select to_jsonb(b) from school_branding b where school_id=tenant),jsonb_build_object('school_id',tenant,'revision',0,'object_path',null));
end $$;
create function public.commit_school_branding(p_actor uuid,p_school uuid,p_revision integer,p_operation uuid,p_path text,p_width integer,p_height integer,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare old_value jsonb; result jsonb; prior school_branding_operations%rowtype;begin
 if not platform_administrator_allowed(p_actor) then raise exception 'Platform administrator access denied' using errcode='42501';end if;
 if p_operation is null or length(btrim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Operation and change reason required';end if;
 perform 1 from schools where id=p_school for update;if not found then raise exception 'School not found';end if;
 select * into prior from school_branding_operations where id=p_operation;
 if found then
  if prior.actor_id<>p_actor or prior.school_id<>p_school or prior.expected_revision is distinct from p_revision or prior.object_path is distinct from p_path or prior.reason is distinct from p_reason then raise exception 'Operation belongs to another school or request';end if;
  return prior.result;
 end if;
 old_value:=coalesce((select to_jsonb(b) from school_branding b where school_id=p_school),jsonb_build_object('school_id',p_school,'revision',0,'object_path',null));
 if (old_value->>'revision')::integer is distinct from p_revision then raise exception 'Branding changed. Refresh before replacing it.' using errcode='40001';end if;
 if p_path is not null then
  if p_path is distinct from p_school::text||'/'||p_operation::text||'.png' or p_width is null or p_height is null or p_width not between 1 and 2048 or p_height not between 1 and 2048 then raise exception 'Invalid school logo path or dimensions';end if;
  if not exists(select 1 from storage.objects where bucket_id='school-branding' and name=p_path) then raise exception 'Upload must succeed before branding can be saved';end if;
 elsif p_width is not null or p_height is not null then raise exception 'Removed logo must not have dimensions';end if;
 insert into school_branding(school_id,revision,object_path,width,height,updated_by) values(p_school,p_revision+1,p_path,p_width,p_height,p_actor)
 on conflict(school_id) do update set revision=excluded.revision,object_path=excluded.object_path,width=excluded.width,height=excluded.height,updated_by=excluded.updated_by,updated_at=now();
 select to_jsonb(b) into result from school_branding b where school_id=p_school;
 insert into school_branding_operations(id,actor_id,school_id,expected_revision,object_path,reason,result) values(p_operation,p_actor,p_school,p_revision,p_path,p_reason,result);
 insert into platform_admin_audit(actor_id,action,school_id,target_id,previous_value,new_value,reason) values(p_actor,case when p_path is null then 'school_logo_removed' else 'school_logo_replaced' end,p_school,p_school,old_value,result,p_reason);
 return result;
end $$;
revoke all on function public.can_read_school_branding(uuid),public.can_read_school_logo(text),public.platform_admin_branding(uuid),public.get_my_school_branding(),public.commit_school_branding(uuid,uuid,integer,uuid,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.can_read_school_branding(uuid),public.can_read_school_logo(text),public.platform_admin_branding(uuid),public.get_my_school_branding() to authenticated;
grant execute on function public.commit_school_branding(uuid,uuid,integer,uuid,text,integer,integer,text) to service_role;
