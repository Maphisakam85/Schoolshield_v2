# Focused Super Admin pages

The combined pages have been separated. All page layouts, forms, tables and dialogs remain in HTML. Existing backend permissions, selected-school UUIDs, confirmations, revisions and audit rules are reused. No migration or Edge Function change is required.

| Page | Purpose |
| --- | --- |
| super-admin.html | Platform overview: six key cards, remaining metrics under More platform metrics |
| super-admin-directory.html | Search schools and open the existing school-provisioning dialog |
| super-admin-reports.html | Unresolved school reports; open the correct school/ticket |
| super-admin-school.html?school=UUID | School details and provisioning recovery |
| super-admin-branding.html?school=UUID | Current logo, crop/preview, replace/reset |
| super-admin-colours.html?school=UUID | Portal colour editor and preview |
| super-admin-accounts.html?school=UUID | School accounts and incomplete account requests |
| super-admin-access.html?school=UUID | Lifecycle status, implemented feature controls and confirmation |
| super-admin-support.html?school=UUID | School-specific support tickets and resolution notes |
| super-admin-diagnostics.html?school=UUID | Sanitised operation and delivery diagnostics |
| super-admin-audit.html | Searchable cross-school audit history |
| super-admin-audit.html?school=UUID | Audit history initially filtered to a school |

The sidebar identifies the selected school and links to each task. School name/code remain prominent; the internal tenant UUID no longer adds visual clutter. The header refresh, mobile menu, keyboard controls, adjustable sidebar, unsaved-entry protection and server-written audit behavior remain. Pages read the administrative datasets their controls need rather than loading access controls, tickets and history together. School academic features and staff impersonation remain absent.

Old super-admin-operations.html links redirect to Access controls; links containing a ticket redirect to Support tickets and retain the complete query string. Report notifications, overview report links and audit report buttons point directly to Support tickets. The login landing URL remains super-admin.html.

Validation: full local build 194 passed, 0 failed, 1 optional codec skip, including focused-page and legacy-link tests. Mocked desktop/mobile navigation, branding/colour editing, account actions, access controls, support, diagnostics, audit filtering and report deep-link tests passed. QA uses fictional records and mocked APIs; no real invitations, suspension or school edits were performed. Backend access checks are unchanged and remain covered by existing isolated SQL tests.
