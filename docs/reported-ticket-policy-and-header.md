# Reported ticket policy and Super Admin header

Updated 10 November 2026.

For School-reported tickets, the original title, description, category, submitted
priority, school, origin and submission attribution are retained. Super Admin can
read the complete report and update status and internal resolution notes through
the existing audited support workflow. Opening a report does not dismiss it.
Owner-created tickets retain editable details.

The form marks original text read-only and disables original category/priority
controls. It submits the confirmed original values with status/notes; disabled
selects are not silently lost from FormData. The backend trigger in migration
`20261109160000_preserve_reported_problem_details.sql` independently rejects any
attempt to rewrite the original submission, including changing its tenant or
attribution. No existing ticket contents were rewritten by this migration.

All five authenticated platform pages share the same header: SchoolShield brand
and Super Admin subtitle on the left; directory, reports and account actions
grouped on the right. The notification count keeps its red badge without a large
red alert frame. Mobile navigation moves to a second row and keeps sign-out
visible; the long account email is omitted at narrow widths.

Verification: isolated SQL covers protected-field/tenant/attribution tampering,
allowed resolution/notes and editable owner-created details. Mocked desktop/mobile
browser checks cover locked original fields, enabled workflow fields, expandable
report contents and report navigation. Desktop/mobile header screenshots were
visually inspected. No real tickets were edited for QA.

The migration is applied to the linked project; its ledger entry and enabled
support-table trigger were verified live. Final build: 185 passed, zero failed,
one optional image-codec test skipped.
