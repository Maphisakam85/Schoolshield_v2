# User-generated HTML rendering audit

Scope: rendering only. No database migrations, permissions, onboarding, persistence or layout changes.

## Fixed boundaries

`app.js` defines the central `escapeHtml(value)` function. It escapes `&`, `<`, `>`, double quotes and apostrophes, preserving zero/false and treating null as empty. Escaping happens only during rendering; stored data is unchanged. Existing announcement and feature-local escape functions delegate to this helper.

Escaped template data covers visitor lists/details/forms; incident details, affected items, follow-up and audit comments; announcements; current and legacy chat contacts/senders/messages; notification pages/drawer; staff and Security officer details; learner and guardian lists/details; class/assessment/attendance views; report previews/download HTML; appointments and sick notices; account request rows; user/school management forms; and teacher performance, targets, review history and support actions.

IDs and form values are escaped in quoted attributes as well as visible text. Modal titles and database error strings are escaped. School signup options now use DOM-created options and `textContent` instead of interpolated HTML. Existing document filenames/errors already use `textContent` or escaped templates.

HTML escaping alone does not protect URL schemes. `safeLinkUrl` rejects executable schemes for dynamic back/setup links. `safeImageUrl` restricts profile images to HTTP(S), blob URLs or raster base64 images, excluding executable/data-HTML/SVG schemes.

## Preserved markup and remaining sinks

`shell`, `generic`, `table`, `modal`, chat patching and feature panels still accept app-generated HTML. They are internal markup composition boundaries, not sanitizers; any new data interpolation must call `escapeHtml` or use `textContent`. Generated buttons, badges, tables, SVG password icons and fixed form controls remain markup. Arrays of generated rows are joined without escaping the markup again.

No known raw user/database HTML insertion remains in the audited first-party rendering paths. This is not a claim that arbitrary future HTML passed to those internal functions is safe. The vendored jsPDF implementation was not modified; existing report data is escaped before HTML composition, and normal PDF text output remains text. This audit does not replace a general third-party dependency security assessment.

## Tests

`tests/html-rendering.test.cjs` checks five attack/character payloads across ten generated views, verifies the central escaping contract, unchanged source data and executable URL rejection. `tests/html-rendering.browser.cjs` inserts those 50 generated views into a real headless Edge DOM, verifies exact literal text, absence of injected script/SVG/image elements, and no payload execution. Payloads include script tags, image `onerror`, attribute-breaking quotes, ampersands, angle brackets and textarea/SVG breakout attempts.

Existing management browser tests verify that forms, actions, saving/error feedback and controls still work. The regression suite also checks chat ordering, mobile layout, announcements, visitors, incidents, attendance and teacher performance behavior.
