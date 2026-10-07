Document consistency audit and deployment
=========================================

The file controls previously did not upload bytes: visitor photos/ID documents and incident files were ignored; sick notices saved only a filename. A filename in session/workspace JSON cannot be downloaded or reconstructed on another device. Parent workspace saves also bypass cloud persistence, so an uploaded parent letter needs a durable, authorised notice first. Existing Storage policies checked school/category and uploader ownership, but did not enforce the linked record's permissions.

The fix supports the existing visitor photo/document, incident evidence and sick-letter inputs. Files go to the private school-documents bucket at school/category/record/attachment-UUID.extension. document_attachments stores the school, entity, record ID, original filename, path, type, size and uploader. Pending files become visible only after the database confirms an owned Storage object exists. Each record detail loads metadata directly from the database; fresh 60-second signed download URLs are created on demand and never persisted in workspace/session JSON. SQL RLS checks the same tenant and applicable record permissions. Uploaded bytes and metadata are independent of workspace snapshot replacement.

Visitor attachments: security/clerk upload; principal/deputy/security/clerk/SGB read. Incident attachments: leadership/security read/write, SGB read-only, teachers access incidents they reported, are assigned to, or are authorised to see by audience/learner class. Sick letters: principal/deputy/clerk/teacher retain staff access; parents access only their own submitted notices for linked learners. Parent document submissions persist a trusted notice, targeted attendance entry and teacher alert using a scoped RPC; parents cannot supply a trusted uploader or school.

Deploy the new 20261007130000_document_attachments.sql migration and publish app.js plus documents.js together. No Storage public access or secret browser key is needed. Existing known sick_notice_attachments remain downloadable via their trusted metadata and original paths. Other unindexed Storage objects deliberately require an administrator to identify the correct entity/record before being shared; untracked filenames alone cannot be recovered. This migration adds no file inputs for unused categories such as staff documents or reports.

Upload errors retain the form, selected File objects, record ID and completed-file progress for retry in the same page. The record can already be saved while an attachment fails; the UI reports the incomplete upload instead of claiming all files were saved. Pending metadata/objects are private. If the page is abandoned, administrators can reconcile or clean old pending uploads; do not delete ready attachments as part of that cleanup. Signed URLs are short-lived bearer links and should not be shared outside the intended recipients.

Tests
-----

    node --test tests/documents.test.cjs tests/visitor-greeting.test.cjs tests/chat-mobile.test.cjs tests/chat.test.cjs tests/portal-scope.test.cjs tests/announcements.test.cjs tests/invitations.test.cjs

The isolated PostgreSQL test uses PGlite installed outside the repo. Set PGLITE_MODULE to its module directory, then run:

    node tests/documents-rls.cjs

The SQL test executes the actual migration with authenticated roles and verifies staged uploads, finalisation, durable cross-role/new-session metadata and Storage row access, unauthorized-role/other-school/unrelated-class denial, linked-parent persistence, and a private bucket. Client tests use mocked Storage responses to verify bytes are passed to upload, metadata links, fresh-session retrieval, signed links and error/retry handling. They do not prove a live Supabase Storage transfer. After deployment, upload a real PDF as security/clerk, open it as principal in another session/device, refresh and repeat, then verify parent/other-school denial. Repeat with a parent letter and assigned teacher, and teacher incident evidence with an unrelated teacher.
