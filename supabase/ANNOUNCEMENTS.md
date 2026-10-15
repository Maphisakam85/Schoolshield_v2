Announcement publishing
======================

Apply `20261007120000_announcement_publishing.sql`, deploy `parent-workspace`, and publish the updated `SchoolShield/app.js` together. The new authenticated `publish_school_announcement` RPC atomically modifies announcements and their in-app notices in the existing `school_workspaces.payload`. No new announcement table or external message provider is introduced.

The database derives school, author, author ID and Johannesburg publication date from the authenticated profile. Principal/deputy retain full audiences; clerk retains parents, whole school and staff; teacher retains their own class parents. Existing notices without audience IDs retain legacy visibility. New class/grade notices and parent notification payloads are filtered by linked learners. Only the author can edit/delete. An in-flight guard prevents double clicks, and retries use the same UUID so an uncertain response cannot create the same announcement twice.

Title and message are trimmed and required for creation/editing. Failed saves keep the draft and do not claim success. Automatic workspace renders preserve announcement fields. SMS/Email delivery labels are retained as existing settings; this change implements in-app publishing and does not introduce external SMS/email announcement sending.

Verification: `node --test tests/announcements.test.cjs tests/chat.test.cjs tests/portal-scope.test.cjs`. Tests use a mocked Supabase RPC and verify authorized role submissions, whitespace rejection, duplicate/retry handling, audience filtering, and failed edits. After deployment, verify fresh login and page refresh against the live database, and use a parent linked to a different class to confirm restricted delivery. The local automated tests do not establish live Supabase policy or migration execution.
