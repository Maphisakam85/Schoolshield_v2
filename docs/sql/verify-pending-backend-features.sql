-- READ ONLY: rerun after each intended installation. No keys or school data.
select version,name from supabase_migrations.schema_migrations
where version in ('20261021140000','20261109100000','20261109110000') order by version;
select
 to_regprocedure('public.report_school_problem(uuid,text,text,text,text)') is not null as problem_report_rpc,
 to_regclass('public.support_email_queue') is not null as support_email_queue,
 to_regprocedure('public.register_web_push(jsonb)') is not null as push_registration_rpc,
 to_regprocedure('public.claim_web_push()') is not null as push_dispatch_claim_rpc,
 exists(select 1 from pg_trigger where tgrelid='public.schools'::regclass and tgname='enforce_school_access_code' and not tgisinternal) as school_code_trigger;
select pubname,schemaname,tablename from pg_publication_tables
where pubname='supabase_realtime' and schemaname='public' order by tablename;
