# Bongs panic/SOS review — 2026-11-10

Reviewed origin/Bongs after fetching the remote. Its latest commit is 730f126 (2026-11-05), Enhance login and security features with Panic/SOS button and animations. git merge-base --is-ancestor origin/Bongs main returned success: this branch is already part of main. No additional Bongs commits need merging. No Bongs files, school data or emergency records were modified for this review.

## Findings

1. Login SOS is not wired. SchoolShield/login.html contains loginPanicButton, but the current repository has no listener or inline action referencing that ID. The visible pre-login button therefore has no implemented response. A follow-up should define a safe pre-login emergency-help/contact flow; it must not claim to dispatch a school SOS before a school/user has been safely identified.
2. Backend setup is not reproducible from this repository. app.js calls panic_alerts for insertion/listing and set_panic_alert_status for acknowledgement/resolution, but no tracked migration or SQL file defines them. Existing live alerts indicate some setup may have been installed independently; table existence, defaults, RLS, tenant isolation, role permissions and audit behavior cannot be established from the checked-in migrations. Live database configuration was not inspected and no real SOS was triggered.
3. Delivery is an in-app register, not guaranteed emergency dispatch. The current code polls active alerts roughly every ten seconds. It explicitly says it does not call police or send SMS and tells the sender to contact responders directly. No claim of emergency-service or outside-app delivery is supported by the reviewed flow.

## Preserved behavior
The school dashboard exposes the SOS creation UI only to Security Officers and asks for confirmation plus location. Principal/Deputy users can acknowledge/resolve after confirmation. The server must independently enforce those permissions; browser role checks alone are insufficient. The compact active-SOS banner and failure feedback currently on main are retained. Failed inserts do not display confirmed success. Account/session recovery and updated login layouts on main should not be replaced with the older Bongs versions.

## Limits and next work
This was a branch/source review. No live emergency, email, SMS, push, suspension or account action was tested. Resolve the pre-login button behavior and reconcile the actual deployed SOS schema into reviewed, tested migrations before claiming end-to-end SOS verification.
