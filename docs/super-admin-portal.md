# Super Admin portal - implementation and technical reference

Implemented locally, not deployed. No real schools, Auth accounts or invitations
were created during implementation. Mmulakgoro is the first rollout priority,
then Ntebaleng; neither is provisioned from a guessed contact or EMIS number.

## Inspection and architecture

No applicable AGENTS.md was found in the repository or parent directories.
Reviewed school Auth/profile creation, per-tab Supabase sessions, the school-role
enum, tenancy/profile checks, school workspace initialization, current RLS,
private Storage, migration wrappers, manage-users and provision-school Edge
Functions, and the static Vercel build configuration.

The legacy provisioning endpoint used an environment allowlist of Principals.
That path is replaced by verified platform membership. Existing service-only
pilot-school SQL functions remain for migration compatibility; the Edge Function
no longer invokes them or accepts SCHOOLSHIELD_PILOT_ADMIN_IDS as authority.
The school User Management provisioning button/form moved to the separate portal;
school user creation/editing/invitations retain their existing implementation.

Platform administration uses the existing project, public Supabase configuration
and JavaScript SDK, with a separate sessionStorage key, schoolshield-platform-auth.
It neither sets schoolshieldRole nor creates a school profile for the owner.
Page layouts, forms, table rows and dialogs are defined in the new HTML files.
JavaScript clones those templates and renders values with textContent/value.
No service credential or setup token is persisted in the static source or audit.

Entry points:

- super-admin-login.html: separate owner authentication.
- super-admin.html: searchable school directory, provisioning and latest 100 audit events.
- super-admin-school.html?school=UUID: canonical school's name/code/UUID prominently
  displayed, contact editing, school-specific history and provisioning recovery.

## Secure owner bootstrap (operator only)

Do not run this with an unverified UUID or a guessed email. Use a dedicated,
existing Supabase Auth owner account where possible. Confirm the owner controls
the email through the normal Auth verification process. Copy the actual UUID from
Supabase Authentication and independently verify the account/email before granting
access. Do not add a super-admin value to app_role or trusted app_metadata.

After reviewing and applying all six platform migrations in the controlled release,
run the following in the trusted Supabase SQL console. Replace BOTH placeholders:

```sql
begin;
do $$
declare
 owner_uuid uuid := 'REPLACE_WITH_VERIFIED_OWNER_AUTH_UUID';
 expected_email text := 'REPLACE_WITH_INDEPENDENTLY_VERIFIED_EMAIL';
begin
 if not exists (
  select 1 from auth.users
  where id=owner_uuid and lower(email)=lower(expected_email)
    and email_confirmed_at is not null and deleted_at is null
    and (banned_until is null or banned_until<=now())
 ) then raise exception 'Verified owner identity did not match'; end if;
 insert into public.platform_administrators(user_id,reason)
 values(owner_uuid,'Initial owner bootstrap after independent identity verification');
end $$;
commit;
```

No administrator is bootstrapped by the migrations themselves. Bootstrap writes
an audit event with the SQL session user; there is no forged browser actor UUID.
Subsequent portal events derive actor_id from auth.uid(). SQL-console operator
events may have a null Auth actor; database_actor records their database identity.

Revoke without deleting history, from the trusted console:

```sql
update public.platform_administrators
set active=false, reason='Owner access revoked by authorised operator'
where user_id='ACTUAL_OWNER_AUTH_UUID';
```

Every RPC rechecks active membership, verified Auth email, Auth deletion and ban
state. A still-valid JWT does not bypass membership revocation. Ordinary school
roles, browser storage values and user metadata grant no platform privilege.
Configure and test owner MFA through Supabase before production use; this section
does not introduce a new MFA enrollment flow or require an unconfigured AAL2 policy.

## Migrations and authorization

- 20261015100000_platform_administration.sql: platform_administrators,
  platform_admin_audit, verified UUID checks, select-only RLS for owners, immutable
  audit events, grant/revoke-change audit trigger, checked context/directory and
  idempotent portal-open RPC.
- 20261015110000_platform_school_management.sql: optional canonical EMIS/address/
  telephone/email/contact columns, unique non-null EMIS, platform_revision,
  platform_school_provisions, checked school read/save and service-only provisioning RPCs.

