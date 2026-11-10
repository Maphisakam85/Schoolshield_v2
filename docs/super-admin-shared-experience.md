# Super Admin shared portal experience — 2026-11-10

Reviewed the authenticated school portal's shared interface and compared it with all five authenticated Super Admin pages. This transfers administrative usability patterns while keeping the owner portal separate from school roles and academic records.

| School portal pattern | Super Admin result |
| --- | --- |
| Header refresh | Added to directory, school management, branding, accounts and operations. Reloads confirmed data without reloading the document; refreshes report notifications and the home summary. Panel-level failure results stay in their panels. |
| Sidebar navigation | Added a common sidebar with visible SVG icons, current-page indication, collapse/expand, draggable vertical edge, keyboard resizing, and tab-scoped width preference. School links use the canonical UUID returned after authenticated school loading. |
| Mobile menu | Overlay navigation with backdrop, Escape dismissal, inert hidden content and toggle state. No horizontal page overflow at the tested 390px viewport. |
| Loading and click feedback | Refresh is disabled before platform verification and while running. Duplicate refresh clicks do not issue duplicate page reads. Existing mutation buttons keep their operation-specific feedback and idempotency. |
| Unsaved forms | Header refresh refuses to overwrite unsaved form entries or refresh during a pending mutation. Existing discard confirmations, retained provisioning recovery and cross-school navigation guards remain. It does not silently retry saves. |
| Connection state | Compact offline indication; offline refresh makes no API request. No automatic mutation retry when reconnecting. |
| Notifications | Existing unresolved school-report count, expandable list, correct school/ticket links, polling, manual refresh and Escape dismissal retained. Reports remain active until resolved/closed. |
| Save feedback and required fields | Existing local logo/crop/theme/account/support feedback, required asterisks, validation and access-change confirmation retained. Status feedback uses live regions; keyboard focus styling and a skip-to-content link are available. |
| Branding | Selected-school logo and theme editor retained. Owner portal keeps generic SchoolShield branding so one selected school cannot brand the platform owner interface. |
| School-specific modules | Academic setup, academic records, staff chats, school SOS handling, teacher assignments and learner/guardian links remain in school portals. No owner impersonation or browser-role privilege was added. |
| Outside-app school push | Not copied into owner navigation: its school-scoped subscription/recipient authorization is different. Owner report notifications and the separate support email-dispatch configuration remain the owner mechanisms. No fake Enable notifications control was added. |

## Validation
Full local build: 192 passed, 0 failed, 1 optional image-codec skip. Mocked desktop/mobile browser checks exercise authenticated loading/denial, header refresh, duplicate prevention, failure retention, offline requests, unsaved forms, collapse, keyboard/drag resizing, school-scoped links and logout. Existing branding/accounts and operations browser suites cover refresh on those pages as well. The UI uses static HTML markup and a shared chrome script; it does not import app.js or access school academic datasets. No new migration or Edge deployment is required. No live school data/account mutation or real invitation/email was performed.
