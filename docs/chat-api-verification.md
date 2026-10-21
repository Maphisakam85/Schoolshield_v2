# Chat and API contract verification — 21 October 2026

The SGB–Security page now uses a searchable inbox and a contained transcript in SchoolShield colours. The most recent authorised conversation opens automatically on desktop. Mobile displays the inbox first, then a conversation with a Chats back button. Message previews come from the private participant-scoped RPC. No sample conversations are injected.

The composer survives message refreshes. Failed sends retain text and reuse their message UUID on retry. Only the transcript scrolls; the page uses the visual viewport for keyboard resizing. Existing Parent/Teacher/Principal chat layouts and permissions are preserved.

## Backend migrations

Apply in order: `20261021100000_sgb_security_chat.sql`, `20261021110000_sgb_security_chat_lifecycle.sql`, `20261021120000_sgb_security_chat_role_cast.sql`, `20261021130000_sgb_security_chat_inbox.sql`. These are applied to the linked project. Lifecycle checks cover suspension; explicit enum casts fix the live recipient query; inbox previews include only messages involving the authenticated actor. Direct message table and private helper access remain revoked.

## Verification

- Live metadata audit: 63 active RPC names, 77 literal call signatures; no missing active RPC or argument/grant mismatch found. Six dynamic argument constructions reviewed separately. Twelve directly referenced public tables exist. This is a contract audit, not execution of every business operation.
- Four missing RPC names occur only in the unused `workspace-sync.js` prototype; no page loads it. Do not activate it without implementing and testing its backend contract.
- Isolated PostgreSQL: bidirectional messages, retries, same-role/cross-school/inactive/setup denial, suspended schools, direct-table denial and inbox preview participant isolation.
- Mocked browser: SGB/Security desktop and mobile inbox, draft preservation, contained scrolling and composer visibility. Other three chat pages retain their nine existing viewport/keyboard simulation checks.
- Sidebar browser checks cover all seven roles, pointer/keyboard, restored/programmatic state, replaced navigation and single-open behaviour.

Browser tests use mocked API data and Edge. Physical Android/iOS keyboards and real multi-device message delivery were not tested. Frontend changes are local until pushed/deployed. The pre-existing school-records.html edits were left untouched.

## Shared chat design follow-up

Parent–Teacher, Principal–Teacher and Principal–SGB now use the same inbox/thread design as SGB–Security. Removed the obsolete alternative chat renderer and old WhatsApp-specific CSS overrides. Existing conversation storage indexes, send actions and authorisation remain unchanged. Inbox previews update alongside the transcript without replacing the composer. Mobile includes a Chats back button and searchable inbox with an empty-search state.

Shared browser coverage now includes 360×800, 390×844, 412×915 and 1366×900 for all three workspace channels, including search/back navigation, split-view visibility, simulated keyboard resizing, incoming messages and draft/focus/cursor/history preservation. No backend changes are required for this visual follow-up.

## Unified inbox

All permitted chat channels now share one Chats navigation entry and combined conversation list. Workspace conversations continue to use their existing store/send handlers; SGB–Security continues to use its participant-scoped RPC. Existing URLs remain valid. Direct-thread links use the profile UUID as the peer parameter; the server still validates recipient and school. No new backend grants or migrations are introduced. The unified inbox never fetches a channel absent from the user's existing access list.
