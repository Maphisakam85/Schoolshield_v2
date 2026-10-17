# Super Admin completion review - 17 October 2026

Review branch: `review/super-admin-qa`, based on `test_v2` / `de81b8a`.
Release decision: **ready for code review and isolated staging QA; not certified
for a live pilot**. No merge, deployment, remote migration, real invitation,
real-school suspension or client account creation was performed.

## What was verified, and where

The platform browser fixtures use **Mmulakgoro QA (fictional)** and **Ntebaleng QA
(fictional)** with different school UUIDs, codes, branding and account collections.
The directory suite also uses fictional Alpha/Beta schools. All fixtures are local;
these names do not provision actual schools. PGlite exercises the repository's
actual migration SQL, RLS, triggers and RPCs under simulated Auth UUIDs/DB roles.
It is not a deployed Supabase instance. Browser routes and Auth/provider/storage
calls are mocked unless the table explicitly says otherwise.

| Area | Result and evidence | Testing level |
| --- | --- | --- |
| Owner access | Verified-email allowlist, revoked/banned/unverified denial; all seven school roles denied platform RPCs; browser role spoof does not grant access | Local SQL + mocked Edge/browser |
| School directory/identity | Search, read-only codes, canonical UUID edits and switching; selected name/code remain visible | Local SQL + mocked browser |
| ID tampering | Wrong-school account/ticket targets and branding paths rejected; other-school rows unchanged | Actual local SQL/RLS + mocked service |
| Provisioning | Duplicate code/name/operation checks; Auth/link failure recovery reuses reservations and Auth UUID; empty live-school bootstrap | Local SQL + mocked Auth/Edge |
| Branding | Genuine PNG/JPEG/WebP codec tests, MIME/content/size validation, private paths/policies, failure retention, replacement/reset, late-response/logout/school isolation and PDF aspect ratio | Local real codecs + SQL; Storage/browser mocked |
| Open forms/switching | Account and support navigation cancellation retains school A entries; accepted switch shows school B without submitting old form; form close/refresh guards and clear-on-confirmed-save added | Mocked browser, native browser beforeunload |
| Account access | School-only roles, confirmed changes, protected owner, last active Principal, deactivation/reactivation, partial-operation recovery, no assignment/family editing | Local SQL + mocked Auth/Edge/browser |
| Invitations/resets | Canonical setup/recovery route generation and real Auth API call contracts; no default passwords; provider/manual outcomes distinct; failed invitation resumes same UUID | Mocked Auth/email/SMS; local profile/RPC tests |
| Suspension/reactivation | Seven school roles denied subsequent school RPCs/raw table reads; owner recovery preserved; other QA school unaffected; unchanged payload after reactivation | Actual local SQL/RLS with simulated JWT claims |
| Feature controls | Only Announcements/Appointments exposed; invalid keys denied; navigation, data projection and mutation guards; records preserved | Local SQL + mocked browser/unit |
| Support/diagnostics | Owner-created tickets, school isolation, optimistic revisions/idempotency, stored internal notes; diagnostic operation references omit raw errors/tokens | Local SQL + mocked browser |
| Audit history | Actor from auth.uid(), school/action/search/date filters; append-only trigger and denied UPDATE/DELETE/raw SELECT | Actual local SQL + mocked browser filters |
| Academic boundary | No academic links/forms/RPCs in platform pages; school staff retain existing academic workflows | Source contract tests + school workflow regressions |
| Mobile/keyboard/states | 1366/390 px portal runs; keyboard activation/focus in dialog, focus-visible styling, no page overflow in operations, empty states, disabled duplicate submits, safe failed saves and confirmed feedback | Headless desktop Edge with viewport emulation |
| Security preservation | Security HTML changes are branding script wiring only; production shift/photo/incident handlers preserved; helper loaded in old photo-test fixture | Diff review + local SQL + mocked browser |

## Final test runs

- **125 unit/service tests passed, zero skipped**, with `BRANDING_CODECS` set,
  including actual local PNG/JPEG/WebP decoding and sanitised-error tests.
- **272** full migration-chain pilot/privacy/platform SQL assertions passed.
- **33** ordinary User Management SQL/RLS assertions passed.
- **38** school-record management SQL/RLS assertions passed.
- **147** teacher-performance SQL assertions passed, covering the existing school
  feature, roles/tenants, terms, margins, missing data, workflow and audit.
- **16** installed attachment/private Storage SQL assertions passed.
- Security-shift SQL suite passed ownership, tenant/role denial, overnight shifts,
  duplicate active shifts, immutable audit times and legacy/raw-save protection.
