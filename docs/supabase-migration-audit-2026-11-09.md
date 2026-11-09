# Supabase migration audit and installation guide

Checked **9 November 2026 (Africa/Johannesburg)** against the linked project **kosidewowwfdvzqhzxau**, from branch `test`.

This audit was read-only on Supabase. No migration, deployment, invitation, school access change or email/push delivery was performed. Local SQL installer files were prepared and tested separately.

## Result

There are **65 local SQL files**, **54 recorded remote migrations**, and **11 local file entries without a corresponding applied entry**. Those eleven are **three new pending features and eight historical gaps**. A missing history entry does not establish that a feature is absent: later scripts installed replacements for several older files.

### New pending migrations

| Migration | Verified live status | Action |
|---|---|---|
| `20261109100000_school_problem_reports.sql` | `report_school_problem` and `support_email_queue` absent | Apply first to fix the report form's missing backend. Owner email delivery is a separate deployment/configuration step. |
| `20261021140000_web_push_notifications.sql` | Subscription/outbox tables and registration/claim functions absent | Apply when enabling outside-app push. Existing notification-read and SGB/Security prerequisites are recorded as applied. |
| `20261109110000_access_code_format.sql` | School-code enforcement trigger/function absent | Review the owner-code reset below BEFORE applying. |

**Important:** the last file is not merely a school-code validator. Its `DO` block replaces the configured platform access-code hash with a hash for `ADMIN`. It does not change the owner's Auth email/password or grant membership, but it changes the access code needed on the next owner login. Do not run it unchanged if you intend to retain another configured owner code or use a different six-character identifier. Separate code enforcement from code rotation in a reviewed forward change, or explicitly accept the `ADMIN` reset. No owner code was changed during this audit.

### Historical gaps: do not replay these files blindly

| File missing from history | Evidence and disposition |
|---|---|
| `20260928_realtime_workspace_sync.sql` | Shares version `20260928` with `link_demo_family_to_teacher`, which IS recorded. Raw `school_workspaces` is not published. This is consistent with the newer, installed `20261014170000_school_dataset_invalidations.sql`: the current app listens to `school_dataset_versions`, which IS published. Keep the invalidation approach; do not enable raw workspace broadcasts just to clear this entry. |
| `20261007_invitation_delivery.sql` | Delivery/phone columns and the six-argument `request_school_account` RPC exist. The newer `20261019100000_restore_account_request_delivery.sql` is recorded. The old file drops/replaces functions and should not overwrite current account/setup logic. |
| `20261007120000_announcement_publishing.sql` | Publishing RPC exists with current lifecycle guarding. Reinstalled by `20261014190000_restore_live_operational_rpcs.sql` and subsequently wrapped for lifecycle checks. |
| `20261007130000_document_attachments.sql` | Attachment table, access check and completion RPC exist; document bucket is private. Installed canonically by `20261014120000_install_private_attachments.sql`. Replaying the old CREATE TABLE/storage policies would collide or regress permissions. |
| `20261007140000_security_shifts.sql` | Attendance table and recording RPC exist. `20261014190000_restore_live_operational_rpcs.sql` plus `20261014220000_canonical_shift_records.sql` are recorded. Do not rerun the older name-based backfill/shift implementation over current Security Officer work. |
| `20261007150000_backend_role_isolation.sql` | Legacy `teacher_class_access` and old class/learner helper names are absent; current canonical staff/learner/teaching-context tables and `read_school_dataset` are present. Authenticated raw workspace INSERT/UPDATE are revoked. This is not an instruction to recreate the legacy model. Some hardening findings below still need review. |
| `20261007151000_record_storage_authorization.sql` | Current attachment permission function uses canonical `school_learners`; private attachment/storage protections were installed later. The old implementation references old helpers and would replace the newer function. |
| `20261007152000_rpc_authorization_guards.sql` | Old `_internal` wrapper aliases are absent; current public routines were installed/replaced later. Announcement lifecycle checking exists, but the parent-notice lifecycle gap below remains. Do not assume this missing entry is wholly satisfied, and do not replay the old wrapper against replaced dependencies. |

Do not mark these eight files applied merely to make the list green. First compare actual effects, document superseded behavior, resolve the duplicate filename version and create forward-only patches for genuine gaps. The duplicate version prevents a clean one-file/one-ledger mapping. No historical filename or ledger entry was modified by this audit.

## Additional hardening findings

These are **review/forward-migration work**, not claims that installing the three pending feature files finishes security QA:

