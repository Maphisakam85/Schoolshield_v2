# Branding, invitations and navigation — 2026-11-10

## Implemented
- Logo actions show an inline live status next to the controls, including preparation, crop preview, cancellation, saving, confirmed success and retained failures. Existing top-of-page status remains available.
- PNG/JPEG/WebP selection retains the existing content/dimension/size checks. A canvas editor fits the whole image by default, preserves aspect ratio, offers keyboard-accessible zoom and horizontal/vertical position controls, and emits a 400 × 300 PNG matching the 200 × 150 display shape. The existing server decoder and school-specific immutable storage paths remain authoritative. The old saved logo remains active until storage and database confirmation succeed.
- In-flight logo controls are disabled. Late decoding results from a cancelled or changed file are discarded. Crop changes start a new operation; retries without edits reuse the operation.
- Active school accounts with no setup-completion timestamp have Send invitation / Resend invitation controls, including legacy records with false/null setup flags. Completed or inactive accounts remain excluded. Existing explicit confirmation, reason, school isolation, protected owner identity, audit and operation recovery apply.
- Migration 20261110100000_platform_pending_setup_invitations.sql updates private server eligibility and sets requires_setup when an invitation operation commits. It does not bulk-edit accounts, send mail, or grant platform privileges. Applied to the linked project; ledger and private-function ACLs verified. Installer under docs/sql is an alternative to the migration runner, not an additional migration to run twice.
- Desktop school sidebar supports dragging its vertical edge, arrow-key adjustments (10px), Home/End bounds, and session-scoped width retention across pages/collapse. Bounds: 220–400px, further limited to 40% of viewport. Mobile navigation and compact icons remain unchanged.
- Password-reset messages distinguish rate limits, provider errors and network failures using safe error codes; raw provider details are not displayed.

## Live findings and changes
The deployed manage-users source was downloaded read-only into TEMP and found to lack the repository's platform-admin branch. That older function rejected the owner as a non-school-staff actor. Replaced it with the tested repository version. No browser role grants or impersonation were introduced. A live request without credentials returned 401; no live account mutation/invitation was attempted.

Read-only live config pull reported no enabled custom SMTP section. The temporary config was removed. Gmail/Workspace SMTP still needs private administrator setup in Supabase (smtp.gmail.com, port 587, full sender address, Google app password). This work did not send a real reset or invitation and does not claim verified mail delivery. The latest safe reset error code is needed if errors persist after configuration.

## Verification
- Full local build: 190 passed, 0 failed, 1 optional image-codec skip.
- Isolated PostgreSQL pilot suite: 274 assertions, including legacy pending-setup invitation finalization, tenant and ordinary-user denial, last-Principal protection and audit behavior.
- Mocked desktop/mobile branding/accounts browser suite: exact 400 × 300 upload, crop controls, local status visibility, failed-save retention, school isolation, invitation visibility, confirmation/duplicate protection.
- Desktop/mobile branding/theme regression suite passed after the inline status change.
- All seven school roles checked at desktop/tablet/mobile widths, including drag/keyboard width changes and collapse/expand retention.
- Real authenticated owner mutation, actual email delivery and real-device interaction remain untested. No real school logo, status or account was modified during QA.
