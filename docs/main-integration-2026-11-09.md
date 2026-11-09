# Main integration review — 9 November 2026

> **Backend application update, 9 November 2026:** Subsequent backend work installed the three pending SQL migrations and removed the owner-code reset before installation. The outstanding-configuration section below records the earlier Git integration. See [the application record](backend-migrations-applied-2026-11-09.md).

Source: `test`, including the recent login, access-code, required-field, branding,
support reporting, Super Admin navigation and migration-audit updates. Baseline:
`main` at `29368aa`; original test tip `5ddee0a`. Existing work was captured in
`3572129` during the review and retained.

## Reconciliation

- Restored main's HTML/URL escaping, workspace draft protection, learner history,
  notification read tracking and filtering, staff linking, quick-access buttons,
  single-open navigation and mounted chat switching/sending controls.
- Restored account activation/setup checks, backend school-access and feature
  checks, school data mode and authenticated branding identification at startup.
  Kept bounded requests, retry feedback and nonblocking optional notifications.
- Preserved the Security Officer shift/evidence workflows and SOS implementation.
  Connected its dashboard controls to the existing SOS handlers; removed duplicate
  script includes. Background SOS failures no longer create unhandled rejections.
- Removed the duplicate declaration that prevented the committed test app parsing.
- Updated the workspace fixtures to exercise backend school access, suspension,
  mismatched school IDs and inactive/incomplete accounts. Updated outdated login
  error and rejected-input expectations without weakening access checks.

## Local verification

- `node scripts/build.cjs`: 178 passed, zero failed, one optional image-codec test
  skipped because `BRANDING_CODECS` is not configured. PGlite SQL fixtures enabled.
- Syntax checked every top-level SchoolShield JavaScript file. No functions from
  main's app.js were lost. No duplicate external script includes in school HTML.
- Four Playwright suites passed using Edge: login layout/sign-in timeout and retry
  at four viewport sizes; shared-login redirect and lifecycle controls; branding
  save/cancel/report feedback; Super Admin navigation, logout and denial.
- Browser Auth/API responses were mocked. SQL fixtures used isolated local
  databases; owner-code digest functions were mocked in that fixture.

## Outstanding backend configuration

This Git integration does not apply SQL, deploy Edge Functions, send invitations
or emails, or change real schools. Follow `supabase-migration-audit-2026-11-09.md`
for pending SQL, deployment dependencies, history gaps and recovery precautions.
The pending access-code migration changes the configured owner code to ADMIN;
review that explicitly before applying it to an existing owner configuration.

The inherited SOS code references `panic_alerts` and `set_panic_alert_status`, but
this repository contains no migration defining them. Its live backend availability
is unverified; do not treat it as a guaranteed emergency delivery mechanism. The
pre-login SOS button also has no backend submission workflow. These pre-existing
gaps require a separate backend design/verification task.

Live affected-user login, real mail/push delivery and live tenant-isolation tests
were not performed. Passing local checks does not certify those configurations.
