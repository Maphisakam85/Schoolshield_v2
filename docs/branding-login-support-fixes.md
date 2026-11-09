# Branding, sign-in and school problem reports — 9 November 2026

## Implemented

- Branding has explicit Cancel logo changes and Cancel colour changes controls. Each uses the existing discard confirmation and restores the last server-confirmed data locally, even offline; cancelling one form preserves the other form's draft.
- Colour saves validate required entries, show saving feedback, abort after 20 seconds, retain the operation UUID on uncertain failure, release disabled controls and clear the draft only after confirmation. A missing initial record is handled without an uncaught exception.
- The colour preview's View updates is a real keyboard-accessible button opening preview-only content. It does not grant platform owners access to school academic records.
- Login distinguishes a failed profile lookup from a school-code mismatch and compares school codes consistently. Inactive and incomplete-setup accounts remain denied. Auth errors distinguish confirmation, throttling and service outages; existing-account users are directed to password recovery rather than duplicate registration. No approval, school assignment or Auth account is created by the browser.
- School pages have a Report problem button in the header. The HTML form requires a title, category, description and priority. The shared required-field utility marks required controls and rejects whitespace-only required text without making optional fields mandatory.
- School reports reuse `platform_support_tickets`; school and actor come from the authenticated server context. Reports are idempotent, limited to ten new reports per user/hour, audited and queued for owner email. Ordinary users cannot read tickets/internal notes or the mail queue. Super Admin lists ticket origin.
- Removed an existing duplicate local declaration in `teacherClasses` that prevented `app.js` from parsing. No Security Officer functionality was replaced.

## Installation and configuration — not deployed in this change

