# SchoolShield — Separate HTML/CSS/JS Prototype

Framework-free multi-page prototype. Each role/module is a separate HTML page; shared behaviour is in `app.js` and styling in `styles.css`.

## Roles and access
- Principal / Deputy Principal: full access to all modules.
- SGB: view-only Dashboard, Incidents, Notifications and Reports.
- Security: Dashboard, Visitors, Incidents, Notifications, Security Officers and Reports.
- Parent / Guardian: sick notice, school notifications, learner record/PDF flow, teacher chat and incidents involving their learner.
- Clerk: student records, school announcements, sick notices and appointments.
- Teacher: own learners, targeted announcements, sick notices, student reports, permitted test scores, learner-related incidents and parent chat.

## Integrated prototype requirements
- Separate physical HTML pages; no hash routing.
- Role selector on sign-in with role-specific dashboard redirect.
- Registration does not auto-login; confirmation/password-match flow is simulated.
- Session role is stored in `sessionStorage`, so closing the browser tab requires signing in again.
- Login audit log records date/time, role/user, browser/mobile context and result.
- Role-specific navigation and access guard.
- Admin-only staff deletion and employee-document visibility.
- Visitor registration, visitor search/filter, visitor details and QR visitor check simulation.
- Incident reporting, incident register, filters and automatic incident notification.
- Emergency alerts and notification history/export.
- Learner records, parent links and teacher assignments.
- Security officer register with role-specific badge IDs, shifts and site assignments.
- Supervisor-to-guard assignment with shift, site and duties.
- Named QR checkpoint creation with site, coordinates and allowed radius.
- Simulated guard checkpoint check-in with location-radius validation.
- Sick-notice submission and clerk review view.
- School/class announcements.
- Appointments.
- Student report creation and sending to registered parents.
- Test-score entry.
- Parent/teacher chat prototype.
- Student-record PDF access flow placeholder for backend PDF retrieval.

## Run
Open the folder with VS Code and use Live Server, then open `index.html`.

This is a front-end prototype. Authentication, email confirmation, SMS, GPS, QR camera scanning, PDF storage/download and backend permissions need a backend/service integration for production.
