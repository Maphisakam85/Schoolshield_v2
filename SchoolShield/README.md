# SchoolShield — Proper Role-Based Multi-Page Prototype

The interface is plain HTML/CSS/JS. Every module is a real physical HTML page shared by roles. Roles do not get duplicate copies of the same page; the shared page reads the logged-in role from sessionStorage and builds the permitted navigation. Unauthorized direct URLs redirect to the role's dashboard.

Roles: Principal, Deputy Principal, SGB Member, Security Officer, Parent/Guardian, School Clerk, Teacher.

Session behaviour: closing the browser tab ends the prototype session. Use one of the Botshabelo school codes and role-based demo emails listed in [demo-credentials.md](demo-credentials.md) to preview each permission set.

## Supabase operational prototype baseline

The repository includes a Supabase migration with Auth profiles, school-tenant
RLS, a staff workspace store, parent-owned sick notices, and private document
storage. See [the setup guide](../supabase/README.md) to link a Supabase
project and apply it. The `SUPABASE_SECRET_KEY` is never used in or
exposed to this browser application.
