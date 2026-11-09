-- Source SHA-256: d87c9a025c668a43f420de2d30848441f64d73ad4ba165bd202413cccfd74158
BEGIN;
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261109150000') THEN RAISE EXCEPTION 'Migration already recorded'; END IF;
END $preflight$;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
-- The cron command contains no credential. Only a narrowly scoped dispatcher
-- secret is read from Vault at runtime; never a Supabase service-role key.
create function public.dispatch_school_web_push() returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare endpoint text; credential text; request_id bigint;
begin
 if not exists(select 1 from public.web_push_outbox where status in ('pending','sending') and available_at<=now() and attempts<5) then return null; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='schoolshield_push_project_url';
 select decrypted_secret into credential from vault.decrypted_secrets where name='schoolshield_push_dispatch_secret';
 if endpoint is null or credential is null then return null; end if;
 if endpoint !~ '^https://[a-z]{20}\.supabase\.co$' then raise exception 'Invalid push project endpoint'; end if;
 select net.http_post(url:=endpoint||'/functions/v1/push-dispatch',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:='{}'::jsonb,timeout_milliseconds:=15000) into request_id;
 return request_id;
end $$;
revoke all on function public.dispatch_school_web_push() from public,anon,authenticated;
do $$ declare job bigint; begin
 job:=cron.schedule('schoolshield-web-push-dispatch','* * * * *','select public.dispatch_school_web_push();');
 perform cron.alter_job(job,active:=false);
end $$;
-- Enable this exact job only after deploying the dispatcher and provisioning
-- matching Edge/Vault secrets. No schedule is activated by the migration itself.
notify pgrst,'reload schema';

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261109150000','web_push_scheduler');
COMMIT;
