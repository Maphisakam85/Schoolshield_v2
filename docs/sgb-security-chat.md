# SGB–Security direct chat

Open **Communication → SGB–Security Chat** as an active SGB member or Security officer. Choose an individual contact, type a message and Send. The opposite role can open the same contact conversation and reply. Existing SGB–Principal chat is unchanged.

Messages refresh every five seconds while the tab is visible and on focus/reconnect. Refresh reloads contacts and the current conversation. Load older messages pages backwards through history. Drafts are kept per contact in memory until a successful send; they are not retained after closing/reloading the page. Failed sends retain their message identifier for safe retries.

## Deployment

Apply `supabase/migrations/20261021100000_sgb_security_chat.sql` to the intended Supabase project before using the page. This is an additive migration: it creates a dedicated message table and one authenticated RPC. Do not blindly replay historical migrations. Deploy the branch frontend after applying this migration.

The RPC derives sender and school from the authenticated profile, checks both users are active/setup-complete, and permits only opposite-role SGB/Security peers in the same school. Contacts expose names, IDs and roles only. Messages are visible only to the two participants through the RPC. Direct client table reads/writes are revoked; RLS is enabled. Principal, Deputy, Clerk, Teacher and Parent accounts cannot use this channel. Service-role database administration remains privileged.

## Review

- Use separate SGB and Security test accounts in one test school. Send and reply; confirm sender bubbles appear on the right and recipient bubbles on the left.
- Leave a draft open while the other account replies. Confirm the draft remains.
- Simulate a failed send and retry. Confirm one stored message and the retained draft until success.
- Confirm unrelated roles, another school and a different SGB/Security participant cannot read a conversation.
- Confirm the existing Principal chat still works.

No production users, messages, or Supabase settings are changed by the GitHub pull request. A successful frontend deployment alone does not apply the database migration.
