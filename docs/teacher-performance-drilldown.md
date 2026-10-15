# Teacher Performance drill-down

Management now moves through distinct screens: directory -> teacher -> subject -> grade -> class -> term -> term review. The management dashboard and directory filters appear only on the directory. The teacher landing screen shows subject choices; assignment configuration and confidential history are explicit entry points. The final review loads only the chosen teaching context and term: metrics, targets, management review and support actions stay separate from unrelated classes/subjects.

Each step has breadcrumbs and an HTTPS URL query identifying teacher/subject/grade/context/term/year. Reload restores the selected screen; browser Back/Forward restores the previous screen. Changing academic year resets subordinate selections and reloads authoritative records. Invalid/unavailable contexts have a recoverable empty state. Server-derived role/tenant permissions and existing management RPCs are unchanged.

Draft navigation checks occur before route changes. Cancelling retains the mounted form; accepting discards that unsaved form explicitly. Pending document capture blocks navigation. Term choices respect server-provided eligibleTerms; missing assignments or actual school term dates are displayed instead of guessed.

UUIDs remain the underlying identities. A profile/staff UUID is no longer displayed as an employee number when no human staff number is captured.

QA: 105 unit regressions; four dedicated Principal/Deputy desktop/mobile drill-down cases with multiple subjects, grades and classes; URL/reload/Back; context-only metric binding; draft cancellation and confirmed departure. Existing review workflow, teacher own-view/history/support and teaching-assignment browser tests passed after updating them to follow the drill-down. This is a UI/navigation change; no database migration is required.

Published to https://schoolshieldv2.vercel.app on 14 October 2026. A real Principal browser session verified the separate teacher landing and assignment management screens, URL reload, browser Back, retained confidential history, archived-year exclusion and working Apply updates without JavaScript errors.
