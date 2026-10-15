# Realtime and authentication hardening

Workspace refresh defers both server snapshot activation and full DOM replacement while an editor is open, focused or dirty. A visible Apply updates notice reloads fresh server data after the editor is saved/closed. Drafts stay mounted; before-unload warns for unsaved edits. This does not provide crash-proof draft recovery.

Chat refresh patches only the current conversation message list. Composer, focus, cursor and IME remain mounted. History keeps its scroll offset; only readers within 60px of the bottom follow incoming messages. Changing contacts remains an explicit navigation action.

Realtime school_dataset_versions changes feed the same in-flight refresh gate as polling/focus/online. Subscription status selects 60-second healthy checks or 15-second fallback; hidden tabs skip checks. A connected subscription is not proof that publications/RLS are configured correctly: keep the health check.

## Auth

account-setup.html is the canonical invitation route. Login keeps one explicit legacy invite redirect; the unused invite form was removed. Password recovery stays on login. Both use invitation.js exchange validation: PKCE code, token_hash with purpose, or legacy access/refresh fragment. Duplicate/mixed credentials, provider errors and wrong purposes fail without falling back to an unrelated cached login. Successful exchange strips credentials from the URL. Setup still updates password, calls complete_my_profile, checks sign-out and redirects to login.html?setup=complete.

Auth sessions remain tab-scoped. Only PKCE code verifiers share localStorage, so email links opened in another tab of the same browser can exchange. Another browser/device cannot exchange a PKCE code without its verifier; the error asks for a fresh link/original browser. Multiple overlapping recovery requests can replace a verifier.

## Required Supabase configuration

- Site URL: https://schoolshieldv2.vercel.app
- Allowed redirects: https://schoolshieldv2.vercel.app/account-setup.html and https://schoolshieldv2.vercel.app/login.html (plus explicitly approved local QA URLs).
- SCHOOLSHIELD_ACCOUNT_SETUP_URL and SCHOOLSHIELD_MANUAL_SETUP_URL: canonical HTTPS account-setup.html. Keep local setup disabled outside development.
- For browser-independent email opening, configure invite template href as {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite and recovery template href as {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery. RedirectTo must have no query string. Recovery RedirectTo may be account-setup for an unfinished approved account, or login for a password reset.
- Enable authenticated Realtime for school_dataset_versions, account_request_notifications and notification_reads with their existing recipient/school policies. No RLS changes were made here.

Supabase code/token-hash exchanges are single-use. Legacy fragment URLs contain bearer session credentials: copying still-valid credentials is not equivalent to a consumed OTP and cannot be made universally single-use by a frontend. Prefer token-hash templates. Refreshing the cleaned setup/reset page requires a fresh link; no raw URL credentials are stored as drafts.

Reference: https://supabase.com/docs/guides/auth/sessions/pkce-flow and https://supabase.com/docs/guides/auth/auth-email-templates

## QA

101 unit tests passed. Nine Edge mobile viewport chat cases passed (360x800, 390x844, 412x915 across Parent/Teacher/SGB chat). Dirty form DOM/value/cursor preservation passed at 1366px and 390px. Targets/Performance navigation checks passed at three mobile widths. Physical Android Chrome/iOS Safari keyboards, real email delivery, deployed auth template configuration and live Realtime publication delivery were not verified in this run. No database migrations were required.
