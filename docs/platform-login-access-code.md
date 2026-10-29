# Main login and platform access

The main `login.html` accepts a school code or a private admin access code with
email and password. Password authentication uses a temporary client. The
`authorize_platform_login` RPC checks trusted platform membership and the code
before persisting the session under `schoolshield-platform-auth` and routing to
`super-admin.html`. School accounts retain their existing profile, school code,
activation and onboarding checks. The standalone platform login requires the
same server check.

Migration `20261029100000_platform_access_code.sql` stores only a bcrypt hash in
an inaccessible table. Five incorrect attempts lock code verification for 15
minutes per administrator. Successful verification is bound to the Auth session
UUID for eight hours. Platform RPCs and platform read policies require that
session authorization, alongside active membership and verified email. Knowing
the code never grants platform membership. Auth password limits remain managed
by Supabase.

Operator code configuration and owner provisioning are separate from migrations.
The private local `.env.super-admin-access.local` handover is gitignored and was
excluded from the deployment. Code rotation should also delete existing rows in
`platform_login_sessions` to invalidate prior authorizations.

Released on 29 October 2026 to https://schoolshieldv2.vercel.app. Local and Vercel
build checks passed: 149 tests, one skipped. Rollback-only database checks passed
for code verification, protected RPCs, throttling, session isolation, expiration,
school-role denial and secret-table permissions. Published login scripts were
fetched and checked; anonymous gate calls returned 401. The owner's password was
not requested or used for testing.

The initial root migration dry run detected older local versions absent from
remote history. This release fetched remote history into an ignored staging
directory, added only this migration, and used `db push --linked` there. The dry
run and applied result both listed only `20261029100000_platform_access_code.sql`.
No earlier migrations were replayed or marked applied.

Follow-up on 29 October: replaced the generated code with the owner's requested
short code (stored only in the private operator handover and the database hash),
cleared previous code sessions/lockouts, and renamed the login field to School
access code. The standalone sign-in now shares the main login's responsive
layout and no longer links to the fictional review. Desktop/mobile screenshots
and portal browser tests passed.

Migration `20261029110000_platform_portal_startup.sql` fixes a reproduced startup
failure: a school lifecycle wrapper had added `assert_account_access()` to
`open_platform_admin_portal`, blocking owners without a school profile. The
function retains its platform session gate, operation validation and idempotent
audit insertion. Rollback-only database tests now exercise portal opening and
directory loading after code authorization, in addition to denial scenarios.