Public browser RPCs: platform_admin_context, platform_admin_directory,
platform_admin_school, platform_admin_save_school, open_platform_admin_portal and
is_platform_administrator. Internal helpers cannot be invoked directly by browser
roles. Service-only reservation/completion/result RPCs recheck the verified owner
UUID supplied by the authenticated Edge Function.

No new access is granted to school_workspaces, profiles, academic tables or
Storage. No academic setup, teacher appraisals, marks, learners, class assignments
or impersonation are exposed by this portal. Existing school permission and
Security Officer attendance/shift/photo implementations are unchanged.

## School edits and provisioning recovery

School identity is schools.id; codes are read-only. Server writes accept only the
contact metadata projection, not arbitrary JSON columns, roles, school codes or
tenant IDs. Edits require a reason, expected revision and stable operation UUID.
Updates and before/after audit values commit together. Duplicate retry requests
return their confirmed result; stale revisions and operation reuse for another
school are rejected. Browser switching uses separate UUID-addressed pages, and
checks response UUIDs before showing or accepting data.

The Edge Function keeps the existing Auth admin → profile → canonical
account-setup.html workflow. It now requires platform_admin_context authorization
under the caller's verified JWT. Its service credential remains in Edge secrets.
The browser cannot supply actor authority or Principal app_metadata.

Reservation prevents duplicate code, non-null EMIS or case-insensitive school
name, serializes identical operation/name attempts and allocates stable school and
Principal UUIDs. Same-name schools need operator review rather than automatic
creation. The established empty-workspace trigger is reused; no seed/bootstrap
function is called. The intended Principal identity is a real account record,
not demo staff. No fake learners, teachers or operational records are added.

Auth/profile/link failures retain the operation, school and any existing reserved
Auth identity. Failure phase/status is recorded when the backend is reachable.
Retry uses the original fields/operation; it never adopts an unrelated Auth user
with the same email. Network failure cannot guarantee that an audit/error status
write succeeded, so success is never claimed without confirmation. Duplicate email
conflicts or unexpected Auth identities require operator review, not automatic
deletion/reassignment. Existing reserved fields cannot be rewritten to another
Principal under the same operation.

Provisioning results expose an administrator-only manual setup link. No email/SMS
delivery is claimed. Setup-link generation/recovery is audited without storing the
token. The originating owner can recover an awaiting-setup Principal link from the
school management page. Completed Principal accounts are not password-reset by
this feature. Deliver links privately after verifying the recipient.

## Outstanding release configuration

Nothing was deployed or applied to remote Supabase. Release requires review and
application of both new migrations, deployment of the updated provision-school
Edge Function and static pages, verified owner bootstrap, and HTTPS configuration
of SCHOOLSHIELD_ACCOUNT_SETUP_URL ending in /account-setup.html. Retain the existing
canonical Auth redirect configuration. The legacy pilot-admin environment
allowlist no longer authorizes this endpoint.

SUPABASE_SECRET_KEYS.default or SUPABASE_SERVICE_ROLE_KEY is used only by the Edge
Function, as before. Demo/fictional QA provisioning is off by default; enable
SCHOOLSHIELD_ALLOW_QA_PROVISIONING=true only for approved development/QA usage.
Live provisioning refuses .test Principal addresses. Actual rollout requires
confirmed school/contact/Principal details, beginning with Mmulakgoro, then
Ntebaleng. No email/SMS provider changes are required for manual-link delivery.

## Verification

- Unit/service/Edge tests: failed Auth/link recovery, stable UUID reuse, no false
  delivery claims, invalid mode/live fictional email rejection, JWT/platform denial
  and ignored forged actor_id. Existing unit suite remains passing.
- Full historical migration/RLS integration: verified owner without school profile,
  all seven verified school roles and other-school Principal denied, anonymous and
  direct membership/audit writes denied, append-only audit, revision/idempotency,
  wrong-school operation reuse, duplicate EMIS/code/name, empty new workspace,
  retained failed reservation, Auth/profile finalization and owner revocation.
- Browser fixtures at 1366 and 390 pixels: separate session, role denial despite
  stored Principal role, searchable directory, selected school heading/code,
  safe text rendering, actual A/B school switching, correct save target, read-only
  code, duplicate-submit prevention and failed-edit retention. Existing User
  Management browser regression remains covered.

