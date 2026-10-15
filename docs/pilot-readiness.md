# SchoolShield pilot readiness — 14 October 2026

## Current deployment

https://schoolshieldv2.vercel.app remains a **demo deployment**. Existing school-name/role accounts and useful historical records are retained at the user's request. Real school names and administrator contacts have not yet been supplied. Do not treat these shared demo accounts as production personnel accounts.

Schools have an explicit `data_mode`: `live`, `demo`, or `qa`. New schools default to live and empty. Demo bootstrap is optional, restricted to an active, setup-complete demo-school Principal, and currently disabled through `ALLOW_DEMO_BOOTSTRAP=false`. `SCHOOLSHIELD_DEPLOYMENT_MODE=demo` explicitly permits the current demo administrator to provision isolated testing schools. Outside this mode a real live-school administrator is required. Live user creation rejects `.test` email addresses.

## Data and identity

Supabase Auth and `profiles` own account identity. Normalized school staff, guardians, learners, grades, classes, subjects and teaching contexts own school relationships, using UUIDs and school IDs. `school_workspaces` remains the shared operational store for visitors, incidents and other existing operational features; its core entity arrays are server-generated projections. Browser session state is a cache, never seed/bootstrap authority.

New workspaces do not inject learners, teachers, parents, visitors, incidents or messages. Existing demo records are preserved. Duplicate legacy references are retained under compatibility aliases and flagged for explicit reconciliation rather than silently deleted or merged by name. See [the source-of-truth audit](authoritative-school-data.md).

School Records provides authorized CRUD, guardian linking and teaching assignments. User Management creates real Auth identities through a validated Edge backend, updates shared profile references, sends invitations, and deactivates/reactivates accounts without deleting history. Setup exchanges actual Auth tokens, creates a password and completes the profile. Manual invitation links remain available to authorized management. Assignment notifications use existing recipient UUIDs.

## Security and persistence

Backend checks derive role, active/setup status and school from the authenticated profile. RLS separates schools and limits teacher and parent data to assignments and linked learners. SGB/Security cannot retrieve raw family links or sick notices. Client role and school fields do not grant authorization. Private attachments require entity-specific permission; membership alone does not grant every file. Upload finalization checks the real Storage object.

`school_integrity_report` is management-only and reports Auth/profile, staff, teaching context, learner/class, guardian, notification, operational tenant and attachment integrity. It reports historical reconciliation warnings without deleting data. A school-scoped version marker drives refresh without broadcasting private workspace payloads. Realtime delivery itself still needs device/network soak testing.

## Migrations and backend

New migration series: `20261014100000` through `20261014200000` (eleven migrations), following authoritative entity migrations `20261013180000`–`20261013200000`. They install managed account operations/audit, profile recovery, private attachments, core record management, empty-school provisioning, staff normalization, duplicate-account protection, dataset invalidation, demo/live isolation/integrity, secured operational RPCs and explicit retained-demo-school labels.

Edge functions: `manage-users`, `approve-account`, `provision-school`, `bootstrap-demo-masters`, `parent-workspace`, `parent-chat`.

Main RPCs: `begin_user_management`, `finish_user_management`, `complete_my_profile`, `get_school_records`, `save_school_record`, `read_school_dataset`, `save_school_dataset`, `school_integrity_report`, `complete_document_attachment`, `record_security_shift`, `publish_school_announcement`. Provisioning finalization and trusted metadata writes are service-only.

The repository contains historical duplicate migration versions and unapplied older October migrations. Deployment used a staged, reviewed migration chain matching remote history; do not blindly push the root history or edit already-applied migrations. Fresh-install migration-history reconciliation remains required before offering unattended installation.

## Verification

- Unit/regression suite: 90 tests, including explicit demo/QA versus live-account validation.
- SQL policy/behavior suites: user management 33 assertions; school records 38; private attachments 16; school provisioning 9; demo/live isolation, integrity, family privacy and operational RPCs 41.
- Browser management tests cover seven roles, restricted role choices, locked school, save/error feedback, duplicate prevention, retained input, multi-guardian UUIDs and assignment permissions.
- Real Auth account suite previously passed 85 assertions: invitation exchange, password creation, first login, reused token denial, profile changes, activation/deactivation and tenant isolation.
- End-to-end school suite passed 103 assertions against an isolated QA school and real accounts, two teachers, two parents, five learners, two classes, three subjects and assignments. It verified UUID consistency, family/teacher visibility, notifications, profile update propagation without duplicates, separate sessions, private photo storage, operational publishing and browser login across all seven roles without JavaScript exceptions. All nine QA accounts were deactivated afterward and historical records retained.
- Deployed original demo-school integrity check: zero critical issues, with 18 unlinked staff contacts, 86 unresolved legacy identity entries and one legacy notice without a recipient UUID retained for review. Bootstrap returned 403 while disabled; the removed public credentials document returned 404. The freshly created QA school's integrity check also returned zero critical issues.

## Remaining limitations

This is ready for continued **controlled demo/QA**, not an unconditional real-school pilot sign-off.

- Real school and named administrator onboarding is deferred by user choice. Shared demo credentials must not be used for a real school deployment.
- HTTPS setup URLs are configured and manual real Auth links tested. Real inbox delivery/SMTP and SMS delivery have not been verified. Configure the SMS provider credentials only in backend secrets; missing configuration returns an error instead of pretending to send.
- Genuine scannable visitor QR generation is not implemented. The decorative demo pattern is labelled and blocked for live/QA credentials; manual visitor IDs remain available.
- Existing historical demo identity warnings require administrator review or a new clean live school. Historical Security identity merges need an audited reconciliation path.
- Realtime reconnect/device soak testing and fresh-install migration-history reconciliation remain outstanding.
- No real mobile camera hardware, Android Chrome or iOS Safari certification is implied by headless desktop browser testing.

Demo credentials are retained only in `tests/fixtures/demo-credentials.md`, outside the published static site. Test accounts and explicit QA records are fixtures; none are automatically copied into new live schools.
