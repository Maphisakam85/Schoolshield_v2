# SchoolShield platform owner guide

Status: implemented locally; remote release and live QA are outstanding. There
are no shared Super Admin credentials. Use your own verified Supabase Auth account
after an authorised SQL operator explicitly grants platform membership.

## Bootstrap and migration order

Use the verified Auth UUID and independently verified email procedure in
[super-admin-portal.md](super-admin-portal.md#secure-owner-bootstrap-operator-only).
Never paste credentials into source, create a school role called Super Admin, or
use a Principal's browser role to authorise platform access. Prefer a dedicated
owner identity without a school profile. Store recovery access with an authorised
operator. If a pending account change blocks bootstrap, finish or investigate that
operation first; do not bypass the protection.

Review the existing migration history first. In a release, apply all preceding
repository migrations in their established order, then these six new migrations:

1. `20261015100000_platform_administration.sql`
2. `20261015110000_platform_school_management.sql`
3. `20261015120000_private_school_branding.sql`
4. `20261015130000_platform_school_accounts.sql`
5. `20261017100000_school_lifecycle_features.sql`
6. `20261017110000_platform_support_audit.sql`

Do not re-run historical seed scripts against live schools. Inspect the migration
diff and take a backup before an authorised release. No migration above has been
applied remotely during this work. All bootstrap SQL in the technical guide is a
manual operator procedure, not an automatic account creation script.

Coordinate the database, frontend and Edge release: `provision-school`,
`school-branding`, `manage-users`, `approve-account`, `parent-workspace` and
`parent-chat`. Package branding WASM using `supabase/config.toml`; verify it in the
actual Deno Edge runtime. Apply the new database API before the new UI. Do not
leave old service-privileged Edge routes running once suspension controls are
exposed. Review that rollout in staging before any production release.

Required configuration remains server-side: Supabase service credentials,
`SCHOOLSHIELD_ACCOUNT_SETUP_URL` (HTTPS `/account-setup.html`),
`SCHOOLSHIELD_PASSWORD_RESET_URL` (HTTPS `/login.html`), Supabase Auth redirect
allowlist and email delivery. SMS additionally requires the existing configured
SMS provider. `SCHOOLSHIELD_ALLOW_QA_PROVISIONING=true` is for isolated demo/QA
provisioning only. Never expose service keys through static configuration.

## Daily use

1. Open `super-admin-login.html` and sign in with the verified owner account.
2. Search the directory. Select a school and check both its **name and code**.
3. Use School details for name, EMIS, address and contact edits. Established codes
   and tenant UUIDs are fixed. Save with a reason and wait for confirmation.
4. Branding shows the saved logo separately from the proposed replacement.
   Upload PNG/JPEG/WebP up to 2 MB and 2048 by 2048 pixels. Save before leaving.
   Reset restores the generic SchoolShield logo and preserves tenant isolation.
5. Accounts provides school-only roles, identity/contact edits, status changes,
   invitations and resets. Confirm access changes. Do not move accounts between
   schools. The last active Principal and platform-owner identity are protected.
6. Lifecycle, support and audit contains school availability, module switches,
   owner-created tickets, safe operation diagnostics and filtered audit history.

Academic setup, teaching assignments, learner/guardian links, marks and reviews
remain with authorised school staff in their existing portals. The platform
portal has no academic management or impersonation controls.

Onboarding/Pilot/Active allow school use. Suspended blocks subsequent backend
requests, including requests from existing school sessions. Lifecycle is separate
from Live/Demo/QA data mode. Existing schools remain Active with both supported
feature switches enabled; new schools start Onboarding with clean operational
data. Announcements and Appointments can be switched off without deleting their
records. Other modules and shared authentication/notifications cannot be disabled
here; unsupported feature keys are rejected.

Support tickets are labelled **Owner-created**. Use operational descriptions and
internal notes only. Do not enter tokens, passwords, medical details, private
family information or academic records. No messages are automatically sent to
schools. Audit search supports school, exact action, date range and text matching
school/action/actor/operation. Dates use UTC boundaries. Events are append-only;
trusted bootstrap events identify their database operator.

## Recovery

- **Unconfirmed save:** retain the entries and operation UUID. Check safe
  diagnostics, refresh confirmed records and resume the original operation.
  An upstream timeout does not prove that nothing was saved.
- **Partially provisioned school:** use Retry incomplete provisioning. Do not
  create a second school or second Principal to repair the first. Auth UUIDs and
  school reservations are reused. Recover Principal setup links where offered.
- **Invitation failure:** verify the canonical URL, redirect allowlist and
  provider configuration, then resend/resume. Generated manual links are private
  bearer credentials: deliver them securely. Sent means provider acceptance, not
  proof of inbox delivery. Never use a shared default password.
- **Suspended school:** the owner can still select it. Confirm reactivation to
  Pilot or Active with a reason. Existing records and accounts are retained.
- **Logo failure:** retain the existing logo, retry the original request and
  refresh confirmed branding. Old or uncertain uploads remain private; no orphan
  cleanup job is provided in this section.
- **Unsaved form:** navigation warns before leaving; closing an edited modal or
  refreshing an edited form requires confirmation. Cancelling keeps the draft in
  that page. Confirmed saves clear the warning. Forms are not a cross-device draft
  backup; save or explicitly discard before switching schools.
- **Lost owner access:** an authorised SQL operator can inspect membership/Auth
  state and use the verified-UUID bootstrap/revocation procedure. School staff
  cannot grant themselves platform access.

Suspension cannot erase already downloaded or offline-cached information. Existing
document signed URLs expire on their current 60-second TTL; in-flight service
requests may finish. Do not delete historical profiles, tickets or audit events
as a recovery method. See the [QA report and checklist](super-admin-qa.md).

## Password-free visual review

Open `super-admin-review.html`, or use the demo link on the real sign-in page.
It uses two fictional schools in memory and has no Supabase client, credentials,
network API access or real account actions. Refresh resets changes. Demo audit
events and save feedback are labelled simulations. Real portal authentication
and backend RLS remain enabled. This is a visual review, not live Auth testing.
