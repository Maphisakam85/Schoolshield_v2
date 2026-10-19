# Main integration - 19 October 2026

Includes test_v2 through `61ce4fb` and preserves main's existing Speed Insights
integration. Resolves the in-progress merge conflicts without replacing the
colleague-owned Security handlers.

Included updates:

- Separate backend-enforced platform-owner portal, verified-UUID bootstrap and
  independent session; no ordinary Principal escalation or impersonation.
- Canonical school directory/contact management and resumable empty-school
  provisioning with duplicate/partial-failure protection.
- Private school branding, validated PNG/JPEG/WebP, previews/replacement/reset,
  school-specific headers/exports and tenant isolation.
- School-scoped account administration, real invitation/reset API workflows,
  last-Principal protection, activation/deactivation and audited access changes.
- Independent school lifecycle/data modes; suspension/reactivation and limited
  backend-enforced module controls.
- Owner-created support tickets, sanitised diagnostics and immutable audit search.
- Mobile/keyboard improvements, draft guards, save feedback, isolated password-free
  demo review and owner/bootstrap/recovery/QA guides.
- Password-reset requests use the configured deployed HTTPS login URL and an
  isolated recovery client; existing login PKCE remains unchanged.
- New forward migration `20261019100000_restore_account_request_delivery.sql`
  restores the missing six-argument Email/SMS request RPC and preference/phone
  columns. Preserves the old API, approval control, tenant selection and records;
  validates South African numbers and blocks suspended-school requests. It does
  not replay the older onboarding migration or change complete_my_profile.
- Main's Speed Insights assets and script wiring retained. Vercel uses a short
  npm build command with the existing checks retained in scripts/build.cjs.
  Temporary Supabase connection/config state stays ignored.

Verification: 127 unit/service tests, 20 request-delivery SQL assertions and the
build checks passed. Live API probes for both six-argument delivery methods failed
on deliberately empty names, confirming resolution and validation without storing
requests or sending invitations. The forward migration was applied transactionally
and recorded in the linked project's migration history. Actual email/SMS delivery
and the still-pending coordinated platform Edge release are separate concerns;
this change does not claim those functions were deployed.
