# Internal QMS-Aligned Review

This term review supports internal performance monitoring and does not replace the formal DBE/ELRC QMS appraisal process.

## Workflow

Principal/Deputy selects a teacher and term, reviews the separate subject/class metrics and targets, then opens the review form for that teaching context. The five QMS-aligned areas each have a reviewer comment and optional evidence/reference notes. Overall strengths, concerns, recommended support, next-term focus, contextual factors/notes and repeatable support actions are saved with the review. Evidence here is descriptive text/document references; this form does not upload attachments.

Save Draft persists an In Progress review. Complete Review requires a comment for each area and records reviewer completion, freezes academic evidence and targets, and sets Awaiting Teacher Acknowledgement. The optional 1–4 rating is explicitly chosen by the reviewer and is never calculated from learner marks. A missing rating remains unrated.

This section queues the review for acknowledgement. Section 5 (`teacher-my-performance.md`) adds the teacher receipt/response action; acknowledgement does not mean agreement. Existing Completed records remain readable and locked. Each subject/class/term remains separate, with no combined academic teacher score.

## Integrity and permissions

Apply `20261013140000_teacher_term_review_workflow.sql` after the three preceding teacher-performance migrations. It adds review content, a manual internal rating, revision checking, an evidence snapshot and append-only `teacher_review_history` metadata. All draft, submission and amendment writes run through `save_teacher_review`; Principal/Deputy and tenant identity come from the authenticated profile. Direct authenticated review writes and audit mutations are revoked. The legacy status setter can only bootstrap a Not Started header.

Submitted review metrics/targets reject changes, including through their existing RPCs. Opening a submitted review returns saved metrics rather than recomputing historical evidence. Deleting a submitted review, including via a teaching-context cascade, is rejected. Later changes to the narrative/context/support/rating require an amendment reason and the expected server revision. Amendments preserve the previous and new full values, authenticated author and server timestamp in the same database transaction. The original academic snapshot remains unchanged; an amendment returns a legacy Completed review to Awaiting Teacher Acknowledgement. Updating the frozen metric/target definitions is deliberately not part of a narrative amendment.

History is visible only to same-school Principal/Deputy. Teachers retain the existing read access to their own shared/completed review and own targets, without management edits. Other roles and other schools cannot access this workflow. Database owners/service credentials remain privileged and must stay server-side.

## Validation

- `tests/teacher-review-workflow-rls.cjs`: actual PostgreSQL migrations using PGlite; draft/submission, optional/manual rating, factors, support, optimistic revision conflicts, frozen metrics/targets, legacy Completed, deletion/immutability, reasoned audit and roles/tenants.
- `tests/teacher-review-workflow.browser.cjs`: local headless Edge with mocked Supabase responses; Principal/Deputy draft reopen, submission validation, retained text on failed save, disabled duplicate submission, locked fields and amendments/history.
- Existing unit and review/metrics/target browser suites cover regressions. Browser mocks are not a live Supabase deployment test; migration deployment and live-session acceptance remain outstanding.