- `persist_parent_document_notice(jsonb)` is executable by `anon` and `authenticated`. Its current body checks authenticated parent identity and the child link, but has no explicit active-account/setup/suspension check. Because it is SECURITY DEFINER, do not rely on table RLS to supply that check. Prepare a reviewed forward migration to revoke anonymous EXECUTE and add `assert_account_access()` while preserving the canonical routine and child-link checks; test inactive, incomplete-setup and suspended users. No real notice was submitted to demonstrate or exploit this gap.
- `anon` retains a workspace UPDATE privilege. Workspace RLS is enabled and every current policy targets `authenticated`, so this metadata finding is NOT evidence of anonymous row access. Nevertheless remove residual anonymous write privileges in a reviewed hardening migration and test denial directly. Authenticated raw INSERT/UPDATE/column UPDATE privileges are already false.
- Dataset, attachment and school-theme APIs are installed. The reported workspace-startup failure is not explained simply by the three pending features. It still needs the affected authenticated request/error or server logs; do not remove authorization or substitute demo records to hide it.

## Apply problem reporting first (no CLI required)

1. Verify that you are in the correct Supabase project. Review/verify a database backup or available recovery point before applying schema changes.
2. Open **Supabase Dashboard → SQL Editor → New query** for project `kosidewowwfdvzqhzxau`.
3. Open [install-school-problem-reports.sql](sql/install-school-problem-reports.sql), copy the ENTIRE file into the editor, review it, then click **Run** once.
4. The installer wraps the original migration and its history entry in one transaction. It refuses a recorded or already-installed feature; errors roll back the transaction. If the editor leaves an aborted transaction open, run `ROLLBACK;` before investigating. Do not continue running fragments or drop existing objects to force success.
5. Open [verify-pending-backend-features.sql](sql/verify-pending-backend-features.sql) and run it. `problem_report_rpc` and `support_email_queue` should now be `true`, and version `20261109100000` should be listed.
6. Reload the application. Using an existing authorised fictional QA account, submit one report and verify that its reference appears in the selected school's Super Admin support list. Retry the same uncertain request and confirm there is no duplicate. Do not enter learner, family, health or credential information.

The SQL installer does not send email. Until mail delivery is configured, successfully saved reports say email is queued.

## Enable outside-app push separately

1. Review [install-web-push-notifications.sql](sql/install-web-push-notifications.sql). Run the entire file in a NEW SQL Editor query, once. It includes exactly the push migration plus its migration-history entry in a transaction.
2. Run the verification SQL again. Push registration and claim functions should now be present, and version `20261021140000` should be listed. This file can be installed after reporting even though its timestamp is older; its required notification/chat migrations are already installed. These two pending features do not depend on each other.
3. Complete the push function/secrets/scheduler configuration below. SQL alone cannot deliver a browser notification.
4. Test with opted-in QA devices and two isolated QA schools, including logged-out click-through, deactivation, suspension and cross-school denial. Keep generic lock-screen content. Other chat streams without a corresponding notification are not automatically covered.

## Apply school-code enforcement only after reviewing owner-code behavior

The original file is [20261109110000_access_code_format.sql](../supabase/migrations/20261109110000_access_code_format.sql).

If you explicitly want its current behavior, including resetting the owner identifier to `ADMIN`:

1. Verify no migration/history entry or existing enforcement trigger is already present.
2. In SQL Editor start with `BEGIN;`, paste the entire reviewed migration, append the history INSERT below, then `COMMIT;`. Run the combined query ONCE.

```sql
INSERT INTO supabase_migrations.schema_migrations(version,name)
VALUES ('20261109110000','access_code_format');
```

3. Verify the trigger and history entry using the supplied read-only verification SQL.
4. In a fictional QA school test a new code such as `ABC-001`, reject malformed codes, preserve an existing code during unrelated school edits and verify ordinary users cannot obtain platform access with any owner identifier. The owner must still use verified Auth credentials and backend-approved membership.

If the `ADMIN` reset is not wanted, STOP before applying this file. Review/change the unapplied migration or add a carefully reconciled replacement first. Do not silently mark the original applied without carrying out/documenting its intended replacement. Existing school codes are not automatically renamed by the original migration.

## Missing Edge deployments and configuration

SQL migrations and Edge Function deployments are separate. The deployed function list currently contains `approve-account`, `bootstrap-demo-masters`, `parent-workspace`, `parent-chat`, `manage-users` and `provision-school`. Their source parity with every local edit was not established. Three local functions are NOT deployed:

