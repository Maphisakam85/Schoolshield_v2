# Learner reports, teaching assignments and feedback

The report history preview is a responsive report with school heading, learner details, term columns, assessment results, current attendance and standing. Its PDF uses a matching table, wrapping, repeated headings and confidential/page footers. It uses configured class subjects rather than unrelated subjects across a grade. Missing scores remain Not enough data; no invented averages or teacher names are generated.

Existing teacher_teaching_contexts remains the UUID relationship between school, teacher, subject, class and academic year. A learner belongs to a class; subject teachers derive from those assignments. The class teacher remains a separate administrative/pastoral role. Current learner pages show the subject-teacher list only when multiple active teachers are actually assigned. Report tables add subject teachers only for multiple teachers assigned in the selected school year. No universal grade threshold forces a staffing model. Historic teacher names shown in report rows describe school-year assignments, not proof of who authored every assessment.

Migration 20261014260000 adds get_learner_subject_teachers(p_learner uuid), exposing only assignment identity, teacher display name, subject/class/year/dates/status. It checks authenticated readiness, same-school membership and existing learner access: linked parents, assigned teachers, Principal/Deputy/Clerk. SGB, Security and other-school users are denied. It does not expose phone/email/appraisal data or broaden profile SELECT permissions. The prior registration migration 20261014250000 is also applied.

## DBE research (14 October 2026)

Foundation R?3: languages, Mathematics and Life Skills; Intermediate 4?6: languages, Mathematics, Natural Sciences and Technology, Social Sciences and Life Skills; Senior 7?9 separates Natural Sciences and Technology and includes EMS, Life Orientation and Creative Arts; FET 10?12 has language/mathematics/life-orientation requirements and approved subject choices, including academic and technical pathways. Computer Applications Technology is an FET subject; a legacy Grade 8 CAT offering requires administrator review rather than silent deletion of stored marks. Coding and Robotics is listed separately on DBE phase pages; it must not be equated with CAT. This is curriculum guidance, not a complete qualification validation engine or a mandate about teacher counts.

School Records class/assignment forms show phase guidance. Actual school subject offerings remain configurable and are never automatically replaced with a universal seed catalogue. Language levels and elective choices must be configured accurately by the school; individual FET elective group enrolment is not added by this change.

Primary sources:
- https://www.education.gov.za/Curriculum/CurriculumAssessmentPolicyStatements%28CAPS%29/CAPSFoundation.aspx
- https://www.education.gov.za/Curriculum/CurriculumAssessmentPolicyStatements%28CAPS%29/CAPSIntermediate.aspx
- https://www.education.gov.za/Curriculum/CurriculumAssessmentPolicyStatements%28CAPS%29/CAPSSenior.aspx
- https://www.education.gov.za/Curriculum/CurriculumAssessmentPolicyStatements%28CAPS%29/CAPSFET.aspx

## Loading and saving

All shared workspace HTML pages render a static loading state before the remote SDK/auth/data reads. Same-origin page links show a navigation loading state. Bootstrap errors provide retry/sign-in controls. ui-feedback.js shows Saving then Saved only after successful mutation RPC responses, or failure/offline feedback. Existing form-level management messages remain. Buttons have pressed/disabled feedback. Unsaved drafts remain governed by existing persistence/draft protection; this helper does not promise offline saves.

QA: 105 unit regressions, desktop/mobile report rendering, real jsPDF download, single/multiple teacher layouts, missing-data and saving/saved/failed checks. Full database fixture passes 46 assertions including linked-parent access and SGB/Security/cross-school denial. Physical devices were not tested.

Deployment: both learner migrations applied and UI published to https://schoolshieldv2.vercel.app on 14 October 2026. Live checks passed for Principal, Deputy, Clerk and linked Parent access; SGB/Security denial. A real Parent browser session loaded the learner, teaching assignments and formatted report without page errors. Existing data was read only during live QA.
