# Identity, dates, shifts and personal notification reads

## Changes

Operational ownership checks now use profile UUIDs, staff/officer UUIDs or learner IDs. Incident reporters and linked staff, sick-notice submitters/learners, appointment participants and announcement authors no longer depend on display-name comparisons. Display labels and legacy references remain preserved. Chat and onboarding are outside this change.

New generated record IDs use full `crypto.randomUUID()` values. Document-associated operational records and announcements no longer prepend display prefixes to their client ID. Visitors/incidents carry a separate readable `referenceId`, never used as a relationship key. Existing primary references are not rewritten.

`app.js` adds `localDateIso`, `localDateTime`, `formatLocalDate` and `formatLocalTime`. Date-only values use `YYYY-MM-DD`; audit instants use complete ISO timestamps. Date-only parsing uses local calendar components. Monday/week generation uses calendar arithmetic, including daylight-saving transitions. Ambiguous legacy numeric dates remain unchanged; valid `D Mon YYYY` dates are migrated with original text retained as `legacy_date`. New operational actor/audit metadata is stamped by the database. Report submission/completion/release metadata now retains full timestamps.

## Migrations

- `20261014210000_personal_notification_reads.sql`: `notification_reads`, own-user RLS, `get_notification_reads`, `mark_notifications_read`, `get_account_request_alerts`, server-side visibility checks, recipient-specific legacy read import and event-reset behavior. Client writes go through a validated RPC that derives user/school from Auth/profile.
- `20261014220000_canonical_shift_records.sql`: typed `security_shifts` ledger, officer ownership RLS, one ACTIVE shift per school/officer, legacy audit projection, canonical UUID shift identity and normalized date/time columns. Existing RPC validation, locking and server-recorded actual attendance are preserved.
- `20261014230000_operational_identity_dates.sql`: operational date/identity/audit normalization, retained legacy date text, immutable prior comment/audit entries, tenant relationship validation and announcement-alert projection based on already-authorized announcement audiences.
- `20261014240000_notification_reader_tenant_fk.sql`: composite profile/tenant foreign key. This enforces same-school reads without introducing an ambiguous PostgREST many-to-many profile-to-school relationship, preserving existing sign-in/profile embeds.

All four migrations were applied to the existing demo Supabase project. Earlier migrations remain unchanged.

## Security shifts

`security_shifts` contains UUID `id`, `school_id`, UUID `officer_id`, `shift_date`, `scheduled_start`, `scheduled_end`, `actual_clock_in`, `actual_clock_out`, scheduled `duration_minutes`, `status` (ACTIVE/COMPLETED/INCOMPLETE), `site`, and legacy references. Overnight duration is supported. Actual times come from the server RPC; a unique partial index prevents duplicate ACTIVE shifts for the same canonical officer.

`security_shift_attendance` and workspace JSON remain compatibility projections. The RPC accepts officer UUIDs or legacy IDs and returns canonical fields (`officerId`, `shiftDate`, `actualClockIn`, `actualClockOut`, `durationMinutes`, `shiftStatus`) alongside legacy display fields. Historical attendance that cannot be linked to a canonical officer remains preserved as legacy history. Missing actual timestamps are not fabricated from scheduled times.

## Notifications

Read state is keyed by school, notification ID and user UUID. Shared workspace `read` booleans are retained but ignored for personal state. Legacy recipient-specific reads are imported; shared reads are not attributed to everyone.

Unread counts, bell/navigation indicators, mark-one and mark-all use confirmed server read records. Failed writes stay unread and show an error. Focus/reconnect and own-user Realtime events reload state. Principal/Clerk alerts remain independent; opening Account Requests marks only that user's alerts for loaded applications. Resolving an incident or reviewing a sick notice no longer clears another recipient's alerts.

Type/category, Priority (including Low), Period (Any date/Today/This week) and drawer search combine as real filters. Filtering does not mutate read state. Missing timestamps are excluded from date-restricted filters. Mark all read covers all authorized notifications, independently of visual filters.

## Tests

- 99 unit/regression tests pass, including per-user reads/failures, filters, identity collisions, leap dates and week behavior in Johannesburg, New York and Auckland.
- 50 SQL assertions cover recipient isolation, independent approvers, all seven roles, inactive/cross-school denial, officer UUIDs, actual-time preservation, overnight duration, duplicate ACTIVE shifts and composite tenant FK integrity.
- The existing full migration/policy fixture passes 41 assertions with these migrations installed.
- Browser tests pass for notification filters/empty states, failures, counts, independent approvers, shift controls and assignment notifications. Nine existing mobile chat cases and 50 malicious-data renders still pass.
- Live Supabase verification passed 33 assertions using the seven existing demo-role accounts, an explicit retained QA announcement, own-row RLS, unambiguous profile-to-school embeds and fresh-session persistence. No accounts were created or changed.

## Compatibility and limits

Name-only historical ownership is not automatically reassigned to a same-named person. Records remain stored for administrator reconciliation; unresolved links may not appear in personal views until explicitly linked. Legacy attendance without trustworthy actual timestamps retains its original clock strings. Physical devices and multi-device Realtime soak testing are not certified by headless tests. Historical records cannot retroactively gain a provable original actor or instant.
