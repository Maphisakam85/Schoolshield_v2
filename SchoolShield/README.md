# SchoolShield — Proper Role-Based Multi-Page Prototype

HTML/CSS/JS only. Every module is a real physical HTML page shared by roles. Roles do not get duplicate copies of the same page; the shared page reads the logged-in role from sessionStorage and builds the permitted navigation. Unauthorized direct URLs redirect to the role's dashboard.

Roles: Principal, Deputy Principal, SGB Member, Security Officer, Parent/Guardian, School Clerk, Teacher.

Session behaviour: closing the browser tab ends the prototype session. Use the role selector on login to preview each permission set.
