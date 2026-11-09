# Super Admin problem notifications

The authenticated Super Admin header shows an unresolved school-report count on
the directory, school management, branding, accounts and operations pages. Opening
the list or a report never marks it resolved or dismisses it. Only school-reported
tickets are included; owner-created tickets remain in school support.

Each entry shows the school name/code, report title, priority and status. Selecting
it opens the school's operations page and the exact support-ticket dialog. The
page matches both ticket and school IDs before opening; tampered or unavailable
targets show a safe message. Use the existing audited support form to save notes
and change status. Open and In Progress stay active. Resolved and Closed leave the
list; reopening a report makes it active again.

The header refreshes after a support save, on focus/open, and every 30 seconds
while visible. Manual refresh and paging cover more than 25 active reports. A
failed refresh retains prior entries and shows retry feedback rather than falsely
clearing the badge. Logout clears the header. It does not send email or school
messages and requires no external notification provider.

Backend migration: `20261109130000_platform_problem_notifications.sql`, installed
in project `kosidewowwfdvzqhzxau` using the explicit transaction/history installer.
The SECURITY DEFINER RPC calls `require_platform_administrator()` before returning
any data. Ordinary school users and anonymous callers cannot read the list.
Descriptions and internal notes are excluded from this notification projection;
the original school-scoped support/audit workflows remain authoritative.

Verification includes isolated PostgreSQL owner/ordinary/anonymous access,
two-school ID/name matching, safe projection, pagination, persistent reads,
in-progress/resolution/reopening; and mocked desktop/mobile browser checks for
header links, report opening, resolution refresh, HTML-as-text and safe errors.
No real reports or real accounts were created for QA.

Live installation and rollback-only anonymous/unverified-account denial checks
passed; migration history and function ACLs were verified. The full local build
passed 181 tests, zero failed, with one optional image-codec test skipped. The
owner UI flow uses mocked APIs in browser QA; no live report was resolved for QA.
