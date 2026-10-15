Invitation deployment and verification
======================================

Flow: public request_school_account stores a school-specific request and Email/SMS preference. Only that school's Principal/Clerk can approve through approve-account. The function assigns trusted app metadata and a profile, sends an invitation, and records approval. account-setup.html exchanges the invitation, creates a password, completes personal profile fields, signs out, and returns to login. Login reads the server profile and checks the supplied school code.

Required deployment
-------------------

1. Apply migrations, including 20261007_invitation_delivery.sql.
2. Set the Edge Function secret SCHOOLSHIELD_ACCOUNT_SETUP_URL to the exact deployed HTTPS URL, including any subdirectory: https://YOUR-HOST/SchoolShield/account-setup.html. Caller redirect_to and Origin are deliberately ignored.
3. Set Supabase Auth Site URL to the deployed site and allow-list the exact setup and login URLs. Replace the Invite user email template with email-templates/invite.html. The template now links directly to RedirectTo with TokenHash, avoiding localhost fallback in the Auth confirmation redirect.
4. Deploy approve-account and publish the changed frontend files together. Keep public sign-up disabled and configure production SMTP.

SMS configuration (backend secrets only)
----------------------------------------

- SCHOOLSHIELD_SMS_PROVIDER=twilio
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_FROM_NUMBER: a sender approved for the destination/country and your Twilio account.

Use Supabase Edge Function secrets, never browser configuration or a committed .env file. Twilio trial accounts require verified recipients. The function sends the one-time Supabase invite link via Twilio's Messages API; an accepted/queued response does not prove handset delivery. Check Twilio delivery logs for delivery confirmation. SMS does not change the sign-in identity: applicants still sign in with their email, password and assigned school code. Unconfigured SMS fails before creating an Auth invitation. Rejected provider requests clean up the unused Auth identity so the pending request can be retried. Ambiguous network failures should be checked in provider logs before retrying.

Manual setup links remain available to approvers. Local HTTP links require SCHOOLSHIELD_ALLOW_LOCAL_SETUP=true and apply only to manual delivery. Production Email/SMS reject localhost URLs.

Verification
------------

Run node --test tests/invitations.test.cjs. These tests use mocked Auth/provider responses and verify exchanges, expiry/reuse errors, number formats, password/profile submission and provider failure handling. They do not prove real email/SMS delivery or live database policies.

After deployment, submit fresh Email and SMS requests, approve as Principal/Clerk, open each received link, create a password and sign in using the supplied school code. Confirm role/school in profiles and the resulting session. Try the wrong school code, a non-approver approval, another school's request, expired/invalid links and a consumed link. Confirm consumed links cannot change a completed account's password, and verify delivered status in Twilio. Existing issued links that point at localhost must be replaced; changing frontend code cannot repair an email already sent.