All Auth identities and schools used by these tests are fictional in-process
fixtures. No live inbox, Auth service or deployed Super Admin flow has been tested.
Audit UI shows the latest 100 events; a paginated/export/retention interface is
outside these sections. No real-school pilot readiness is claimed.

## School branding section

Added super-admin-branding.html/.js and the shared school-branding.js module.
The Branding link is scoped to the selected school's canonical UUID. The page
shows the selected name/code, current logo, upload preview, replacement and
reset/removal. The existing logo is never removed before upload and metadata
persistence succeed. Failed saves retain the current logo and selected file.

Migration 20261015120000_private_school_branding.sql adds school_branding and
school_branding_operations, checked reads and a service-only commit RPC. The
school-branding Edge Function verifies the caller's platform-admin JWT before
accepting input. Neither ordinary school roles nor the browser can upload,
overwrite or delete branding objects directly. Active school accounts may read
only their school's current logo; platform owners may view current school logos.

Uploads are limited to 2 MiB and 2048 × 2048 pixels. PNG/JPEG/WebP signatures,
dimensions, MIME agreement and actual decoded pixel contents are validated
server-side. PNG CRC checking and strict JPEG decoding are enabled. WebP lossy
and lossless fixtures are tested; animated WebP is rejected. Images are re-encoded
to PNG, stripping source metadata and non-image payloads. The private bucket caps
normalised PNG files at 8 MiB. Decoder dependencies are pinned (pngjs 7.0.0,
jpeg-js 0.4.4, bundled wasm-webp 0.1.0); the binary's actual libwebp version was
checked as 1.3.2 and is checked again during initialization. Vendor provenance and
licenses accompany the binary. An older decoder candidate was discarded.

Paths are school_uuid/operation_uuid.png; uploads are immutable. The commit RPC
checks school/path identity, uploaded-object existence, expected revision,
operation identity and reason, and writes the branding/audit changes together.
Failed or uncertain commits do not delete uploaded files: an upload may have
committed before its response was lost. Unreferenced/old files remain private and
are not downloadable through current-logo RLS. An operator cleanup/retention job
for those files is not implemented in this section.

Authenticated school pages load branding only after the server verifies the
profile/tenant. Before identification, on removal and after logout the generic
SchoolShield asset is used. Branding is held in memory, never a shared browser
school-logo cache. Generation checks ignore late downloads from another school.
Fresh metadata plus a new immutable path prevents stale replacements; focus,
workspace refresh and exports request current branding. Retrieval failures have
a fallback. Aspect ratio is retained in headers/previews and PDF images.

The shared script is loaded by existing school pages. Existing header dimensions
and layouts are retained. Existing learner report previews/history and PDF exports
(including visitor/incident report PDFs) reuse the verified branding. No academic
management feature was added to the platform portal. Security Officer attendance,
photo capture, incident and shift handlers were not changed.

Before a release, apply the migration and deploy school-branding with the
supabase/config.toml static_files declaration so vendor/webp_dec.wasm is included.
No public bucket or extra browser credential is required. The actual deployed
Supabase Edge runtime has not been exercised; the bundled decoder was verified
locally under Node/WASM. Runtime packaging must be smoke-tested in staging before
production. No deployment or remote Storage operation was performed here.

## School account administration section

Added super-admin-accounts.html/.js with search, role/status filters, account
creation, permitted identity/contact/employee-ID edits, school-role changes,
activation/deactivation, invitation resend and password reset. School identity is
fixed in the selected page and sent as a canonical UUID. No user move, platform
membership grant, teaching-assignment control or learner/guardian-link field is
available. Platform administrator identities themselves are rejected by this
school-account form; manage them through the separate trusted owner procedure.

The existing manage-users Edge Function now has an explicitly checked platform
branch. It verifies Auth getUser(token) and platform_admin_context under that
JWT, then calls the existing manageUser workflow through a platform persistence
adapter. The actual actor UUID remains the owner: no school Principal account,
school session, impersonation token or synthetic owner school profile is used.
Ordinary school user-management requests continue through their previous branch.

