# Teaching assignments and term reviews

The existing `teacher_teaching_contexts` table is the normalized assignment store. No parallel `teacher_class_assignments` table is created. Its UUID/profile/class/subject/year identities remain unchanged, and existing reviews/targets/support retain their foreign keys.

## Management and teacher views

Principal/Deputy opens Teacher Performance, then a teacher. Opening refreshes the existing catalogue and imports explicit approved teacher/subject/class/year mappings. The roster shows name, employee ID, department, subjects, grades, classes, term and review status. There is no combined academic teacher score: rated contexts are labelled “See subject/class reviews”.

The teacher profile shows all linked assignments. An unassigned teacher sees **No teaching assignments found for this teacher.** and **Assign Subject & Class**. The form uses existing teacher UUIDs, grade choices, class UUIDs and valid class/subject choices; year, start date, optional end date and notes are recorded. Dates and exact duplicates are checked server-side. A save creates the assignment and teacher notification atomically; failed saves retain the form. Existing assignments are never overwritten or automatically removed.

Teachers see **My Teaching Assignments** in My Performance. Current/upcoming links are listed separately from ended links. Teachers can refresh and read, but have no assignment edit or self-assignment action.

## Reused sources and validation

- Existing stable `teacher_teaching_contexts` links remain approved assignments. Previously missing dates remain NULL and display “Not recorded (legacy)”. No retroactive commencement date is invented.
- `school_workspaces.payload.teacherAssignments` imports only Approved records with an explicit subject, class, teacher and academic year. Stable teacher/profile IDs are preferred; legacy display names resolve only to a unique same-school Teacher profile, then all persisted relationships use UUIDs.
- Class-only approvals do not establish subjects taught. Pending requests and invalid/ambiguous/conflicting records are not imported. Counts explain records needing confirmation.
- `teacher_class_subjects` reuses assessment/class subject records, existing approved subject mappings and the same junior/senior subject choices already used by SchoolShield's test-score page. No assessments or marks are fabricated. A newly assigned class must exist in the original school class records, not just a manually inserted review-catalogue row.
- Exact teacher + subject + class + year duplicates are rejected. Grade comes from that class and is snapshotted. A serialised overlap check prevents a different teacher taking the same subject/class during overlapping dates. No explicit co-teaching authorisation was found, so new overlaps are rejected; pre-existing approved overlapping links are preserved.
- A narrow workspace trigger prevents non-Principal/Deputy users from forging or changing the Approved assignment subset in legacy JSON. Clerk pending requests continue to work. Other workspace fields and class-teacher approval screens are retained.

## Terms and history

`teacher_review_terms` stores school/year-specific actual term dates. Principal/Deputy can configure the selected term in the profile. Term dates must fall in the academic year, stay chronological and not overlap; they are not inferred from months or guessed DBE calendars.

For dated assignments, the review section is eligible when the assignment overlaps the selected term. Until term dates are configured, assignments still display, while starting a new dated review is blocked with a clear message. Legacy annual links with unknown start dates retain their existing annual behaviour. Started/submitted historical reviews remain visible even after an assignment ends. An unused Not Started placeholder outside the assignment's dates is retained in storage but does not keep a past assignment in future review sections. Each subject/class/term has its own metrics/review.

Ending an assignment records an explicit end date, reason, actor, timestamp and before/after values in `teacher_assignment_history`, with revision checking. Teacher/class/subject/year/start-date identity remains immutable; a move uses an end date plus a new assignment. No assignment delete is granted. `teacher_performance_reviews.assignment_snapshot` retains assignment labels/dates and configured term boundaries at creation; known legacy identities are backfilled without inventing unknown dates. Existing versions, completion locks and acknowledgement rules remain intact.

## Existing notifications

`account_request_notifications`, the existing per-recipient table, is extended with a notification type, assignment foreign key and payload. Account-request rows still work; approver queries explicitly select only account-request notifications. No independent notification table or separate bell is introduced.

An assignment insert writes **New Teaching Assignment** with subject, grade, class, year, assigning Principal/Deputy and assignment timestamp. A unique assignment/recipient index prevents duplicate notices from repeated imports. RLS restricts each assignment notice to its assigned same-school Teacher. Only `read_at` can be updated by the recipient; payload, recipient and assignment identity cannot be modified. The existing notification page, bell, unread badge, open/read and mark-all-read flows merge these private notices with existing alerts. Existing Realtime receives recipient-filtered changes; the existing 15-second workspace refresh/focus/online fallback also refreshes notices. Assignment records are never appended to school-wide workspace notification JSON.

## Migration and API

New migration: `20261013170000_teacher_teaching_assignments.sql`, following the six existing Teacher Performance migrations and the existing account-request notification migration.

Extended: `teacher_teaching_contexts`, `teacher_performance_reviews`, `account_request_notifications`.

Added supporting tables: `teacher_class_subjects`, `teacher_review_terms`, `teacher_assignment_history`.

Checked RPCs: `assign_teacher_subject_class`, `end_teacher_assignment`, `set_teacher_review_term_dates`, `get_teacher_assignments`. Existing catalogue/directory/overview/teacher-performance RPCs are wrapped to use assignments and term eligibility. The old undated manual linking RPC rejects writes and directs callers to the dated form. Internal base functions are not executable by browser roles.

Principal/Deputy manage same-school assignments. Teachers select their own assignment rows and private notices, with no writes to assignments. Parent/SGB/Security/Clerk cannot access the normalized assignment store or its management APIs. Class-subject mappings and assignment audit are management-only. All new tables have RLS, and browser writes/deletes/truncation to assignment records and recipient notices are revoked apart from recipient `read_at` updates.

## Verification and deployment

`tests/teacher-assignments-rls.cjs` executes actual migrations in PGlite: 89 assertions cover existing/imported links, multiple subjects/classes/grades, no assignments, Principal/Deputy writes, exact duplicates, invalid class/grade subjects, overlaps, private notifications/read privileges, legacy self-assignment blocking, school isolation, ending/replacement, snapshots, unused future placeholders and unchanged source workspace data.

`tests/teacher-assignments.browser.cjs` exercises real frontend handlers with mocked Supabase transport: unassigned state, cascading selectors, Principal/Deputy saves, duplicate feedback with retained input, multi-class/grade display, term/end-date forms, teacher own read-only assignments and existing bell/open/read/mark-all-read. Existing feature/unit suites cover regressions; browser transport mocks are not live-session RLS tests.

Final regression results: 76 unit tests passed, alongside the 89 assignment PostgreSQL assertions, 147 existing performance PostgreSQL assertions, and the assignment/teacher-performance/review/navigation browser suites. Live checks verify the deployed API and self-assignment denial; they do not create demonstration teaching assignments.

Pilot configuration: enter the school's actual term dates; confirm legacy class-only approvals where subject/year were never recorded. The broader legacy workspace authorization/concurrency work remains a separate unfinished task; this migration protects assignment approvals and new private normalized data without redesigning unrelated workspace permissions.

Deployment: `20261013170000_teacher_teaching_assignments.sql` was applied to the linked project `kosidewowwfdvzqhzxau` on 13 October 2026 using an isolated migration directory. Unrelated pending migrations were excluded. Live authenticated checks passed for Principal catalogue/directory/overview/assignments, Teacher own performance/assignments, notification RLS queries and denied Teacher self-assignment. The live catalogue has 77 existing class/subject choices, no teaching assignments and no configured term periods. No demonstration assignments or dates were inserted into the live school.
