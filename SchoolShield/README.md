# SchoolShield

SchoolShield uses shared HTML/CSS/JavaScript pages and real Supabase Auth accounts.
Navigation reflects the signed-in profile; backend RPCs, RLS and private Storage
policies enforce role and school permissions. Browser/session storage is a cache,
not the authoritative school dataset.

## Pilot administration

- **Administration > User Management:** real accounts, invitations and access.
- **Administration > School Records:** staff, learners, guardians, grades,
  classes, subjects, dated teaching assignments and data-integrity checks.
- New live schools start empty. Account/profile/staff relationships use UUIDs.
- Demo and QA schools are explicitly labelled and isolated. Demo bootstrap is
  disabled by default and can never run in a live school.
- Development credentials are documented only in
  [test fixtures](../tests/fixtures/demo-credentials.md); they are not deployed
  with the browser application and are not required for live accounts.

See [pilot setup and verification](../docs/pilot-readiness.md) for backend
configuration, migrations, permissions, test evidence and current limitations.

## Hosting

The existing Vercel project serves `SchoolShield/` at the deployment root. Run
JavaScript checks and relevant tests before deployment. Only public Supabase
configuration belongs in `supabase-config.js`; service credentials and provider
keys stay in Supabase Edge Function secrets.
