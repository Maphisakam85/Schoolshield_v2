# SchoolShield Supabase setup

This document records the Supabase configuration used by the SchoolShield operational prototype. It is the reference for setting up a new environment, maintaining the current project, and understanding which part of the application owns each responsibility.

## Project connection

The front end is a static HTML, CSS and vanilla JavaScript application in `SchoolShield/`.

- Public browser configuration is in `SchoolShield/supabase-config.js`.
- Local public values are documented in `.env.example` as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- The browser must only receive the project URL and publishable/anon key.
- A Supabase secret/service-role key must never be placed in `SchoolShield/`, committed to Git, or exposed to a browser.

The repository is linked to its Supabase project through the Supabase CLI metadata in `supabase/.temp/`. Do not edit that folder manually.

## Database migrations

All schema and data changes are versioned in `supabase/migrations/`. Apply them from the repository root:

```powershell
npx supabase db push --dry-run
npx supabase db push
```

Do not recreate these changes manually in the SQL editor after the project is using migration history.

| Migration | Purpose |
| --- | --- |
| `20260920_schoolshield.sql` | Base tenant schema, role enum, RLS, storage bucket, schools and seed school records. |
| `20260921_account_approval.sql` | Account-request table, approval RPC and invite/profile handling. |
| `20260922_profile_self_read.sql` | Allows an authenticated user to read their own profile. |
| `20260923_storage_categories_and_signup_schools.sql` | Validated document categories and public school-choice RPC for account requests. |
| `20260924_account_request_alerts.sql` | Principal/clerk alerts when somebody requests an account. |
| `20260925_profile_onboarding.sql` | Completes invited-user details after they set a password. |
| `20260926_persist_demo_workspaces.sql` | Stores each school demonstration workspace in Supabase. |
| `20260927_link_demo_parents.sql` | Links the demonstration parent accounts to a learner. |
| `20260928_link_demo_family_to_teacher.sql` | Links a demonstration learner, parent and teacher in every demo school. |

## Main data model

| Object | Purpose |
| --- | --- |
| `schools` | One tenant per school. Includes the school code and display name. |
| `profiles` | One row per Auth user: school, approved role, display name and onboarding details. |
| `school_workspaces` | The per-school prototype workspace JSON: classes, learners, attendance, reports, staff, incidents, announcements and chats. |
| `account_requests` | Pending, approved or rejected sign-up requests. |
| `account_request_notifications` | In-app principal/clerk alerts for account requests. |
| `parent_learner_links` | Authorised parent-to-learner links. This prevents a parent from selecting another learner. |
| `sick_notices` | Parent submissions awaiting staff review. |
| `sick_notice_attachments` | Metadata for sick-letter files in Storage. |

The supported application roles are `principal`, `deputy`, `clerk`, `teacher`, `security`, `parent` and `sgb`.

## Authentication and account approval

1. A visitor chooses a school and submits the account-request form.
2. `request_school_account` stores a pending request and creates alerts for the school principal and clerk.
3. The principal or clerk approves or rejects it in `account-requests.html`.
4. `approve-account` creates a Supabase Auth invitation with trusted `school_code` and `role` app metadata.
5. The invitation opens `SchoolShield/account-setup.html`, where the invited user adds details and chooses a password.
6. `complete_my_profile` saves the onboarding fields; the user is sent to `login.html` to sign in.

For production, disable public email/password sign-up in Supabase Auth. User role and school assignment must come only from the approved server-side invitation path.

### Auth redirect URLs and email

In Supabase Auth settings:

- Set the deployed SchoolShield site as the Site URL.
- Add the deployed `login.html` and `account-setup.html` URLs to Redirect URLs.
- Use `email-templates/invite.html` for the invitation email template.
- Configure custom SMTP before production. The Supabase trial email sender is intentionally rate-limited.

Password reset links return to `login.html`. Invitation links return to `account-setup.html`.

## Row-level security and tenant isolation

RLS is enabled for every application table.

- Helper functions derive the authenticated user's school and role from `profiles`.
- Staff can read their school workspace; managers can create it; non-parent staff can update it.
- Parents cannot read the full `school_workspaces` JSON. They only read their own learner links, notices and eligible attachments.
- A parent may submit a sick notice only for a learner in `parent_learner_links`.
- Principal and clerk roles can review school account requests.

The parent restriction is intentional: the workspace contains school-wide learner, incident and staff data. Parent views use the server-side filtered workspace described below rather than weakening RLS.

## Storage

The private bucket is named `school-documents`.

Every object path must use this pattern:

```text
<school-id>/<category>/<record-id>/<filename>
```

Allowed categories:

- `sick-notices`
- `incident-evidence`
- `visitor-documents`
- `learner-records`
- `staff-documents`
- `reports`

Staff can access their school’s valid categorised documents. Parents are limited to their own sick-notice uploads. The bucket is not public.

## Edge Functions

Edge Functions live in `supabase/functions/`. Deploy after changing one:

```powershell
npx supabase functions deploy <function-name> --project-ref <project-ref>
```

| Function | Responsibility |
| --- | --- |
| `approve-account` | Principal/clerk account approval, rejection, invitation generation and profile assignment. |
| `bootstrap-demo-masters` | Principal-only creation/reset of the demonstration role accounts. |
| `parent-workspace` | Returns a privacy-filtered workspace containing only a parent’s linked learner/class data. |
| `parent-chat` | Validates the linked learner and persists a parent-to-teacher message in the shared workspace. |

The functions use Supabase-managed server secrets (`SUPABASE_SECRET_KEYS` or `SUPABASE_SERVICE_ROLE_KEY`). Those values remain server-side. Browser requests send the user’s access token and are checked again in the function.

## Demonstration data

Five school tenants are seeded:

- Setjhaba-Se-Maketse Combined School (`SMM-001`)
- Lenyora La Thuto Secondary School (`LLT-002`)
- Seemahale Secondary School (`SEE-003`)
- Leratong Secondary School (`LER-004`)
- Ntemoseng Secondary School (`NTE-005`)

Each has the role accounts listed in `SchoolShield/demo-credentials.md`. The demo family migration assigns the first learner in each school to that school’s demonstration parent and teacher, allowing the parent, teacher and principal chat flow to be tested safely.

## Workspace synchronisation

- Staff portals fetch `school_workspaces` from Supabase before rendering, then refresh when the browser gains focus.
- Staff changes are written back with an upsert.
- Parent portals call `parent-workspace`, which returns only allowed data.
- Parent chat messages call `parent-chat` so they remain after refresh; parents do not write the full workspace directly.

If testing on another device, use a hosted site URL or a reachable LAN server address. `127.0.0.1` only points to the device currently running the local server.

## Verification checklist

```powershell
npx supabase db push --dry-run
npx supabase functions list --project-ref <project-ref>
node --check SchoolShield/app.js
git diff --check
```

Manual checks:

1. Sign in as a principal and clerk; confirm account requests are visible.
2. Approve a request and open the account-setup invitation URL.
3. Sign in as the demo teacher and principal; confirm their chat uses the correct sender sides.
4. Sign in as the demo parent; confirm only the linked learner appears.
5. Send a Parent–Teacher Chat message, refresh, and confirm it remains.
6. Upload a permitted document path and confirm users from another school cannot access it.

## Production handover

Before a real-school rollout:

- Replace demonstration accounts and data.
- Configure a verified SMTP provider and real approved domains.
- Review RLS policies with the school’s privacy/data-protection requirements.
- Store production server secrets only in Supabase/Vercel/hosting environment settings.
- Add monitoring, backup and retention procedures.
- Deploy the static site over HTTPS and set its final Auth redirect URLs.
