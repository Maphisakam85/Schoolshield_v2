# Performance history corrections ? 14 October 2026

Teacher history now inserts only internally generated termContext markup as HTML. Each database value inside that markup remains escaped. Prior whole-fragment escaping caused literal section/p/h4 tags to appear. The modal is wider, term panels are spaced and audit JSON wraps.

History/year selectors and learner history controls are read-only view controls, not draft editors. Open read-only modals do not block background rendering or Apply updates. Genuine open edit forms still defer updates. Before-unload checks real changes rather than focus/open-modal state. Explicit sign-out checks actual drafts before ending Auth, permits cancellation while signed in, handles sign-out failure, and suppresses the second native unload prompt after successful confirmed sign-out.

Apply updates displays Save or close form first when blocked; Loading updates... and aria-busy only while a refresh runs. Disabled controls use a not-allowed cursor rather than an indefinite loading cursor. Desktop/mobile tests verify enabled Apply in a read-only history modal, successful refresh and retained real incident drafts.

## Reported 1998 record

A live read found exactly one 1998 context (4b9d6875-a34c-4f4d-8fda-d29fd3657b39) and a linked review in SMM-001, with no targets. Migration 20261014270000 records an archive reason and original context/review snapshots in teacher_performance_archives. Original operational and audit records are not deleted or relabelled as 2026. Checked assignment, directory, overview, history, own-performance and learner-teacher reads exclude this specific context. Other historical years/contexts remain available. Archives are read-only to authenticated same-school Principal/Deputy; clients cannot modify them. Existing RPC role/tenant validation is retained in private wrapped functions.

The absence of explicit 2026 teaching assignments remains a genuine setup condition. Management must use Assign Subject & Class and enter real dates/subjects, rather than treating an old pilot record or a class-teacher name as current subject assignments.

QA: 105 unit tests; 54 SQL assertions including archive retention and legitimate historical-year preservation; management history/acknowledgement/support browser checks; malicious review HTML remains literal text; desktop/mobile draft and Apply checks. Live Parent sign-out and archive exclusion/preservation checks passed.
