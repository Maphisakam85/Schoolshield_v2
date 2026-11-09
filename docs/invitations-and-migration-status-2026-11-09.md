# Invitation email and migration status - 9 November 2026

## Invitation changes

New invitation and password-recovery HTML templates explain the school invitation,
account role, school code, sign-in email, password setup, first sign-in, expired
links, duplicate-account avoidance and unexpected-message handling. Optional
school details fall back safely when absent. Supabase's original ConfirmationURL
is retained. No passwords or guessed support contacts are added.

The managed account service derives display-only template metadata from the
committed profile and canonical school. Resent setup links for confirmed existing
accounts use the recovery template, so both templates are provided. Metadata is
not used to authorise school or platform access.

**Hosted activation is blocked.** A scoped `supabase config push` was attempted
after reviewing its diff. Only the two email subjects/bodies were proposed;
existing site URLs, redirect allowlist, MFA and other settings were undeclared
and preserved. Supabase rejected the Auth update with HTTP 400:

> Email template modification is not available for free tier projects using the
> default email provider. Please upgrade your plan or configure a custom SMTP
> provider.

Configure a verified SMTP sender privately in the Supabase dashboard, or enable an
eligible plan, then rerun the reviewed configuration push. Deploy `manage-users`
and `approve-account` together when enabling the accompanying school/role email
metadata. Those functions were not deployed in this task and no real invitation
was sent. Existing messages therefore do not yet have the new live template.

## Migration list

The linked project's ledger was checked again. All recent feature SQL, including
`20261021140000`, `20261109100000`, `20261109110000` and `20261109120000`, is applied.
No new SQL migration is required for these email templates or the login CSS.

These are **all eight unmatched historical file entries**, not eight pending
feature installations:

| Historical file | Why it must not be blindly pushed |
| --- | --- |
| `20260928_realtime_workspace_sync.sql` | Duplicate version; newer dataset invalidation replaces raw workspace broadcasting. |
| `20261007_invitation_delivery.sql` | Superseded by the recorded 20261019100000 restoration and current account workflow. |
| `20261007120000_announcement_publishing.sql` | Reinstalled by later operational RPCs and lifecycle wrappers. |
| `20261007130000_document_attachments.sql` | Superseded by canonical private attachments. |
| `20261007140000_security_shifts.sql` | Superseded by restored operations and canonical shift records. |
| `20261007150000_backend_role_isolation.sql` | Legacy data model replaced by canonical entities and scoped datasets; identified grant gap fixed forward. |
| `20261007151000_record_storage_authorization.sql` | Replaced by canonical attachment/storage authorisation. |
| `20261007152000_rpc_authorization_guards.sql` | Legacy wrappers replaced; remaining parent lifecycle gap fixed by 20261109120000. |

Do not bulk-mark these files applied or force `db push --include-all`. Migration
history/baseline cleanup remains distinct from installing missing features.

## Screenshot findings and layout

The live reporting RPC exists, authenticated execution is granted, and an
unauthenticated PostgREST request now returns 401/42501 rather than PGRST202. No
ticket was created by this check. A signed-in report submission was not exercised.
Outside-app push remains unconfigured because the public VAPID key is empty;
dispatch secrets and schedules are separate from the installed SQL.

The live login form measured approximately 593px tall and overflowed at effective
viewports 1092x480, 1092x550 and 1280x580. The compact CSS reduces spacing and
control height for short laptop viewports; below 520px height only the repeated
introductory paragraph is omitted. Scrolling remains available for long account
creation forms, error messages, accessibility zoom and smaller viewports. No input
or SOS control is clipped with overflow:hidden.
