# Portal fixes - 11 November 2026

Super Admin now uses page titles in the header and the available content width.
Account settings are accessible above the sidebar email/sign-out controls.
Display-name changes use the authenticated user's Auth metadata; password changes
require the current password, matching new passwords and a fresh platform-context
check. Email and platform privileges are not edited by this page.

The deployed function list did not contain `school-branding`. Deployed the tracked
function with the existing JWT configuration and WebP asset. The private bucket,
read RPC and commit RPC exist. A valid demo Principal JWT reached the function
and received HTTP 403 `Platform access denied`, before image processing or writes.
Owner upload/replacement was exercised with mocked Auth/storage/API in browser QA;
no real school logo was changed. A successful live owner upload remains to verify.

Invitation success now appears once; a private setup/reset-link field is shown
only when a link was returned. Bulk email invitation review lists eligible users
for the selected school. It excludes inactive, completed, pending-operation and
already-invited users, sends sequentially through the existing audited endpoint,
and stops on the first failure. Provider acceptance is not proof of receipt.
No actual emails were sent during verification.

Draft recovery is inside the main content column, so it follows sidebar resizing
instead of being obscured by the sidebar. Quick-access arrows were removed.

Teacher Performance uses five compact KPIs and collapsible academic-evidence and
term-review sections. Each evidence row provides an Assign / view targets action
for its teacher, subject, class and selected term. Existing target editing, review
locks, permissions and teacher read-only access remain in place.

Live Setjhaba-Se-Maketse assignment evidence: English and Mathematics are eligible
for Term 2 of 2026; Computer Applications Technology starts 19 October 2026 and is
not. The directory previously listed full-year assignments while the overview
listed term-eligible assignments. Both tables now use selected-term eligibility.
No assignment dates, academic results or other school records were rewritten.

The aggregate read-only `sql/academic-consistency-audit.sql` returned zero issues
for teaching-context identities/tenants, review contexts, target subjects/classes,
support-action ownership and profiles without schools. This is a relationship
audit, not a claim that every field in every portal has been manually reconciled.

Verification: full unit build 195 passed, 0 failed, 1 optional codec test skipped;
mocked desktop/mobile browser checks for owner settings, accounts/invitations,
branding, navigation, sidebar and teacher target/review flows; draft banner bounds
at 1920, 1366, 390 and 320 pixels. No live password changes, invitations or SOS.

## Recipient selection and sidebar follow-up

Bulk invitations now provide Remove beside each selected recipient. Removal only
excludes the recipient from that batch; it does not delete or deactivate accounts.
Repeated API rows are deduplicated by account UUID. Different selected accounts
sharing an email address block sending until the recipient selection is resolved.
The live MMU-001 aggregate check found seven accounts and zero repeated IDs,
email addresses or display names. No accounts were merged or deleted.

School sidebars use distinct group icons rather than borrowing the first page's
icon. A collapsed group opens a labelled flyout without widening the sidebar.
Escape/outside click dismiss it, and the desktop collapsed/expanded preference
persists across page changes and redraws. Mobile keeps the existing drawer.
Browser tests cover all seven roles at desktop, intermediate and mobile widths,
including recipient exclusion and duplicate-email blocking with mocked sending.

## Theme, register view and presentation follow-up

Saved custom colours now also cover active navigation, hero panels, hover states
and readable foregrounds. Alert/status colours stay semantic. Page controls are
isolated below the sidebar so they cannot paint over its flyouts. Navigation
groups with one available page are direct links, retaining active/unread states.

Saved daily attendance rows provide View alongside Edit/Delete. View displays
only saved entries, including entries whose learner is no longer in the current
roster, and checks that the class is assigned to the signed-in teacher. It has no
editable fields and makes no persistence request.

The shared portal presentation helper groups panel-header actions on the right.
Long optional introduction/header guidance and explicitly marked account guidance
use an information control supporting hover, focus and tap. Errors, status text,
confirmations and required input labels remain visible. Browsers without native
popover support keep the original guidance visible. Form labels have consistent
spacing and restrained focus outlines.

Successful device-notification enable/disable collapses its setup controls to a
compact status row. Notification preferences reopens them. Done can also dismiss
the controls; the choice is remembered on the device per signed-in account. Failed
setup remains visible and is never presented as enabled. No real push permission
or subscription was requested during browser QA (the API/browser boundaries were
mocked).

Verification: 195 unit tests passed, zero failed, one optional test skipped.
Browser checks passed for all seven sidebar roles, custom/light themes, flyout
stacking, read-only attendance, optional guidance, header action grouping, field
spacing and device-preference reopen/persistence at desktop/mobile widths.
