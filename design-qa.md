# Notification centre visual QA

- Source visual truth: user-supplied dashboard screenshot in this conversation.
- Implementation screenshot: unavailable; this environment has no cloud browser available for a rendered capture.
- Intended viewport/state: desktop dashboard, notification drawer open, then an alert detail opened.
- Evidence checked: source screenshot and the implemented interaction/state changes could not be compared side-by-side in a browser.

## Findings

- [P1] Notification detail previously sat behind the notification drawer.
  - Fix applied: opening a notification closes the drawer, and modal overlays now use a higher stacking layer than the drawer.
- [P1] Header notification control used a diamond glyph instead of a bell.
  - Fix applied: replaced with an accessible bell control and label.
- [P1] Newly created notifications stored the literal value `Now`.
  - Fix applied: new notifications now store ISO creation timestamps and render as relative time; existing `Now` entries are migrated on load.

## Implementation checklist

- [x] Correct notification trigger icon.
- [x] Prevent drawer/detail overlap.
- [x] Render dynamic notification times in the centre, list, and detail view.
- [x] Pass JavaScript syntax and whitespace checks.

## Follow-up polish

- Open the dashboard in a browser, trigger a new notification, then verify the drawer and detail modal at the screenshot viewport.

final result: blocked
