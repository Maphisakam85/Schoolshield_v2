# Supabase setup

This directory contains the database, Auth/RLS and private Storage baseline for
SchoolShield's operational prototype.

1. Create a Supabase project in the organisation that will own the school data.
2. Install the Supabase CLI and run `supabase login`, `supabase link`, then
   `supabase db push --dry-run` and `supabase db push` from the repository root.
   This preserves the project's migration history; do not use the SQL Editor
   for schema changes after adopting this workflow.
3. In Auth settings, disable public sign-ups for production. Create users via
   an approved, server-side invitation flow. Every new user must have trusted
   **app metadata** containing `school_code` (for example `SMM-001`) and
   `role` (one of `principal`, `deputy`, `clerk`, `teacher`, `security`,
   `parent`, or `sgb`). The migration creates their profile automatically.
   Put the human-readable `display_name` in user metadata.
4. Copy the Project URL and publishable key to local environment settings.
   Never expose the `SUPABASE_SECRET_KEY` to this static front end.
5. Configure allowed redirect URLs for the deployed SchoolShield origin.

The first migration creates a private `school-documents` bucket for sick
letters and other supporting documentation. Storage paths must begin with the
authenticated user's school UUID, which is enforced by RLS. Parent uploads are
only readable by the uploading parent; school staff can read school documents.

Parents must also be linked to their learner by a trusted process in
`public.parent_learner_links`. That link is required by RLS before a parent can
submit a sick notice. Staff can then review it in `public.sick_notices`.

## Private document paths

All files in `school-documents` must use this path pattern:
`<school-uuid>/<category>/<record-id>/<filename>`. Allowed categories are
`sick-notices`, `incident-evidence`, `visitor-documents`, `learner-records`,
`staff-documents`, and `reports`. Parent uploads are restricted to
`sick-notices`; staff may use all categories.

## Account approval email

Use [invite.html](email-templates/invite.html) as the Supabase **Invite user**
email template. It displays the approved user's sign-in email and school code.
In Supabase Dashboard, set the deployed SchoolShield site as the Site URL and
add its `login.html` address to the Auth redirect allow-list.

The current front end still uses browser-local demo state. The next integration
step is to wire the supplied project URL and publishable key into a Supabase
client, replace the demo login with Supabase Auth, and persist each school's
workspace using `public.school_workspaces`.
