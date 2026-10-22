# Outside-app notifications and chat follow-up

## Implemented locally

- Chat inbox headers contain Chats and search, without the repeated communication/private-description copy.
- Chat links use History API navigation. The selected chat workspace is replaced; the application shell, sidebar and top bar stay mounted. Existing URLs, browser Back/Forward, permissions and message backends are retained. Shared-chat drafts remain in memory per conversation while switching; direct-chat drafts retain their existing per-peer handling. Drafts are not newly guaranteed after closing a tab.
- Desktop conversation lists collapse/restore. Demo mode is a compact header badge. High-priority alerts remain visible in a compact row. Review later suppresses that banner in the current user's session, leaves the unread notification available in Notifications and does not affect another approver.
- Notifications → Device notifications provides explicit opt-in/out for Web Push. Permission is never requested automatically. Logout removes the device subscription, with a bounded cleanup wait and local unsubscribe even if server cleanup fails.
- Private subscriptions and a server-owned outbox use existing profile/school checks and notification visibility. Delivery rechecks school access, notification visibility/read state, and direct-chat participants. No browser-selected recipient, role, school or message is trusted.
- The service worker has no fetch/offline cache handler. Lock-screen content is generic and opens the same-origin Notifications page through normal login checks. It does not include names, learner data, medical information, incident descriptions or chat text.

## Configure before real delivery

This follow-up's `20261021140000_web_push_notifications.sql` migration and `push-dispatch` function have **not** been applied/deployed. No real push notifications were sent. Earlier chat migrations are already applied, as recorded in chat-api-verification.md.

1. Apply the new push migration after the existing notification-read, workspace and SGB–Security migrations (including `20261021130000_sgb_security_chat_inbox.sql`). Review migration history first; do not replay older bootstrap migrations with an indiscriminate include-all push.
2. Generate a persistent VAPID pair with `npx web-push generate-vapid-keys --json`. Keep the private key secret. Store only the public key as `webPushPublicKey` in `SchoolShield/supabase-config.js`.
3. Set Edge Function secrets `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` (a real owner mailto address or HTTPS contact URL), and a long random `PUSH_DISPATCH_SECRET`. Supabase supplies its URL/service-role key to the Edge runtime. Never place private keys or the dispatcher secret in browser configuration.
4. Deploy `push-dispatch` with its supplied `verify_jwt=false` configuration. The function independently requires `Authorization: Bearer <PUSH_DISPATCH_SECRET>`; missing/wrong credentials receive 401. It accepts no client-controlled payload or recipient.
5. Schedule an authenticated POST to `https://<project-ref>.supabase.co/functions/v1/push-dispatch`, for example every minute with Supabase Cron/pg_net. Store the authorization value in Vault or the scheduler's secret store, not in source code or plain-text cron SQL. Body is `{}`. Calls claim up to 20 jobs atomically with a five-minute lease; concurrent dispatchers cannot claim the same live lease.
6. Serve the frontend over HTTPS. Open Notifications, choose Enable notifications and accept the browser prompt. On iPhone/iPad, first add SchoolShield to the Home Screen, then enable from that app. A denied permission must be changed in the browser/OS settings.
7. With two opted-in QA accounts and a separate QA school, create a newly authorised notification, close/background the app and verify delivery, click-through/login, unread state, logout cleanup, account deactivation and school suspension before a pilot rollout.

## Scope and operational limits

New persisted workspace notifications, account-request/teaching-assignment notices and SGB–Security messages queue push delivery to opted-in authorised devices. Existing history/imports do not backfill notifications. Other chat streams that do not generate a server notification are not automatically converted into push events by this section. No SMS or email provider has been configured.

The queue retries transient failures up to five attempts with backoff and removes expired device endpoints (404/410). Failed/expired leases remain inspectable by a trusted administrator in `web_push_outbox`; endpoint data is inaccessible to ordinary users. A sent status means the push provider accepted the request, not that a person read it. Provider acceptance followed by an uncertain database outcome can result in a retry; a generic notification tag coalesces device alerts. Browser/OS push support and delivery remain subject to device settings.

Subscription endpoints currently allow Google FCM, Mozilla, Windows and Apple push services only. Unrecognised providers require a reviewed allowlist update. Limit is ten devices per user. VAPID key rotation requires re-enabling subscriptions on devices.

## Verification

- Isolated PGlite database: full new migration executed; device ownership, endpoint validation, revoked direct table access, backend-only queue access, audience/school isolation, new-event idempotency, leases, role revalidation, retry exhaustion and suspension tested.
- Unit/mocked Edge tests: explicit consent, failed registration, unsubscribe, generic service-worker payload, same-origin click destination, dispatcher authorization, missing secrets, accepted delivery, expired subscriptions and safe retry errors.
- Mocked Edge browser: same/cross-channel chat switching without document reload; shell and draft preservation; Review later without read receipts; compact alert/demo header; inbox collapse/restore; mobile keyboard and history-scroll regressions.
- JavaScript and Edge TypeScript syntax checks run. No real browser Push service, physical Android/iOS device, deployed Edge function, scheduled delivery or live push RLS verification was exercised in this follow-up.

Primary references: [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [web-push library](https://github.com/web-push-libs/web-push), [Supabase Edge Functions](https://supabase.com/docs/guides/functions).
