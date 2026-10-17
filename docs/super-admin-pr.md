# Draft PR: Separate platform-owner administration and isolated school operations

Base: `test_v2` at `de81b8a`. Head: `review/super-admin-qa`.

School Principals previously shared a provisioning authority path with platform
administration. This change introduces a verified Auth-UUID platform allowlist
and a separate portal/session for the owner. It adds a canonical school directory,
contact editing and resumable empty-school provisioning; private branding;
school-scoped account administration; lifecycle/module controls; owner-created
support tickets; safe diagnostics and immutable audit history.

School roles, teaching assignments, learner/family relationships and academic
management stay in school portals. No impersonation or academic owner UI is
introduced. Existing school layouts only gain authenticated branding script
wiring. The colleague-owned Security production handlers are preserved.

Review the six ordered migrations and coordinated Edge/frontend rollout in the
[owner guide](super-admin-owner-guide.md). No owner is automatically bootstrapped,
no credentials are included, and existing-school compatibility defaults are
explicit. Never merge/deploy this PR as a substitute for staging verification.

Validation and remaining gates: [QA report](super-admin-qa.md). SQL tests use
actual migration SQL in local PGlite; browser and Auth/provider tests use fixtures.
No live deployment, real school suspension, real invitation or client account
creation occurred. Actual Supabase Auth/Storage/Realtime, email/SMS and Deno/WASM
integration still require an isolated staging project and authorised release.

This is the local PR description. A remote PR is intentionally not opened by
pushing to the linked repository until automatic deployment behaviour is safely
disabled or an isolated review target is established. The requested QA forbids
deployment; this repository is associated with Vercel.
