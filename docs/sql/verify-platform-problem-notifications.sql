BEGIN;
SET LOCAL ROLE anon;
DO $check$ BEGIN
 BEGIN
  PERFORM public.platform_admin_problem_notifications();
  RAISE EXCEPTION 'Anonymous access accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $check$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
DO $check$ BEGIN
 BEGIN
  PERFORM public.platform_admin_problem_notifications();
  RAISE EXCEPTION 'Unverified platform access accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $check$;
ROLLBACK;
SELECT has_function_privilege('anon','public.platform_admin_problem_notifications(integer)','EXECUTE') AS anonymous_execute,
 has_function_privilege('authenticated','public.platform_admin_problem_notifications(integer)','EXECUTE') AS authenticated_entrypoint,
 EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261109130000') AS migration_recorded;
