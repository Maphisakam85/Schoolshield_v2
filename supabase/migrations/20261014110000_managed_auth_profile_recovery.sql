-- Auth trigger availability can differ on older pilot projects. A reserved,
-- validated real Auth identity may be provisioned explicitly by the backend.
create function public.ensure_managed_auth_profile(p_operation uuid) returns void
language plpgsql security definer set search_path=public as $$
declare o user_management_operations%rowtype;u record;code text;
begin
 select * into o from user_management_operations where id=p_operation;
 if o.id is null or o.action<>'create' then return; end if;
 perform assert_user_management(o.actor_id,o.school_id,null,(o.fields->>'role')::app_role);
 select * into u from auth.users where id=o.target_id;
 select s.code into code from schools s where id=o.school_id;
 if u.id is null then return; end if;
 if u.raw_app_meta_data->>'school_code' is distinct from code or u.raw_app_meta_data->>'role' is distinct from o.fields->>'role' or lower(u.email) is distinct from lower(o.fields->>'email') then raise exception 'Reserved Auth assignment mismatch'; end if;
 insert into profiles(id,school_id,role,display_name,first_name,last_name,phone,requires_setup,account_status)
 values(o.target_id,o.school_id,(o.fields->>'role')::app_role,btrim(o.fields->>'first_name')||' '||btrim(o.fields->>'last_name'),o.fields->>'first_name',o.fields->>'last_name',o.fields->>'phone',true,'Inactive')
 on conflict(id) do nothing;
end $$;
revoke all on function public.ensure_managed_auth_profile(uuid) from public,anon,authenticated;
grant execute on function public.ensure_managed_auth_profile(uuid) to service_role;
-- Preserve any real Auth identities created before the legacy trigger gap was
-- discovered. They remain Inactive and can be repaired through management.
do $$ declare o record;begin for o in select id from user_management_operations where action='create' and status='Failed' loop perform ensure_managed_auth_profile(o.id);end loop;end $$;
