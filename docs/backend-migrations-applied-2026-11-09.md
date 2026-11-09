# Backend migrations applied — 9 November 2026

Project: `kosidewowwfdvzqhzxau`. Installed through the linked Supabase CLI SQL
endpoint, using explicit transaction/ledger installers rather than bulk db push.

| Version | Result |
| --- | --- |
| `20261109100000` | School problem reporting, private email queue, authenticated RPC and audit writes installed. |
| `20261021140000` | Opt-in push registration, private subscriptions/outbox, three queue triggers and service-only dispatch claim installed. |
| `20261109110000` | New-school CCC-000 validation and read-only established codes installed. |

Before installation, the unapplied access-code migration was corrected to remove
the automatic owner-code reset to ADMIN. It now preserves the existing hash and
records a school-code-validation audit event. No owner code, Auth credentials or
platform membership was changed. The checked-in original migration and its new
installer contain the exact applied replacement.

Live verification confirmed all three ledger entries, RPCs, the enabled school-code
trigger and all three push triggers. All three queue/subscription tables have RLS
enabled and deny direct SELECT to anonymous and authenticated browser roles.
Reporting is authenticated-only; push claim is service-role-only.

Rollback-only live smoke checks in `docs/sql/verify-installed-migrations.sql`
passed: malformed school codes, anonymous reporting/queue reads, authenticated
dispatch claims and direct subscription reads were rejected. No probe records
were retained.

Local verification: 16 focused unit/isolated SQL tests passed, including owner-code
preservation, reporting isolation/idempotency and workspace behavior. The separate
`tests/web-push-db.cjs` isolated SQL suite passed ownership, audience/school
isolation, queue authorization, idempotency, leases, retries and suspension checks.
Owner hash functions in the access-code fixture were mocked.

No historical migration was replayed or bulk-marked applied. The eight old history
gaps and duplicate version described in `supabase-migration-audit-2026-11-09.md`
still need a separate reconciliation; newer installed implementations must be
preserved. The additional parent-notice/anonymous-grant hardening findings remain
open. No school data was seeded or reset.

Edge deployment, mail/push secrets, sender configuration and dispatch schedules
remain separate pending work. No actual emails, invitations or push notifications
were sent. Logo-upload function deployment is also separate from these SQL files.

The earlier audit and integration reports are historical snapshots; their claims
that these three migrations are pending, and their owner-reset warning for the
original code-format file, are superseded by this application record.