| Function | Needed for | Configuration |
|---|---|---|
| `school-branding` | Actual validated logo uploads/replacements | Existing platform authorization, branding RPCs/private bucket and the checked-in WebP WASM asset. Preserve its reviewed JWT configuration. |
| `support-email-dispatch` | Email notice to the owner for queued reports | `RESEND_API_KEY`, `SUPPORT_OWNER_EMAIL`, `SUPPORT_EMAIL_FROM`, `SUPPORT_DISPATCH_SECRET`; verified sender/domain; scheduled authenticated POST. |
| `push-dispatch` | Deliver queued browser push | `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `PUSH_DISPATCH_SECRET`; scheduled authenticated POST. |

None of these extra mail/push secret names appears in the current secret-name list. Only names were inspected, never values. `SCHOOLSHIELD_ACCOUNT_SETUP_URL` exists; its value and real invitation delivery were not verified by this audit. The demo bootstrap function is deployed; its mere presence is not an instruction to run it or seed real schools.

From the repository root, after reviewing the code/configuration and signing into the CLI:

```powershell
npx supabase login
npx supabase link --project-ref kosidewowwfdvzqhzxau
npx supabase functions deploy school-branding --project-ref kosidewowwfdvzqhzxau
npx supabase functions deploy support-email-dispatch --project-ref kosidewowwfdvzqhzxau
npx supabase functions deploy push-dispatch --project-ref kosidewowwfdvzqhzxau
```

Deploy only the functions for features you are enabling. Set private values through **Dashboard → Edge Functions → Secrets**, not in committed frontend files or chat. The dispatcher configurations intentionally disable the gateway JWT check and validate their own separate high-entropy dispatch secret before using service credentials. Never remove those checks. For branding use its checked-in configuration and test a real authorised QA request; do not disable checks as a shortcut.

For Web Push, generate a persistent VAPID pair, keep its private half in server secrets and put only the matching PUBLIC key in `SchoolShield/supabase-config.js` as `webPushPublicKey`. For example, generate keys locally with `npx web-push generate-vapid-keys --json`; do not paste the private output into source or chat.

Database `pg_cron` is not installed in the checked project. Use Supabase Cron/pg_net after enabling the required extensions, or an external server scheduler. Configure one authenticated POST schedule per enabled dispatcher, typically once a minute, with body `{}` and `Authorization: Bearer <that dispatcher's secret>`. Store scheduler secrets in Vault or the scheduler's secret store. Do not place secret literals in cron SQL/source code. Enable schedules only after QA and sender/device configuration. A provider's acceptance does not establish that a person received/read an email or notification.

## Migration history and CLI cautions

**Do not use `db push --include-all`, `--include-seed` or a remote reset to fix this repository's current history.** Older DDL/function replacements and the duplicate `20260928` version need reconciliation first; bootstrap data must not be replayed into live schools.

The prepared installers already record their migration version. Do not run `migration repair` afterward for those files. If you instead run an ORIGINAL raw migration successfully through SQL Editor without recording history, record ONLY that actually executed migration through the CLI, for example:

```powershell
npx supabase migration repair 20261109100000 --status applied --linked
npx supabase migration list --linked
```

`migration repair` updates history; it does NOT install missing tables or functions. Do not run it before the SQL. Do not bulk-mark the historical gaps applied. Verify your installed CLI's flags using `--help`; the audit checked the linked-project flags on the locally installed CLI.

After a reviewed history reconciliation, inspect `npx supabase db push --linked --dry-run --skip-vault` before any future push. Do not proceed if it proposes old or unintended files. A dry run may fail until the old history/collision is resolved; it is not an instruction to force `--include-all`.

## Verification and limits

- Live read-only checks: migration ledger and schema signatures; publication membership; private bucket; canonical data structures; workspace RLS roles and effective grants; one parent-notice function definition/ACL; deployed function names; configured secret NAMES; scheduler extension presence.
- Local tests: both prepared transaction/ledger installers executed against isolated PGlite fixtures, reusing the existing support and push integration checks. These cover ticket validation/idempotency/tenant isolation and push device ownership/audience isolation/queue authorization/retries/suspension. Each installer recorded one migration-history entry.
- No remote migration repair, SQL write, function deployment, real-account login, actual notification/email delivery or real-school data change was performed.
- Object/ledger presence is not a full end-to-end role/RLS audit. The additional hardening findings and the live workspace-loading error remain open.

Official references: [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair), [Edge deployment](https://supabase.com/docs/guides/functions/deploy), [server secrets](https://supabase.com/docs/guides/functions/secrets), [scheduled functions and Vault](https://supabase.com/docs/guides/functions/schedule-functions).