Migration 20261015130000_platform_school_accounts.sql adds private
platform_account_operations and checked account-list/reserve/finalize/result RPCs.
The public list is platform-only and scoped to the selected school, without
academic or family-link payloads. Private writes independently validate platform
membership, target-school membership, permitted school-role enum, expected profile
revision, reason, access-change confirmation and last-active-Principal retention.
Cross-school target IDs and school_id fields are rejected before Auth mutation.
Staff/learner-link fields and platform metadata are rejected rather than ignored.

Reservations retain one Auth UUID per account operation. Partial failures retain
the record and original request for repair. A short server lease plus stable
operation UUID and disabled submission controls prevent overlapping retries.
The UI exposes incomplete requests, including Auth-created records whose profile
finalization has not completed. Resume reuses the original fields/UUID; conflicting
edits cannot silently replace them. Permanent duplicate-email/identity mismatches
need operator review, not automatic adoption/deletion of an existing Auth user.
Operations from ordinary school management and platform management are serialized
against each other, and operation UUIDs cannot overwrite another workflow's
invitation record.

Role restrictions/deactivation fail closed while Auth is being changed. Finalize
verifies the real Auth school/role/email/ban state before updating profiles. The
existing identity propagation triggers are reused, without changing assignment
or guardian relationships. Account request/commit/failure/completion and invitation
outcome events are server-written to the append-only platform audit. No passwords
or invitation tokens are audited. Auth and database changes are separate services:
a partial failure cannot be rolled back as one distributed transaction, so the UI
reports it and provides repair instead of claiming success.

Invitation delivery reuses the existing canonical account-setup route and
Supabase/Twilio helpers. A generated link, accepted email request and accepted SMS
provider request have distinct messages; none is presented as inbox/device delivery.
For completed active accounts, password reset uses the existing login.html recovery
flow. Configure SCHOOLSHIELD_PASSWORD_RESET_URL to the application's HTTPS
login.html URL. It is independently validated and cannot be a local/browser-supplied
redirect. Existing setup URL and optional Twilio configuration still apply. There
are no shared/default passwords. External providers cannot guarantee exactly-once
delivery after a lost response; any resend remains an explicit, audited action.

## Additional verification (local QA only)

- 121 unit/service tests, including real PNG/JPEG/WebP decoding with lossy/lossless
  WebP, corrupt/spoofed/oversized inputs, platform denial, cross-school field
  rejection, canonical recovery URLs and no default-password mutation.
- 186 full migration/database assertions: private branding reads/uploads,
  wrong-school logo paths, stale replacement/removal, school account list isolation,
  target-ID tampering, access confirmation, role escalation rejection, last Principal,
  partial Auth repair, deactivation/reactivation, role/identity edits, unchanged
  teaching assignments and secure-reset reservation.
- Desktop/mobile browser tests at 1366 and 390 pixels: school identity, current vs
  preview logo, failed-upload/save retention, replacement/removal, school switching,
  late-response isolation, logout fallback, PDF aspect ratio, account filters,
  creation, actual result display and duplicate-submit prevention.
- Existing User Management browser regression, Security shift browser/SQL
  regressions, and Security photo/affected-item browser regression passed.
  The older photo test fixture was corrected to load the existing central HTML
  escape helper; production photo/incident logic was not changed. Physical camera
  hardware was not exercised.

For codec integration tests, install pngjs@7.0.0 and jpeg-js@0.4.4 in an isolated
test directory and set BRANDING_CODECS to that directory's node_modules path.
Without that environment, the decoder integration test explicitly skips; the
content-header tests still run. PGlite/Playwright use the existing test environment
variables. No real client accounts or live Mmulakgoro/Ntebaleng records were used.
No migrations, files, Edge Functions or credentials have been deployed/configured
by these sections.

Owner identities are also protected from the ordinary school manage-users route,
including previously reserved requests. Bootstrap refuses an identity with pending
account changes; resolve those before granting platform access. This prevents a
school Principal from changing an owner account through an existing school profile.

## School lifecycle, feature controls, support and history (local section)

Open a school, then **Lifecycle, support and audit**. The school name and immutable
code remain visible. Lifecycle is independent of live/demo/qa data mode. Existing
schools migrate explicitly to Active with Announcements/Appointments enabled; new
schools default to Onboarding. Onboarding/Pilot/Active permit normal school access.
Suspended denies normal school access without changing accounts or deleting data.

