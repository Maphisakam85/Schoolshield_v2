BEGIN;
SET LOCAL ROLE anon;
DO $check$ BEGIN
 BEGIN
  PERFORM public.persist_parent_document_notice('{}');
  RAISE EXCEPTION 'Anonymous notice access accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE public.school_workspaces SET payload=payload WHERE false;
  RAISE EXCEPTION 'Anonymous workspace write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $check$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
DO $check$ BEGIN
 BEGIN
  PERFORM public.persist_parent_document_notice('{}');
  RAISE EXCEPTION 'Notice without an active account accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.persist_parent_document_notice_account_base('{}');
  RAISE EXCEPTION 'Private notice base accepted a browser call';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $check$;
ROLLBACK;
SELECT jsonb_build_object(
 'migration_recorded',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261109120000'),
 'anonymous_notice',has_function_privilege('anon','public.persist_parent_document_notice(jsonb)','EXECUTE'),
 'authenticated_notice',has_function_privilege('authenticated','public.persist_parent_document_notice(jsonb)','EXECUTE'),
 'browser_private_base',has_function_privilege('authenticated','public.persist_parent_document_notice_account_base(jsonb)','EXECUTE'),
 'anonymous_workspace_write',has_table_privilege('anon','public.school_workspaces','UPDATE') OR has_any_column_privilege('anon','public.school_workspaces','UPDATE'),
 'account_guard_installed',strpos(pg_get_functiondef('public.persist_parent_document_notice(jsonb)'::regprocedure),'assert_account_access')>0,
 'smoke_checks','PASS; no retained changes'
) AS verification;
