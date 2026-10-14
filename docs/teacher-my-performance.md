# My Performance and development/support

Apply `20261013150000_teacher_acknowledgement_support.sql` after the four preceding teacher-performance migrations. This is an internal term review, not the formal DBE/ELRC QMS appraisal.

Teachers open **My Performance** from navigation and select a year/term. Every explicitly linked subject/class has separate academic indicators, targets/margins and developmental support actions. Missing saved metrics display “Not enough data”. The view reuses persisted subject-performance calculations, targets and review evidence; it does not invent assessments or infer a teacher's subjects. Before publication, only the teacher's numeric metrics and management-set targets/support are exposed. Draft management comments, ratings and review narratives remain private. After submission the review and its frozen academic evidence are shown read-only.

## Receipt and response

The teacher may acknowledge a reviewer-completed own review and submit an optional response (up to 6,000 characters) in the same transaction. The UI and audit explicitly state that acknowledgement confirms receipt and **does not mean agreement**. Supabase stores `teacher_acknowledged_at` and `teacher_comment`, sets the review to Completed, increments its revision and retains the management reviewer, comments, rating and evidence. Acknowledgement cannot be repeated or used to change management fields. Failed saves retain response text. Revision conflicts require refreshing the review.

A management amendment returns the review to Awaiting Teacher Acknowledgement and clears the current acknowledgement/response. The previous receipt, response and review version remain in the immutable review audit, available to leadership. The amended version needs a fresh teacher acknowledgement.

## Development / Support Actions

Principal/Deputy can create and update normalized `teacher_support_actions` from the teacher's subject/class/term page. Fields: support area, intervention, responsible person, due date, optional follow-up date, status and outcome. Suggested areas include subject-content support, classroom management, lesson planning, CAPS pacing, assessment design, moderation, peer observation, departmental support and professional development; custom areas are accepted. Statuses are Planned, In Progress, Completed and Cancelled.

Actions remain editable as developmental follow-up after review completion. They do not mutate the original review's support narrative or create disciplinary actions. Creation/update identities and server timestamps are stored; revision checking prevents stale updates. Action and teacher/review/tenant identity cannot be changed through the RPC. No deletes or direct authenticated table writes are granted. Teachers can read their own actions but cannot create/update them.

## Server permissions

- `get_my_teacher_performance(year, term)` derives teacher and school from the authenticated profile; it accepts no client teacher ID.
- `acknowledge_teacher_review` requires the signed-in teacher's completed review and expected revision; it changes only receipt/response/status metadata.
- `save_teacher_support_action` requires same-school Principal/Deputy and validates the immutable review/teacher assignment.
- RLS permits support reads for same-school Principal/Deputy or the assigned teacher only. Parent, SGB, Security, Clerk and other-school users are denied. Existing review/target RLS continues to deny teacher management edits and other-teacher access.

The private data endpoint exposes current **saved** metrics, not a new background recalculation engine. Existing management metric calculations must be refreshed when marks change. Support actions are shared with the teacher immediately, including while a management review is still a draft. Response drafts survive rerenders in the current page, but are not persisted offline until Supabase confirms acknowledgement.

## Verification

`tests/teacher-my-performance-rls.cjs` executes actual migrations in PGlite and covers own-only retrieval, draft privacy, acknowledgement without agreement, teacher response, immutable management fields, duplicate/stale receipt rejection, amendment re-acknowledgement, support CRUD/revisions and role/cross-school denial. `tests/teacher-my-performance.browser.cjs` checks the real frontend modules in headless Edge with mocked Supabase responses. Live migration deployment and authenticated production-session acceptance are separate steps.
