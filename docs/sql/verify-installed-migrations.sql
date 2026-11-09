-- Live smoke checks. All attempts are denied or rolled back; no accounts,
-- notifications, reports or school records are retained.
BEGIN;
DO $check$ BEGIN
 BEGIN
  INSERT INTO public.schools(code,name) VALUES ('111-111','QA migration validation probe');
  RAISE EXCEPTION 'Invalid school code was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'School code must use three letters%' THEN RAISE; END IF;
 END;
END $check$;
SET LOCAL ROLE anon;
DO $check$ BEGIN
 BEGIN
  PERFORM public.report_school_problem(gen_random_uuid(),'QA probe','Other','QA smoke check','Normal');
  RAISE EXCEPTION 'Anonymous reporting was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM 1 FROM public.support_email_queue LIMIT 1;
  RAISE EXCEPTION 'Anonymous queue access was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $check$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $check$ BEGIN
 BEGIN
  PERFORM public.claim_web_push();
  RAISE EXCEPTION 'Browser push dispatch was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM 1 FROM public.web_push_subscriptions LIMIT 1;
  RAISE EXCEPTION 'Direct browser subscription access was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $check$;
ROLLBACK;
SELECT 'PASS: invalid school codes and unauthorised report/queue access rejected; no retained changes' AS verification;