- Platform directory, branding/accounts and lifecycle/support/audit browser suites
  passed at 1366/390 px, including open-form switching and safe error updates.
- Existing User Management, school records, Security shifts, Security photos,
  learner report/PDF, Principal/Deputy performance drilldown and realtime form
  preservation browser suites passed at their documented desktop/mobile sizes.
- Existing chat suite passed **nine viewport/channel cases** at 360x800, 390x844
  and 412x915, with simulated keyboard resize, drafts/focus/cursor/incoming messages
  and history scrolling. These were not physical Android/iOS keyboard tests.
- Relevant JavaScript syntax and `git diff --check` passed. Portal browser suites
  collected no page JavaScript exceptions. No claim is made about console/network
  behaviour on a deployed Supabase project.

One pre-existing browser assertion expected a raw provider error string. It was
updated to expect the safe user-facing message after sanitisation. Production
Security logic was not changed to make tests pass.

## Reproduction

Use local test dependencies outside the repo. Set these paths to your actual
installed modules; they are not secrets:

```powershell
$env:PGLITE_MODULE = '<local node_modules>/@electric-sql/pglite'
$env:PLAYWRIGHT_MODULE = '<local node_modules>/playwright'
$env:BRANDING_CODECS = '<local node_modules containing pngjs and jpeg-js>'
node --test @(rg --files tests -g '*.test.cjs')
node tests/pilot-readiness-rls.cjs
node tests/user-management-rls.cjs
node tests/school-records-rls.cjs
node tests/security-shifts-rls.cjs
node tests/teacher-performance-final-rls.cjs
node tests/installed-attachments-rls.cjs
node tests/platform-admin.browser.cjs
node tests/platform-branding-accounts.browser.cjs
node tests/platform-operations.browser.cjs
```

Browser scripts currently use the installed Windows Edge executable. Adjust that
test setting for other environments. Never run `*.live.*` suites against a live
school for this review. Codecs: pngjs 7.0.0, jpeg-js 0.4.4; the vendored WebP runtime
and licence information are in `supabase/functions/school-branding/vendor`.

## Fixes made during this review

- Track actual edits in platform branding/account/access/support forms, warn on
  navigation, confirm discard and clear warnings after confirmed saves.
- Keep a pending access-control form intact when support records refresh.
- Preserve confirmed-success feedback if the subsequent read fails, rather than
  reporting that an already-confirmed operation failed.
- Replace raw administrative error strings with controlled messages and operation
  references; invitation/operation rows no longer echo stored provider errors.
- Add explicit support/diagnostic/audit empty messages and keyboard focus outlines.
- Add academic-scope and safe-error contract tests and expand open-form school
  switching/keyboard/empty-state browser coverage.

## Completion checklist and remaining gates

- [x] Separate backend-enforced owner access, no Principal escalation.
- [x] School metadata/provisioning, private branding and account administration.
- [x] Independent lifecycle/data modes, compatible defaults and module controls.
- [x] Owner support, safe diagnostics and immutable searchable audit history.
- [x] Two fictional QA tenants, denial/tampering/recovery tests.
- [x] Existing school academic and colleague-owned Security regressions.
- [x] Owner guide, secure verified-UUID bootstrap, migration order and recovery.
- [x] Local review branch and draft PR description.
- [ ] Remote PR: not opened/pushed, to avoid triggering an unapproved Vercel
  deployment. Establish a non-deploying review target or disable automatic preview
  deployment before publishing this branch. No merge is authorised.
- [ ] Apply migrations and deploy coordinated routes in an authorised **isolated
  staging project**, then test actual Supabase REST/RLS, Storage and Realtime.
- [ ] Verify packaged Deno/WASM behaviour and real two-session Auth flows there.
- [ ] With explicit separate authorisation, verify actual invitation/reset email
  and configured SMS delivery. This QA sent none.
- [ ] Confirm real school/contact details before rollout; Mmulakgoro first, then
  Ntebaleng. Do not guess emails, mobile numbers or EMIS numbers.
- [ ] Physical Android Chrome/iOS Safari, accessibility/screen-reader and device
  camera/keyboard checks remain outstanding.

Existing document signed URLs retain their 60-second lifetime after suspension;
already downloaded/offline data cannot be erased. In-flight service requests may
finish. Old/private orphan logo cleanup is not included. No owner credentials are
provisioned automatically. These are known release considerations, not verified
live behaviour. See the [owner guide](super-admin-owner-guide.md) and
[local draft PR](super-admin-pr.md).
