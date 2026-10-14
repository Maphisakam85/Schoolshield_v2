# Authoritative school data

## Audit findings

* `app.js` used per-user session caches as complete write payloads and could
  bootstrap a workspace from that cache after a failed or unchanged read.
* `getState()` persisted empty workspaces, invented timestamps for legacy
  notices and patched demonstration security contacts on reads.
* Teacher/class, guardian directory, officer ownership and chat-thread lookup
  used display names. The same name could identify different people.
* Timestamp-derived IDs collided in existing pilot staff records. The live
  school audit found 13 staff rows with two repeated references, not exact
  duplicates. Migration initially rolled back safely on that condition; the
  backfill now preserves conflicting rows under deterministic compatibility
  aliases and records reconciliation issues.
* Opening chat generated demonstration messages. Appointment selection included
  a demonstration deputy and fictitious availability dates.
* Browser subject choices duplicated the database catalogue. Performance
  catalogue synchronization could recreate those choices from workspace JSON.
* `bootstrap-demo-masters` could reset existing passwords/profiles, provision
  other schools and guess parent links from the first learner in an array.
* Historical migrations `20260926`–`20260928` initialized/linked pilot data once.
  They remain unchanged; existing pilot data is migrated, not deleted.
* Role HTML pages use the shared application; no independent role seed stores
  were found. Supabase Auth uses tab-scoped session storage. No application
  localStorage entity store was found. The `seedValue` QR rendering variable is
  a visual hash, not school records. Test fixtures are not production bootstrap.
  `workspace-sync.js` accepts injected storage but is not loaded by the pages;
  it is not an active source of school records.

## Sources of truth

| Entity | Authoritative source |
| --- | --- |
| Schools | `schools.id` |
| Login identity and authorization | `auth.users` / `profiles.id`, `profiles.school_id`, `profiles.role` |
| Staff and teachers | `school_staff.id`; optional explicit `profile_id` account link |
| Security officers | `school_security_officers.id` and its `staff_id` foreign key |
| Learners | `school_learners.id`, with `class_id` foreign key |
| Guardians | `school_guardians.id`; `school_learner_guardians` links |
| Parent login permissions | Explicit guardian/profile links; existing `parent_learner_links` synchronized for compatibility |
| Grades | `school_grades.id` |
| Classes | Existing `teacher_review_classes.id`, extended with grade/staff links |
| Subjects | Existing `teacher_review_subjects.id` |
| Subject/class choices | Existing `teacher_class_subjects` |
| Approved teacher subject/class/year assignments | Existing `teacher_teaching_contexts`, linked to the approved profile |
| Announcements, visitors, incidents and remaining operational collections | One server `school_workspaces` row per school; row deltas through the checked RPC |

An account UUID and a staff UUID are deliberately different identity types,
joined by a unique, tenant-constrained foreign key. Review `teacher_id` remains
the profile UUID for compatibility and teacher-own RLS; directory results also
include `profileId` and `staffId`. They must not be interchanged or joined by name.

Compatibility DTOs retain `id`/legacy references for existing marks, history and
attachments, and include canonical `entityId`, `school_id` and relationship
UUIDs. New records use UUIDs. `school_entity_aliases` maps old references within
one school. A legacy reference reused by another school maps to another UUID.
Copies of core arrays in workspace JSON are server-generated projections, not
independent writable sources. Class/subject labels follow their UUID links.

## Migration and permissions

`20261013180000_authoritative_school_entities.sql` archives the original payload
in private `school_dataset_backups`, reconciles legacy rows once, creates the
core tables/links and applies RLS. Exact duplicate rows consolidate; conflicting
records remain available under distinct aliases. Ambiguous legacy class links
are recorded in `school_identity_issues` for explicit management reconciliation.
Names are used only during this one-time import when unambiguous.

`20261013190000_school_identity_reconciliation.sql` binds remaining historical
request/submission actor labels to UUIDs once and exposes reconciliation warnings
only to management. The live school retained 86 legacy reference conflicts across
collections for review; no conflicting pilot records were discarded.

`20261013200000_bind_school_dataset_snapshots.sql` rejects snapshots containing
another school's metadata or mismatched canonical UUIDs, including when legacy
references happen to be identical across pilot schools.

`read_school_dataset()` derives school and role from `auth.uid()`/`profiles`.
Principal/Deputy/Clerk receive their permitted shared entities; Teachers receive
assigned classes/learners and their own threads; Security/SGB receive no academic
registers. Parent access remains through the authenticated, linked-family edge
endpoint, using the same canonical learner IDs. Raw workspace reads are limited
to Principal/Deputy; authenticated raw writes and direct core-table writes are
revoked. Anonymous access to new tables/functions is revoked.

`save_school_dataset(before, after)` locks the school workspace, applies changed
rows only, checks collection/record permissions and rejects stale row changes.
It never writes a role projection over hidden server records. Versions increment
on confirmed writes. A browser cache cannot initialize a school. Failed drafts
remain scoped to the user/school tab, with explicit retry/export; conflicts are
not silently overwritten. Closing the tab can discard session-only drafts.

New schools start empty on the server. New approved accounts acquire staff
identities server-side. Principal/Deputy can explicitly link a pre-existing staff
record through the existing staff management modal and
`link_school_staff_account(staff, profile)`. Only an unused account placeholder
may be consolidated automatically; its previous value and actor are archived in
`school_staff_link_history`. Established identities, particularly officer
identities with history, require an explicit reconciliation migration.

## Optional demonstration bootstrap

On the **Edge Function environment only**, set `ALLOW_DEMO_BOOTSTRAP=true` and
`DEMO_BOOTSTRAP_PASSWORD` (at least 12 characters) to enable optional account
provisioning. Defaults are disabled. Provisioning is confined to the caller
Principal's school, skips existing accounts, never resets passwords/roles and
never guesses a family relationship. Disable it after provisioning. These
values do not belong in browser configuration. Post-migration imports must use
normalized tables/checked APIs, not raw workspace core arrays.

## Validation

* `tests/school-dataset-rls.cjs`: actual migrations in PostgreSQL/PGlite; shared
  UUIDs, role/tenant isolation, conflicting legacy refs, pilot archive, explicit
  account binding, staff rename, stale edits and protected compatibility data.
* `tests/school-dataset.test.cjs`: cache reads without writes, no login bootstrap,
  UUID-based relationships, failed drafts and safe optional bootstrap.
* Existing unit and browser suites cover announcements, visitors, incident
  evidence, security schedules, assignment forms and teacher navigation.
* Live verification logs in as all seven pilot roles and another-school
  Principal; it compares IDs without printing personnel data or credentials.

Verified on 2026-10-13: 83 unit tests, 50 database assertions, assignment and
Targets/Performance browser suites, and nine mobile chat viewport cases passed.
Live Principal/Deputy/Clerk views shared 10 classes and 150 learner identities;
Teacher received one assigned class/15 learners, Parent one linked learner,
and Security/SGB no academic registers. Another-school reads and a cached
other-school write snapshot were denied. All three migrations and the three
updated Edge Functions were deployed to the linked project. Physical mobile
keyboards were not exercised.

This work does not deploy the earlier, separate full Storage/medical/profile
authorization audit. Operational collections remain JSON-backed; moving them
into normalized tables and durable cross-device offline drafts are separate
follow-up work. Legacy conflicts must be resolved explicitly rather than by
guessing that people with the same display name are the same person.
