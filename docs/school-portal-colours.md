# School portal colours

Super Admin → Manage school → Logo & colours now provides five presets, custom
button/highlight and navigation colour pickers, an isolated portal preview,
reload, and an audited save with a required reason. Choosing a preset is a
preview until saved. The default preset restores SchoolShield colours.

`school_portal_themes` holds settings by school UUID. The authenticated save RPC
requires the platform access-code session, validates hex colours and reason,
checks the revision, and records an idempotent operation in platform admin audit.
School users cannot write the table or select another school's theme. Their
read RPC derives the school from the authenticated profile and checks school
access. The migration is `20261029120000_school_portal_themes.sql`.

Every school page loads the shared colour helper before authenticated branding.
Theme settings are held in memory and applied after the returned school UUID is
verified. Identity changes clear prior CSS values; focus refreshes settings.
Foregrounds select readable black or white for primary and navigation surfaces.
Portal navigation, hero and primary buttons use the theme; safety status colours
remain unchanged. Super Admin styling is unaffected by the preview.

Verified on 29 October 2026: 153 unit tests passed, one skipped; database rollback
checks covered save/read, idempotency, stale revision rejection, invalid colours,
school isolation and role denial. Browser checks covered desktop/mobile presets,
preview isolation, saving, retained failed drafts, reload and layout. Existing
branding/account browser checks passed.

Mmulakgoro's database record was checked against the supplied DOCX: official
name, address, telephone, email and designated contact match. No EMIS number was
supplied, so it remains empty. Colour controls do not alter these school details.
