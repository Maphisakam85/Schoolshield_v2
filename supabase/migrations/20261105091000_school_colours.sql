alter table public.school_branding add column primary_colour text not null default '#0a8f62' check(primary_colour ~ '^#[0-9a-fA-F]{6}$'), add column sidebar_colour text not null default '#082c36' check(sidebar_colour ~ '^#[0-9a-fA-F]{6}$');
create function public.platform_admin_save_colours(p_school uuid,p_revision integer,p_primary text,p_sidebar text,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; previous jsonb;
begin
 perform require_platform_administrator();
 if p_primary is null or p_sidebar is null or p_primary !~ '^#[0-9a-fA-F]{6}$' or p_sidebar !~ '^#[0-9a-fA-F]{6}$' or length(btrim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Valid colours and a reason of 5–500 characters are required'; end if;
 perform 1 from schools where id=p_school for update; if not found then raise exception 'School not found';end if;
 insert into school_branding(school_id) values(p_school) on conflict do nothing;
 select to_jsonb(b) into previous from school_branding b where school_id=p_school;
 if (previous->>'revision')::integer is distinct from p_revision then raise exception 'Branding changed. Refresh before saving.' using errcode='40001';end if;
 update school_branding set primary_colour=lower(p_primary),sidebar_colour=lower(p_sidebar),revision=revision+1,updated_at=now(),updated_by=auth.uid() where school_id=p_school;
 select to_jsonb(b) into result from school_branding b where school_id=p_school;
 insert into platform_admin_audit(actor_id,action,school_id,target_id,previous_value,new_value,reason) values(auth.uid(),'school_colours_updated',p_school,p_school,previous,result,btrim(p_reason));
 return result;
end $$;
revoke all on function public.platform_admin_save_colours(uuid,integer,text,text,text) from public,anon;
grant execute on function public.platform_admin_save_colours(uuid,integer,text,text,text) to authenticated;
