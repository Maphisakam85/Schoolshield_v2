-- Applies school-code enforcement only; preserves the configured owner code.
-- Source SHA-256: 3bfe2cab42bba60107689fe6a447397ee9def1ff203f71a1e2452dc88b1d0ef5
BEGIN;
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261109110000') THEN RAISE EXCEPTION 'Migration already recorded'; END IF;
 IF to_regprocedure('public.enforce_school_access_code()') IS NOT NULL THEN RAISE EXCEPTION 'Existing code function requires reconciliation'; END IF;
END $preflight$;
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

-- Owner identifiers are configured separately by a trusted operator. School-code
-- validation must never rotate an existing owner's access-code hash.
insert into public.platform_admin_audit(action,reason)
values('school_access_code_validation_installed','CCC-000 validation installed; established school codes and owner access configuration preserved');
notify pgrst,'reload schema';

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261109110000','access_code_format');
COMMIT;