New migrations (apply in order after the earlier portal migrations):
- 20261017100000_school_lifecycle_features.sql
- 20261017110000_platform_support_audit.sql

Backend enforcement: account readiness, school/role resolution, restrictive school
table/Storage policies and browser-callable school SECURITY DEFINER RPC guards.
Platform membership remains separate and owner recovery is not school-bound. The
parent-workspace, parent-chat, approve-account and ordinary manage-users Edge routes
verify the caller through get_my_school_access before using service privileges.
Deploy these routes together with the migrations in a controlled release; none
have been deployed by this task. No new credentials are required.

Only two independent, implemented modules are switchable: Announcements and
Appointments. Authentication and shared notifications are required dependencies
and have no disable switch. Unknown/dependent module keys are rejected server-side.
Disabling a module hides its navigation/quick access and role-projected data and
rejects mutations. Announcement publishing is checked separately. Raw workspace
SELECT is denied when a module is disabled: use read_school_dataset. Historical
legacy workspace RPCs also reject requests while modules are disabled. Existing
records are retained and return when enabled. Academic and Security modules are
not configurable here. Feature changes use revision checks, explicit confirmation,
reason, idempotent operation UUIDs and atomic server-written auditing.

New platform_support_tickets are explicitly Owner-created operational records,
separate from teacher_support_actions. There was no generic school helpdesk table
to reuse. Titles/categories/descriptions/priorities/status/internal notes and
server-generated actors/timestamps are stored with school UUIDs and revisions.
Writes are RPC-only and stale/cross-school ticket IDs are rejected. No messages
or notifications are sent to schools. Avoid private family/health information or
credentials in free text. Tickets are not a school-facing helpdesk.

Owner RPCs: platform_admin_school_access, platform_admin_set_school_access,
platform_admin_support, platform_admin_save_support, platform_admin_audit_history.
Diagnostics select operation UUIDs/actions/status/timestamps only; raw provider
errors, account fields and invitation tokens are excluded. Audit history searches
school/action/actor/operation and filters school/exact action/UTC date range, with
100-row pagination. Older summary views now omit historical value payloads and
provider error strings. Raw audit SELECT is revoked from browser roles. Audit
UPDATE/DELETE remains denied by privileges and the immutable trigger. Actor comes
from auth.uid(); bootstrap events retain the trusted database operator identity.

Verification: full historical migration test includes both QA schools and all seven
school roles, suspension/reactivation, unchanged workspace data, owner recovery,
direct API denial, disabled modules, ticket isolation/revision/idempotency and
audit actor/immutability. tests/platform-operations.browser.cjs exercises desktop
and mobile layouts, access controls, duplicate submits, safe errors, ticket HTML
injection as text, school switching and audit filters. Existing unit suites and
portal/Security browser regressions are run separately. These are local simulated
sessions/requests, not deployed Auth/Edge integration tests.

Limitations: suspension blocks subsequent backend requests using existing JWTs;
it cannot erase information already displayed, downloaded or cached offline. An
already issued document signed URL remains usable for its existing 60-second TTL.
A service request already in flight when suspension commits may finish. Existing
manual data/DB operators remain trusted. Staging must verify actual Supabase REST,
Storage, Realtime and deployed Edge behaviour before enabling this for a pilot.
No deployment, remote migrations, real accounts or outbound messages were made.

Final local results for these sections: 122 unit/service tests passed (including
real PNG/JPEG/WebP decoding), 272 full-chain SQL assertions passed, new lifecycle/
support/audit browser checks passed at 1366 and 390 pixels with no page errors,
and existing platform directory, branding/accounts, Security shifts and photo/
affected-item browser regressions passed. JavaScript syntax and diff whitespace
checks passed. Ordinary account approval now has a suspended-school denial test.
Changed files for this section: the two migrations above; super-admin-operations
HTML/JS; super-admin HTML/JS and school-page navigation; app.js feature navigation/
verified access refresh; parent-workspace/parent-chat/approve-account/manage-users
Edge entry points; platform-operations.browser.cjs, pilot-readiness-rls.cjs and
invitations.test.cjs; this document and the existing Vercel build syntax checks.

Owner operations: [owner guide](super-admin-owner-guide.md). Final QA evidence,
limitations and release checklist: [QA report](super-admin-qa.md). Review description:
[draft PR](super-admin-pr.md).
