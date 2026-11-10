# Retained draft timeout investigation — 2026-11-10

The draft retry performs read_school_dataset first, verifies whether the intended edits already committed, and only then calls save_school_dataset if necessary. Both requests previously emitted the same generic 15-second timeout message. A timeout does not prove that the save failed or rolled back. Do not delete the retained draft or blindly resend it without the verification read.

Read-only live pg_stat_statements inspection found high-volume dataset read means around 174–187 ms and maxima around 2.7 seconds; another recorded read maximum was 3.05 seconds. Recorded saves included a maximum of 4.11 seconds. These statistics cover completed statements and cannot exclude failed/cancelled requests, network delays, Auth session waits or an earlier transient database wait. They do not establish the screenshot's root cause.

The retry now identifies verification versus saving in timeout messages. window.schoolshieldDraftDiagnostic records only operation, start time, elapsed milliseconds and outcome for the most recent attempt; it contains no request payloads, credentials or personal records. A failed verification does not resubmit the save. A timed-out save remains unconfirmed and is verified before a later retry. The timeout is not increased and permission/conflict checks remain intact.

Local tests cover both timeout phases, retained drafts, real failures and successful refreshes. Live diagnostic queries did not modify school data or retry the user's draft. The affected authenticated browser request still needs reproduction: record which phase fails and inspect that RPC's Network status/timing. Do not share Authorization headers, session storage, raw request bodies or a HAR containing credentials.

The live wait snapshot showed zero blocked sessions. Its single active connection older than 15 seconds was a walsender waiting for WAL (replication), not a dataset RPC.