1. Preserve migration history. Existing colour migration `20261029120000_school_portal_themes.sql` is already recorded on the linked database; do not replay old demo/bootstrap migrations.
2. Apply `supabase/migrations/20261109100000_school_problem_reports.sql` after the existing platform support migration. It adds school-reported origin, a private email outbox and `report_school_problem` RPC. No existing ticket is deleted.
3. Deploy `support-email-dispatch` with the checked-in `verify_jwt=false` configuration. The function validates its own high-entropy `SUPPORT_DISPATCH_SECRET`; it rejects requests before using service credentials. Never put this secret or the Resend key in browser configuration.
4. Configure server secrets `RESEND_API_KEY`, `SUPPORT_OWNER_EMAIL` (verified platform owner's recipient), `SUPPORT_EMAIL_FROM` (verified sending domain/address) and `SUPPORT_DISPATCH_SECRET`. Use the provider dashboard to verify sending-domain configuration.
5. Schedule an authenticated POST to `/functions/v1/support-email-dispatch` with `Authorization: Bearer <SUPPORT_DISPATCH_SECRET>`. Use a server scheduler/secret store, not a browser timer. The dispatcher processes up to twenty pending items per call. Configure one scheduler. Provider or network failure leaves items pending.
6. Email contains only a ticket reference and a sign-in instruction, not ticket text or school/family/health data. A `Sent` queue row means the provider accepted the email, not that a mailbox delivered it. Provider idempotency covers 24 hours: prolonged uncertain delivery requires investigation before retrying beyond that window. See [Resend idempotency documentation](https://resend.com/changelog/idempotency-keys).
7. Publish the changed static files together. Until the new migration is applied, reporting fails safely and retains form entries. Email remains queued until the dispatcher is configured and run. No real invitations or emails were sent during this QA.

## Verification

- Fifteen focused login, theme and mocked email tests pass.
- Two isolated PGlite database integration tests pass (multiple assertions): required/NULL/whitespace validation, tenant identity, idempotent retries, cross-school reference tampering, private table access, anonymous denial and audit creation. These use minimal schema fixtures, not the live database. The theme migration is also executed and tested for persistence, replay safety, revisions, NULL rejection, two-school isolation and ordinary-user denial.
- Mocked Edge browser checks at 1366px and 390px pass: save, retained failure, cancel, preview, whitespace rejection, report submission, server-selected tenancy and closing the report form.
- Read-only live checks confirm the colour RPC and migration exist; there were zero saved colour rows/audit events at inspection. Specific affected users and the actual colour-save error are still needed to establish the reported live failures' causes. Owner-only Auth users may intentionally lack a school profile; no account was automatically relinked.
- Broad existing unit suite is not clean: latest run before adding the login-profile/email tests showed 82 passed, 71 failed, 2 skipped. Failures include test harnesses without `setInterval`, parent helper `escapeHtml`, and existing chat/static expectations. The earlier duplicate-declaration syntax failure is fixed. Do not treat the focused checks as full-system readiness.

## Test commands

Install QA dependencies outside the repository, then set `PGLITE_MODULE` and `PLAYWRIGHT_MODULE` to their module directories.

```powershell
node --test tests/login-routing.test.cjs tests/login-profile.test.cjs tests/school-theme.test.cjs tests/support-email.test.cjs
node --test tests/problem-reports.test.cjs tests/theme-persistence.test.cjs
node tests/branding-fixes.browser.cjs
node --check SchoolShield/app.js
git diff --check
```

## Remaining limits

- No production deployment, migration application, real email delivery or real-user login repair was performed.
- Account-specific failures need the affected email and school code, never a password. Auth account existence does not establish school approval; a trusted administrator must verify existing identity before any repair.
- Shared browser required-field enforcement complements existing server validators. The new report RPC and existing colour RPC enforce their own required fields; this change is not a claim that every historical optional database column is now NOT NULL. Such constraints require entity-specific legacy-data review.


## Login corrections after screenshot review

Required markers are grouped with their label caption rather than appended after block inputs. Login/SOS spacing was compacted without disabling scrolling at zoomed or unusually small viewports. Browser checks confirm no page scroll at 1366x600, 1366x768, 390x844 and 390x640. The restored placeholder is School code access. HTML tab titles use an ASCII separator and include the generic SchoolShield favicon.

Owner access-code entry additionally supports C0C-CCC (e.g. A0A-ABC) and CCC-000 (e.g. ABC-001). School creation remains CCC-000. Formatting a code does not configure its server-side hash, grant membership or bypass Auth. Existing ADMIN compatibility is retained. No new owner code or password was guessed or configured. The pending code-format migration still configures ADMIN when explicitly applied; operators using a different verified owner code must preserve/configure its hash in the trusted backend.

Sign-in calls have bounded waits and retain credential, account-status and school checks. Workspace initialization also has bounded requests plus a final error handler. Failed profile reads preserve the session for retry; failed or stalled school data loads show an HTML retry screen instead of leaving the loading placeholder indefinitely. Optional teaching-assignment notices and Principal-name lookups cannot block indefinitely. The problem-report button remains available on the retry screen.

Verification: seventeen focused unit checks, an isolated SQL integration test (cryptographic digest functions mocked), and mocked browser success/timeout cases across four viewport sizes pass. The SQL test covers both owner code formats and ordinary-user denial. Real-user sign-in, real email and deployment were not exercised. This confirms local behavior, not resolution of an unknown live account or backend outage.


## Invalid access-code progression

Access-code entry now rejects malformed partial input, including numeric-only codes such as 111-111. An inline error explains the required format. Tab and attempts to focus later input fields remain on an incomplete/invalid code; backward navigation and buttons for switching to account creation/recovery remain available. Correcting the code clears the error and restores normal focus progression. Submission retains native validation and the existing pre-authentication/server gates.

Verified locally: partial-pattern unit tests and desktop/mobile browser checks for rejected numeric input, inline errors, blocked Tab/next-field clicks, form switching, corrected input and successful mocked sign-in. Missing-report-backend and access-denial feedback tests verify safe messages, retained entries, stable operation references and re-enabled buttons.

A read-only linked-database check confirmed report_school_problem is absent and migration 20261109100000 is not applied, while read_school_dataset is present. No live migration was applied. Further schema inspection was not approved; the reported live workspace load failure is not diagnosed or declared resolved by this field-validation change. The report form now distinguishes missing server setup from a generic network failure without exposing raw provider errors.
