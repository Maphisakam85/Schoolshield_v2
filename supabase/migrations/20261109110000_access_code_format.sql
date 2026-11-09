-- New school codes use CCC-000; established codes/relationships are preserved.
create function public.enforce_school_access_code() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if TG_OP='UPDATE' then
  if NEW.code is distinct from OLD.code then raise exception 'Established school codes are read-only'; end if;
  return NEW;
 end if;
 NEW.code:=upper(btrim(NEW.code));
 if NEW.code is null or NEW.code !~ '^[A-Z]{3}-[0-9]{3}$' then
  raise exception 'School code must use three letters, a hyphen and three digits (ABC-001)';
 end if;
 return NEW;
end $$;
revoke all on function public.enforce_school_access_code() from public,anon,authenticated;
create trigger enforce_school_access_code before insert or update of code on public.schools
for each row execute function public.enforce_school_access_code();

-- ADMIN is the requested public owner access identifier, not an Auth password.
-- Existing verified-owner membership, password authentication, rate limiting and
-- server-side session checks in authorize_platform_login remain unchanged.
do $$ begin
 perform set_config('search_path','public,extensions',true);
 insert into public.platform_login_secret(singleton,code_hash)
 values(true,crypt('ADMIN',gen_salt('bf')))
 on conflict(singleton) do update set code_hash=excluded.code_hash;
 insert into public.platform_admin_audit(action,reason)
 values('platform_access_code_format_updated','Owner access identifier set to ADMIN; verified owner and Auth requirements preserved');
end $$;
notify pgrst,'reload schema';
