# SchoolShield client updates

Target branch: test_v2. Preserve vanilla HTML/CSS/JS and Supabase.

## Implemented

- Authenticated `school_login_context` RPC checks the caller's own approved profile, account status, setup state, school code and school access separately. It avoids misleading approval errors caused by a nested profile/school read. No account is automatically approved or reassigned.
- Existing accounts receive recovery guidance instead of instructions to create duplicates. Login no longer defaults to one school's code.
- New or changed school codes are normalized to uppercase and must match CCC-000 in the provisioning form, backend service and database. Existing legacy codes remain usable to avoid locking out their users.
- Platform function requests refresh expired sessions once on HTTP 401, preserve operation IDs and do not retry HTTP 403. The sign-in link stays hidden during verification. Platform entry auditing occurs once per tab session. Existing logout goes to super-admin-login.html.
- Portal colours save through a platform-authorized RPC with revision conflict detection, audit history and validated hex values. Preview and separate logo/colour cancellation controls are available. School branding applies only after confirmed tenant identification.
- Report a problem opens a form on school pages. Reports persist in the existing per-school super-admin Operations queue, with identity derived from the authenticated profile. Ticket submission is idempotent and limited to ten new reports per user per hour. Other users cannot read or overwrite tickets. Email uses a server-configured recipient and sender; no browser-supplied recipient is accepted.
- Static forms show required markers and reject whitespace-only required text. Existing action-driven required-field validation remains in place.
- Invitation metadata and email templates explain school, role, code, setup steps and expired-link recovery.
- Fixed the live-chat contact list selector so it returns a list rather than one element.

## Already present and preserved

Government Official visitor type; local-time greetings; private document/photo capture and retrieval; incident affected-item lists; canonical security officer persistence and clickable profiles; scheduled and actual security shift times; announcements; teacher quarterly reviews/targets; realtime form preservation; and invitation/recovery exchanges already existed on this branch. Existing automated checks covered these paths. Their presence does not prove the deployed backend has every migration or that a reported production account has been repaired.

## Verification completed

- Existing full unit run: 144 passed, one optional real-image codec test skipped.
- Existing build checks passed.
- New problem-report handler tests: three passed, covering authorization, server-selected email recipient, duplicate email claims and saved-ticket survival after email failure.
- New database suite: 29 checks passed with PGlite, including login states, legacy codes, tenant isolation, branding revision conflicts, ticket ownership/rate limiting and service-only email claiming.
- Browser check with an isolated fictional backend confirmed colour preview/save and cancellation restoring saved colours. Login required markers rendered correctly.
- Final incremental checks: new form/report JavaScript syntax, Supabase TOML parsing and whitespace validation.

## Required deployment and remaining limits

These source changes have not been applied to the live Supabase project in this task. Deploy the backend before the frontend login changes:

1. Apply the three new migrations in order: 20261105090000, 20261105091000 and 20261105092000. They assume the branch's earlier migrations are installed.
2. Deploy manage-users, provision-school, school-branding and report-problem with the checked-in function settings. Each handler verifies the Auth user and its required school/platform authority internally.
3. Install the invite and recovery templates from supabase/templates in the hosted Auth configuration, and retain the canonical HTTPS account-setup.html/login.html redirect allowlist. Set SCHOOLSHIELD_ACCOUNT_SETUP_URL, SCHOOLSHIELD_MANUAL_SETUP_URL and SCHOOLSHIELD_PASSWORD_RESET_URL appropriately.
4. For problem-report email, configure RESEND_API_KEY, SCHOOLSHIELD_SUPPORT_FROM (verified sender) and SCHOOLSHIELD_SUPPORT_EMAIL. Tickets remain saved without these settings; the UI does not claim email delivery. A provider timeout leaves delivery uncertain; retrying the same ticket uses its idempotency key. A function crash after claiming email can leave its status Sending, requiring operator review before retry.
5. SMS still requires the existing Twilio provider configuration. No SMS or real email was sent during QA.
6. Verify the reported accounts and original platform operation against the deployed backend. Missing profiles, incorrect passwords, absent platform membership and unapplied migrations require account-specific operator review; this code does not bypass those checks.
7. Complete live multi-role/cross-device checks, real camera capture, Android/iOS keyboard tests and email/SMS delivery checks before calling the pilot production-ready.

Unauthenticated users cannot submit support tickets. The login-page report form directs them to their school administrator when no authenticated school profile is available.
