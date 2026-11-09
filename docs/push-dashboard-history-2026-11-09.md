# Push delivery, dashboard and migration history - 9 November 2026

## Completed

- Deployed `push-dispatch` to `kosidewowwfdvzqhzxau`. Generated a matching VAPID
  pair; only its public key is in frontend configuration. Private VAPID material
  and `PUSH_DISPATCH_SECRET` are server-side Edge secrets. The scheduler's scoped
  dispatcher credential and project URL are stored in Vault, not cron SQL/source.
- Installed `20261109150000_web_push_scheduler.sql` (initially disabled), then
  enabled the exact `schoolshield-web-push-dispatch` job after configuration and
  smoke checks. It runs every minute, skips empty queues and uses pg_net to call
  the protected dispatcher. A live cron execution was verified as `succeeded`.
- Installed `20261109140000_platform_dashboard_summary.sql`. Its owner-only RPC
  exposes administrative aggregate counts and safe report metadata. The home page
  now shows 21 KPI cards: schools/lifecycle/data mode, accounts/setup, reports,
  failures, delivery queues/devices and recent audit activity. Failed refreshes
  retain confirmed values and display retry feedback.
- Audit entries for report/support events now have an Open report action even
  when raw audit payloads are intentionally omitted. The selected-school ticket
  dialog has an expandable full-description section, metadata and existing audited
  editing/resolution controls. Opening a report never resolves it.
- Moved eight superseded SQL files into `supabase/legacy-migrations`, retaining
  hashes and historical tests. No applied migration was renamed and no remote
  migration history was fabricated or deleted. All **61 active files match all
  61 remote ledger entries**, including names; no active duplicate version remains.

The old duplicate `20260928_realtime_workspace_sync` and obsolete invitation,
announcement, attachment, shift and legacy-authorisation scripts must not be
restored to the active directory. See the archive README/manifest for replacements.
Earlier reports saying eight unresolved history gaps remain are superseded by this
record. Their real missing protections were already fixed by forward migrations.

## Evidence and limits

- Live dispatcher: missing credential rejected with 401; configured credential
  accepted with 200, `sent:0`, `failed:0`. Matching VAPID public/private pair checked.
  There were no subscribed devices or pending jobs at configuration time. No real
  messages, invitations or notifications were sent for QA.
- Live metadata: dashboard RPC exists; anonymous dashboard execution is denied;
  anonymous/browser dispatch execution is denied; two expected Vault names exist;
  the exact cron job is active and its latest execution succeeded.
- Final local build including template ordering and archive integrity: 184 passed,
  zero failed, one optional image-codec test skipped. Historical SQL suites passed:
  123 authorization assertions, document/storage checks and Security Officer shifts.
- Mocked desktop/mobile browser checks passed for KPI counts/error retention,
  full expandable report text, audit-to-report links and existing resolution flow.
  Report templates now precede scripts so immediately resolved requests can render.
- A CLI db-push dry run stalled after login-role initialisation and was cancelled.
  Parity was instead verified directly against the linked migration ledger. This
  does not certify a brand-new empty-project bootstrap or real device delivery.

## Enable and test a QA device

1. After the frontend update is live, sign into an existing fictional QA school
   in a supported browser. Open Notifications and choose Enable notifications;
   accept the browser permission. No opt-in is performed automatically.
2. From another authorised QA user, create an activity that produces a supported
   school notification, or an SGB/Security direct message. Close/background the
   recipient tab and allow up to one minute for the queue schedule.
3. Verify the generic device alert and click-through to the normal authenticated
   notification page. Lock-screen content excludes report/learner/message details.
4. Disable on that device and verify no further pushes are delivered there.
   OS/browser background restrictions can delay or suppress delivery. Other chat
   streams require a generated notification; arbitrary messages are not inferred.

## Recovery and maintenance

To pause delivery without deleting subscriptions or queues, run as a trusted
database operator:

```sql
select cron.alter_job(jobid,active:=false)
from cron.job where jobname='schoolshield-web-push-dispatch';
```

Re-enable through the reviewed operator SQL only after checking Edge/Vault config.
Keep both copies of the dispatch secret in sync when rotating. Preserve the VAPID
pair while subscriptions exist; rotating it requires devices to resubscribe.
Pause/reconfigure cron on restored or cloned databases before allowing external
calls. Never place service-role keys, private VAPID values or dispatch secrets in
frontend files, migration sources, committed environment files or cron commands.

SMTP/email activation remains separate and still requires the user's private
Gmail/Workspace App Password in Supabase. This task does not configure that password.
