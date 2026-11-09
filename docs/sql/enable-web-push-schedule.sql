-- Operator action after Edge/Vault provisioning and empty-queue smoke checks.
BEGIN;
DO $activate$ DECLARE job bigint; BEGIN
 IF (SELECT count(*) FROM vault.secrets WHERE name IN ('schoolshield_push_project_url','schoolshield_push_dispatch_secret'))<>2 THEN
  RAISE EXCEPTION 'Push Vault configuration missing';
 END IF;
 SELECT jobid INTO job FROM cron.job WHERE jobname='schoolshield-web-push-dispatch';
 IF job IS NULL THEN RAISE EXCEPTION 'Push schedule missing'; END IF;
 PERFORM cron.alter_job(job,active:=true);
 INSERT INTO public.platform_admin_audit(action,reason)
 VALUES('web_push_delivery_enabled','Scoped dispatcher deployed and verified; one-minute Vault-backed schedule enabled for opted-in devices');
END $activate$;
COMMIT;
SELECT jobname,schedule,active FROM cron.job WHERE jobname='schoolshield-web-push-dispatch';
