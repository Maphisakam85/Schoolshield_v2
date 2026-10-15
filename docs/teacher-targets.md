# Management-set teacher targets

Targets are attached to one existing teacher → subject → grade/class → academic
year → term teaching context and review. This section adds target setting and
tracking only, not teacher acknowledgement or a full review workflow.

## Model and authorization

`teacher_targets` uses UUID identities, school-scoped foreign keys and the
requested teacher/year/term/subject/class/category/description/baseline/value/
measurement/due-date/priority/status/creator fields. It additionally records the
actual source, actual value/evidence note, margin, direction, Near Target tolerance,
revision and update attribution.

All twelve requested target categories and six measurement types are supported.
Percentage, Percentage Point Improvement and Number are numeric. Yes / No,
Completion and Qualitative use descriptive expected outcomes/progress, without
invented numeric values or margins.

Principal and Deputy can create/edit targets through the checked RPC. The server
derives school, teacher, subject, class, year, creator and timestamps. Teachers
can read only their own management-set targets, including on the new My Targets
page, and cannot create/edit them. Parent, SGB, Security, Clerk, anonymous and
other-school accounts have no access. Direct table writes are not granted;
management edits must provide the current revision to prevent stale overwrites.

## Margin and status

Numeric margin is always **Actual − Target**:

- Percentage targets show their margin in percentage points, not relative percent.
- Percentage Point Improvement targets also show a percentage-point margin.
- Number targets show the difference in the target's numeric units.
- A missing actual gives `Not Yet Measured`, with a null margin; valid zero is
  measured normally.
- Exact equality is `Target Achieved`.
- A favourable difference is `Target Exceeded`.
- An unfavourable difference within the explicitly entered tolerance is
  `Near Target`; a larger shortfall is `Below Target`.

Default direction is Higher is better; Lower is better is available for measures
such as outstanding marks. Direction changes classification, **not the raw
margin's sign**. Near tolerance defaults to zero, so no unrequested threshold
policy is assumed. Leadership specifies a positive tolerance in the same units
to enable a Near Target band. Each target displays its direction/tolerance.

Qualitative targets use only Not Started, In Progress, Completed and Not Achieved.
Their margin remains null and displays Not applicable. Yes/No is not converted
to 0/1, nor is Completion automatically converted into a percentage.

## Actual sources

Leadership can explicitly record a manual actual or choose a compatible saved
subject/class metric: current average, pass rate, baseline improvement,
curriculum coverage, assessment counts, outstanding marks or learner counts.
The metric must belong to the exact same review; other subjects/classes/terms
cannot supply the actual. Computed actuals cannot be supplied by the browser.

When subject evidence is recalculated, a database trigger updates sourced actuals,
margins and statuses. Missing evidence remains Not Yet Measured. These are saved
evidence snapshots; raw mark edits require the existing subject-evidence
recalculation before they flow into targets. Manual actuals and qualitative
progress are recorded by leadership. Targets do not create an overall teacher
score or judge teacher performance solely by absolute learner marks.

## Files and verification

- `20261013130000_teacher_targets.sql`: normalized table, RLS, validation,
  derived margins/statuses, stale-edit protection and metric-update trigger.
- `teacher-targets.js`: management Set Target/editor plus read-only Teacher view.
- `teacher-targets.html`: My Targets page.
- `app.js`, `teacher-performance.html/js`, `teacher-performance-metrics.js`:
  navigation, per-context actions and refresh integration.
- `teacher-targets-rls.cjs`, `teacher-targets.test.cjs`,
  `teacher-targets.browser.cjs`: SQL/RLS, display/permissions and browser tests.

Apply the Section 1 and Section 2 migrations before this migration. Verification
uses isolated PostgreSQL and an installed headless browser; production was not
modified or deployed during this task.
