# Teacher subject/class academic evidence

This is part of the internal Teacher Term Performance Review, not the official
QMS appraisal. Metrics are evidence for a review; no overall teacher score,
performance judgement, CAPS topic catalogue or targets are generated.

## Data and scope

The normalized `teacher_performance_subjects` table has one evidence row per
existing `teacher_performance_reviews` row. Its subject, grade and class come
from that review's teaching context. The server reads saved SchoolShield
workspace assessments and their percentage scores, plus the existing class
roster. No demo marks or placeholder numeric metrics are created.

Only the Principal and Deputy can refresh/save evidence. All school/context
identities are verified server-side. Computed fields cannot be directly edited
through the table API. Teachers can read only their own evidence for shared or
completed reviews; other roles and schools cannot access it.

## Calculation rules

- Match the exact subject, class, academic year and term. Use explicit assessment
  year fields or the year recorded in its date; never infer a term from a date or
  assume an unknown year. Unattributable records are excluded and counted.
- Use submitted/completed/finalised/published assessments for academic evidence;
  draft scores do not count as completed evidence.
- SchoolShield scores are percentages. Blank, null, non-numeric and out-of-range
  scores are missing data; a valid zero is retained. `totalMarks` does not convert
  percentage entries into raw marks.
- The reviewer selects a submitted assessment from that same context as the
  baseline. No baseline is automatically invented from a teacher's name, an
  unrelated subject, class averages, or a previous term.
- Current performance excludes the selected baseline. First compute each
  learner's mean from their valid current marks, then average those learner
  means. Use assessment weights when every current assessment has a valid
  positive weight; otherwise use equal weights throughout that period.
- Baseline average uses valid baseline marks for the current roster. Improvement
  is the mean change for learners with **both** baseline and current marks.
  Matched learner counts and paired averages are displayed separately so roster
  or missing-mark differences do not masquerade as improvement. Positive/negative
  paired changes count learners improving/declining; equal marks count as neither.
- Pass rate uses learners with valid current means as its denominator. At-risk
  means below SchoolShield's existing 50% indicator threshold. Coverage is shown
  as marked learners out of the full class roster. These are application
  indicators, not an official promotion determination or a teacher rating.
- Previous-term average independently uses submitted marks for the same subject
  and class, filtered to the current roster. Term 1 compares with Term 4 of the
  preceding year; other terms compare with the preceding term of the same year.
  Historical roster snapshots are unavailable, so this is explicitly a current
  roster comparison, not a claim about all learners enrolled last term.

Null/unavailable results display **Not enough data**. Known zero counts remain
zero. For example, valid baseline marks 50 and 58 give 54%; current marks 60 and
62 give 61%; the matched improvement is +7 percentage points.

## Assessment and curriculum summary

Planned assessments count recorded tasks for the exact subject/class/year/term.
Completed assessments count those with submitted/finalised status. Marks
outstanding count missing/invalid learner marks on completed tasks, including
the baseline. Without scoped assessment records these fields remain unknown.
There is no separate official assessment-plan source or assumed prescribed count.

Curriculum coverage is an optional reviewer-reported percentage; no coverage is
calculated without curriculum evidence. Reviewer comments are optional. These
manual fields are saved with the calculated evidence and preserved by ordinary
refreshes. No CAPS topics are hard-coded.

## Files and deployment

- `SchoolShield/teacher-performance-metrics.js`: per-context evidence cards,
  baseline selection, manual coverage/comments, failed-save draft retention.
- `SchoolShield/teacher-performance.js` and `.html`: integrate the metrics with
  the existing teacher → subject → grade → class → term review hierarchy.
- `supabase/migrations/20261013120000_teacher_subject_performance.sql`: table,
  RLS, server-side calculations and refresh RPC.
- `tests/teacher-performance-metrics.cjs`, `.test.cjs`, `.browser.cjs`: actual
  PostgreSQL calculations/RLS and frontend/browser regression coverage.

Apply the Section 1 migration (`20261013110000_teacher_term_performance.sql`)
before this migration. They have only been tested locally, not deployed here.
Academic evidence is a saved snapshot. Use **Save and recalculate** after mark
changes. Assessment planning completeness and historical class membership cannot
be recovered from records that the application never stored.
