# Backend authorization audit

Scope: repository Supabase schema, policies, Storage and RPC authorization. Only
new migrations and verification/documentation files were added. Existing chat,
notification, date, concurrency and onboarding operations were not rewritten.
These changes have not been applied to a live Supabase project.

## Issues fixed

- Every non-Parent previously had SELECT and UPDATE access to the complete
  `school_workspaces` JSON, including academic, medical, administration and
  communication records. Browser role checks did not protect that endpoint.
- Non-manager roles could read school-wide profiles, including personal contact
  fields; school-wide family links and medical notices were also exposed.
- Teacher document permission included every sick notice in the school. The
  legacy Storage download branch similarly admitted every teacher.
- Direct workspace replacement allowed changes to other roles' data. Medical
  notice updates also allowed changes to ownership/learner fields.
- Mutable/name-based class associations were not a reliable permission source.
- A parent could retry an existing notice ID for a no-longer-linked learner by
  passing a different linked learner. Publishing retained name-based class
  authority after a canonical assignment had been revoked.

## New migrations

1. `20261007150000_backend_role_isolation.sql`: leadership-only raw workspace
   SELECT, no authenticated raw writes, checked projection/collection APIs,
   stable teacher assignments, scoped profiles/family links/medical notices.
2. `20261007151000_record_storage_authorization.sql`: generic and legacy
   attachment permissions use the actual entity and record. Orphan files and
   unrelated class/tenant files remain inaccessible. Uploads require authorised
   pending metadata; downloads require ready metadata. Legacy metadata is frozen.
3. `20261007152000_rpc_authorization_guards.sql`: authorization wrappers on
   existing notice and publishing RPCs. Their feature operations are unchanged;
   internal implementations are no longer callable by browser roles.

Every new permission decision derives account and school from `auth.uid()` and
`profiles`. Neither API accepts a role or tenant argument. Principals/Deputies
can still read their own raw workspace. All generic writes, including leadership
writes, must use a collection allowlist; shift audit records and communications
are excluded. Existing checked shift, attachment, publishing and parent-notice
RPCs remain the entry points for those operations.

## Role matrix

| Role | Scoped reads | Generic writes |
| --- | --- | --- |
| Principal / Deputy | School academic, administration and operational records | Allowed school collections; protected audit/communications excluded |
| Clerk | School academic/admin, medical notices, visitors | Same permitted collections; no Security roster or incidents |
| Teacher | Assigned classes/learners, their assessments/reports/attendance/notices, related or explicitly shared incidents | Assessments/attendance/report requests for assigned classes only |
| Security | Visitors, incidents, Security roster/attendance | Visitors/incidents; dedicated shift RPC for actual attendance |
| SGB | Visitors/incidents and their authorised attachments | None |
| Parent | Linked learners, their class metadata, own score/attendance entries/report release fields and own linked notices | None; existing linked-notice RPC allowed |

Private profiles are visible only to their owner or school managers. Family links
are visible to their Parent owner or authorised academic staff. Medical notice
review can only change review columns, and the reviewer must be the authenticated
academic staff member assigned to the learner (or an authorised school manager).
Storage membership/ownership alone never grants file access. All buckets remain
private; existing signed-download code uses these record policies.

Teacher assignments are stored in `teacher_class_access`. Migration backfill
accepts an explicit teacher ID or an unambiguous existing profile/name match.
Ambiguous/unmatched assignments fail closed and need administrator review. New
or changed assignments use `set_teacher_class_access(teacher_uuid,class_ref,bool)`
from a school manager; an ordinary teacher cannot grant their own access.

## Rollout/API integration required

**Do not apply this migration-only change to production without adapting the
workspace data adapter.** The existing browser still queries and replaces the
raw workspace. Restricted-role reads will return no rows and direct saves will
fail after rollout. Raw workspace Realtime events also follow the tighter SELECT
policy. No frontend or communication flow changes are included in this section.

- Read: `rpc('get_authorised_workspace')` returns the authorised JSON projection.
- Write: `rpc('save_authorised_collection', {p_collection, p_records})` replaces
  a permitted collection. Teacher submissions retain unrelated classes on the
  server; unrelated IDs, classes and score/attendance keys are rejected.
- Dedicated actions keep their checked RPCs. Communication data/actions require
  separately authorised services; they are deliberately absent from the new
  generic API rather than inheriting access to an entire workspace.
- Review imported teacher assignments and inspect the deployed `pg_policies`,
  grants and bucket settings before rollout. Repository tests cannot establish
  that production has no extra permissive policies or stale deployed functions.

## Verification

`tests/backend-authorization.cjs` executes the actual baseline and subsequent
schema/policy migrations, followed by the three new migrations, in isolated
PostgreSQL using PGlite. Default authenticated table privileges are granted
before hardening so denials exercise RLS/grant changes rather than an artificial
absence of baseline privileges.

```powershell
$env:PGLITE_MODULE="$env:TEMP/schoolshield-document-tests/node_modules/@electric-sql/pglite"
node tests/backend-authorization.cjs
```

Checks cover all seven roles, a second school with overlapping record IDs,
unassigned Teachers/unlinked Parents, role metadata spoofing, direct-write and
role-escalation denial, permitted collection writes, out-of-class writes,
assignment/link revocation, generic/legacy file reads, orphan files, staged photo
upload/finalisation and cross-role retrieval. No live tenant records are changed.

## Remaining security concerns outside this migration-only scope

- **`bootstrap-demo-masters` uses a service key and permits any Principal to
  create/reset demo accounts across all five schools to the fixed test password.**
  RLS cannot constrain those admin calls. Disable/remove this endpoint in
  production or separately restrict it to a controlled provisioning operator.
- **`parent-workspace` bypasses RLS with a service key.** It spreads whole report
  objects and selects notices by learner name rather than stable linked IDs;
  extra report fields or same-name learners can expose unrelated family data.
  It must be migrated to the checked projection or equivalent strict filtering.
- The excluded `parent-chat` service also uses a service key and checks Teacher
  assignment by display name, not `teacher_class_access`. It needs a separate
  authorization integration before canonical assignment revocation protects that
  endpoint. Its message handling was not changed here.
- Existing account-request alert policies check recipient identity but not the
  current school/approver role, and permit unrestricted column updates on a
  recipient's row. They were reviewed but left unchanged under the explicit
  restriction against notification work; restrict updates to read state and
  validate tenant/approver identity in that section.
- Service-role credentials intentionally bypass RLS. Approval currently checks
  caller profile and request school, but all deployed service-key endpoints and
  existing demo accounts/passwords need an independent production review. This
  change secures authenticated database access, not every service-key route.
