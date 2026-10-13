# Teacher Performance: final QA and pilot handover

The feature is confidential **Internal QMS-Aligned Review** personnel information. It supports internal performance monitoring and does not replace the formal DBE/ELRC QMS appraisal process. Teachers are never ranked or displayed in public league tables, and ratings are entered by reviewers rather than derived from marks.

## Entry points

- Principal/Deputy dashboard: current-term counts and a link to the management feature.
- Teacher Performance: department, subject, grade, class, teacher, year, term and review-status filters; separate subject/class academic evidence; reviews, targets and support actions.
- Teacher history: teacher → year → Term 1/2/3/4, showing subject/class evidence, targets, actual results/margins, review rating/comments/context, acknowledgement/response and audit history.
- My Performance: teachers see only their own data and acknowledge receipt with an optional response. Receipt does not mean agreement. An amended review requires fresh acknowledgement; prior responses remain in management audit history.

## Summary definitions

Total teachers counts authenticated teacher profiles in the selected department/teacher scope; subject/grade/class filters narrow that set to linked contexts. Unassigned teachers are shown separately. Completed/outstanding review counts refer to individual subject/class review records in the selected year/term. Reviewer completion includes Awaiting Teacher Acknowledgement and Completed. A missing review is outstanding.

All targets for the selected year/term are counted as the period's active target set, including achieved targets. Achieved includes Target Achieved, Target Exceeded and qualitative Completed; Near and Below use existing target statuses (Below includes qualitative Not Achieved). Not yet measured/in-progress targets are shown separately. These definitions are displayed in the interface.

On track requires recorded targets, all achieved/near target, and no support flag. Requiring support reflects open support actions, reviewer concerns/recommended support, internal rating 1 or below/not-achieved targets. A teacher with no targets is not automatically on track. Academic rows remain separate by subject/class and are not sorted by performance.

## Database

Apply these new migrations in order:

1. `20261013110000_teacher_term_performance.sql`
2. `20261013120000_teacher_subject_performance.sql`
3. `20261013130000_teacher_targets.sql`
4. `20261013140000_teacher_term_review_workflow.sql`
5. `20261013150000_teacher_acknowledgement_support.sql`
6. `20261013160000_teacher_performance_dashboard_history.sql`

Tables: `teacher_review_classes`, `teacher_review_subjects`, `teacher_teaching_contexts`, `teacher_performance_reviews`, `teacher_performance_subjects`, `teacher_targets`, `teacher_support_actions`, `teacher_review_history`, `teacher_performance_events`.

Key write RPCs: `save_teacher_review`, `save_teacher_target`, `acknowledge_teacher_review`, `save_teacher_support_action`, `refresh_teacher_subject_performance`. Key read RPCs: `get_teacher_performance_directory`, `get_teacher_performance_overview`, `get_teacher_performance_history`, `get_my_teacher_performance`, `get_teacher_targets`. Existing class/subject catalogue and explicit teaching-context linkage are reused.

## Authorization and audit

Principal/Deputy have same-school management access. Teachers have own-only academic/target/support access and read-only published reviews; their acknowledgement RPC accepts no management fields. Parent/SGB/Security/Clerk cannot view individual appraisal information or edit it. Management RPCs derive roles and tenant from authenticated profiles, not client role values. All new tables have RLS. Authenticated clients cannot directly write reviews, metrics, targets, support actions or history/events; checked RPCs perform writes.

Database triggers log target creation/editing, review start/completion/amendment, rating changes, teacher acknowledgement/response, support action creation/update/completion. Events retain before/after values, authenticated actor and server timestamp. Existing full review version history also retains amendment reasons. Browser clients cannot edit/delete events or version history. Submitted reviews/evidence/targets are locked, and revision checking rejects stale writes. Independent developmental support can continue after submission.

Events start when the final migration is installed. Earlier review version history remains visible; unavailable historical target/support edits cannot be reconstructed and are not fabricated. Database owners/service credentials remain privileged and must remain private.

## QA evidence

- `tests/teacher-performance-final-rls.cjs`: 147 PostgreSQL assertions using all six actual feature migrations in PGlite. Principal/Deputy, own teacher, other teacher/school, Parent/SGB/Security/Clerk denial; multiple subjects/classes, terms, margins, missing data, completion locks, acknowledgement/response, context, support and all required audit events.
- `tests/teacher-my-performance.browser.cjs`: real feature scripts in headless Edge with mocked Supabase transport; teacher response, failed-save text retention, confirmed acknowledgement, Principal/Deputy summary/history/filter controls, year separation, support create/update/failure handling and console-error checks.
- Existing unit suites and review/metrics/targets/workflow browser tests provide regression coverage. This is not proof of every existing SchoolShield screen or a live production-session test.

## Pilot readiness

Ready for a controlled staging pilot **after** migrations are applied and authenticated live-session acceptance passes. No migrations have been deployed by this task. Verify the actual project RLS with the intended pilot identities/schools, catalogue/teaching assignments, real assessment year/term/weights and mark completeness, and review the personnel-information access with school leadership.

Persisted academic calculations are reused: missing assessments/marks remain “Not enough data”; management must refresh calculations when marks change before completing the review. Evidence input currently records narrative/document reference notes, not uploaded review attachments. Teacher response drafts are retained in the current page but are not a full offline queue. History currently retrieves a teacher/year in one response; large longitudinal audit volumes may require pagination. The separate broader workspace-concurrency work is outside this feature and remains unfinished.
