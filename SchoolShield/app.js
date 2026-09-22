/* SchoolShield — role-based school management prototype.


/* ------------------------------ DOM helpers ------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* -------------------------------- roles ---------------------------------- */
const ROLE_NAMES = {
  principal: "Principal",
  deputy: "Deputy Principal",
  sgb: "SGB Member",
  security: "Security Officer",
  parent: "Parent / Guardian",
  clerk: "School Clerk",
  teacher: "Teacher",
};

/* A signed-in person works within exactly one Supabase school tenant. */
function activeSchool() {
  try {
    const session = JSON.parse(sessionStorage.getItem("schoolshieldSession") || "null");
    if (session?.schoolCode && session?.schoolName) {
      return { name: session.schoolName, code: session.schoolCode };
    }
  } catch (err) { /* The sign-in guard redirects before any workspace is rendered. */ }
  return { name: "", code: "" };
}
let SCHOOL = activeSchool();

const TERM = "Term 2";

/* ------------------------------ permissions ------------------------------
 * Leadership deliberately does NOT carry "student-records" (the flat editable
 * learner list) or "student-record" (the standalone learner profile). Leaders
 * use "class-records", which starts at class level and drills down.
 * Teacher-to-principal chat ("teacher-chat") excludes parents.
 * Parent-to-teacher chat ("parent-chat") excludes leadership. */
const ACCESS = {
  principal: [
    "dashboard",
    "leadership",
    "visitors",
    "incidents",
    "notifications",
    "learners",
    "class-records",
    "parents",
    "staff",
    "security",
    "reports",
    "settings",
    "announcements",
    "sick-notices",
    "appointments",
    "test-scores",
    "teacher-chat",
  ],
  deputy: [
    "dashboard",
    "leadership",
    "visitors",
    "incidents",
    "notifications",
    "learners",
    "class-records",
    "parents",
    "staff",
    "security",
    "reports",
    "settings",
    "announcements",
    "sick-notices",
    "appointments",
    "test-scores",
    "teacher-chat",
  ],
  sgb: ["dashboard", "incidents", "notifications", "reports"],
  security: [
    "dashboard",
    "visitors",
    "incidents",
    "notifications",
    "security-officers",
    "reports",
  ],
  parent: [
    "dashboard",
    "sick-notice",
    "notifications",
    "student-record",
    "parent-chat",
  ],
  clerk: [
    "dashboard",
    "class-records",
    "student-records",
    "student-reports",
    "report-compilation",
    "test-scores",
    "learners",
    "parents",
    "staff",
    "announcements",
    "sick-notices",
    "appointments",
  ],
  teacher: [
    "dashboard",
    "learners",
    "class-records",
    "announcements",
    "sick-notices",
    "student-reports",
    "test-scores",
    "attendance-register",
    "incidents",
    "parent-chat",
    "teacher-chat",
  ],
};

/* ------------------------------- navigation ------------------------------ */
const NAV = [
  ["dashboard", "Dashboard", "dashboard.html", "grid"],
  ["leadership", "Leadership", "leadership.html", "lead"],
  ["learners", "Learners", "learners.html", "student"],
  ["class-records", "Class Records", "class-records.html", "folder"],
  ["parents", "Parents", "parents.html", "parent"],
  ["staff", "Staff", "staff.html", "staff"],
  ["visitors", "Visitors", "visitors.html", "users"],
  ["incidents", "Incidents", "incidents.html", "alert"],
  ["notifications", "Notifications", "notifications.html", "bell"],
  ["security", "Security Officers", "security.html", "shield"],
  ["reports", "Reports", "reports.html", "report"],
  ["announcements", "Announcements", "announcements.html", "megaphone"],
  ["sick-notices", "Sick Notices", "sick-notices.html", "medical"],
  ["appointments", "Appointments", "appointments.html", "calendar"],
  ["account-requests", "Account Requests", "account-requests.html", "users"],
  ["student-records", "Student Records", "student-records.html", "folder"],
  ["student-record", "Student Record", "student-record.html", "record"],
  ["student-reports", "Student Reports", "student-reports.html", "report"],
  ["report-compilation", "Report Compilation", "report-compilation.html", "report"],
  ["test-scores", "Test Scores", "test-scores.html", "scores"],
  ["attendance-register", "Attendance Register", "attendance-register.html", "calendar"],
  ["sick-notice", "Sick Notice", "sick-notice.html", "medical"],
  ["teacher-chat", "Teacher Chat", "teacher-chat.html", "chat"],
  ["parent-chat", "Parent–Teacher Chat", "parent-chat.html", "chat"],
  [
    "security-officers",
    "Security Officers",
    "security-officers.html",
    "shield",
  ],
  ["settings", "Settings", "settings.html", "settings"],
];

const NAV_GROUPS = [
  { label: "Overview", ids: ["leadership", "notifications"] },
  { label: "People", ids: ["learners", "class-records", "parents", "staff", "account-requests", "student-records", "student-record"] },
  { label: "Learning", ids: ["attendance-register", "test-scores", "student-reports", "report-compilation", "reports"] },
  { label: "Safety & wellbeing", ids: ["visitors", "incidents", "security", "security-officers", "sick-notices", "sick-notice"] },
  { label: "Communication", ids: ["announcements", "appointments", "teacher-chat", "parent-chat"] },
  { label: "Administration", ids: ["settings"] },
];

/* -------------------------------- icons ---------------------------------- */
const ICON = {
  grid: "▦", lead: "♛", users: "◉", alert: "⚠", bell: "🔔",
  student: "🎓", parent: "👪", staff: "👤", shield: "🛡", report: "📊",
  settings: "⚙", megaphone: "📣", medical: "✚", calendar: "▣",
  folder: "🗂", record: "📄", scores: "▥", chat: "💬",
};
/* -------------------------- workspace data source ------------------------- */
// Operational data is loaded from and saved to Supabase. The empty shape only
// protects a newly created, as-yet-unpopulated school workspace.
const WORKSPACE_VERSION = 13;
const SUBJECTS_BY_PHASE = {
  junior: ["Mathematics", "Natural Sciences", "English", "Sesotho", "Social Sciences", "Technology", "Life Orientation"],
  senior: ["Mathematics", "Physics", "Life Sciences", "Sesotho", "English", "Life Orientation", "Computer Applications Technology", "History"],
};
function emptyWorkspace() {
  return { __v: WORKSPACE_VERSION, classes: [], learners: [], assessments: [], reports: [], announcements: [], visitors: [], incidents: [], notifications: [], staff: [], staffChangeRequests: [], security: [], sickNotices: [], appointments: [], teacherChat: [], parentChat: [], attendanceRegisters: [], attendanceWeeks: [], chatExtras: [], reportRequests: [], teacherAssignments: [] };
}

/* ------------------------------ state layer ------------------------------ */
function getState() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(`schoolshield:${SCHOOL.code}`) || "null");
  } catch (err) {
    stored = null;
  }
  if (!stored || typeof stored !== "object") {
    stored = emptyWorkspace();
    save(stored);
    return stored;
  }
  // Merge into a new object. Mutating `stored` while using it as a later
  // Object.assign source erased populated arrays (for example parent learners).
  stored = { ...emptyWorkspace(), ...stored, __v: WORKSPACE_VERSION };
  let migratedLegacyTimes = false;
  (stored.notifications || []).forEach((notice) => {
    if (notice.time === "Now" && !notice.createdAt) {
      notice.createdAt = notificationTimestamp();
      delete notice.time;
      migratedLegacyTimes = true;
    }
  });
  if (migratedLegacyTimes) save(stored);
  return stored;
}

function save(state) {
  localStorage.setItem(`schoolshield:${SCHOOL.code}`, JSON.stringify(state));
  if (window.schoolshieldCloudWorkspaceReady && window.schoolshieldSupabase) {
    const session = JSON.parse(sessionStorage.getItem("schoolshieldSession") || "{}");
    window.schoolshieldSupabase.from("school_workspaces")
      .upsert({ school_id: session.schoolId, payload: state, version: WORKSPACE_VERSION, updated_by: session.userId || null }, { onConflict: "school_id" })
      .then(({ error }) => { if (error) console.warn("School workspace sync failed", error.message); });
  }
}

async function refreshCloudWorkspace(renderAfterRefresh = false) {
  const client = window.schoolshieldSupabase;
  const session = JSON.parse(sessionStorage.getItem("schoolshieldSession") || "{}");
  if (!client || !session.schoolId) return false;
  if (session.role === "parent") {
    const { data: { session: authSession } } = await client.auth.getSession();
    if (!authSession?.access_token) return false;
    const config = window.SCHOOLSHIELD_SUPABASE_CONFIG;
    const response = await fetch(`${config.url}/functions/v1/parent-workspace`, {
      method: "POST",
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${authSession.access_token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.payload) {
      window.schoolshieldParentWorkspaceError = data?.error || `Request failed (${response.status})`;
      console.warn("Parent workspace could not be refreshed", window.schoolshieldParentWorkspaceError);
      return false;
    }
    window.schoolshieldParentWorkspaceError = "";
    const key = `schoolshield:${session.schoolCode}`;
    const incoming = JSON.stringify(data.payload);
    const changed = localStorage.getItem(key) !== incoming;
    localStorage.setItem(key, incoming);
    window.schoolshieldParentLearnerLinked = Boolean(data.linked);
    if (changed && renderAfterRefresh) render();
    return changed;
  }
  const { data, error } = await client.from("school_workspaces").select("payload, version, updated_at").eq("school_id", session.schoolId).maybeSingle();
  if (error || !data?.payload || !Object.keys(data.payload).length) return false;
  const key = `schoolshield:${session.schoolCode}`;
  const incoming = JSON.stringify(data.payload);
  const changed = localStorage.getItem(key) !== incoming;
  localStorage.setItem(key, incoming);
  window.schoolshieldCloudWorkspaceReady = true;
  if (changed && renderAfterRefresh) render();
  return changed;
}

async function connectCloudWorkspace(user, profile, school) {
  const client = window.schoolshieldSupabase;
  if (!client) return;
  if (profile.role === "parent") {
    await refreshCloudWorkspace();
    return;
  }
  if (await refreshCloudWorkspace()) return;
  if (["principal", "deputy", "clerk"].includes(profile.role)) {
    const initialState = getState();
    const { error: insertError } = await client.from("school_workspaces").upsert({ school_id: school.id, payload: initialState, version: WORKSPACE_VERSION, updated_by: user.id }, { onConflict: "school_id", ignoreDuplicates: true });
    if (!insertError) {
      window.schoolshieldCloudWorkspaceReady = true;
      await refreshCloudWorkspace();
    }
  }
}

function persist(mutator) {
  const state = getState();
  mutator(state);
  save(state);
  return state;
}

function role() {
  try {
    const session = JSON.parse(sessionStorage.getItem("schoolshieldSession") || "null");
    if (session?.role && ROLE_NAMES[session.role]) return session.role;
  } catch (err) { /* Legacy demo sessions continue below. */ }
  return sessionStorage.getItem("schoolshieldRole") || "principal";
}
function userName() {
  try {
    const session = JSON.parse(sessionStorage.getItem("schoolshieldSession") || "null");
    if (session?.displayName) return session.displayName;
  } catch (err) { /* The sign-in guard redirects before any workspace is rendered. */ }
  return ROLE_NAMES[role()] || "Member";
}
function page() {
  return document.body.dataset.page || "dashboard";
}
function param(name) {
  return new URLSearchParams(location.search).get(name);
}
function allowed(target = page()) {
  if (target === "account-requests") return ["principal", "clerk"].includes(role());
  return (ACCESS[role()] || []).includes(target);
}
function go(url) {
  location.href = "./" + url;
}
function isLeadership() {
  return role() === "principal" || role() === "deputy";
}

/* --------------------------- domain: collections ------------------------- */
function classes() {
  return getState().classes;
}
function learners() {
  return getState().learners;
}
function classById(id) {
  return classes().find((c) => c.id === id);
}
function learnerById(id) {
  return learners().find((l) => l.id === id);
}
function learnersInClass(classId) {
  return learners().filter((l) => l.class === classId);
}
function teacherForClass(classId) {
  return classById(classId)?.teacher || "Unassigned";
}
function teacherClasses(teacherName) {
  return classes().filter((c) => c.teacher === teacherName);
}

/* Grades in curriculum order, each with its classes. */
function gradeGroups() {
  const order = [];
  const map = new Map();
  for (const c of classes()) {
    if (!map.has(c.grade)) {
      map.set(c.grade, []);
      order.push(c.grade);
    }
    map.get(c.grade).push(c);
  }
  return order.map((grade) => ({ grade, classes: map.get(grade) }));
}

/* ------------------------------- averages -------------------------------- */
function mean(values) {
  const nums = values.filter((v) => typeof v === "number" && !isNaN(v));
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/* Attendance, class average and pass rate for one class. */
function classStats(classId) {
  const list = learnersInClass(classId);
  const attendance = Math.round(mean(list.map((l) => l.attendance)));
  const courseAverage = Math.round(mean(list.map((l) => l.average)));
  const passing = list.filter((l) => l.average >= 50).length;
  const passRate = list.length ? Math.round((passing / list.length) * 100) : 0;
  return {
    learners: list.length,
    attendance,
    courseAverage,
    passRate,
    passing,
  };
}

/* Average across every learner in a grade. */
function gradeStats(grade) {
  const list = learners().filter((l) => l.grade === grade);
  const attendance = Math.round(mean(list.map((l) => l.attendance)));
  const courseAverage = Math.round(mean(list.map((l) => l.average)));
  const passing = list.filter((l) => l.average >= 50).length;
  const passRate = list.length ? Math.round((passing / list.length) * 100) : 0;
  return {
    learners: list.length,
    attendance,
    courseAverage,
    passRate,
    passing,
  };
}

function schoolStats() {
  const list = learners();
  const attendance = Math.round(mean(list.map((l) => l.attendance)));
  const courseAverage = Math.round(mean(list.map((l) => l.average)));
  const passing = list.filter((l) => l.average >= 50).length;
  const passRate = list.length ? Math.round((passing / list.length) * 100) : 0;
  return {
    learners: list.length,
    attendance,
    courseAverage,
    passRate,
    passing,
  };
}

function standingFor(learner) {
  if (learner.average >= 50) return "Pass";
  return "At Risk";
}

/* Average score for a single assessment. */
function assessmentAverage(assessment) {
  return Math.round(mean(Object.values(assessment.scores || {})));
}

/* Average of every captured assessment in a class. */
function classTestAverage(classId) {
  const list = getState().assessments.filter((a) => a.class === classId);
  const all = list.flatMap((a) => Object.values(a.scores || {}));
  return Math.round(mean(all));
}

function assessmentsForClass(classId) {
  return getState().assessments.filter((a) => a.class === classId);
}

/* ---------------------------- domain: reports ---------------------------- */
const REPORT_FLOW = [
  {
    key: "awaiting-marks",
    label: "Awaiting marks",
    hint: "Teacher captures and submits class marks.",
  },
  {
    key: "ready",
    label: "Ready to compile",
    hint: "Marks submitted — clerk compiles the learner reports.",
  },
  {
    key: "compiled",
    label: "Compiled — with teacher",
    hint: "Clerk sent the compiled report back to the teacher.",
  },
  {
    key: "finalised",
    label: "Finalised",
    hint: "Teacher reviewed and finalised the report.",
  },
  {
    key: "published",
    label: "Published to parents",
    hint: "Final report released to registered parents.",
  },
];

function reportForClass(classId) {
  return getState().reports.find((r) => r.class === classId);
}
function flowStep(status) {
  return REPORT_FLOW.find((s) => s.key === status) || REPORT_FLOW[0];
}
function reportBadgeClass(status) {
  if (status === "published") return "success";
  if (status === "finalised") return "success";
  if (status === "compiled") return "warn";
  if (status === "ready") return "warn";
  return "neutral";
}
function publishedReportsForClass(classId, learnerId = "") {
  const report = reportForClass(classId);
  if (!report) return [];
  if (learnerId) return (report.releasedLearners?.[learnerId] || report.status === "published") ? [report] : [];
  return report.status === "published" ? [report] : [];
}

/* ---------------------------- domain: parents ---------------------------- */
/* Parents are derived from the learner register so the two never disagree. */
function parentRecords() {
  return learners().map((l) => ({
    name: l.parent,
    relation: l.relation,
    phone: l.phone,
    learner: l.name,
    learnerId: l.id,
    class: l.class,
    grade: l.grade,
  }));
}
/* One entry per parent, with the classes their children sit in. */
function parentDirectory() {
  const map = new Map();
  for (const p of parentRecords()) {
    if (!map.has(p.name)) {
      map.set(p.name, {
        name: p.name,
        relation: p.relation,
        phone: p.phone,
        children: [],
        classes: new Set(),
      });
    }
    const entry = map.get(p.name);
    entry.children.push(p.learner);
    entry.classes.add(p.class);
  }
  return [...map.values()].map((e) => ({ ...e, classes: [...e.classes] }));
}
function parentsForClass(classId) {
  return parentDirectory().filter((p) => p.classes.includes(classId));
}
function parentLearner() {
  return learners().find((learner) => learner.parent === userName()) || learners()[0] || null;
}
function parentLinkRequired(title = "Your learner") {
  return generic(
    title,
    "Parent / guardian",
    "Your account is active, but it has not yet been linked to a learner record.",
    '<section class="panel"><h3>Learner link needed</h3><p class="muted">Please ask the school clerk to link your parent account to your learner. Once it is linked, your learner record, notices and teacher chat will appear here.</p><div class="panel-foot"><button class="btn primary" data-action="refresh-parent-workspace">Refresh learner link</button></div></section>',
  );
}

/* ----------------------------- domain: audience --------------------------- */
/* Announcement audiences and how many people each one reaches. */
function audienceOptions() {
  const r = role();
  const state = getState();
  if (r === "teacher") {
    return [
      {
        id: "my-classes-parents",
        label: "Parents / guardians of my classes",
        count: teacherClasses(userName()).reduce(
          (n, c) => n + parentsForClass(c.id).length,
          0,
        ),
      },
    ];
  }
  if (r === "clerk") {
    return [
      {
        id: "all-parents",
        label: "All registered parents",
        count: parentDirectory().length,
      },
      {
        id: "whole-school",
        label: "Whole school (learners + parents)",
        count: learners().length + parentDirectory().length,
      },
      { id: "all-staff", label: "All staff", count: state.staff.length },
    ];
  }
  /* Principal / deputy: full reach. */
  const byGrade = gradeGroups().map((g) => ({
    id: "grade-" + g.grade.replace(/\s+/g, "-"),
    label: g.grade + " parents + learners",
    count:
      learners().filter((l) => l.grade === g.grade).length +
      parentDirectory().filter((p) =>
        p.classes.some((c) => c.startsWith(g.grade.replace("Grade ", ""))),
      ).length,
  }));
  return [
    {
      id: "whole-school",
      label: "Whole school (learners + parents)",
      count: learners().length + parentDirectory().length,
    },
    {
      id: "all-parents",
      label: "All registered parents",
      count: parentDirectory().length,
    },
    { id: "all-learners", label: "All learners", count: learners().length },
    {
      id: "all-staff",
      label: "All staff (teachers + admin + security)",
      count: state.staff.length,
    },
    {
      id: "teachers",
      label: "Teaching staff only",
      count: state.staff.filter((s) => s.role === "Teacher").length,
    },
    { id: "leadership", label: "Leadership (principal + deputy)", count: 2 },
    { id: "sgb", label: "SGB members", count: 5 },
    {
      id: "security",
      label: "Security officers",
      count: state.security.length,
    },
    {
      id: "administration",
      label: "Administration staff",
      count: state.staff.filter((s) => s.role === "Clerk").length,
    },
    ...byGrade,
    ...classes().map((c) => ({
      id: "class-" + c.id,
      label: `${c.grade} · ${c.id} parents + learners`,
      count: learnersInClass(c.id).length + parentsForClass(c.id).length,
    })),
  ];
}

/* ------------------------------ ui primitives ---------------------------- */
function daysAbsent(learner) {
  return Number.isFinite(learner.absentDays) ? learner.absentDays : Math.round(((100 - learner.attendance) / 100) * 60);
}
function attendanceRegisterFor(classId, date) {
  return (getState().attendanceRegisters || []).find((register) => register.class === classId && register.date === date);
}
function icon(key) {
  return `<span class="icon">${ICON[key] || "•"}</span>`;
}
function badge(value) {
  const danger = ["Critical", "High", "Open", "At Risk", "Fail"];
  const warn = [
    "Medium",
    "Under Investigation",
    "Scheduled",
    "Awaiting marks",
    "Ready to compile",
    "Compiled — with teacher",
  ];
  const success = [
    "Resolved",
    "Inside",
    "Active",
    "On Duty",
    "Read",
    "Pass",
    "Finalised",
    "Published to parents",
  ];
  const cls = danger.includes(value)
    ? "danger"
    : warn.includes(value)
      ? "warn"
      : success.includes(value)
        ? "success"
        : "neutral";
  return `<span class="badge ${cls}">${value}</span>`;
}
function statusBadge(status) {
  return `<span class="badge ${reportBadgeClass(status)}">${flowStep(status).label}</span>`;
}
function navHasNewUpdates(id) {
  if (id === "notifications") return notificationsForRole().some((notice) => !notice.read);
  if (id === "account-requests") return (window.schoolshieldPendingAccountAlerts || 0) > 0;
  if (id === "sick-notices" && role() === "teacher") {
    return getState().sickNotices.some((notice) => {
      const learnerRecord = learners().find((learner) => learner.name === notice.person);
      return notice.status !== "Reviewed" && learnerRecord && teacherForClass(learnerRecord.class) === userName();
    });
  }
  return false;
}
function nav() {
  const dashboardLink = NAV.find((item) => item[0] === "dashboard");
  const dashboard = dashboardLink && allowed("dashboard") ? (() => {
    const [id, label, url, ic] = dashboardLink;
    return `<a href="${url}" class="nav-item dashboard-nav ${page() === id ? "active" : ""}">${icon(ic)}<span>${label}</span></a>`;
  })() : "";
  return dashboard + NAV_GROUPS.map((group) => {
    const links = group.ids.map((id) => NAV.find((item) => item[0] === id)).filter((item) => item && allowed(item[0]));
    if (!links.length) return "";
    const isCurrentGroup = links.some(([id]) => page() === id);
    const open = isCurrentGroup || links.some(([id]) => navHasNewUpdates(id));
    return `<details class="nav-group" ${open ? "open" : ""}><summary>${group.label}<span>⌄</span></summary>${links.map(
      ([id, label, url, ic]) => {
        const hasUpdates = navHasNewUpdates(id);
        return `<a href="${url}" class="nav-item ${page() === id ? "active" : ""} ${hasUpdates ? "has-updates" : ""}" title="${hasUpdates ? label + ": new updates" : label}" aria-label="${hasUpdates ? label + ", new updates" : label}">${icon(ic)}<span>${label}</span>${hasUpdates ? '<span class="nav-update" aria-label="New updates"></span>' : ""}</a>`;
      },
    ).join("")}</details>`;
  }).join("");
}
function shell(body, title) {
  const r = role();
  const scope =
    r === "sgb"
      ? "View-only access"
      : isLeadership()
        ? "Class-level oversight"
        : "Role-based access";
  return `<div class="app-shell"><aside class="sidebar"><div class="brand"><img src="assets/schoolshield-logo.png" alt="SchoolShield"><div><strong>SchoolShield</strong><small>School safety platform</small></div></div><div class="menu-title">Workspace</div><nav>${nav()}</nav><div class="sidebar-bottom"><div class="role-card"><div class="avatar">${ROLE_NAMES[r].slice(0, 2).toUpperCase()}</div><div><b>${ROLE_NAMES[r]}</b><small>${scope}</small></div></div><button class="logout" id="logout">↪ <span>Sign out</span></button></div></aside><main class="main"><header class="topbar"><div><div class="eyebrow">SchoolShield</div><h2>${title}</h2></div><div class="top-actions"><button class="icon-btn notification-toggle" id="globalBell" title="Open notifications" aria-label="Open notifications">🔔</button><div class="profile"><div class="avatar">${ROLE_NAMES[r].slice(0, 2).toUpperCase()}</div><div><b>${userName()}</b><small>${SCHOOL.name}</small></div></div></div></header>${alertToast()}<section class="content">${body}</section></main></div>`;
}
function stat(label, value, sub) {
  return `<div class="stat-card"><div class="stat-icon">▦</div><div><div class="stat-value">${value}</div><div class="stat-label">${label}</div><small>${sub}</small></div></div>`;
}
function table(headers, rows, empty = "No records found") {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
}
function searchBar(id, placeholder = "Search...") {
  return `<div class="toolbar"><div class="search"><span>⌕</span><input id="${id}" placeholder="${placeholder}"></div><button class="btn ghost" data-action="filter">Filters</button></div>`;
}
function generic(title, eyebrow, desc, content, actions = "") {
  return shell(
    `<div class="page-intro"><div><span class="pill">${eyebrow}</span><h1>${title}</h1><p>${desc}</p></div><div>${actions}</div></div>${content}`,
    title,
  );
}
function progressBar(percent) {
  const safe = Math.max(0, Math.min(100, percent));
  return `<span class="meter"><span class="meter-fill" style="width:${safe}%"></span></span>`;
}
function backLink(label, url) {
  return `<a class="crumb" href="${url}">← ${label}</a>`;
}
/* -------------------------------- helpers -------------------------------- */
function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
function openIncidents() {
  return getState().incidents.filter((i) => i.status !== "Resolved").length;
}
function classesForScope() {
  const r = role();
  if (r === "teacher") return teacherClasses(userName());
  return classes();
}
function learnersForScope() {
  return classesForScope().flatMap((c) => learnersInClass(c.id));
}
function scopeStats() {
  const list = learnersForScope();
  const attendance = Math.round(mean(list.map((l) => l.attendance)));
  const courseAverage = Math.round(mean(list.map((l) => l.average)));
  const passing = list.filter((l) => l.average >= 50).length;
  const passRate = list.length ? Math.round((passing / list.length) * 100) : 0;
  return {
    learners: list.length,
    attendance,
    courseAverage,
    passRate,
    passing,
  };
}

/* ------------------------------- dashboard ------------------------------- */
function dashboard() {
  const s = getState();
  const r = role();
  if (r === "parent") return parentDashboard();
  const stats = scopeStats();
  const heroLabel =
    r === "sgb"
      ? "Governance overview"
      : r === "security"
        ? "Security operations"
        : r === "parent"
          ? "Your learner & school updates"
          : r === "teacher"
            ? "Your class workspace"
            : r === "clerk"
              ? "Administration workspace"
              : "Campus oversight";

  const kpis = ["security", "sgb"].includes(r)
    ? [
        stat("Visitors today", s.visitors.length, "Registered visits"),
        stat(
          "On campus",
          s.visitors.filter((v) => v.status === "Inside").length,
          "Currently inside",
        ),
        stat("Open incidents", openIncidents(), "Needs attention"),
        stat("Learners", schoolStats().learners, "Enrolled this year"),
      ]
    : [
        stat(
          "Learners in scope",
          stats.learners,
          classesForScope().length + " classes",
        ),
        stat(
          "Attendance average",
          stats.attendance + "%",
          "Across selected classes",
        ),
        stat(
          "Pass rate",
          stats.passRate + "%",
          stats.passing + " learners passing",
        ),
        stat("Open incidents", openIncidents(), "Campus-wide"),
      ];

  const classPanelRows = classesForScope()
    .slice(0, 5)
    .map((c) => {
      const st = classStats(c.id);
      return `<div class="report-row" style="display:grid;grid-template-columns:minmax(220px,1fr) 110px 100px;gap:18px;align-items:center;padding:15px 4px"><span><b style="font-size:12px">${c.grade} · ${c.id}</b><small style="display:block;margin-top:4px">${c.teacher} · ${st.learners} learners</small></span><span class="row-metrics"><b>${st.attendance}%</b><small>attendance</small></span><span class="row-metrics"><b>${st.passRate}%</b><small>pass rate</small></span></div>`;
    })
    .join("");

  return shell(
    `<div class="hero"><div><span class="pill">${heroLabel}</span><h1>Good morning, ${ROLE_NAMES[r]}</h1><p>One secure workspace for school safety, people, incidents and communication.</p></div><div class="hero-actions">${r !== "sgb" ? '<button class="btn primary" data-action="incident">Report incident</button>' : ""}<button class="btn ghost" data-nav="notifications">View alerts</button></div></div><div class="stats-grid">${kpis.join("")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3>Class performance</h3><p>Attendance and pass rate by class</p></div><a class="text-link" href="class-records.html">All classes →</a></div>${classPanelRows || '<p class="muted">No classes assigned.</p>'}</section><section class="panel"><div class="panel-head"><div><h3>Recent incidents</h3><p>Most recent reports</p></div><a class="text-link" href="incidents.html">View all →</a></div>${table(
      ["Incident", "Location", "Priority", "Status"],
      s.incidents
        .slice(0, 4)
        .map(
          (i) =>
            `<tr><td><b>${i.id}</b><small>${i.time}</small></td><td>${i.location}</td><td>${badge(i.priority)}</td><td>${badge(i.status)}</td></tr>`,
        ),
    )}</section></div><section class="panel"><div class="panel-head"><div><h3>Quick access</h3><p>Only tools available to your role are shown.</p></div></div><div class="quick-grid">${quickForRole(r)}</div></section>`,
    "Dashboard",
  );
}
function parentDashboard() {
  const child = parentLearner();
  if (!child) return parentLinkRequired("Parent dashboard");
  const childClass = classStats(child.class);
  const alerts = notificationsForRole();
  const published = publishedReportsForClass(child.class, child.id);
  return shell(
    `<div class="hero"><div><span class="pill">Your child & school updates</span><h1>Good morning, Parent / Guardian</h1><p>Everything here relates to ${child.name} or a school notice specifically shared with families.</p></div><div class="hero-actions"><button class="btn ghost" data-nav="notifications">View family alerts</button></div></div><section class="profile-card"><div class="student-avatar">${initials(child.name)}</div><div><h2>${child.name}</h2><p>${child.grade} · ${child.class} · Class teacher: ${teacherForClass(child.class)}</p></div><span>${badge(standingFor(child))}</span></section><div class="stats-grid">${stat("Attendance", child.attendance + "%", "Term to date")}${stat("Overall average", child.average + "%", "Current academic average")}${stat("Class average", childClass.courseAverage + "%", "${child.class} only")}${stat("Family alerts", alerts.filter((notice) => !notice.read).length, "Shared with parents")}</div><section class="panel"><div class="panel-head"><div><h3>Quick access</h3><p>Tools for your registered child.</p></div></div><div class="quick-grid">${quickForRole("parent")}</div></section><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3>${child.name}'s learning summary</h3><p>Personal attendance and academic information</p></div><a class="text-link" href="student-record.html">Open learner record →</a></div><div class="report-row"><span><b>Class teacher</b><small>${teacherForClass(child.class)}</small></span><span class="row-metrics"><b>${child.attendance}%</b><small>attendance</small></span><span class="row-metrics"><b>${child.average}%</b><small>average</small></span></div>${published.length ? `<div class="report-row"><span><b>Published ${TERM} report</b><small>Ready to view or download</small></span><button class="btn small" data-action="download-report" data-class="${child.class}" data-learner="${child.id}">Download</button></div>` : '<p class="muted">Your child’s term report will appear here after it is finalised and released.</p>'}</section><section class="panel"><div class="panel-head"><div><h3>Family notifications</h3><p>Child-specific and school notices shared with parents</p></div><a class="text-link" href="notifications.html">View all →</a></div>${alerts.map((notice) => `<div class="report-row"><span><b>${notice.title}</b><small>${notice.description}</small></span>${badge(notice.priority)}</div>`).join("") || '<p class="muted">No family notifications.</p>'}</section></div>`,
    "Dashboard",
  );
}
function quickForRole(r) {
  const map = {
    principal: [
      ["Class records", "class-records.html"],
      ["Learners by grade", "learners.html"],
      ["Test scores", "test-scores.html"],
      ["Announcements", "announcements.html"],
      ["Reports", "reports.html"],
    ],
    deputy: [
      ["Class records", "class-records.html"],
      ["Learners by grade", "learners.html"],
      ["Test scores", "test-scores.html"],
      ["Parents", "parents.html"],
      ["Reports", "reports.html"],
    ],
    sgb: [
      ["Review incidents", "incidents.html"],
      ["Open reports", "reports.html"],
      ["Read notifications", "notifications.html"],
    ],
    security: [
      ["Register visitor", "visitors.html"],
      ["Report incident", "incidents.html"],
      ["Security officers", "security-officers.html"],
      ["Alerts", "notifications.html"],
    ],
    parent: [
      ["My learner record", "student-record.html"],
      ["Teacher chat", "parent-chat.html"],
      ["Submit sick notice", "sick-notice.html"],
      ["School notifications", "notifications.html"],
    ],
    clerk: [
      ["Report compilation", "student-reports.html"],
      ["Update test scores", "test-scores.html"],
      ["Student records", "student-records.html"],
      ["Announcements", "announcements.html"],
    ],
    teacher: [
      ["My classes", "learners.html"],
      ["Daily attendance", "attendance-register.html"],
      ["Submit marks", "test-scores.html"],
      ["Student reports", "student-reports.html"],
      ["Parent chat", "parent-chat.html"],
    ],
  };
  return (map[r] || [])
    .map(
      (x) => {
        const navItem = NAV.find((item) => item[2] === x[1]);
        return `<a class="quick" style="min-height:68px;padding:13px 15px;gap:11px" href="${x[1]}">${navItem ? icon(navItem[3]) : "✦"}<span>${x[0]}</span><b>→</b></a>`;
      },
    )
    .join("");
}

/* --------------------------- shared class widgets ------------------------ */
function classCard(c, opts = {}) {
  const st = classStats(c.id);
  const request = opts.request
    ? `<button class="btn small" data-action="request-report" data-class="${c.id}">Request report</button>`
    : "";
  const status =
    opts.showStatus && reportForClass(c.id)
      ? statusBadge(reportForClass(c.id).status)
      : `<span class="badge neutral">${st.learners} learners</span>`;
  return `<article class="class-card" style="border:1px solid #dce8e5;border-radius:14px;padding:17px;background:linear-gradient(145deg,#fff,#f5fbf8);box-shadow:0 7px 18px rgba(18,45,54,.05)"><div class="class-card-head" style="padding-bottom:13px;border-bottom:1px solid #e5eeeb"><div><a class="class-link" style="font-size:14px;color:#087550" href="class-records.html?class=${c.id}"><b>${c.grade} · ${c.id}</b></a><small style="display:block;margin-top:5px">${c.teacher} · ${c.room}</small></div>${status}</div><div class="class-metrics" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:15px 0"><div><small>Learners</small><b>${st.learners}</b></div><div><small>Attendance</small><b>${st.attendance}%</b>${progressBar(st.attendance)}</div><div><small>Pass rate</small><b>${st.passRate}%</b>${progressBar(st.passRate)}</div></div><div class="class-card-foot" style="display:flex;justify-content:space-between;align-items:center"><a class="table-action" href="class-records.html?class=${c.id}">Open class records →</a>${request}</div></article>`;
}
function classGrid(list, opts = {}) {
  if (!list.length) return '<p class="muted">No classes to show.</p>';
  return `<div class="class-grid">${list.map((c) => classCard(c, opts)).join("")}</div>`;
}

/* -------------------------------- learners ------------------------------- */
function learnersPage() {
  const r = role();
  const inScope = classesForScope();
  const stats = scopeStats();
  const teachMode = r === "teacher";

  const groups = gradeGroups()
    .map((g) => ({
      grade: g.grade,
      classes: g.classes.filter((c) => inScope.some((s) => s.id === c.id)),
    }))
    .filter((g) => g.classes.length);

  const gradePanels = groups
    .map((g) => {
      const gs = gradeStats(g.grade);
      return `<details class="panel grade-panel" style="padding:0;overflow:hidden" ${innerWidth > 820 ? "open" : ""}><summary style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 20px;cursor:pointer;list-style:none"><div><h3 style="margin:0">${g.grade}</h3><p style="margin:5px 0 0">${gs.learners} registered learners · attendance ${gs.attendance}% · pass rate ${gs.passRate}%</p></div><span class="badge neutral">${g.classes.length} ${g.classes.length === 1 ? "class" : "classes"} · View</span></summary><div style="padding:0 20px 20px">${classGrid(g.classes, { request: isLeadership() })}</div></details>`;
    })
    .join("");

  const ownLearnerTable = teachMode
    ? `<section class="panel"><div class="panel-head"><div><h3>Registered learners in my classes</h3><p>${stats.learners} learners across ${inScope.length} classes</p></div></div>${table(
        [
          "Learner",
          "Class",
          "Parent / guardian",
          "Attendance",
          "Average",
          "Status",
          "",
        ],
        learnersForScope().map(
          (l) =>
            `<tr><td><b>${l.name}</b><small>${l.id}</small></td><td>${l.grade} · ${l.class}</td><td>${l.parent}</td><td>${l.attendance}%</td><td>${l.average}%</td><td>${badge(standingFor(l))}</td><td><button class="table-action" data-action="view-learner" data-learner="${l.id}" data-class="${l.class}">View profile</button></td></tr>`,
        ),
      )}</section>`
    : "";

  return generic(
    teachMode ? "My Learners" : "Learners",
    "Learner management",
    teachMode
      ? "Learners registered in the classes you teach, grouped by grade."
      : "Learner key indicators first, then every class that contains registered learners, grouped by grade.",
    `<div class="stats-grid">${stat("Registered learners", stats.learners, inScope.length + " classes in scope")}${stat("Attendance average", stats.attendance + "%", "Across classes in scope")}${stat("Pass rate", stats.passRate + "%", stats.passing + " learners passing")}${stat("Classes", inScope.length, "Grouped by grade")}</div>${searchBar("learnerSearch", "Search class, grade or teacher")}${gradePanels}${ownLearnerTable}`,
  );
}
/* ------------------------------ class records ---------------------------- */
function classRecords() {
  const classId = param("class");
  const learnerId = param("learner");
  if (classId && learnerId) return classRecordsLearner(classId, learnerId);
  if (classId) return classRecordsClass(classId);
  return classRecordsIndex();
}

/* Level 1 — grades with their classes and class averages. */
function classRecordsIndex() {
  const r = role();
  const stats = scopeStats();
  const inScope = classesForScope();
  const groups = gradeGroups()
    .map((g) => ({
      grade: g.grade,
      classes: g.classes.filter((c) => inScope.some((s) => s.id === c.id)),
    }))
    .filter((g) => g.classes.length);
  const panels = groups
    .map((g) => {
      const gs = gradeStats(g.grade);
      return `<details class="panel grade-panel" style="padding:0;overflow:hidden" ${innerWidth > 820 ? "open" : ""}><summary style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 20px;cursor:pointer;list-style:none"><div><h3 style="margin:0">${g.grade}</h3><p style="margin:5px 0 0">${gs.learners} learners · attendance ${gs.attendance}% · class average ${gs.courseAverage}% · pass rate ${gs.passRate}%</p></div><span class="badge neutral">${g.classes.length} ${g.classes.length === 1 ? "class" : "classes"} · View</span></summary><div style="padding:0 20px 20px">${classGrid(g.classes, { request: isLeadership(), showStatus: isLeadership() || r === "clerk" })}</div></details>`;
    })
    .join("");
  const assignmentTool = role() === "clerk"
    ? '<section class="panel"><div class="panel-head"><div><h3>Class teacher assignment</h3><p>Submit a registered teacher assignment for principal approval.</p></div><button class="btn primary" data-action="assign-teacher">Assign teacher</button></div></section>'
    : "";
  const approvalQueue = role() === "principal" ? (getState().teacherAssignments || []).filter((assignment) => assignment.status === "Pending") : [];
  const approvalPanel = approvalQueue.length ? `<section class="panel"><div class="panel-head"><div><h3>Teacher assignments awaiting approval</h3><p>Approval updates the teacher portal and notifies linked parents.</p></div></div>${table(["Class", "Proposed teacher", "Requested by", ""], approvalQueue.map((assignment) => `<tr><td>${assignment.class}</td><td>${assignment.teacher}</td><td>${assignment.requestedBy}</td><td><button class="btn small primary" data-action="approve-teacher-assignment" data-assignment="${assignment.id}">Approve</button></td></tr>`))}</section>` : "";
  const note = isLeadership()
    ? "Class-level summary first — open a class to see its learners, or request a compiled report for a specific class."
    : "Class-level summary. Open a class to see the learners registered in it.";
  return generic(
    "Class Records",
    "Grades & classes",
    note,
    `${assignmentTool}${approvalPanel}<div class="stats-grid">${stat("Grades", groups.length, "Grade levels on register")}${stat("Classes", inScope.length, "Across all grades")}${stat("Learners", stats.learners, "In classes in scope")}${stat("Pass rate", stats.passRate + "%", stats.passing + " learners passing")}</div>${panels}`,
  );
}

/* Level 2 — the learners registered in one class. */
function classRecordsClass(classId) {
  const c = classById(classId);
  if (!c)
    return generic(
      "Class Records",
      "Grades & classes",
      "That class could not be found.",
      `<section class="panel">${backLink("All class records", "class-records.html")}</section>`,
    );
  const st = classStats(classId);
  const list = learnersInClass(classId);
  const report = reportForClass(classId);
  const canSeeReport = isLeadership() || role() === "clerk";
  const rows = list.map(
    (l) =>
      `<tr><td><b>${l.name}</b><small>${l.id}</small></td><td>${l.parent}<small>${l.relation}</small></td><td>${l.attendance}%</td><td>${l.average}%</td><td>${badge(standingFor(l))}</td><td><button class="table-action" data-action="view-learner" data-learner="${l.id}" data-class="${classId}">View learner →</button></td></tr>`,
  );
  const reportRow =
    canSeeReport && report
      ? `<div class="report-row"><span><b>${TERM} learner report</b><small>${flowStep(report.status).hint}</small></span>${statusBadge(report.status)}</div>`
      : "";
  return generic(
    `${c.grade} · ${c.id}`,
    "Class record",
    `Teacher ${c.teacher} · ${c.room} · ${st.learners} registered learners`,
    `${backLink("All class records", "class-records.html")}<div class="stats-grid">${stat("Learners", st.learners, "Registered in this class")}${stat("Attendance", st.attendance + "%", "Class average")}${stat("Class average", st.courseAverage + "%", "Across all learners")}${stat("Pass rate", st.passRate + "%", st.passing + " learners passing")}</div>${reportRow ? `<section class="panel"><div class="panel-head"><div><h3>Reporting status</h3><p>Class report pipeline</p></div></div>${reportRow}</section>` : ""}<section class="panel"><div class="panel-head"><div><h3>Learners in ${c.id}</h3><p>Parent, attendance, average and standing for every learner</p></div>${isLeadership() ? `<button class="btn primary" data-action="request-report" data-class="${classId}">Request class report</button>` : ""}</div>${table(["Learner", "Parent / guardian", "Attendance", "Average", "Status", ""], rows, "No learners registered in this class")}</section>`,
  );
}

/* Level 3 — full learner profile reached from inside a class. */
function classRecordsLearner(classId, learnerId) {
  const learner = learnerById(learnerId);
  if (!learner)
    return generic(
      "Learner",
      "Class record",
      "That learner could not be found.",
      `<section class="panel">${backLink("Back", "class-records.html?class=" + classId)}</section>`,
    );
  return generic(
    learner.name,
    "Learner profile",
    `${learner.grade} · ${learner.class} · ${SCHOOL.name}`,
    `${backLink("Back to " + learner.class, "class-records.html?class=" + learner.class)}${learnerProfileBody(learner, { request: isLeadership() })}`,
  );
}

/* Personal details + academic record, shared by class records and parent view. */
function learnerProfileBody(learner, opts = {}) {
  const teacher = teacherForClass(learner.class);
  const details = `<section class="panel"><h3>Personal details</h3><div class="detail-grid"><div><small>Full name</small><b>${learner.name}</b></div><div><small>Student number</small><b>${learner.id}</b></div><div><small>Grade</small><b>${learner.grade}</b></div><div><small>Class</small><b>${learner.class}</b></div><div><small>Class teacher</small><b>${teacher}</b></div><div><small>Enrolment status</small>${badge(learner.status)}</div><div><small>Parent / guardian</small><b>${learner.parent}</b></div><div><small>Relationship</small><b>${learner.relation}</b></div><div><small>Contact number</small><b>${learner.phone || "Not captured"}</b></div><div><small>Attendance</small><b>${learner.attendance}%</b></div><div><small>Days absent</small><b>${daysAbsent(learner)}</b></div><div><small>Overall average</small><b>${learner.average}%</b></div><div><small>Academic standing</small>${badge(standingFor(learner))}</div></div></section>`;
  const assessments = assessmentsForClass(learner.class);
  const scoreRows = assessments.map((a) => {
    const score =
      a.scores && a.scores[learner.id] !== undefined
        ? a.scores[learner.id]
        : null;
    return `<tr><td><b>${a.subject}</b><small>${a.title} · ${a.term}</small></td><td>${score === null ? '<span class="muted">Not captured</span>' : score + "%"}</td><td>${assessmentAverage(a)}%</td><td>${score === null ? badge("Open") : badge(score >= 50 ? "Pass" : "At Risk")}</td></tr>`;
  });
  const academic = `<section class="panel"><div class="panel-head"><div><h3>Academic record</h3><p>Captured assessment scores for ${learner.class}</p></div></div>${table(["Assessment", "This learner", "Class average", "Standing"], scoreRows, "No assessments captured yet")}</section>`;
  const published = publishedReportsForClass(learner.class, learner.id);
  const reports = `<section class="panel"><div class="panel-head"><div><h3>Published reports</h3><p>Finalised reports released to the parent</p></div></div>${published.length ? published.map((rep) => `<div class="report-row"><span><b>${rep.term} learner report</b><small>Published ${rep.publishedOn} · ${learner.class}</small></span><button class="btn small" data-action="download-report" data-class="${learner.class}" data-learner="${learner.id}">Download PDF</button></div>`).join("") : '<p class="muted">No report has been published for this class yet. Reports appear here once the teacher finalises and releases them.</p>'}</section>`;
  const history = `<section class="panel"><div class="panel-head"><div><h3>Report history</h3><p>Select a grade and term to view or download the academic record available up to that term.</p></div></div><div class="form-grid"><label>Grade<select class="select" id="historyGrade">${[8, 9, 10, 11, 12].map((grade) => `<option value="${grade}" ${learner.grade === "Grade " + grade ? "selected" : ""}>Grade ${grade}</option>`).join("")}</select></label><label>Term<select class="select" id="historyTerm"><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option><option value="4">Term 4</option></select></label></div><div class="panel-foot"><button class="btn ghost" data-action="view-history" data-learner="${learner.id}">View selected report</button><button class="btn primary" data-action="download-history" data-learner="${learner.id}">Download PDF</button></div></section>`;
  const footer = opts.request
    ? `<section class="panel"><div class="panel-head"><div><h3>Need a class-wide report?</h3><p>Request a compiled report for the whole class from the clerk.</p></div><button class="btn primary" data-action="request-report" data-class="${learner.class}">Request class report</button></div></section>`
    : "";
  return `<section class="profile-card"><div class="student-avatar">${initials(learner.name)}</div><div><h2>${learner.name}</h2><p>${learner.id} · ${learner.grade} · ${learner.class}</p></div><span>${badge(standingFor(learner))}</span></section><div class="dashboard-grid">${details}${academic}</div>${reports}${history}${footer}`;
}

/* -------------------- student records (clerk administration) ------------- */
function studentRecords() {
  const list = learners();
  const rows = list.map(
    (l) =>
      `<tr class="student-row"><td><b>${l.name}</b><small>${l.id}</small></td><td>${l.grade} · ${l.class}</td><td>${l.parent}<small>${l.relation}</small></td><td>${l.attendance}%</td><td>${daysAbsent(l)}</td><td>${badge(l.status)}</td><td><button class="table-action" data-action="view-learner" data-learner="${l.id}" data-class="${l.class}">Open</button></td></tr>`,
  );
  return generic(
    "Student Records",
    "Administration",
    "The individual learner register, maintained by the clerk. Leadership sees class-level summaries instead of this list.",
    `${searchBar("studentSearch", "Search learner, class, parent or ID")}<section class="panel">${table(["Student", "Grade / class", "Parent / guardian", "Attendance", "Days absent", "Status", ""], rows)}</section>`,
    '<button class="btn primary" data-action="add-learner">+ Add learner</button>',
  );
}

/* --------------------- learner profile (parent view) --------------------- */
function studentRecord() {
  const r = role();
  const child =
    r === "parent"
      ? parentLearner()
      : learnerById(param("learner")) || learners()[0];
  if (!child) return parentLinkRequired("Student Record");
  const stats = schoolStats();
  return generic(
    "Student Record",
    "Your learner",
    "The registered learner record for your child, including published reports you can download.",
    `<section class="profile-card"><div class="student-avatar">${initials(child.name)}</div><div><h2>${child.name}</h2><p>${child.id} · ${child.grade} · ${child.class}</p></div><span>${badge(standingFor(child))}</span></section><div class="stats-grid">${stat("Attendance", child.attendance + "%", "Term to date")}${stat("Overall average", child.average + "%", "Across assessments")}${stat("Class average", classStats(child.class).courseAverage + "%", "Grade " + child.class)}${stat("School pass rate", stats.passRate + "%", "Whole school")}</div>${learnerProfileBody(child, {})}`,
  );
}

/* -------------------------------- parents -------------------------------- */
function parents() {
  const r = role();
  const scope =
    r === "teacher"
      ? teacherClasses(userName()).map((c) => c.id)
      : classes().map((c) => c.id);
  const records = parentRecords().filter((p) => scope.includes(p.class));
  const directory = parentDirectory().filter((p) =>
    p.classes.some((c) => scope.includes(c)),
  );
  const guardians = directory.filter((p) => p.relation === "Guardian").length;
  const coveredClasses = new Set(records.map((p) => p.class)).size;

  const panels = gradeGroups()
    .map((g) => {
      const inGrade = g.classes.filter((c) => scope.includes(c.id));
      if (!inGrade.length) return "";
      const blocks = inGrade
        .map((c) => {
          const list = records.filter((p) => p.class === c.id);
          const rows = list.map(
            (p) =>
              `<tr><td><b>${p.name}</b><small>${p.phone}</small></td><td><span class="badge neutral">${p.relation}</span></td><td>${p.learner}<small>${p.learnerId}</small></td><td>${badge("Active")}</td><td>${["principal", "deputy", "clerk"].includes(role()) ? `<button class="table-action" data-action="manage-parent" data-learner="${p.learnerId}">Manage</button>` : "—"}</td></tr>`,
          );
          return `<div class="parent-group"><div class="parent-group-head"><b>${c.grade} · ${c.id}</b><small>${c.teacher} · ${list.length} registered ${list.length === 1 ? "parent" : "parents"}</small></div>${table(["Parent / guardian", "Classification", "Learner", "Status", ""], rows, "No parents linked to this class")}</div>`;
        })
        .join("");
      return `<section class="panel"><div class="panel-head"><div><h3>${g.grade}</h3><p>Parents grouped by the class their learner attends</p></div><span class="badge neutral">${inGrade.length} ${inGrade.length === 1 ? "class" : "classes"}</span></div>${blocks}</section>`;
    })
    .join("");

  return generic(
    "Parents",
    "Family relationships",
    "Registered parents and guardians, classified by relationship and grouped by the class their learner attends.",
    `<div class="stats-grid">${stat("Registered parents", directory.length, "Guardians of learners")}${stat("Guardians", guardians, "Legal guardians on file")}${stat("Classes covered", coveredClasses, "Each class has linked parents")}${stat("Learner links", records.length, "Parent-to-learner links")}</div>${panels}`,
  );
}
/* ------------------- student reports (workflow) -------------------------- */
function studentReports() {
  const r = role();
  const classId = param("class");
  if (classId && r === "clerk") return reportCompilationWorkspace(classId);
  if (classId && r === "teacher") return teacherReportReview(classId);
  return r === "clerk" ? studentReportsClerk() : studentReportsTeacher();
}

/* Teacher view: submit marks, review the compiled report, finalise and send. */
function studentReportsTeacher() {
  const mine = teacherClasses(userName());
  const rows = mine
    .map((c) => {
      const report = reportForClass(c.id);
      const status = report ? report.status : "awaiting-marks";
      const st = classStats(c.id);
      let action = '<span class="muted">No action</span>';
      if (status === "awaiting-marks")
        action = `<button class="btn small" data-action="go-test-scores" data-class="${c.id}">Capture & submit marks</button>`;
      else if (status === "ready")
        action = '<span class="muted">Waiting for the clerk to compile</span>';
      else if (status === "compiled")
        action = `<a class="btn small primary" href="student-reports.html?class=${c.id}">Review learner reports</a>`;
      else if (status === "finalised")
        action = `<a class="btn small primary" href="student-reports.html?class=${c.id}">Release individual reports</a>`;
      else if (status === "published")
        action = `<button class="btn small" data-action="download-report" data-class="${c.id}">Download</button>`;
      return `<tr><td><b>${c.grade} · ${c.id}</b><small>${st.learners} learners</small></td><td>${TERM}</td><td>${statusBadge(status)}</td><td>${report && report.compiledOn ? report.compiledOn : "—"}</td><td>${action}</td></tr>`;
    });
  const steps = REPORT_FLOW.map(
    (s, i) =>
      `<div class="flow-step"><span class="flow-index">${i + 1}</span><div><b>${s.label}</b><small>${s.hint}</small></div></div>`,
  ).join("");
  return generic(
    "Student Reports",
    "Teacher workspace",
    "Submit your class marks to the clerk, then review, finalise and release the compiled report to parents.",
    `<div class="stats-grid">${stat("My classes", mine.length, "Assigned to you")}${stat("Awaiting marks", countStatus(mine, "awaiting-marks"), "Capture & submit")}${stat("With me to finalise", countStatus(mine, "compiled"), "Sent back by the clerk")}${stat("Published", countStatus(mine, "published"), "Visible to parents")}</div><section class="panel"><div class="panel-head"><div><h3>Report workflow</h3><p>Teacher marks → clerk compiles → teacher finalises → parents receive</p></div></div><div class="flow-strip">${steps}</div></section><section class="panel"><div class="panel-head"><div><h3>My class reports — ${TERM}</h3><p>Each class moves through the pipeline independently</p></div></div>${table(["Class", "Term", "Status", "Compiled on", "Action"], rows, "You have no classes assigned")}</section>`,
  );
}

function teacherReportReview(classId) {
  const c = classById(classId);
  const report = reportForClass(classId);
  if (!c || !teacherClasses(userName()).some((item) => item.id === classId)) return studentReportsTeacher();
  const learnersInReview = learnersInClass(classId);
  const rows = learnersInReview.map((learner) => {
    const reviewed = report?.learnerReviews?.[learner.id];
    const released = report?.releasedLearners?.[learner.id];
    const action = report?.status === "compiled" ? (reviewed ? badge("Approved") : `<button class="btn small primary" data-action="review-learner-report" data-class="${classId}" data-learner="${learner.id}">Review & approve</button>`) : report?.status === "finalised" || report?.status === "published" ? (released ? badge("Released") : `<button class="btn small primary" data-action="release-learner-report" data-class="${classId}" data-learner="${learner.id}">Release to ${learner.parent}</button>`) : '<span class="muted">Awaiting compilation</span>';
    return `<tr><td><b>${learner.name}</b><small>${learner.id} · ${learner.parent}</small></td><td>${learner.attendance}%</td><td>${learner.average}%</td><td>${learnerSickNotices(learner).length}</td><td><button class="table-action" data-action="preview-learner-report" data-class="${classId}" data-learner="${learner.id}">Preview</button> ${action}</td></tr>`;
  });
  const canFinalise = report && report.status === "compiled";
  const approved = learnersInReview.filter((learner) => report?.learnerReviews?.[learner.id]).length;
  const released = learnersInReview.filter((learner) => report?.releasedLearners?.[learner.id]).length;
  return generic(`${c.grade} · ${c.id} report review`, "Teacher review", "Review each learner’s generated report, including marks and recorded sick notices, before releasing it only to that learner’s registered parent.", `${backLink("All student reports", "student-reports.html")}<section class="panel"><div class="panel-head"><div><h3>Compiled learner reports</h3><p>Prepared by the clerk · ${report ? report.compiledOn || "Pending" : "Pending"} · ${approved}/${learnersInReview.length} reviewed · ${released}/${learnersInReview.length} released</p></div>${report ? statusBadge(report.status) : ""}</div>${table(["Learner / registered parent", "Attendance", "Average", "Sick notices", ""], rows)}<div class="panel-foot">${canFinalise && approved === learnersInReview.length ? `<button class="btn primary" data-action="finalise-report" data-class="${classId}">Approve class for individual release</button>` : canFinalise ? `<span class="muted">Review ${learnersInReview.length - approved} more learner report(s) before enabling release.</span>` : report && report.status === "finalised" ? `<span class="muted">Release each learner report above to its registered parent.</span>` : '<span class="muted">This class is not ready for teacher approval.</span>'}</div></section>`);
}

/* Clerk view: compile learner reports from submitted marks, send back. */
function studentReportsClerk() {
  const all = classes();
  const requests = getState().reportRequests || [];
  const requestRows = requests
    .map((request) => {
      const c = classById(request.class);
      return `<tr><td><b>${c ? c.grade + " · " + c.id : request.class}</b></td><td>${request.requestedBy}</td><td>${request.requestedOn}</td><td><a class="table-action" href="class-records.html?class=${request.class}">Open class →</a></td></tr>`;
    });
  const rows = all
    .map((c) => {
      const report = reportForClass(c.id);
      const status = report ? report.status : "awaiting-marks";
      const st = classStats(c.id);
      const teacher = c.teacher;
      let action = '<span class="muted">No action</span>';
      if (status === "awaiting-marks")
        action = '<span class="muted">Waiting for teacher marks</span>';
      else if (status === "ready")
        action = `<a class="btn small primary" href="report-compilation.html?class=${c.id}">Open compilation</a>`;
      else if (status === "compiled")
        action = '<span class="muted">With the teacher for review</span>';
      else if (status === "finalised")
        action = '<span class="muted">Teacher releases to registered parents</span>';
      else if (status === "published")
        action = `<button class="btn small" data-action="download-report" data-class="${c.id}">Download</button>`;
      return `<tr><td><b>${c.grade} · ${c.id}</b><small>${st.learners} learners · ${teacher}</small></td><td>${report && report.marksSubmittedOn ? report.marksSubmittedOn : "—"}</td><td>${statusBadge(status)}</td><td>${action}</td></tr>`;
    });
  const ready = all.filter(
    (c) => (reportForClass(c.id) || {}).status === "ready",
  ).length;
  return generic(
    "Report Compilation",
    "Clerk workspace",
    "Compile learner reports from the marks teachers submit, then send each compiled report back to the teacher for review.",
    `<div class="stats-grid">${stat("Classes", all.length, "On register")}${stat("Requests", requests.length, "From leadership")}${stat("Ready to compile", ready, "Marks received")}${stat("Published", countStatus(all, "published"), "Released to parents")}</div>${requests.length ? `<section class="panel"><div class="panel-head"><div><h3>Leadership report requests</h3><p>Requested class reports to monitor</p></div></div>${table(["Class", "Requested by", "Date", ""], requestRows)}</section>` : ""}<section class="panel"><div class="panel-head"><div><h3>Compilation queue — ${TERM}</h3><p>Marks submitted by teachers arrive here</p></div></div>${table(["Class", "Marks submitted", "Status", "Action"], rows)}</section><section class="panel"><div class="panel-head"><div><h3>About this workflow</h3></div></div><p class="muted">Teachers submit class marks from Test Scores. The clerk compiles the individual learner reports and returns them to the teacher. The teacher finalises the report and releases it to parents, who can then view and download it under their child's record.</p></section>`,
  );
}

function reportCompilationWorkspace(classId) {
  const c = classById(classId);
  const report = reportForClass(classId);
  if (!c || !report) return studentReportsClerk();
  const assessments = assessmentsForClass(classId);
  const rows = learnersInClass(classId).map((learner) => {
    const sick = learnerSickNotices(learner);
    const marks = assessments.map((assessment) => assessment.scores?.[learner.id] ?? "—");
    return `<tr><td><b>${learner.name}</b><small>${learner.id} · Parent: ${learner.parent}</small></td><td>${marks.map((mark) => mark === "—" ? "—" : mark + "%").join(" · ")}</td><td>${learner.attendance}%</td><td>${sick.length ? sick.map((notice) => `${notice.date} · ${notice.reason}`).join("<br>") : '<span class="muted">None recorded</span>'}</td><td><button class="table-action" data-action="preview-learner-report" data-class="${classId}" data-learner="${learner.id}">Preview</button></td></tr>`;
  });
  const markHeaders = assessments.length ? assessments.map((assessment) => assessment.subject).join(" · ") : "No marks";
  const ready = report.status === "ready";
  return generic(`${c.grade} · ${c.id} compilation`, "Clerk report compilation", "Check submitted teacher marks and learner sick notices, generate the term reports, then send the complete class back to the assigned teacher.", `${backLink("Compilation queue", "student-reports.html")}<div class="stats-grid">${stat("Learners", learnersInClass(classId).length, "Individual reports to generate")}${stat("Assessments", assessments.length, "Teacher-submitted marks")}${stat("Sick notices", learnersInClass(classId).reduce((total, learner) => total + learnerSickNotices(learner).length, 0), "Included in reports")}${stat("Report status", flowStep(report.status).label, c.teacher)}</div><section class="panel"><div class="panel-head"><div><h3>Report data review</h3><p>Marks: ${markHeaders}</p></div>${statusBadge(report.status)}</div>${table(["Learner / registered parent", "Submitted marks", "Attendance", "Sick notices to include", ""], rows)}<div class="panel-foot">${ready ? `<button class="btn primary" data-action="compile-report" data-class="${classId}">Generate reports & send to ${c.teacher}</button>` : '<span class="muted">This class has already moved beyond clerk compilation.</span>'}</div></section><section class="panel"><div class="panel-head"><div><h3>Term report layout</h3><p>Each learner report contains the current term and all earlier terms in the school year, subject levels, attendance, sick-notice summary, remarks and signatures.</p></div></div><p class="muted">Use Preview to inspect an individual report before sending the class to the teacher.</p></section>`);
}

function reportCompilationPage() {
  const classId = param("class");
  return classId ? reportCompilationWorkspace(classId) : studentReportsClerk();
}

function countStatus(classList, status) {
  return classList.filter((c) => (reportForClass(c.id) || {}).status === status)
    .length;
}

/* ------------------------------ test scores ------------------------------ */
function testScores() {
  const r = role();
  if (r === "teacher") return testScoresTeacher();
  if (r === "clerk") return testScoresClerk();
  return testScoresLeadership();
}

/* Principal / deputy: class averages only, with drill-down for detail. */
function testScoresLeadership() {
  const classId = param("class");
  if (classId) return testScoresDetail(classId, true);
  const all = classes();
  const schoolAvg = Math.round(mean(all.map((c) => classTestAverage(c.id))));
  const rows = all.map((c) => {
    const avgs = assessmentsForClass(c.id).map((a) => assessmentAverage(a));
    const captured = assessmentsForClass(c.id).reduce(
      (n, a) => n + Object.keys(a.scores || {}).length,
      0,
    );
    return `<tr><td><b>${c.grade} · ${c.id}</b><small>${c.teacher}</small></td><td>${assessmentsForClass(c.id).length}</td><td>${captured}</td><td>${classTestAverage(c.id)}%</td><td><a class="table-action" href="test-scores.html?class=${c.id}">Detailed view →</a></td></tr>`;
  });
  const gradeRows = gradeGroups().map((g) => {
    const gradeAvg = Math.round(
      mean(g.classes.map((c) => classTestAverage(c.id))),
    );
    return `<div class="report-row"><span><b>${g.grade}</b><small>${g.classes.length} classes</small></span><span class="row-metrics"><b>${gradeAvg}%</b><small>grade average</small></span></div>`;
  });
  return generic(
    "Test Scores",
    "Assessment oversight",
    "Class and grade test-score averages. Open a class for the detailed assessment breakdown.",
    `<div class="stats-grid">${stat("School average", schoolAvg + "%", "All captured assessments")}${stat("Classes", all.length, "Across all grades")}${stat("Assessments", getState().assessments.length, "Captured this term")}${stat("Grades", gradeGroups().length, "Grade levels")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3>Class averages</h3><p>Average score for every class</p></div></div>${table(["Class", "Assessments", "Scores captured", "Average", ""], rows)}</section><section class="panel"><div class="panel-head"><div><h3>Grade averages</h3><p>Rolled up from class averages</p></div></div>${gradeRows.join("")}</section></div>`,
  );
}

/* Detailed, read-only assessment breakdown for leadership and clerk. */
function testScoresDetail(classId, readOnly) {
  const c = classById(classId);
  if (!c)
    return generic(
      "Test Scores",
      "Assessment",
      "That class could not be found.",
      `<section class="panel">${backLink("Back to test scores", "test-scores.html")}</section>`,
    );
  const list = assessmentsForClass(classId);
  const rows = list.map((a) => {
    const valueRows = learnersInClass(classId)
      .map((l) => {
        const score =
          a.scores && a.scores[l.id] !== undefined ? a.scores[l.id] : null;
        return `<div class="score-line" style="display:grid;grid-template-columns:minmax(240px,1fr) 110px;align-items:center;gap:18px;padding:11px 13px;border:1px solid #e3e9eb;border-radius:9px;margin:8px 0;background:#fff"><span><b>${l.name}</b><small style="display:block;margin-top:3px">${l.id}</small></span><b style="text-align:right;color:#087550">${score === null ? "Not captured" : score + "%"}</b></div>`;
      })
      .join("");
    return `<div class="assessment-block"><div class="assessment-head"><div><b>${a.subject} — ${a.title}</b><small>${a.term} · avg ${assessmentAverage(a)}% · submitted by ${a.submittedBy}</small></div>${a.status === "submitted" ? badge("Active") : badge("Awaiting marks")}</div><div class="score-lines">${valueRows}</div></div>`;
  });
  return generic(
    `${c.grade} · ${c.id} test scores`,
    "Assessment detail",
    `${c.teacher} · ${list.length} assessments captured`,
    `${backLink("Back to test scores", "test-scores.html")}<div class="stats-grid">${stat("Class average", classTestAverage(classId) + "%", "All assessments")}${stat("Assessments", list.length, "Captured this term")}${stat("Learners", learnersInClass(classId).length, "Registered")}${stat("Attendance", classStats(classId).attendance + "%", "Class average")}</div><section class="panel"><div class="panel-head"><div><h3>Assessment breakdown</h3><p>${readOnly ? "Read-only detailed view" : "Update scores for this class"}</p></div></div>${rows.join("") || '<p class="muted">No assessments captured.</p>'}</section>`,
  );
}

/* Teacher: capture and submit marks for their own classes. */
function testScoresTeacher() {
  const mine = teacherClasses(userName());
  const classId = param("class") || (mine[0] && mine[0].id);
  const c = classById(classId);
  if (!c)
    return generic(
      "Test Scores",
      "Teacher workspace",
      "You have no class assigned to capture marks for.",
      '<section class="panel"><p class="muted">No class assigned.</p></section>',
    );
  const assessment = assessmentsForClass(classId)[0];
  const valueRows = learnersInClass(classId)
    .map((l) => {
      const score =
        assessment && assessment.scores && assessment.scores[l.id] !== undefined
          ? assessment.scores[l.id]
          : "";
      return `<div class="score-line" style="display:grid;grid-template-columns:minmax(220px,1fr) 96px 18px;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #e3e9eb"><span><b>${l.name}</b><small style="display:block;margin-top:3px">${l.id}</small></span><input class="input score" style="margin:0;text-align:center" inputmode="numeric" aria-label="${l.name} mark" data-score="${l.id}" value="${score}"><span class="pct">%</span></div>`;
    })
    .join("");
  const report = reportForClass(classId);
  const submitted = assessment && assessment.status === "submitted";
  const classPicker = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 16px">${mine
    .map(
      (m) =>
        `<a href="test-scores.html?class=${m.id}" style="display:inline-flex;align-items:center;justify-content:center;padding:9px 13px;border-radius:9px;border:1px solid ${m.id === classId ? "#087550" : "#d4e0e3"};background:${m.id === classId ? "#087550" : "#fff"};color:${m.id === classId ? "#fff" : "#14343b"};font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap">${m.grade} · ${m.id}</a>`,
    )
    .join("")}</div>`;
  return generic(
    "Test Scores",
    "Teacher workspace",
    "Capture marks for your class and submit them to the clerk for report compilation.",
    `<div class="class-picker">${classPicker}</div><section class="panel"><div class="panel-head"><div><h3>${c.grade} · ${c.id} — ${assessment ? assessment.subject + " " + assessment.title : "No assessment"}</h3><p>${assessment ? assessment.term + " · " + learnersInClass(classId).length + " learners" : "No assessment scheduled"}</p></div>${report ? statusBadge(report.status) : ""}</div><div class="score-list">${valueRows}</div><div class="panel-foot"><button class="btn primary" data-action="submit-marks" data-class="${classId}" ${submitted ? "disabled" : ""}>${submitted ? "Marks submitted" : "Submit marks to clerk"}</button></div></section>${submitted ? '<p class="muted">Marks have been submitted. The clerk will compile the learner reports and return them to you for review.</p>' : ""}`,
  );
}

/* Clerk: update scores for a class after the teacher has submitted them. */
function testScoresClerk() {
  const all = classes();
  const classId = param("class");
  const picker = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 16px">${all
    .map(
      (m) =>
        `<a href="test-scores.html?class=${m.id}" style="display:inline-flex;align-items:center;justify-content:center;padding:9px 13px;border-radius:9px;border:1px solid ${m.id === classId ? "#087550" : "#d4e0e3"};background:${m.id === classId ? "#087550" : "#fff"};color:${m.id === classId ? "#fff" : "#14343b"};font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap">${m.grade} · ${m.id}</a>`,
    )
    .join("")}</div>`;
  if (!classId) {
    const rows = all.map((c) => {
      const list = assessmentsForClass(c.id);
      const submitted = list.some((a) => a.status === "submitted");
      return `<tr><td><b>${c.grade} · ${c.id}</b><small>${c.teacher}</small></td><td>${list.length}</td><td>${classTestAverage(c.id)}%</td><td>${submitted ? badge("Active") : badge("Awaiting marks")}</td><td><a class="table-action" href="test-scores.html?class=${c.id}">Update scores →</a></td></tr>`;
    });
    return generic(
      "Test Scores",
      "Clerk workspace",
      "Update test scores for a class once the teacher has submitted them.",
      `${picker}<section class="panel"><div class="panel-head"><div><h3>Assessment register</h3><p>Create an assessment, then capture or correct marks for the selected class.</p></div><button class="btn primary" data-action="add-assessment">+ Add assessment</button></div>${table(["Class", "Assessments", "Average", "Marks status", ""], rows)}</section>`,
    );
  }
  const c = classById(classId);
  const assessmentId = param("assessment");
  const assessment = assessmentsForClass(classId).find((item) => item.id === assessmentId) || assessmentsForClass(classId)[0];
  const assessmentPicker = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">${assessmentsForClass(classId)
    .map((item) => `<a href="test-scores.html?class=${classId}&assessment=${item.id}" style="display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:999px;border:1px solid ${item.id === assessment?.id ? "#087550" : "#d4e0e3"};background:${item.id === assessment?.id ? "#e7f7ef" : "#fff"};color:#14343b;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap">${item.subject} <span style="font-weight:500;margin-left:4px">· ${item.title}</span></a>`)
    .join("")}</div>`;
  const valueRows = learnersInClass(classId)
    .map((l) => {
      const score =
        assessment && assessment.scores && assessment.scores[l.id] !== undefined
          ? assessment.scores[l.id]
          : "";
      return `<div class="score-line" style="display:grid;grid-template-columns:minmax(220px,1fr) 96px 18px;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #e3e9eb"><span><b>${l.name}</b><small style="display:block;margin-top:3px">${l.id}</small></span><input class="input score" style="margin:0;text-align:center" inputmode="numeric" aria-label="${l.name} mark" data-score="${l.id}" value="${score}"><span class="pct">%</span></div>`;
    })
    .join("");
  return generic(
    "Test Scores",
    "Clerk workspace",
    "Correct and update the scores captured for this class after teacher submission.",
    `${picker}${backLink("All classes", "test-scores.html")}<section class="panel"><div class="panel-head"><div><h3>${c.grade} · ${c.id} assessments</h3><p>Select an assessment, or add a new one for this class.</p></div><button class="btn primary" data-action="add-assessment" data-class="${classId}">+ Add assessment</button></div><div class="class-picker">${assessmentPicker}</div></section><section class="panel"><div class="panel-head"><div><h3>${assessment ? assessment.subject + " — " + assessment.title : "No assessment"}</h3><p>${assessment ? assessment.term + " · " + assessment.date + " · Teacher: " + c.teacher : "Create an assessment to capture marks."}</p></div>${assessment && assessment.status === "submitted" ? badge("Active") : badge("Awaiting marks")}</div><div class="score-list">${valueRows}</div><div class="panel-foot"><button class="btn primary" data-action="update-scores" data-class="${classId}" data-assessment="${assessment ? assessment.id : ""}">Update scores</button></div></section>`,
  );
}
/* --------------------------- attendance register ------------------------- */
function attendanceRegister() {
  const mine = teacherClasses(userName());
  const classId = param("class") || mine[0]?.id;
  if (!mine.length) return generic("Attendance Register", "Teacher workspace", "A class must be assigned before you can capture daily attendance.", '<section class="panel"><p class="muted">No class assigned.</p></section>');
  const weekStart = param("week") || "2026-09-14";
  const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((name, index) => ({ name, date: new Date(new Date(weekStart + "T00:00:00").getTime() + index * 86400000).toISOString().slice(0, 10) }));
  const records = Object.fromEntries(weekDays.map((day) => [day.date, attendanceRegisterFor(classId, day.date)?.entries || {}]));
  const classPicker = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">${mine.map((schoolClass) => `<a href="attendance-register.html?class=${schoolClass.id}&week=${weekStart}" style="padding:9px 13px;border-radius:9px;text-decoration:none;font-size:12px;font-weight:700;border:1px solid ${schoolClass.id === classId ? "#087550" : "#d4e0e3"};background:${schoolClass.id === classId ? "#087550" : "#fff"};color:${schoolClass.id === classId ? "#fff" : "#14343b"}">${schoolClass.grade} · ${schoolClass.id}</a>`).join("")}</div>`;
  const headers = weekDays.map((day, index) => `<th colspan="3" style="background:${index % 2 ? "#eaf0ff" : "#eef8ee"};min-width:104px">${day.name}<small style="display:block">${day.date.slice(5)}</small></th>`).join("");
  const statusHeaders = weekDays.map(() => "<th>P</th><th>A</th><th>E</th>").join("");
  const rows = learnersInClass(classId).map((learner) => `<tr><td style="position:sticky;left:0;background:#fff;min-width:190px"><b>${learner.name}</b><small>${learner.id}</small></td>${weekDays.map((day, index) => { const value = records[day.date][learner.id] || "Present"; const colours = index % 2 ? "#eaf0ff" : "#eef8ee"; return ["Present", "Absent", "Excused"].map((status) => `<td style="background:${colours};text-align:center"><input type="checkbox" aria-label="${learner.name} ${day.name} ${status}" data-week-status="${status}" data-week-learner="${learner.id}" data-week-day="${day.date}" ${value === status ? "checked" : ""}></td>`).join(""); }).join("")}</tr>`).join("");
  const todayDate = new Date().toISOString().slice(0, 10);
  const today = new Date(todayDate + "T00:00:00");
  const mondayOffset = (today.getDay() + 6) % 7;
  const todayWeekStart = new Date(today.getTime() - mondayOffset * 86400000).toISOString().slice(0, 10);
  const previous = (getState().attendanceWeeks || []).filter((week) => week.class === classId).map((week) => `<div class="report-row"><span><b>Week of ${week.weekStart}</b><small>Last updated ${week.updatedOn} · ${week.teacher}</small></span><a class="btn small" href="attendance-register.html?class=${classId}&week=${week.weekStart}">View / Edit</a><button class="btn small" data-action="download-attendance-week" data-class="${classId}" data-week="${week.weekStart}">Download</button></div>`).join("") || '<span class="muted">No previous weekly registers.</span>';
  const todayRegister = `<a class="btn primary" href="attendance-register.html?class=${classId}&week=${todayWeekStart}">Today’s register · ${todayDate}</a>`;
  const c = classById(classId);
  return generic("Attendance Register", "Teacher workspace", "Weekly checklist register. Mark P (present), A (absent) or E (excused) for each learner and day; saved absences update learner records, reports and the parent view.", `${classPicker}<section class="panel"><div class="panel-head"><div><h3>${c.grade} · ${c.id} weekly register</h3><p>${c.teacher} · Week beginning ${weekStart}</p></div>${todayRegister}</div><div class="table-wrap" style="max-height:65vh;overflow:auto"><table><thead><tr><th rowspan="2" style="position:sticky;left:0;z-index:3">Student name</th>${headers}</tr><tr>${statusHeaders}</tr></thead><tbody>${rows}</tbody></table></div><div class="panel-foot"><span class="muted">Checklist key: P = Present · A = Absent · E = Excused</span><button class="btn primary" data-action="save-weekly-attendance" data-class="${classId}" data-week="${weekStart}">Submit register & update this week</button></div></section><section class="panel"><div class="panel-head"><div><h3>Previous registers</h3><p>View, download or edit a saved week.</p></div></div>${previous}</section>`);
}

/* Daily attendance is the source of truth. Weekly completion is derived from
 * five saved school-day registers, rather than asking teachers to re-enter a
 * whole week in a matrix. */
function weekStartFor(date) {
  const day = new Date(date + "T00:00:00");
  const offset = (day.getDay() + 6) % 7;
  return new Date(day.getTime() - offset * 86400000).toISOString().slice(0, 10);
}
function schoolDaysForWeek(weekStart) {
  const start = new Date(weekStart + "T00:00:00");
  return Array.from({ length: 5 }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
}
function refreshClassAttendance(state, classId) {
  const registers = (state.attendanceRegisters || []).filter((item) => item.class === classId);
  state.learners.filter((learner) => learner.class === classId).forEach((learner) => {
    const absences = registers.reduce((total, register) => total + (["Absent", "Sick", "Excused"].includes(register.entries?.[learner.id]) ? 1 : 0), 0);
    learner.absentDays = (learner.initialAbsentDays || 0) + absences;
    const totalDays = (learner.attendanceDays || 60) + registers.length;
    learner.attendance = Math.max(0, Math.round(((totalDays - learner.absentDays) / totalDays) * 100));
  });
}
function attendanceOverview() {
  const mine = teacherClasses(userName());
  if (!mine.length) return generic("Attendance Register", "Teacher workspace", "A class must be assigned before you can capture daily attendance.", '<section class="panel"><p class="muted">No class assigned.</p></section>');
  const classId = param("class") || mine[0].id;
  const schoolClass = classById(classId);
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartFor(today);
  const weekDays = schoolDaysForWeek(weekStart);
  const classPicker = mine.map((item) => `<a class="btn small" href="attendance-register.html?class=${item.id}">${item.grade} - ${item.id}</a>`).join("");
  const progress = weekDays.map((date, index) => {
    const done = Boolean(attendanceRegisterFor(classId, date));
    return `<div class="attendance-day ${done ? "complete" : "pending"}"><b>${["Mon", "Tue", "Wed", "Thu", "Fri"][index]}</b><span>${done ? "✓" : "○"}</span><small>${date.slice(8)}</small></div>`;
  }).join("");
  const grouped = (getState().attendanceRegisters || []).filter((register) => register.class === classId).sort((a, b) => b.date.localeCompare(a.date)).reduce((groups, register) => {
    const key = weekStartFor(register.date);
    (groups[key] ||= []).push(register);
    return groups;
  }, {});
  const pastWeeks = Object.entries(grouped).map(([start, registers]) => `<section class="attendance-history-week"><div class="panel-head"><div><h3>Week of ${start}</h3><p>${registers.length} of 5 weekday registers captured</p></div></div>${registers.map((register) => `<div class="report-row"><span><b>${register.date}</b><small>${register.teacher} - saved ${register.capturedOn}</small></span><span class="action-row"><a class="btn small" href="attendance-register.html?class=${classId}&date=${register.date}">Edit</a><button class="btn small" data-action="delete-daily-attendance" data-class="${classId}" data-date="${register.date}">Delete</button></span></div>`).join("")}</section>`).join("") || '<p class="muted">No attendance has been captured for this class yet.</p>';
  const savedThisWeek = weekDays.filter((date) => attendanceRegisterFor(classId, date)).length;
  const weeklySubmission = (getState().attendanceWeeks || []).find((week) => week.class === classId && week.weekStart === weekStart);
  const weeklyAction = savedThisWeek === 5 && !weeklySubmission ? `<button class="btn primary" data-action="submit-daily-week" data-class="${classId}" data-week="${weekStart}">Submit weekly attendance</button>` : "";
  return generic("Attendance Register", "Teacher workspace", "Record attendance one day at a time and review completed registers by week.", `<div class="action-row" style="flex-wrap:wrap;margin-bottom:16px">${classPicker}</div><section class="panel"><div class="panel-head"><div><h3>${schoolClass?.grade || "Class"} - ${classId}</h3><p>Week beginning ${weekStart}</p></div><a class="btn primary" href="attendance-register.html?class=${classId}&date=${today}">+ New attendance</a></div><div class="attendance-week-bar">${progress}</div><div class="panel-foot"><span class="muted">${savedThisWeek} of 5 school days completed this week.</span>${weeklyAction}</div></section><section class="panel"><div class="panel-head"><div><h3>Past attendance registers</h3><p>Registers are organised by week. You can edit or delete any saved day.</p></div></div>${pastWeeks}</section>`);
}
function dailyAttendanceRegister() {
  if (!param("date")) return attendanceOverview();
  const mine = teacherClasses(userName());
  if (!mine.length) return generic("Attendance Register", "Teacher workspace", "A class must be assigned before you can capture daily attendance.", '<section class="panel"><p class="muted">No class assigned.</p></section>');
  const today = new Date().toISOString().slice(0, 10);
  const classId = param("class") || mine[0].id;
  const date = param("date") || today;
  const schoolClass = classById(classId);
  const existing = attendanceRegisterFor(classId, date);
  const weekStart = weekStartFor(date);
  const weekDays = schoolDaysForWeek(weekStart);
  const savedDays = weekDays.filter((day) => attendanceRegisterFor(classId, day));
  const weeklySubmission = (getState().attendanceWeeks || []).find((week) => week.class === classId && week.weekStart === weekStart);
  const classPicker = mine.map((item) => `<a class="btn small" href="attendance-register.html?class=${item.id}&date=${date}">${item.grade} - ${item.id}</a>`).join("");
  const learnerRows = learnersInClass(classId).map((learner) => {
    const status = existing?.entries?.[learner.id] || "Present";
    const checklist = ["Present", "Absent", "Sick", "Excused"].map((option) => `<label class="attendance-choice"><input type="radio" name="attendance-${learner.id}" data-day-status="${option}" data-learner="${learner.id}" ${status === option ? "checked" : ""}><span>${option}</span></label>`).join("");
    return `<tr><td><b>${learner.name}</b><small>${learner.id}</small></td><td><div class="attendance-checklist" role="radiogroup" aria-label="${learner.name} attendance">${checklist}</div></td></tr>`;
  });
  const past = (getState().attendanceRegisters || []).filter((register) => register.class === classId).sort((a, b) => b.date.localeCompare(a.date)).map((register) => `<div class="report-row"><span><b>${register.date}</b><small>${register.teacher} - saved ${register.capturedOn}</small></span><span class="action-row"><a class="btn small" href="attendance-register.html?class=${classId}&date=${register.date}">Edit</a><button class="btn small" data-action="delete-daily-attendance" data-class="${classId}" data-date="${register.date}">Delete</button></span></div>`).join("") || '<p class="muted">No daily attendance has been submitted for this class.</p>';
  const weeklyPrompt = savedDays.length === 5 && !weeklySubmission
    ? `<div class="notice"><div class="notice-icon">!</div><div class="grow"><b>Weekly attendance ready to submit</b><p>All five school days for the week beginning ${weekStart} have been captured.</p></div><button class="btn primary" data-action="submit-daily-week" data-class="${classId}" data-week="${weekStart}">Submit week</button></div>`
    : `<p class="muted">Week of ${weekStart}: ${savedDays.length} of 5 school days captured${weeklySubmission ? " - weekly attendance submitted" : ""}.</p>`;
  return generic("Attendance Register", "Teacher workspace", "Capture one day at a time. Each saved day immediately updates learner and weekly attendance.", `<div class="action-row" style="flex-wrap:wrap;margin-bottom:16px">${classPicker}</div><section class="panel"><div class="panel-head"><div><h3>${schoolClass?.grade || "Class"} - ${classId} daily register</h3><p>${existing ? `Editing the register saved by ${existing.teacher}.` : "Every learner is listed below. Mark each learner, then submit the day."}</p></div></div><div class="form-grid"><label>Date<input class="input" id="attendanceDate" type="date" value="${date}"></label></div><div class="panel-foot"><button class="btn" data-action="open-attendance-day" data-class="${classId}">Open selected date</button></div>${table(["Learner", "Attendance status"], learnerRows)}<div class="panel-foot"><span class="muted">Submitting closes this register and returns you to your dashboard.</span><button class="btn primary" data-action="save-daily-attendance" data-class="${classId}">${existing ? "Save changes & close" : "Submit attendance & close"}</button></div></section><section class="panel"><div class="panel-head"><div><h3>Weekly completion</h3><p>Daily records are rolled up automatically.</p></div></div>${weeklyPrompt}</section><section class="panel"><div class="panel-head"><div><h3>Past daily attendance</h3><p>Edit or delete a previously saved day.</p></div></div>${past}</section>`);
}
function saveDailyAttendance(classId) {
  const date = inputValue("attendanceDate");
  if (!date) return;
  const entries = Object.fromEntries(learnersInClass(classId).map((learner) => [learner.id, $(`[data-day-status][data-learner="${learner.id}"]:checked`)?.dataset.dayStatus || "Present"]));
  persist((state) => {
    state.attendanceRegisters = state.attendanceRegisters || [];
    const index = state.attendanceRegisters.findIndex((register) => register.class === classId && register.date === date);
    const register = { class: classId, date, teacher: userName(), entries, capturedOn: todayLabel() };
    if (index >= 0) state.attendanceRegisters[index] = register;
    else state.attendanceRegisters.unshift(register);
    refreshClassAttendance(state, classId);
  });
  go("attendance-register.html?class=" + classId);
}
function deleteDailyAttendance(classId, date) {
  if (!confirm(`Delete the attendance register for ${date}?`)) return;
  persist((state) => {
    state.attendanceRegisters = (state.attendanceRegisters || []).filter((register) => !(register.class === classId && register.date === date));
    const weekStart = weekStartFor(date);
    state.attendanceWeeks = (state.attendanceWeeks || []).filter((week) => !(week.class === classId && week.weekStart === weekStart));
    refreshClassAttendance(state, classId);
  });
  render();
}
function submitDailyWeek(classId, weekStart) {
  const schoolDays = schoolDaysForWeek(weekStart);
  if (schoolDays.some((date) => !attendanceRegisterFor(classId, date))) return;
  persist((state) => {
    state.attendanceWeeks = state.attendanceWeeks || [];
    const summary = { class: classId, weekStart, teacher: userName(), updatedOn: todayLabel(), status: "Submitted" };
    const index = state.attendanceWeeks.findIndex((week) => week.class === classId && week.weekStart === weekStart);
    if (index >= 0) state.attendanceWeeks[index] = summary;
    else state.attendanceWeeks.unshift(summary);
  });
  render();
}

/* --------------------------------- chat ---------------------------------- */
function chatLayout(title, eyebrow, desc, conversations, storeKey, ownStoredSide = "me") {
  if (!conversations.length)
    return generic(
      title,
      eyebrow,
      desc,
      '<section class="panel"><p class="muted">No conversations available.</p></section>',
    );
  const selected = Math.max(0, Math.min(conversations.length - 1, Number(param("chat")) || 0));
  const active = conversations[selected];
  const storageIndex = active.storeIndex ?? selected;
  const people = conversations
    .map(
      (c, i) =>
        `<a href="${page()}.html?chat=${i}" data-chat-contact class="chat-person ${i === selected ? "active" : ""}"><div class="avatar">${c.initials}</div><div><b>${c.id}</b><small>${c.role}</small></div><span class="dot success"></span></a>`,
    )
    .join("");
  const contacts = conversations
    .map(
      (c, i) =>
        `<button data-chat-contact class="chat-person" data-action="open-chat" data-url="${page()}.html?chat=${i}" style="border:1px solid #dce6e8;background:#fff;border-radius:10px;text-align:left;cursor:pointer"><div class="avatar">${c.initials}</div><div><b>${c.id}</b><small>${c.role}</small></div><span style="margin-left:auto;color:#087550;font-weight:700;font-size:12px">Chat →</span></button>`,
    )
    .join("");
  const messages =
    (active.messages || [])
      .map(
        (m) => {
          const mine = m.from === ownStoredSide;
          return `<div class="chat-message ${mine ? "outgoing" : "incoming"}"><div class="msg ${mine ? "mine" : "other"}"><span>${m.text}</span><small>${m.date || "Now"}${mine ? " ✓✓" : ""}</small></div></div>`;
        },
      )
      .join("") ||
    '<p class="muted">No messages yet — start the conversation below.</p>';
  return generic(
    title,
    eyebrow,
    desc,
    `<section class="panel" style="margin-bottom:16px"><div class="panel-head"><div><h3>Start a conversation</h3><p>Choose a person you are authorised to contact.</p></div></div><input class="input" id="chatSearch" placeholder="Search people you can contact..." style="margin:0 0 11px"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px;max-height:205px;overflow:auto;padding-right:4px">${contacts}</div></section><div class="chat-layout"><section class="panel chat-list">${people}</section><section class="panel chat-window"><div class="chat-head"><b>${active.id}</b><small>${active.role}</small></div><div class="messages">${messages}</div><div class="chat-compose"><input class="input" id="chatInput" placeholder="Write a secure message..."><button class="btn primary" data-action="send-message" data-store="${storeKey}" data-chat="${storageIndex}" data-sender="${ownStoredSide}">Send</button></div></section></div>`,
  );
}

/* Principal ↔ teacher channel. Parents have no access to this page. */
function teacherChat() {
  if (isLeadership()) {
    const list = getState().teacherChat;
    return chatLayout(
      "Teacher Chat",
      "Leadership · staff channel",
      "Direct, private channel between the principal and each teacher.",
      list,
      "teacherChat",
      "me",
    );
  }
  const storedIndex = getState().teacherChat.findIndex((conversation) => conversation.id === userName());
  const stored = getState().teacherChat[storedIndex];
  const peer = {
    id: SCHOOL.principal,
    role: "Principal · " + SCHOOL.name,
    initials: initials(SCHOOL.principal),
    storeIndex: storedIndex,
    messages: stored ? stored.messages : [{ from: "them", text: "Good morning. Please submit your class marks so the clerk can compile the term reports.", date: "17 Sep 2026" }],
  };
  return chatLayout(
    "Teacher Chat",
    "Teacher · staff channel",
    "Direct, private channel between you and the principal. Parents cannot access this channel.",
    [peer],
    "teacherChat",
    "them",
  );
}

/* Teacher ↔ parent channel. Leadership has no access to this page. */
function parentChat() {
  const r = role();
  if (r === "teacher") {
    const mine = teacherClasses(userName()).map((c) => c.id);
    const list = getState().parentChat
      .map((conversation, storeIndex) => ({ ...conversation, storeIndex }))
      .filter((conversation) => mine.includes(conversation.class));
    return chatLayout(
      "Parent–Teacher Chat",
      "Teacher · family channel",
      "Private channel between you and the parents of learners in your classes. Leadership cannot access this channel.",
      list,
      "parentChat",
      "me",
    );
  }
  const child = parentLearner();
  if (!child) return parentLinkRequired("Parent–Teacher Chat");
  const parentChatIndex = getState().parentChat.findIndex((conversation) => conversation.learnerId === child.id);
  const storedParentChat = getState().parentChat[parentChatIndex];
  const peer = {
    id: teacherForClass(child.class),
    role: `Class teacher · ${child.class}`,
    initials: initials(teacherForClass(child.class)),
    storeIndex: parentChatIndex,
    messages: storedParentChat ? storedParentChat.messages : [
      {
        from: "them",
        text: `Good day. ${child.name}'s Term 2 report will be shared here once it is published.`,
      },
    ],
  };
  return chatLayout(
    "Parent–Teacher Chat",
    "Parent · teacher channel",
    "Private channel between you and your child's class teacher.",
    [peer],
    "parentChat",
    "them",
  );
}

/* ------------------------------ announcements ---------------------------- */
function announcements() {
  const r = role();
  const options = audienceOptions();
  const opts = options
    .map(
      (o) =>
        `<option value="${o.id}" data-count="${o.count}">${o.label}</option>`,
    )
    .join("");
  const first = options[0] || { count: 0, label: "" };
  const recent = getState().announcements;
  const rows = recent.map(
    (a) =>
      `<tr><td><b>${a.title}</b><small>${a.author} · ${a.date}</small></td><td>${a.audience}</td><td>${a.recipients}</td><td>${a.delivery}</td><td>${badge("Active")}</td><td>${a.author === userName() ? `<button class="table-action" data-action="manage-announcement" data-announcement="${a.id}">Manage</button>` : "—"}</td></tr>`,
  );
  const whoCanSend =
    r === "teacher"
      ? "As a teacher you can only reach parents and guardians registered to the classes you teach."
      : r === "clerk"
        ? "As the clerk you can reach all registered parents, the whole school or all staff."
        : "As principal you can reach learners, parents, teaching staff, administration, security, the SGB and leadership — school-wide or by grade.";
  return generic(
    "Announcements",
    "Communication",
    "Compose a target announcement. The audience list is built from the live register, so you only reach people your role is cleared to contact.",
    `<section class="panel"><div class="panel-head"><div><h3>New announcement</h3><p>${whoCanSend}</p></div></div><div class="form-grid"><label>Audience<select class="select" id="audienceSelect">${opts}</select></label><label>Delivery<select class="select" id="deliverySelect"><option>In-app notification</option><option>In-app + SMS</option><option>In-app + Email</option></select></label><label class="full">Title<input class="input" id="annTitle" placeholder="Announcement title"></label><label class="full">Message<textarea class="textarea" id="annBody" placeholder="Write the announcement..."></textarea></label></div><div class="audience-preview">Recipients reached: <b id="audienceCount">${first.count}</b> <small>${first.label}</small></div><div class="panel-foot"><button class="btn primary" data-action="send-announcement">Send announcement</button></div></section><section class="panel"><div class="panel-head"><div><h3>Recent announcements</h3><p>Only announcements you authored can be changed or deleted.</p></div></div>${table(["Announcement", "Audience", "Recipients", "Delivery", "Status", ""], rows)}</section>`,
  );
}
/* ---------------------------------- staff -------------------------------- */
function staff() {
  const s = getState();
  const canManage = ["principal", "deputy", "clerk"].includes(role());
  const requests = s.staffChangeRequests || [];
  const mine = requests.filter((request) => request.requestedBy === userName() && request.status === "Pending");
  const reviewQueue = ["principal", "deputy"].includes(role()) ? requests.filter((request) => request.status === "Pending") : [];
  const approvals = reviewQueue.length ? `<section class="panel"><div class="panel-head"><div><h3>Staff changes awaiting dual approval</h3><p>Clerk changes only update the register after both the principal and deputy approve.</p></div></div>${table(["Change", "Requested by", "Principal", "Deputy", ""], reviewQueue.map((request) => `<tr><td><b>${request.type === "add" ? "Add" : "Edit"} staff member</b><small>${request.proposed.name} · ${request.proposed.role}</small></td><td>${request.requestedBy}<small>${request.requestedOn}</small></td><td>${request.approvals.principal ? badge("Approved") : badge("Pending")}</td><td>${request.approvals.deputy ? badge("Approved") : badge("Pending")}</td><td>${request.approvals[role()] ? '<span class="muted">Your approval recorded</span>' : `<button class="btn small primary" data-action="approve-staff-change" data-staff-change="${request.id}">Approve</button>`}</td></tr>`))}</section>` : "";
  const submitted = role() === "clerk" && mine.length ? `<section class="panel"><div class="panel-head"><div><h3>My pending staff changes</h3><p>These changes are not live until the principal and deputy both approve.</p></div></div>${table(["Change", "Principal", "Deputy", "Requested"], mine.map((request) => `<tr><td><b>${request.type === "add" ? "Add" : "Edit"} · ${request.proposed.name}</b><small>${request.proposed.role} · ${request.proposed.department}</small></td><td>${request.approvals.principal ? badge("Approved") : badge("Pending")}</td><td>${request.approvals.deputy ? badge("Approved") : badge("Pending")}</td><td>${request.requestedOn}</td></tr>`))}</section>` : "";
  return generic(
    "Staff",
    "People management",
    "Teaching, administration and support staff.",
    `${approvals}${submitted}<section class="panel">${table(
      ["Employee", "Role", "Department", "Status", ""],
      s.staff.map(
        (x) =>
          `<tr><td><b>${x.name}</b><small>${x.id}</small></td><td>${x.role}</td><td>${x.department}</td><td>${badge(x.status)}</td><td>${canManage ? `<button class="table-action" data-action="manage-staff" data-staff="${x.id}">Manage</button>` : "—"}</td></tr>`,
      ),
    )}</section>`,
    canManage ? '<button class="btn primary" data-action="add-staff">+ Add staff member</button>' : "",
  );
}

/* --------------------------------- security ------------------------------ */
function security() {
  return generic(
    "Security Officers",
    "Security operations",
    "Manage security personnel, assignments, sites and duty coverage.",
    `<div class="stats-grid compact">${stat("Officers", "6", "Active workforce")}${stat("On duty", "3", "Current shift")}${stat("Sites", "4", "Protected locations")}${stat("QR checkpoints", "12", "Registered checkpoints")}</div><section class="panel"><div class="panel-head"><div><h3>Deployment overview</h3><p>Who is covering which site and shift</p></div><a class="text-link" href="security-officers.html">Manage officers →</a></div><div class="deployment"><div><b>Main Gate</b><span>Sello Ndlovu · 06:00–14:00</span>${badge("On Duty")}</div><div><b>Sports Field</b><span>Palesa Dube · 06:00–14:00</span>${badge("On Duty")}</div><div><b>Admin Block</b><span>Unassigned · 14:00–22:00</span>${badge("Open")}</div></div></section>`,
  );
}
function securityOfficers() {
  const s = getState();
  return generic(
    "Security Officers",
    "Security management",
    "Manage officer profiles, employee IDs, shifts, sites and duties.",
    `<div class="stats-grid compact">${stat("Officers", s.security.length, "Displayed here")}${stat("On duty", s.security.filter((x) => x.status === "On Duty").length, "Current shift")}${stat("Sites", "4", "Configured")}${stat("Checkpoints", "12", "QR checkpoints")}</div><section class="panel"><div class="panel-head"><div><h3>Officer directory & deployment</h3><p>Open an officer to update shift, site and duty status.</p></div></div>${table(
      ["Officer", "Employee ID", "Shift", "Assigned site", "Status", ""],
      s.security.map(
        (x) =>
          `<tr><td><b>${x.name}</b><small>Badge ${x.id}</small></td><td>${x.employee}</td><td>${x.shift}</td><td>${x.site}</td><td>${badge(x.status)}</td><td><button class="table-action" data-action="manage-officer" data-officer="${x.id}">Manage</button></td></tr>`,
      ),
    )}</section>`,
    '<button class="btn primary" data-action="add-officer">+ Add security officer</button>',
  );
}

/* --------------------------------- reports ------------------------------- */
function reports() {
  const stats = schoolStats();
  const cards = [
    [
      "Learner pass rate",
      stats.passRate + "%",
      stats.passing + " learners passing",
      "class-records.html",
    ],
    [
      "Attendance average",
      stats.attendance + "%",
      "School-wide",
      "class-records.html",
    ],
    [
      "Open incidents",
      String(openIncidents()),
      "Needs attention",
      "incidents.html",
    ],
    [
      "Published reports",
      String(getState().reports.filter((x) => x.status === "published").length),
      "Released to parents",
      "class-records.html",
    ],
  ];
  const classRows = classes().map((c) => {
    const st = classStats(c.id);
    return `<tr><td><b>${c.grade} · ${c.id}</b><small>${c.teacher}</small></td><td>${st.learners}</td><td>${st.attendance}%</td><td>${classTestAverage(c.id)}%</td><td>${st.passRate}%</td></tr>`;
  });
  return generic(
    "Reports",
    "Insights & accountability",
    "Academic and operational performance, summarised by class for leadership.",
    `<div class="report-grid">${cards.map((x) => `<a class="report-card" href="${x[3]}"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small><b>Open report →</b></a>`).join("")}</div><section class="panel"><div class="panel-head"><div><h3>Class performance summary</h3><p>Attendance, test average and pass rate per class</p></div><button class="btn primary" id="exportCsv">Export CSV</button></div>${table(["Class", "Learners", "Attendance", "Test average", "Pass rate"], classRows)}</section>`,
  );
}

/* -------------------------------- leadership ----------------------------- */
function leadership() {
  const stats = schoolStats();
  const classRows = classes().map((c) => {
    const st = classStats(c.id);
    return `<div class="report-row"><span><b>${c.grade} · ${c.id}</b><small>${c.teacher}</small></span><span class="row-metrics"><b>${st.attendance}%</b><small>attendance</small></span><span class="row-metrics"><b>${st.courseAverage}%</b><small>average</small></span><span class="row-metrics"><b>${st.passRate}%</b><small>pass rate</small></span></div>`;
  });
  return shell(
    `<div class="page-intro"><div><span class="pill">Executive oversight</span><h1>Leadership</h1><p>School-wide academic and safety posture for the Principal and Deputy Principal.</p></div><div><button class="btn primary" data-nav="announcements">New announcement</button></div></div><div class="stats-grid">${stat("Learners", stats.learners, "Across " + classes().length + " classes")}${stat("Attendance", stats.attendance + "%", "School average")}${stat("Pass rate", stats.passRate + "%", stats.passing + " learners passing")}${stat("Open incidents", openIncidents(), "Requiring action")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3>Class oversight</h3><p>Every class, grouped by grade</p></div><a class="text-link" href="class-records.html">Open class records →</a></div>${classRows.join("")}</section><section class="panel"><div class="panel-head"><div><h3>Leadership priorities</h3><p>Items requiring executive attention</p></div></div><div class="priority-list"><div><b>Review critical security incident</b><span>Due today · Main Gate</span><button class="btn small" data-nav="incidents">Open case</button></div><div><b>Approve security deployment</b><span>Next shift · 14:00</span><button class="btn small" data-nav="security">Review</button></div><div><b>Release finalised term reports</b><span>Academic · ${TERM}</span><button class="btn small" data-nav="test-scores">Open</button></div></div></section></div>`,
    "Leadership",
  );
}

/* --------------------------------- settings ------------------------------ */
function settings() {
  const roleSettings = {
    principal: [["School profile", "School name, code, contact details and term calendar."], ["Leadership alerts", "Choose urgent incident escalation and daily oversight summaries."], ["Announcement governance", "Set publishing approval and delivery defaults."]],
    deputy: [["Deputy preferences", "Set delegated classes, alert escalation and handover notifications."], ["Leadership alerts", "Choose urgent incident escalation and daily oversight summaries."], ["Communication defaults", "Control notification delivery preferences."]],
    clerk: [["Office workflow", "Manage report, appointment and front-office notification preferences."], ["Data administration", "Set learner-record and score-update review reminders."], ["Communication defaults", "Control notification delivery preferences."]],
    teacher: [["Class workspace", "Set class reminders, mark-submission and parent-message preferences."], ["Communication defaults", "Control notification delivery preferences."], ["Privacy", "Manage your session and secure-device preferences."]],
    parent: [["My child alerts", "Choose notifications for your linked learner and school-wide alerts."], ["Contact details", "Keep your preferred contact method current."], ["Privacy", "Manage your session and secure-device preferences."]],
    security: [["Security operations", "Set incident escalation, shift and checkpoint notification preferences."], ["Privacy", "Manage your session and secure-device preferences."], ["Device access", "Review secure-session and sign-in preferences."]],
    sgb: [["Governance updates", "Choose reports and school-wide notification preferences."], ["Privacy", "Manage your session and secure-device preferences."], ["Device access", "Review secure-session and sign-in preferences."]],
  };
  const panels = (roleSettings[role()] || roleSettings.parent).map(([heading, description]) => `<section class="panel"><div class="setting-row"><div><b>${heading}</b><small>${description}</small></div><input type="checkbox" checked></div></section>`).join("");
  return generic(
    "Settings",
    "Role preferences",
    "Settings and controls relevant to your authorised role.",
    `<div class="settings-grid">${panels}<section class="panel"><h3>Secure access</h3><div class="setting-row"><div><b>Require re-login after tab closes</b><small>Session expires when the browser tab is closed.</small></div><input type="checkbox" checked disabled></div><div class="setting-row"><div><b>Login audit logging</b><small>Record role, time and successful/failed login events.</small></div><input type="checkbox" checked></div></section></div>`,
  );
}
/* ---------------------------------- people ------------------------------- */
function sickNotices() {
  const s = getState();
  return generic(
    "Sick Notices",
    "Attendance & welfare",
    "Receive, review and track learner and staff sick notices.",
    `<section class="panel">${table(
      ["Submitted by", "Learner / staff", "Date", "Reason", "Status", "Action"],
      s.sickNotices.map(
        (n) =>
      `<tr><td>${n.submittedBy}</td><td>${n.person}</td><td>${n.date}</td><td>${n.reason}</td><td>${badge(n.status)}</td><td><button class="table-action" data-action="view-sick-notice" data-sick="${n.id}">${n.status === "Reviewed" ? "View" : "Review"}</button></td></tr>`,
      ),
    )}</section>`,
  );
}
function sickNotice() {
  return generic(
    "Sick Notice",
    "Parent / guardian",
    "Notify the school when your learner is absent for health reasons.",
    `<section class="panel"><div class="form-grid"><label>Learner<select class="select" id="sickLearner">${learners().filter((learner) => learner.parent === userName()).map((learner) => `<option>${learner.name} — ${learner.grade} ${learner.class}</option>`).join("") || '<option>No registered learner found</option>'}</select></label><label>Date<input class="input" id="sickDate" type="date"></label><label>Expected return<input class="input" id="sickReturn" type="date"></label><label>Reason<select class="select" id="sickReason"><option>Illness</option><option>Medical appointment</option><option>Other</option></select></label><label class="full">Sick letter (optional)<input class="input" id="sickLetter" type="file" accept="image/*,.pdf,.doc,.docx"><small>Take a photo or attach a sick letter, medical certificate or supporting document.</small></label><label class="full">Additional information<textarea class="textarea" id="sickDetails" placeholder="Optional details for the school..."></textarea></label></div><div class="panel-foot"><button class="btn primary" data-action="submit-sick-notice">Submit sick notice</button></div></section>`,
  );
}
function parentSickNoticePage() {
  const linkedLearner = parentLearner();
  const eligibleLearners = linkedLearner ? [linkedLearner] : [];
  const submitted = getState().sickNotices.filter((notice) => notice.submittedBy === userName());
  const latestId = sessionStorage.getItem("schoolshieldLastSickNotice");
  const latest = submitted.find((notice) => notice.id === latestId);
  const confirmation = latest ? `<div class="notice" style="border-left-color:#21845c;border-color:#b9e4cf"><div class="notice-icon" style="background:#eaf8f0;color:#21845c">✓</div><div class="grow"><div class="notice-top"><b>Sick notice submitted</b>${badge(latest.status)}</div><p>${latest.person} has been marked sick for ${latest.date}. The assigned teacher has been alerted and must review the notice.</p></div><button class="btn small" data-action="view-parent-sick-notice" data-sick="${latest.id}">Review submission</button></div>` : "";
  const historyRows = submitted.map((notice) => `<tr><td><b>${notice.person}</b><small>${notice.id}</small></td><td>${notice.date}</td><td>${notice.reason}</td><td>${badge(notice.status)}</td><td><button class="table-action" data-action="view-parent-sick-notice" data-sick="${notice.id}">Review</button></td></tr>`);
  const options = eligibleLearners.map((learner) => `<option>${learner.name} — ${learner.grade} ${learner.class}</option>`).join("") || '<option>No registered learner found</option>';
  return generic("Sick Notice", "Parent / guardian", "Notify the school when your learner is absent for health reasons.", `${confirmation}<section class="panel"><div class="form-grid"><label>Learner<select class="select" id="sickLearner">${options}</select></label><label>Date<input class="input" id="sickDate" type="date"></label><label>Expected return<input class="input" id="sickReturn" type="date"></label><label>Reason<select class="select" id="sickReason"><option>Illness</option><option>Medical appointment</option><option>Other</option></select></label><label class="full">Sick letter (optional)<input class="input" id="sickLetter" type="file" accept="image/*,.pdf,.doc,.docx"><small>Take a photo or attach a sick letter, medical certificate or supporting document.</small></label><label class="full">Additional information<textarea class="textarea" id="sickDetails" placeholder="Optional details for the school..."></textarea></label></div><div class="panel-foot"><button class="btn primary" data-action="submit-sick-notice">Submit sick notice</button></div></section><section class="panel"><div class="panel-head"><div><h3>Past submitted sick notices</h3><p>Track each submission and the teacher-review status.</p></div></div>${table(["Learner", "Date", "Reason", "Teacher review", ""], historyRows, "You have not submitted any sick notices yet.")}</section>`);
}
function appointments() {
  const s = getState();
  const isPrincipal = role() === "principal";
  const items = isPrincipal
    ? s.appointments.filter((appointment) => appointment.with.includes(SCHOOL.principal))
    : s.appointments;
  return generic(
    isPrincipal ? "My Appointments" : "Appointments",
    isPrincipal ? "Principal review" : "Administration",
    isPrincipal ? "Appointments set by the clerk for your review." : "Schedule and track parent, learner and staff appointments.",
    `<section class="panel">${table(
      ["Appointment", "With", "Date", "Time", "Status", ""],
      items.map(
        (a) =>
          `<tr><td><b>${a.title}</b><small>${a.id}</small></td><td>${a.with}</td><td>${a.date}</td><td>${a.time}</td><td>${badge(a.status)}</td><td><button class="table-action" data-action="manage-appointment" data-appointment="${a.id}">${isPrincipal ? "Review" : "Open"}</button></td></tr>`,
      ),
    )}</section>`,
    role() === "clerk" ? '<button class="btn primary" data-action="add-appointment">+ New appointment</button>' : "",
  );
}

/* --------------------- operational pages (visitors / incidents) ---------- */
function visitors() {
  const s = getState();
  const canManage = ["security", "clerk"].includes(role());
  const controls = canManage
    ? '<div class="action-row"><button class="btn ghost" data-action="scan">Scan QR</button><button class="btn primary" data-action="register">+ Register visitor</button></div>'
    : "";
  return shell(
    `<div class="page-intro"><div><span class="pill">Front office & gate</span><h1>Visitors</h1><p>${canManage ? "Register visitors, track campus presence and complete check-outs." : "View visitor activity and campus presence."}</p></div>${controls}</div><div class="stats-grid compact">${stat("Inside", s.visitors.filter((v) => v.status === "Inside").length, "Currently on campus")}${stat("Visits today", s.visitors.length, "All registrations")}${stat("Checked out", s.visitors.filter((v) => v.status === "Checked Out").length, "Completed visits")}</div>${searchBar("visitorSearch", "Search visitor, ID, host or purpose")}<section class="panel">${table(
      ["Visitor", "Type", "Host", "Purpose", "Check-in", "Check-out", "Status", ""],
      s.visitors.map(
        (v) =>
          `<tr class="visitor-row"><td><b>${v.name}</b><small>${v.id}</small></td><td>${v.type}</td><td>${v.host}</td><td>${v.purpose}</td><td>${v.in}</td><td>${v.out}</td><td>${badge(v.status)}</td><td><button class="table-action" data-visitor="${v.id}">View</button>${canManage ? `<button class="table-action" data-action="generate-visitor-qr" data-visitor="${v.id}">QR pass</button>` : ""}${canManage && v.status === "Inside" ? `<button class="table-action" data-action="checkout-visitor" data-visitor="${v.id}">Check out</button>` : ""}</td></tr>`,
      ),
    )}</section>`,
    "Visitors",
  );
}
function incidents() {
  const s = getState();
  return shell(
    `<div class="page-intro"><div><span class="pill">Safety management</span><h1>Incidents</h1><p>Record, investigate, escalate and close school safety incidents.</p></div><div class="action-row"><button class="btn ghost" data-action="download-incidents">Download incident report</button>${role() !== "sgb" ? '<button class="btn primary" data-action="incident">+ Report incident</button>' : ""}</div></div>${searchBar("incidentSearch", "Search incident ID, location or description")}<section class="panel">${table(
      [
        "Incident",
        "Date & time",
        "Category",
        "Location",
        "Priority",
        "Status",
        "Officer",
        "",
      ],
      s.incidents.map(
        (i) =>
          `<tr class="incident-row"><td><b>${i.id}</b></td><td>${i.date}<small>${i.time}</small></td><td>${i.category}</td><td>${i.location}</td><td>${badge(i.priority)}</td><td>${badge(i.status)}</td><td>${i.officer}</td><td><button class="table-action" data-action="view-incident" data-incident="${i.id}">Open</button></td></tr>`,
      ),
    )}</section>`,
    "Incidents",
  );
}
function notifications() {
  const s = getState();
  const visible = notificationsForRole();
  return shell(
    `<div class="page-intro"><div><span class="pill">Alerts & communication</span><h1>Notification centre</h1><p>${visible.filter((notice) => !notice.read).length} unread · Open an alert for full details and follow-up.</p></div><button class="btn ghost" id="markRead">Mark all read</button></div><section class="panel"><div class="form-grid"><label>Type<select class="select"><option>All types</option><option>System</option><option>Security</option><option>Emergency</option></select></label><label>Priority<select class="select"><option>All priority</option><option>Critical</option><option>High</option><option>Medium</option></select></label><label>Period<select class="select"><option>Any date</option><option>Today</option><option>This week</option></select></label></div></section><div class="notice-stack">${visible.map((n) => `<button class="notice ${n.read ? "read" : ""}" data-action="view-notification" data-notification="${n.id}"><div class="notice-icon">${n.priority === "Critical" ? "!" : "🔔"}</div><div class="grow"><div class="notice-top"><b>${n.title}</b>${badge(n.priority)}</div><p>${n.description}</p><small>${n.category} · ${notificationTime(n)} · ${n.read ? "Read" : "Unread"}</small></div></button>`).join("") || '<p class="empty">No alerts for your learner or the whole school.</p>'}</div>`,
    "Notifications",
  );
}
/* ------------------------------- interactions ---------------------------- */
function modal(title, body) {
  const el = document.createElement("div");
  el.className = "modal-backdrop";
  el.innerHTML = `<div class="modal" style="max-height:90vh;display:flex;flex-direction:column"><div class="modal-head"><h3>${title}</h3><button class="close">×</button></div><div class="modal-body" style="overflow-y:auto;max-height:calc(90vh - 70px)">${body}</div></div>`;
  document.body.appendChild(el);
  $$('[data-action]', el).forEach(
    (button) => (button.onclick = () => action(button.dataset.action, button)),
  );
  el.querySelector(".close").onclick = () => el.remove();
  el.onclick = (e) => {
    if (e.target === el) el.remove();
  };
}
function visitorModal(id) {
  const v = getState().visitors.find((x) => x.id === id);
  if (!v) return;
  modal(
    v.name,
    `<p class="muted">${isLeadership() ? "Read-only visitor record for school leadership." : "Visitor registration record."}</p><div class="detail-grid"><div><small>Visitor ID</small><b>${v.id}</b></div><div><small>Visitor type</small><b>${v.type}</b></div><div><small>Identification</small><b>${v.identificationType || "Not captured"} · ${v.identity || "—"}</b></div><div><small>Person being visited</small><b>${v.host}</b></div><div><small>Department</small><b>${v.department || "—"}</b></div><div><small>Purpose</small><b>${v.purpose}</b></div><div><small>Date</small><b>${v.date || "—"}</b></div><div><small>Check-in / check-out</small><b>${v.in} · ${v.out}</b></div><div><small>Expected check-out</small><b>${v.expectedOut || "—"}</b></div><div><small>Vehicle</small><b>${v.vehicle || "—"}</b></div><div><small>Registered by</small><b>${v.registeredBy || "—"}</b></div><div><small>Processed by</small><b>${v.processedBy || "—"}</b></div></div>`,
  );
}
function todayLabel() {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const d = new Date();
  return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
}
function notificationTimestamp() {
  return new Date().toISOString();
}
function notificationTime(notice) {
  const created = notice?.createdAt ? new Date(notice.createdAt) : null;
  if (!created || Number.isNaN(created.getTime())) return notice?.time || "No time recorded";
  const seconds = Math.max(0, Math.floor((Date.now() - created.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  if (seconds < 172800) return "Yesterday";
  return created.toLocaleDateString([], { day: "numeric", month: "short", year: created.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/* ------------------------------- downloads ------------------------------- */
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function downloadHtmlFile(filename, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function downloadAttendanceWeek(classId, weekStart) {
  const start = new Date(weekStart + "T00:00:00");
  const dates = Array.from({ length: 6 }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
  const labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const rows = learnersInClass(classId).map((learner) => [learner.name, ...dates.map((date) => attendanceRegisterFor(classId, date)?.entries?.[learner.id] || "Present")].join(","));
  downloadTextFile(`${classId}-attendance-${weekStart}.csv`, ["Learner," + labels.join(","), ...rows].join("\n"));
}
function learnerSickNotices(learner) {
  return getState().sickNotices.filter((notice) => notice.person === learner.name);
}
function reportTerms() {
  const active = Number(String(TERM).replace(/\D/g, "")) || 1;
  return Array.from({ length: Math.min(4, active) }, (_, index) => `Term ${index + 1}`);
}
function reportMark(learner, subject, term) {
  const current = assessmentsForClass(learner.class).find((assessment) => assessment.subject === subject && assessment.term === term);
  if (current && current.scores?.[learner.id] !== undefined) return current.scores[learner.id];
  const subjectOffset = Array.from(subject).reduce((total, char) => total + char.charCodeAt(0), 0) % 13;
  const termOffset = Number(String(term).replace(/\D/g, "")) * 3;
  return Math.max(30, Math.min(100, learner.average + subjectOffset - 7 + termOffset));
}
function achievementLevel(mark) {
  if (mark >= 80) return 7;
  if (mark >= 70) return 6;
  if (mark >= 60) return 5;
  if (mark >= 50) return 4;
  if (mark >= 40) return 3;
  if (mark >= 30) return 2;
  return 1;
}
function learnerReportMarkup(learner) {
  const classInfo = classById(learner.class);
  const terms = reportTerms();
  const gradeNumber = Number(String(learner.grade).replace(/\D/g, ""));
  const subjects = gradeNumber <= 9 ? SUBJECTS_BY_PHASE.junior : SUBJECTS_BY_PHASE.senior;
  const sick = learnerSickNotices(learner);
  const headers = terms.map((term) => `<th colspan="2">${term}</th>`).join("");
  const subHeaders = terms.map(() => "<th>Mark %</th><th>Level</th>").join("");
  const subjectRows = subjects.map((subject) => `<tr><td>${subject}</td>${terms.map((term) => { const mark = reportMark(learner, subject, term); return `<td>${mark}</td><td>${achievementLevel(mark)}</td>`; }).join("")}</tr>`).join("");
  const averages = terms.map((term) => Math.round(mean(subjects.map((subject) => reportMark(learner, subject, term)))));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${learner.name} ${TERM} report</title><style>body{font-family:Arial,sans-serif;color:#102d35;margin:36px;line-height:1.35}.report{max-width:1000px;margin:auto;border:1px solid #b8c8cc;padding:26px}.head{display:flex;justify-content:space-between;border-bottom:3px solid #087550;padding-bottom:17px}.brand{font-size:25px;font-weight:800;color:#087550}.stamp{width:82px;height:82px;border:3px double #087550;border-radius:50%;display:grid;place-items:center;text-align:center;color:#087550;font-size:11px;font-weight:800}.small{font-size:12px;color:#52686e}.learner{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0}.box{border:1px solid #d4e0e3;padding:10px;background:#f8fbfb}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #9eafb4;padding:7px;text-align:center}th{background:#e9f4ef}td:first-child{text-align:left;font-weight:700}.remarks{min-height:72px;border:1px solid #9eafb4;padding:12px;margin-top:15px}.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:35px;margin-top:42px}.sign div{border-top:1px solid #334; padding-top:6px;font-size:12px}@media print{body{margin:0}.report{border:0}}</style></head><body><main class="report"><div class="head"><div><div class="brand">${SCHOOL.name}</div><div class="small">Academic term report · ${SCHOOL.code}</div><div class="small">Generated ${todayLabel()}</div></div><div class="stamp">SCHOOL<br>OFFICIAL<br>STAMP</div></div><section class="learner"><div class="box"><b>Learner</b><br>${learner.name} · ${learner.id}<br>Parent / guardian: ${learner.parent}</div><div class="box"><b>Grade / class</b><br>${learner.grade} · ${learner.class}<br>Class teacher: ${classInfo.teacher}</div><div class="box"><b>Attendance</b><br>${learner.attendance}% · ${daysAbsent(learner)} days absent</div><div class="box"><b>Report period</b><br>${terms.join(" · ")} · 2026<br>Status: ${standingFor(learner)}</div></section><table><thead><tr><th rowspan="2">Subject</th>${headers}</tr><tr>${subHeaders}</tr></thead><tbody>${subjectRows}<tr><td>Average</td>${averages.map((average) => `<td>${average}</td><td>${achievementLevel(average)}</td>`).join("")}</tr></tbody></table><section class="remarks"><b>General remarks</b><br>${learner.average >= 50 ? "Steady progress. Continue with consistent preparation and attendance." : "Additional support and regular practice are recommended."}<br><span class="small">Sick notices recorded this term: ${sick.length ? sick.map((notice) => `${notice.date} (${notice.reason})`).join(", ") : "None"}.</span></section><section class="sign"><div>Class teacher signature</div><div>Principal signature</div><div>Parent / guardian acknowledgement</div></section><p class="small">Achievement levels: 1 = 0–29 · 2 = 30–39 · 3 = 40–49 · 4 = 50–59 · 5 = 60–69 · 6 = 70–79 · 7 = 80–100</p></main></body></html>`;
}
let pdfLibraryPromise;
function loadPdfLibrary() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (pdfLibraryPromise) return pdfLibraryPromise;
  pdfLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    script.onload = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error("PDF library unavailable"));
    script.onerror = () => reject(new Error("Could not load PDF library"));
    document.head.appendChild(script);
  });
  return pdfLibraryPromise;
}

async function downloadPdf(filename, title, lines) {
  try {
    const JsPdf = await loadPdfLibrary();
    const documentPdf = new JsPdf({ unit: "mm", format: "a4" });
    const margin = 16, width = 178, pageBottom = 280;
    let y = 18;
    documentPdf.setFont("helvetica", "bold");
    documentPdf.setFontSize(16); documentPdf.text(SCHOOL.name, margin, y); y += 9;
    documentPdf.setFontSize(12); documentPdf.text(title, margin, y); y += 10;
    documentPdf.setDrawColor(8, 117, 80); documentPdf.line(margin, y, margin + width, y); y += 8;
    documentPdf.setFont("helvetica", "normal"); documentPdf.setFontSize(10);
    lines.forEach((line) => {
      const wrapped = documentPdf.splitTextToSize(String(line), width);
      if (y + wrapped.length * 5 > pageBottom) { documentPdf.addPage(); y = 18; }
      documentPdf.text(wrapped, margin, y); y += wrapped.length * 5 + 2;
    });
    documentPdf.save(filename);
  } catch (error) { alert("The PDF could not be created. Please check your internet connection and try again."); }
}

function historyReportDetails(learnerId) {
  const learner = learnerById(learnerId), grade = inputValue("historyGrade"), selectedTerm = Number(inputValue("historyTerm"));
  if (!learner || !grade || !selectedTerm) return null;
  const terms = Array.from({ length: selectedTerm }, (_, index) => `Term ${index + 1}`);
  const subjects = Number(grade) <= 9 ? SUBJECTS_BY_PHASE.junior : SUBJECTS_BY_PHASE.senior;
  const lines = [`Learner: ${learner.name} (${learner.id})`, `Grade ${grade} · 2026`, `Included: ${terms.join(", ")}`, "", "Subject performance"];
  subjects.forEach((subject, index) => lines.push(`${subject} — ${terms.map((term, termIndex) => `${term}: ${Math.min(100, Math.max(35, learner.average + ((index * 7 + termIndex * 3) % 17) - 8))}%`).join(" · ")}`));
  lines.push("", `Attendance: ${learner.attendance}%`, `Current standing: ${standingFor(learner)}`);
  return { learner, grade, selectedTerm, lines };
}

async function downloadReport(classId, learnerId) {
  const report = reportForClass(classId);
  const pupil = learnerId ? learnerById(learnerId) : null;
  const classInfo = classById(classId);
  if (!report) return;
  if (pupil) {
    const reportLines = [`Learner: ${pupil.name} (${pupil.id})`, `Grade / class: ${pupil.grade} · ${pupil.class}`, `Class teacher: ${classInfo.teacher}`, `Attendance: ${pupil.attendance}%`, `Overall average: ${pupil.average}%`, `Standing: ${standingFor(pupil)}`, "", "Assessments:"];
    assessmentsForClass(classId).forEach((assessment) => reportLines.push(`${assessment.subject} ${assessment.title}: ${assessment.scores?.[pupil.id] ?? "Not captured"}%`));
    await downloadPdf(`${pupil.id}-${TERM.toLowerCase().replace(/\s+/g, "-")}-report.pdf`, `${report.term} learner report`, reportLines);
    return;
  }
  const lines = [
    SCHOOL.name + " — " + report.term + " learner report",
    "=================================================",
    pupil
      ? "Learner: " + pupil.name + " (" + pupil.id + ")"
      : "Class: " + classId,
    "Grade / class: " + classInfo.grade + " · " + classId,
    "Class teacher: " + classInfo.teacher,
    "Status: " + flowStep(report.status).label,
    "Finalised: " + (report.finalisedOn || "—"),
    "Published: " + (report.publishedOn || "—"),
    "",
  ];
  if (pupil) {
    lines.push(
      "Attendance: " + pupil.attendance + "%",
      "Overall average: " + pupil.average + "%",
      "Standing: " + standingFor(pupil),
      "",
      "Assessments:",
    );
    assessmentsForClass(classId).forEach((a) => {
      const score =
        a.scores && a.scores[pupil.id] !== undefined
          ? a.scores[pupil.id] + "%"
          : "Not captured";
      lines.push(
        "  - " +
          a.subject +
          " " +
          a.title +
          ": " +
          score +
          " (class average " +
          assessmentAverage(a) +
          "%)",
      );
    });
  } else {
    lines.push(
      "Class average: " + classStats(classId).courseAverage + "%",
      "Attendance: " + classStats(classId).attendance + "%",
      "Pass rate: " + classStats(classId).passRate + "%",
    );
  }
  await downloadPdf(
    (pupil ? pupil.id : "class-" + classId) +
      "-" +
      report.term.toLowerCase().replace(/\s+/g, "-") +
      "-report.pdf",
    `${report.term} class report`,
    lines,
  );
}
function previewLearnerReport(classId, learnerId) {
  const learner = learnerById(learnerId);
  if (!learner || learner.class !== classId) return;
  const source = encodeURIComponent(learnerReportMarkup(learner));
  modal(`${learner.name} — report preview`, `<p class="muted">This is the report that will be sent only to ${learner.parent}, the learner’s registered parent / guardian, after teacher release.</p><iframe title="Learner report preview" src="data:text/html;charset=utf-8,${source}" style="width:100%;height:68vh;border:1px solid #dce6e8;border-radius:8px;background:white"></iframe><div class="modal-foot"><button class="btn primary" data-action="download-report" data-class="${classId}" data-learner="${learnerId}">Download learner report</button></div>`);
}

async function downloadHistory(learnerId) {
  const selected = historyReportDetails(learnerId);
  if (!selected) return;
  await downloadPdf(`${selected.learner.id}-grade-${selected.grade}-term-${selected.selectedTerm}-report-history.pdf`, "Academic report history", selected.lines);
  return;
  const learner = learnerById(learnerId);
  const grade = inputValue("historyGrade");
  const selectedTerm = Number(inputValue("historyTerm"));
  if (!learner || !grade || !selectedTerm) return;
  const terms = Array.from({ length: selectedTerm }, (_, index) => `Term ${index + 1}`);
  const subjects = Number(grade) <= 9 ? SUBJECTS_BY_PHASE.junior : SUBJECTS_BY_PHASE.senior;
  const lines = [SCHOOL.name, "Academic report history", `Learner: ${learner.name} (${learner.id})`, `Grade ${grade} · 2026`, `Included: ${terms.join(", ")}`, "", "Subject performance"];
  subjects.forEach((subject, index) => {
    const results = terms.map((term, termIndex) => `${term}: ${Math.min(100, Math.max(35, learner.average + ((index * 7 + termIndex * 3) % 17) - 8))}%`).join(" · ");
    lines.push(`${subject} — ${results}`);
  });
  lines.push("", `Attendance: ${learner.attendance}%`, `Current standing: ${standingFor(learner)}`);
  downloadTextFile(`${learner.id}-grade-${grade}-term-${selectedTerm}-report-history.txt`, lines.join("\n"));
}
function viewHistory(learnerId) {
  const selected = historyReportDetails(learnerId);
  if (!selected) return;
  modal(`${selected.learner.name} — selected report`, `<div style="white-space:pre-wrap;line-height:1.7;padding:6px">${selected.lines.join("\n")}</div><div class="modal-foot"><button class="btn primary" data-action="download-history" data-learner="${learnerId}">Download PDF</button></div>`);
}
function downloadIncidentReport() {
  const incidents = getState().incidents;
  const lines = [`${SCHOOL.name} — Incident report`, `Generated ${todayLabel()} · ${incidents.length} incident(s) · Average response 4.8 hrs`, "", "Incident Number | Date | Time | Category | Priority | Location | Reported By | Status | Description | Action Taken"];
  incidents.forEach((incident) => lines.push([incident.id, incident.date, incident.time, incident.category, incident.priority, incident.location, incident.reporter || incident.officer, incident.status, incident.description, incident.immediateAction || "—"].join(" | ")));
  downloadTextFile(`schoolshield-incident-report-${todayLabel().replace(/\s/g, "-")}.txt`, lines.join("\n"));
}

/* -------------------------------- actions -------------------------------- */
function action(type, el) {
  const classId = el && el.dataset.class;
  const learnerId = el && el.dataset.learner;
  if (type === "register")
    modal(
      "Register visitor",
      `<p class="muted">Captured ${todayLabel()} by ${userName()}. ID numbers are validated and duplicate same-day registrations are blocked.</p><div class="form-grid"><label>Full name<input class="input" id="visitorName" placeholder="Full name"></label><label>Identification type<select class="select" id="visitorIdType"><option>South African ID</option><option>Passport</option><option>Driving licence</option></select></label><label>Identification number<input class="input" id="visitorIdentity" placeholder="ID / passport number"></label><label>Cell phone number<input class="input" id="visitorPhone" placeholder="082 000 0000"></label><label>Email address (optional)<input class="input" id="visitorEmail" type="email"></label><label>Company / organisation (optional)<input class="input" id="visitorCompany"></label><label>Visitor type<select class="select" id="visitorType"><option value="">Select type</option><option>Parent</option><option>Visitor</option><option>Service Provider</option><option>Contractor</option></select></label><label>Purpose of visit<input class="input" id="visitorPurpose"></label><label>Person being visited<input class="input" id="visitorHost"></label><label>Department<select class="select" id="visitorDepartment"><option>Administration</option><option>Senior Phase</option><option>Security</option><option>School management</option></select></label><label>Vehicle registration (optional)<input class="input" id="visitorVehicle"></label><label>Expected check-out time<input class="input" id="visitorExpectedOut" type="time"></label><label>Visitor photo<input class="input" id="visitorPhoto" type="file" accept="image/*"></label><label>Identification document (optional)<input class="input" id="visitorDocument" type="file" accept="image/*,.pdf"></label></div><div class="modal-foot"><button class="btn primary" data-action="save-visitor">Save visitor</button></div>`,
    );
  else if (type === "incident")
    modal(
      "Report incident",
      `<p class="muted">A new incident ID is issued automatically and the administrator is notified immediately.</p><div class="form-grid"><label>Date<input class="input" id="incidentDate" type="date"></label><label>Time<input class="input" id="incidentTime" type="time"></label><label>Location<input class="input" id="incidentLocation" placeholder="Location"></label><label>Category<select class="select" id="incidentCategory"><option>Suspicious Person</option><option>Suspicious Vehicle</option><option>Safety</option><option>Medical</option><option>Security</option><option>Behaviour</option></select></label><label>Priority<select class="select" id="incidentPriority"><option>High</option><option>Low</option><option>Medium</option><option>Critical</option></select></label><label>Security officer<select class="select" id="incidentOfficer">${getState().security.map((officer) => `<option>${officer.name}</option>`).join("")}</select></label><label>Persons involved<input class="input" id="incidentPeople"></label><label>Linked visitor (optional)<select class="select" id="incidentVisitor"><option value="">None</option>${getState().visitors.map((visitor) => `<option value="${visitor.id}">${visitor.name}</option>`).join("")}</select></label><label>Learner (optional)<select class="select" id="incidentLearner"><option value="">None</option>${learners().map((learner) => `<option value="${learner.id}">${learner.name}</option>`).join("")}</select></label><label>Staff member (optional)<select class="select" id="incidentStaff"><option value="">None</option>${getState().staff.map((staff) => `<option>${staff.name}</option>`).join("")}</select></label><label>CCTV reference (optional)<input class="input" id="incidentCctv"></label><label class="full">Full description<textarea class="textarea" id="incidentDescription" placeholder="Describe the incident..."></textarea></label><label class="full">Immediate action taken<textarea class="textarea" id="incidentAction"></textarea></label><label class="full">Additional notes (optional)<textarea class="textarea" id="incidentNotes"></textarea></label><label class="full">Photos & documents<input class="input" id="incidentFiles" type="file" multiple></label></div><div class="modal-foot"><button class="btn primary" data-action="save-incident">Submit incident</button></div>`,
    );
  else if (type === "scan")
    modal(
      "Gate QR scanner",
      `<p class="muted">Scan a visitor-pass QR code or enter the visitor ID to record check-in and check-out automatically.</p><div class="scan-box" style="border:1px dashed #75aef7;background:#f1f7ff;border-radius:14px;padding:28px"><div class="qr" style="font-size:64px;color:#1468d4">⌗</div><b>Waiting for a scan…</b><p>Camera scanning is represented in this prototype. Use the ID field below.</p></div><div class="form-grid"><label class="full">Visitor ID or QR payload<input class="input" id="scanVisitorId" placeholder="e.g. VIS-1042 or SCHOOLSHIELD:VIS-1042"></label></div><div class="modal-foot"><button class="btn primary" data-action="process-visitor-scan">⌗ Scan visitor</button></div><section class="panel"><div class="panel-head"><div><h3>Currently on campus</h3></div></div>${getState().visitors.filter((visitor) => visitor.status === "Inside").map((visitor) => `<div class="report-row"><span><b>${visitor.name}</b><small>${visitor.id}</small></span><button class="btn small" data-action="checkout-visitor" data-visitor="${visitor.id}">Check out</button></div>`).join("") || '<p class="muted">No visitors currently on campus.</p>'}</section>`,
    );
  else if (type === "process-visitor-scan") processVisitorScan();
  else if (type === "generate-visitor-qr") generateVisitorQr(el.dataset.visitor);
  else if (type === "download-visitor-qr") downloadVisitorQr(el.dataset.visitor);
  else if (type === "view-learner")
    go("class-records.html?class=" + classId + "&learner=" + learnerId);
  else if (type === "download-report") downloadReport(classId, learnerId);
  else if (type === "preview-learner-report") previewLearnerReport(classId, learnerId);
  else if (type === "download-history") downloadHistory(el.dataset.learner);
  else if (type === "view-history") viewHistory(el.dataset.learner);
  else if (type === "download-incidents") downloadIncidentReport();
  else if (type === "go-test-scores") go("test-scores.html?class=" + classId);
  else if (type === "submit-marks") saveTestScores(classId, "teacher");
  else if (type === "update-scores") saveTestScores(classId, "clerk", el.dataset.assessment);
  else if (type === "save-attendance") saveAttendance(classId);
  else if (type === "open-attendance-day") go(`attendance-register.html?class=${classId}&date=${inputValue("attendanceDate") || new Date().toISOString().slice(0, 10)}`);
  else if (type === "save-daily-attendance") saveDailyAttendance(classId);
  else if (type === "delete-daily-attendance") deleteDailyAttendance(classId, el.dataset.date);
  else if (type === "submit-daily-week") submitDailyWeek(classId, el.dataset.week);
  else if (type === "save-weekly-attendance") saveWeeklyAttendance(classId, el.dataset.week);
  else if (type === "download-attendance-week") downloadAttendanceWeek(classId, el.dataset.week);
  else if (type === "add-assessment") addAssessment(classId);
  else if (type === "assign-teacher") assignTeacher();
  else if (type === "submit-teacher-assignment") submitTeacherAssignment();
  else if (type === "approve-teacher-assignment") approveTeacherAssignment(el.dataset.assignment);
  else if (type === "approve-account-request") approveAccountRequest(el.dataset.request, el.dataset.delivery || "email");
  else if (type === "reject-account-request") rejectAccountRequest(el.dataset.request);
  else if (type === "refresh-account-requests") loadAccountRequests();
  else if (type === "refresh-parent-workspace") refreshCloudWorkspace(true);
  else if (type === "close-modal") el.closest(".modal-backdrop")?.remove();
  else if (type === "save-assessment") saveAssessment();
  else if (type === "request-report")
    {
      persist((state) => {
        state.reportRequests = state.reportRequests || [];
        const existing = state.reportRequests.find(
          (request) => request.class === classId,
        );
        if (!existing)
          state.reportRequests.unshift({
            id: "REQ-" + Date.now().toString().slice(-6),
            class: classId,
            requestedBy: userName(),
            requestedOn: todayLabel(),
          });
      });
      modal(
        "Class report requested",
        `<p>A compiled ${TERM} report for class <b>${classId}</b> has been added to the clerk's request queue. The clerk will compile the individual learner reports and return them to the class teacher for finalisation.</p>`,
      );
    }
  else if (type === "compile-report") setReportStatus(classId, "compiled");
  else if (type === "review-learner-report") reviewLearnerReport(classId, learnerId);
  else if (type === "release-learner-report") releaseLearnerReport(classId, learnerId);
  else if (type === "finalise-report") setReportStatus(classId, "finalised");
  else if (type === "publish-report") setReportStatus(classId, "published");
  else if (type === "send-announcement") sendAnnouncement();
  else if (type === "open-chat") go(el.dataset.url);
  else if (type === "send-message") sendMessage(el.dataset.store, el.dataset.chat, el.dataset.sender);
  else if (type === "add-learner")
    modal(
      "Add learner",
      `<div class="form-grid"><label>Full name<input class="input" id="learnerName" placeholder="Learner full name"></label><label>Class<select class="select" id="learnerClass">${classes()
        .map((c) => `<option value="${c.id}">${c.grade} · ${c.id}</option>`)
        .join(
          "",
        )}</select></label><label>Parent / guardian<input class="input" id="learnerParent" placeholder="Parent name"></label><label>Relationship<select class="select" id="learnerRelation"><option>Mother</option><option>Father</option><option>Guardian</option></select></label></div><div class="modal-foot"><button class="btn primary" data-action="save-learner">Save learner</button></div>`,
    );
  else if (type === "add-staff")
    modal(
      "Add staff member",
      `<div class="form-grid"><label>Full name<input class="input" id="staffName"></label><label>Role<select class="select" id="staffRole"><option>Teacher</option><option>Clerk</option><option>Security Officer</option></select></label><label>Department<input class="input" id="staffDepartment"></label></div><div class="modal-foot"><button class="btn primary" data-action="save-staff">${role() === "clerk" ? "Submit for dual approval" : "Save staff member"}</button></div>`,
    );
  else if (type === "add-appointment")
    modal(
      "New appointment",
      `<div class="form-grid"><label>Appointment title<input class="input" id="appointmentTitle" placeholder="Parent meeting"></label><label>With<select class="select" id="appointmentWith"><option value="${SCHOOL.principal}">Principal — ${SCHOOL.principal}</option><option value="Deputy Principal — Mr Naidoo">Deputy Principal — Mr Naidoo</option><option value="Parent / guardian">Parent / guardian</option><option value="Staff member">Staff member</option></select></label><label>Date<input class="input" id="appointmentDate" type="date"></label><label>Time<input class="input" id="appointmentTime" type="time"></label></div><div class="modal-foot"><button class="btn primary" data-action="save-appointment">Save appointment</button></div>`,
    );
  else if (type === "save-visitor") saveVisitor();
  else if (type === "save-incident") saveIncident();
  else if (type === "save-learner") saveLearner();
  else if (type === "save-staff") saveStaff();
  else if (type === "approve-staff-change") approveStaffChange(el.dataset.staffChange);
  else if (type === "manage-staff") manageStaffRecord(el.dataset.staff, [...el.closest("tbody").querySelectorAll('[data-action="manage-staff"]')].indexOf(el));
  else if (type === "manage-parent") manageParent(el.dataset.learner);
  else if (type === "save-parent") saveParent(el.dataset.learner);
  else if (type === "save-staff-changes") saveStaffChanges(el.dataset.staff, el.dataset.staffIndex);
  else if (type === "save-appointment") saveAppointment();
  else if (type === "submit-sick-notice") saveSickNotice();
  else if (type === "checkout-visitor") checkoutVisitor(el.dataset.visitor);
  else if (type === "view-notification") viewNotification(el.dataset.notification);
  else if (type === "view-incident") viewIncident(el.dataset.incident);
  else if (type === "add-incident-response") addIncidentResponse(el.dataset.incident);
  else if (type === "resolve-incident") resolveIncident(el.dataset.incident);
  else if (type === "comment-notification") commentNotification(el.dataset.notification);
  else if (type === "manage-officer") manageOfficer(el.dataset.officer);
  else if (type === "add-officer") addOfficer();
  else if (type === "save-officer-new") saveNewOfficer();
  else if (type === "save-officer") saveOfficer(el.dataset.officer);
  else if (type === "view-sick-notice") viewSickNotice(el.dataset.sick);
  else if (type === "view-parent-sick-notice") viewParentSickNotice(el.dataset.sick);
  else if (type === "review-sick-notice") reviewSickNotice(el.dataset.sick);
  else if (type === "manage-announcement") manageAnnouncement(el.dataset.announcement);
  else if (type === "save-announcement") saveAnnouncement(el.dataset.announcement);
  else if (type === "delete-announcement") deleteAnnouncement(el.dataset.announcement);
  else if (type === "manage-appointment") manageAppointment(el.dataset.appointment);
  else if (type === "choose-appointment-slot") chooseAppointmentSlot(el.dataset.appointment);
  else if (type === "confirm-appointment-slot") confirmAppointmentSlot(el.dataset.appointment);
  else if (type === "set-appointment-status") setAppointmentStatus(el.dataset.appointment, el.dataset.status);
  else if (type === "filter")
    modal(
      "Search filters",
      '<p class="muted">Use the search field above to narrow the displayed records by name, class, grade, parent, ID or status.</p>',
    );
  else
    modal(
      "Quick action",
      '<p class="muted">This action is available in your role workspace.</p>',
    );
}
function alertToast() {
  const latest = notificationsForRole().find((notice) => !notice.read && ["Critical", "High"].includes(notice.priority));
  if (!latest) return "";
  return `<button class="incident-toast" style="width:100%;border:0;background:#fff0f1;color:#18323a;display:flex;align-items:center;gap:11px;padding:10px 38px;text-align:left;cursor:pointer;border-bottom:1px solid #f3c9ce" data-action="view-notification" data-notification="${latest.id}"><span style="width:23px;height:23px;border-radius:50%;background:#d83d49;color:#fff;display:grid;place-items:center;font-weight:800">!</span><div><b>${latest.title}</b><small style="display:block;margin-top:2px">${latest.description}</small></div><em style="margin-left:auto;color:#d83d49;font-size:9px;font-style:normal;font-weight:800">View alert →</em></button>`;
}
function notificationsForRole() {
  const notices = getState().notifications;
  if (["principal", "deputy"].includes(role())) return notices.filter((notice) => notice.scope !== "teacher");
  if (role() === "teacher") return notices.filter((notice) => notice.scope !== "leadership" && (notice.scope !== "teacher" || notice.recipient === userName()));
  if (role() !== "parent") return notices.filter((notice) => notice.scope !== "teacher" && notice.scope !== "leadership");
  const child = parentLearner();
  return notices.filter(
    (notice) => (notice.scope === "parents" && (!notice.class || (child && notice.class === child.class))) || notice.scope === "whole-school" || (child && notice.learnerId === child.id),
  );
}

function inputValue(id) {
  return ($("#" + id)?.value || "").trim();
}
function finishForm() {
  $$(".modal-backdrop").forEach((el) => el.remove());
  render();
}
function requireValues(values) {
  if (values.every(Boolean)) return true;
  modal("Missing information", '<p class="muted">Complete all required fields before saving.</p>');
  return false;
}
function saveVisitor() {
  const name = inputValue("visitorName");
  const host = inputValue("visitorHost");
  const purpose = inputValue("visitorPurpose");
  const identity = inputValue("visitorIdentity");
  const type = inputValue("visitorType");
  if (!requireValues([name, host, purpose, identity, type])) return;
  if (inputValue("visitorIdType") === "South African ID" && !/^\d{13}$/.test(identity)) {
    modal("Invalid South African ID", '<p class="muted">Enter a valid 13-digit South African ID number.</p>');
    return;
  }
  if (getState().visitors.some((visitor) => visitor.identity === identity && visitor.date === todayLabel())) {
    modal("Duplicate visitor", '<p class="muted">This identity has already been registered today.</p>');
    return;
  }
  persist((state) =>
    state.visitors.unshift({
      id: "VIS-" + Date.now().toString().slice(-4),
      name,
      host,
      purpose,
      in: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      out: "—",
      status: "Inside",
      type,
      identity,
      identificationType: inputValue("visitorIdType"),
      phone: inputValue("visitorPhone"),
      email: inputValue("visitorEmail"),
      company: inputValue("visitorCompany"),
      department: inputValue("visitorDepartment"),
      vehicle: inputValue("visitorVehicle"),
      expectedOut: inputValue("visitorExpectedOut"),
      date: todayLabel(),
      registeredBy: userName(),
      processedBy: userName(),
    }),
  );
  finishForm();
}
function saveIncident() {
  const location = inputValue("incidentLocation");
  const description = inputValue("incidentDescription");
  if (!requireValues([location, description])) return;
  persist((state) => {
    const id = "INC-" + Date.now().toString().slice(-6);
    state.incidents.unshift({
      id,
      date: inputValue("incidentDate") || todayLabel(),
      time: inputValue("incidentTime") || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      category: inputValue("incidentCategory"),
      location,
      priority: inputValue("incidentPriority"),
      status: "Open",
      officer: inputValue("incidentOfficer") || userName(),
      reporter: userName(),
      description,
      people: inputValue("incidentPeople"),
      visitorId: inputValue("incidentVisitor"),
      learnerId: inputValue("incidentLearner"),
      staff: inputValue("incidentStaff"),
      cctv: inputValue("incidentCctv"),
      immediateAction: inputValue("incidentAction"),
      notes: inputValue("incidentNotes"),
      comments: [],
      audit: [{ action: "Created", author: userName(), date: todayLabel(), time: inputValue("incidentTime") || "Now" }],
    });
    state.notifications.unshift({
      id: "NTF-" + Date.now().toString().slice(-6),
      incidentId: id,
      createdAt: notificationTimestamp(),
      category: "Incident",
      scope: "system",
      priority: inputValue("incidentPriority"),
      title: `${inputValue("incidentCategory")} incident reported`,
      description: `${location}: ${description}`,
      reporter: userName(),
      read: false,
      comments: [],
    });
  });
  finishForm();
}
function saveLearner() {
  const name = inputValue("learnerName");
  const parent = inputValue("learnerParent");
  const classId = inputValue("learnerClass");
  const schoolClass = classById(classId);
  if (!requireValues([name, parent, classId]) || !schoolClass) return;
  persist((state) =>
    state.learners.push({
      id: "STU-" + Date.now().toString().slice(-6),
      name,
      grade: schoolClass.grade,
      class: classId,
      parent,
      relation: inputValue("learnerRelation"),
      phone: "Not captured",
      attendance: 0,
      average: 0,
      status: "Active",
    }),
  );
  finishForm();
}
function saveStaff() {
  const name = inputValue("staffName");
  const staffRole = inputValue("staffRole");
  const department = inputValue("staffDepartment");
  if (!requireValues([name, staffRole, department])) return;
  const proposed = { id: "EMP-" + Date.now().toString().slice(-5), name, role: staffRole, department, status: "Active" };
  if (role() === "clerk") return submitStaffChange("add", proposed);
  persist((state) => state.staff.push(proposed));
  finishForm();
}
function manageParent(learnerId) {
  const learner = learnerById(learnerId);
  if (!learner) return;
  modal("Manage parent / guardian", `<div class="form-grid"><label>Parent / guardian name<input class="input" id="editParentName" value="${learner.parent}"></label><label>Relationship<select class="select" id="editParentRelation"><option ${learner.relation === "Mother" ? "selected" : ""}>Mother</option><option ${learner.relation === "Father" ? "selected" : ""}>Father</option><option ${learner.relation === "Guardian" ? "selected" : ""}>Guardian</option></select></label><label>Cell phone<input class="input" id="editParentPhone" value="${learner.phone || ""}"></label></div><div class="modal-foot"><button class="btn primary" data-action="save-parent" data-learner="${learnerId}">Save parent record</button></div>`);
}
function saveParent(learnerId) {
  persist((state) => {
    const learner = state.learners.find((item) => item.id === learnerId);
    if (!learner) return;
    learner.parent = inputValue("editParentName");
    learner.relation = inputValue("editParentRelation");
    learner.phone = inputValue("editParentPhone");
  });
  finishForm();
}
function manageStaff(id) {
  const member = getState().staff.find((item) => item.id === id);
  if (!member) return;
  modal("Manage staff member", `<div class="form-grid"><label>Full name<input class="input" id="editStaffName" value="${member.name}"></label><label>Role<select class="select" id="editStaffRole"><option ${member.role === "Teacher" ? "selected" : ""}>Teacher</option><option ${member.role === "Clerk" ? "selected" : ""}>Clerk</option><option ${member.role === "Security Officer" ? "selected" : ""}>Security Officer</option></select></label><label>Department<input class="input" id="editStaffDepartment" value="${member.department}"></label><label>Status<select class="select" id="editStaffStatus"><option ${member.status === "Active" ? "selected" : ""}>Active</option><option ${member.status === "On Leave" ? "selected" : ""}>On Leave</option><option ${member.status === "Inactive" ? "selected" : ""}>Inactive</option></select></label></div><div class="modal-foot"><button class="btn primary" data-action="save-staff-changes" data-staff="${id}">${role() === "clerk" ? "Submit for dual approval" : "Save changes"}</button></div>`);
}
function manageStaffRecord(id, index) {
  const member = Number.isInteger(Number(index)) ? getState().staff[Number(index)] : getState().staff.find((item) => item.id === id);
  if (!member) return;
  modal("Manage staff member", `<div class="form-grid"><label>Full name<input class="input" id="editStaffName" value="${member.name}"></label><label>Role<select class="select" id="editStaffRole"><option ${member.role === "Teacher" ? "selected" : ""}>Teacher</option><option ${member.role === "Clerk" ? "selected" : ""}>Clerk</option><option ${member.role === "Security Officer" ? "selected" : ""}>Security Officer</option></select></label><label>Department<input class="input" id="editStaffDepartment" value="${member.department}"></label><label>Status<select class="select" id="editStaffStatus"><option ${member.status === "Active" ? "selected" : ""}>Active</option><option ${member.status === "On Leave" ? "selected" : ""}>On Leave</option><option ${member.status === "Inactive" ? "selected" : ""}>Inactive</option></select></label></div><div class="modal-foot"><button class="btn primary" data-action="save-staff-changes" data-staff="${member.id}" data-staff-index="${index}">${role() === "clerk" ? "Submit for dual approval" : "Save changes"}</button></div>`);
}
function saveStaffChanges(id, index) {
  const current = Number.isInteger(Number(index)) ? getState().staff[Number(index)] : getState().staff.find((item) => item.id === id);
  if (!current) return;
  const proposed = { ...current, name: inputValue("editStaffName"), role: inputValue("editStaffRole"), department: inputValue("editStaffDepartment"), status: inputValue("editStaffStatus") };
  if (role() === "clerk") return submitStaffChange("edit", proposed, current);
  persist((state) => {
    const member = Number.isInteger(Number(index)) ? state.staff[Number(index)] : state.staff.find((item) => item.id === id);
    if (!member) return;
    Object.assign(member, proposed);
  });
  finishForm();
}
function submitStaffChange(type, proposed, previous = null) {
  persist((state) => {
    state.staffChangeRequests = state.staffChangeRequests || [];
    const request = { id: `SCR-${Date.now().toString().slice(-7)}`, type, staffId: proposed.id, proposed, previous, requestedBy: userName(), requestedOn: todayLabel(), status: "Pending", approvals: { principal: false, deputy: false } };
    state.staffChangeRequests.unshift(request);
    state.notifications.unshift({ id: `NTF-STAFF-${Date.now().toString().slice(-6)}`, createdAt: notificationTimestamp(), category: "Staff approval", priority: "Medium", title: "Staff change requires approval", description: `${request.requestedBy} submitted a ${type} request for ${proposed.name}. Principal and deputy approval are both required.`, scope: "leadership", staffChangeId: request.id, read: false });
  });
  $$(".modal-backdrop").forEach((element) => element.remove());
  modal("Staff change submitted", `<p>Your ${type === "add" ? "new staff member" : "staff edit"} is pending approval from both the principal and deputy. The live staff register has not changed.</p><div class="modal-foot"><button class="btn primary" data-action="close-modal">Done</button></div>`);
}
function approveStaffChange(id) {
  if (!["principal", "deputy"].includes(role())) return;
  let completed = false;
  persist((state) => {
    const request = (state.staffChangeRequests || []).find((item) => item.id === id && item.status === "Pending");
    if (!request || request.approvals[role()]) return;
    request.approvals[role()] = true;
    if (!request.approvals.principal || !request.approvals.deputy) return;
    if (request.type === "add") state.staff.push(request.proposed);
    else {
      const member = state.staff.find((item) => item.id === request.staffId);
      if (member) Object.assign(member, request.proposed);
    }
    request.status = "Approved";
    request.completedOn = todayLabel();
    completed = true;
  });
  modal(completed ? "Staff change applied" : "Approval recorded", completed ? "<p>Both leadership approvals are recorded and the live staff register has been updated.</p>" : "<p>Your approval has been recorded. The register will update after the other leader approves.</p>");
  render();
}
function saveAppointment() {
  const title = inputValue("appointmentTitle");
  const withPerson = inputValue("appointmentWith");
  const date = inputValue("appointmentDate");
  const time = inputValue("appointmentTime");
  if (!requireValues([title, withPerson, date, time])) return;
  persist((state) =>
    state.appointments.unshift({
      id: "APT-" + Date.now().toString().slice(-5),
      title,
      with: withPerson,
      date,
      time,
      status: "Scheduled",
    }),
  );
  finishForm();
}
function saveSickNotice() {
  const learner = inputValue("sickLearner");
  const date = inputValue("sickDate");
  const reason = inputValue("sickReason");
  if (!requireValues([learner, date, reason])) return;
  persist((state) =>
    state.sickNotices.unshift({
      id: "SN-" + Date.now().toString().slice(-5),
      submittedBy: userName(),
      person: learner.split(" — ")[0],
      date,
      reason: inputValue("sickDetails") || reason,
      letter: $("#sickLetter")?.files?.[0]?.name || "",
      status: "Open",
    }),
  );
  persist((state) => {
    const notice = state.sickNotices[0];
    const learnerRecord = state.learners.find((item) => item.name === notice?.person);
    if (!notice || !learnerRecord) return;
    notice.status = "Pending teacher review";
    state.attendanceRegisters = state.attendanceRegisters || [];
    const index = state.attendanceRegisters.findIndex((register) => register.class === learnerRecord.class && register.date === date);
    const existing = index >= 0 ? state.attendanceRegisters[index] : null;
    const entries = Object.fromEntries(state.learners.filter((item) => item.class === learnerRecord.class).map((item) => [item.id, existing?.entries?.[item.id] || "Present"]));
    entries[learnerRecord.id] = "Sick";
    const register = { ...(existing || {}), class: learnerRecord.class, date, teacher: existing?.teacher || teacherForClass(learnerRecord.class), entries, capturedOn: todayLabel(), source: "Parent sick notice", pendingSickNoticeIds: [...new Set([...(existing?.pendingSickNoticeIds || []), notice.id])] };
    if (index >= 0) state.attendanceRegisters[index] = register;
    else state.attendanceRegisters.unshift(register);
    refreshClassAttendance(state, learnerRecord.class);
    state.notifications.unshift({ id: "NTF-SICK-" + Date.now().toString().slice(-6), createdAt: notificationTimestamp(), category: "Sick notice", priority: "High", title: "Sick notice requires attention", description: `${learnerRecord.name} was reported sick by ${notice.submittedBy} for ${date}. Attendance has been marked sick pending your review.`, scope: "teacher", recipient: teacherForClass(learnerRecord.class), sickNoticeId: notice.id, read: false });
  });
  sessionStorage.setItem("schoolshieldLastSickNotice", getState().sickNotices[0]?.id || "");
  finishForm();
}

function qrMarkup(payload) {
  let seedValue = [...payload].reduce((total, character) => total + character.charCodeAt(0), 0);
  const cells = Array.from({ length: 225 }, (_, index) => {
    const row = Math.floor(index / 15);
    const column = index % 15;
    const finder = (row < 5 && column < 5) || (row < 5 && column > 9) || (row > 9 && column < 5);
    seedValue = (seedValue * 9301 + 49297) % 233280;
    const dark = finder ? (row === 0 || row === 4 || column === 0 || column === 4 || (row >= 1 && row <= 3 && column >= 1 && column <= 3)) : seedValue % 2 === 0;
    return `<span style="display:block;background:${dark ? "#092e38" : "#fff"}"></span>`;
  }).join("");
  return `<div aria-label="Visitor QR code" style="width:210px;height:210px;padding:10px;background:#fff;display:grid;grid-template-columns:repeat(15,1fr);gap:1px;border:1px solid #dce6e8;border-radius:8px;margin:15px auto">${cells}</div>`;
}
function generateVisitorQr(id) {
  const visitor = getState().visitors.find((item) => item.id === id);
  if (!visitor) return;
  const payload = `SCHOOLSHIELD:${visitor.id}:${visitor.identity || visitor.name}`;
  modal("Visitor QR pass", `<div class="scan-box"><b>${visitor.name}</b><p>${visitor.id} · ${visitor.type}</p>${qrMarkup(payload)}<p class="muted">Present this pass at the gate. Payload: ${payload}</p><div class="modal-foot"><button class="btn primary" data-action="download-visitor-qr" data-visitor="${id}">Download QR pass</button></div></div>`);
}
function downloadVisitorQr(id) {
  const visitor = getState().visitors.find((item) => item.id === id);
  if (!visitor) return;
  downloadTextFile(`${visitor.id}-qr-pass.txt`, `${SCHOOL.name}\nVisitor QR pass\nVisitor: ${visitor.name}\nVisitor ID: ${visitor.id}\nPayload: SCHOOLSHIELD:${visitor.id}:${visitor.identity || visitor.name}\n\nUse the generated QR pass at the school gate.`);
}
function processVisitorScan() {
  const raw = inputValue("scanVisitorId");
  const id = raw.replace("SCHOOLSHIELD:", "").split(":")[0].toUpperCase();
  const visitor = getState().visitors.find((item) => item.id === id);
  if (!visitor) {
    modal("Visitor not found", '<p class="muted">Enter a valid visitor ID or QR payload.</p>');
    return;
  }
  if (visitor.status === "Inside") {
    checkoutVisitor(visitor.id);
    return;
  }
  persist((state) => {
    const item = state.visitors.find((entry) => entry.id === visitor.id);
    item.status = "Inside";
    item.in = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    item.out = "—";
    item.processedBy = userName();
  });
  finishForm();
}
function checkoutVisitor(id) {
  persist((state) => {
    const visitor = state.visitors.find((item) => item.id === id);
    if (visitor && visitor.status === "Inside") {
      visitor.status = "Checked Out";
      visitor.out = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  });
  $$(".modal-backdrop").forEach((element) => element.remove());
  render();
}
function viewIncident(id) {
  const incident = getState().incidents.find((item) => item.id === id);
  if (!incident) return;
  const comments = (incident.comments || []).map((comment) => `<div class="report-row"><span><b>${comment.author}</b><small>${comment.date}</small></span><span>${comment.text}</span></div>`).join("") || '<p class="muted">No responses yet.</p>';
  const audit = (incident.audit || []).map((entry) => `<li><b>${entry.action}</b> — ${entry.author} · ${entry.date} · ${entry.time}</li>`).join("") || '<li>Initial incident record</li>';
  const response = role() !== "sgb" ? `<label>Add response<textarea class="textarea" id="incidentResponse" placeholder="Add an update or request further details..."></textarea></label><div class="modal-foot"><button class="btn" data-action="resolve-incident" data-incident="${id}">Mark as resolved</button><button class="btn primary" data-action="add-incident-response" data-incident="${id}">Send response</button></div>` : "";
  modal(incident.id, `<p class="muted">${isLeadership() ? "Leadership view — read-only operational fields. Follow-up communication is available below." : "Incident record."}</p><div class="detail-grid"><div><small>Category</small><b>${incident.category}</b></div><div><small>Location</small><b>${incident.location}</b></div><div><small>Reported by</small><b>${incident.reporter || incident.officer}</b></div><div><small>Officer</small><b>${incident.officer}</b></div><div><small>Date & time</small><b>${incident.date} · ${incident.time}</b></div><div><small>Persons involved</small><b>${incident.people || "—"}</b></div><div><small>CCTV reference</small><b>${incident.cctv || "—"}</b></div><div><small>Priority / status</small>${badge(incident.priority)} ${badge(incident.status)}</div></div><section class="panel"><h3>Description</h3><p>${incident.description}</p><h3>Immediate action taken</h3><p>${incident.immediateAction || "—"}</p></section><section class="panel"><h3>Communication & follow-up</h3>${comments}${response}</section><section class="panel"><h3>Audit trail</h3><ul>${audit}</ul></section>`);
}
function addIncidentResponse(id) {
  const text = inputValue("incidentResponse");
  if (!text) return;
  persist((state) => {
    const incident = state.incidents.find((item) => item.id === id);
    if (!incident) return;
    incident.comments = incident.comments || [];
    incident.audit = incident.audit || [];
    incident.comments.push({ author: userName(), text, date: todayLabel() });
    incident.audit.push({ action: "Response added", author: userName(), date: todayLabel(), time: "Now" });
  });
  finishForm();
}
function resolveIncident(id) {
  persist((state) => {
    const incident = state.incidents.find((item) => item.id === id);
    if (!incident) return;
    incident.status = "Resolved";
    incident.audit = incident.audit || [];
    incident.audit.push({ action: "Status changed — Open → Resolved", author: userName(), date: todayLabel(), time: "Now" });
    state.notifications.forEach((notice) => { if (notice.incidentId === id) notice.read = true; });
  });
  $(".incident-toast")?.remove();
  finishForm();
}
function viewNotification(id) {
  const notice = getState().notifications.find((item) => item.id === id);
  if (!notice) return;
  persist((state) => {
    const item = state.notifications.find((entry) => entry.id === id);
    if (item) item.read = true;
  });
  $(".incident-toast")?.remove();
  const comments = (notice.comments || []).map((comment) => `<div class="report-row"><span><b>${comment.author}</b><small>${comment.date}</small></span><span>${comment.text}</span></div>`).join("") || '<p class="muted">No follow-up comments yet.</p>';
  const principalControls = role() === "principal" ? `<label>Comment or request details<textarea class="textarea" id="notificationComment" placeholder="Ask the reporter for further information or record a follow-up..."></textarea></label><div class="modal-foot"><button class="btn primary" data-action="comment-notification" data-notification="${id}">Send follow-up</button></div>` : "";
  const drawer = $("#notificationCenter");
  if (drawer) drawer.style.display = "none";
  modal(notice.title, `<p>${notice.description}</p><div class="detail-grid"><div><small>Category</small><b>${notice.category}</b></div><div><small>Reported by</small><b>${notice.reporter || "SchoolShield user"}</b></div><div><small>Priority</small>${badge(notice.priority)}</div><div><small>Time</small><b>${notificationTime(notice)}</b></div></div><section class="panel"><h3>Follow-up</h3>${comments}</section>${principalControls}`);
}
function commentNotification(id) {
  const text = inputValue("notificationComment");
  if (!text) return;
  persist((state) => {
    const notice = state.notifications.find((item) => item.id === id);
    if (!notice) return;
    notice.comments = notice.comments || [];
    notice.comments.push({ author: userName(), text, date: todayLabel() });
  });
  finishForm();
}
function addOfficer() {
  modal("Add security officer", `<div class="form-grid"><label>Full name<input class="input" id="newOfficerName"></label><label>Employee ID<input class="input" id="newOfficerEmployee"></label><label>Shift<select class="select" id="newOfficerShift"><option>06:00–14:00</option><option>14:00–22:00</option><option>22:00–06:00</option></select></label><label>Assigned site<select class="select" id="newOfficerSite"><option>Main Gate</option><option>Admin Block</option><option>Sports Field</option><option>Vehicle Gate</option></select></label></div><div class="modal-foot"><button class="btn primary" data-action="save-officer-new">Save officer</button></div>`);
}
function saveNewOfficer() {
  const name = inputValue("newOfficerName");
  const employee = inputValue("newOfficerEmployee");
  if (!requireValues([name, employee])) return;
  persist((state) => state.security.push({ id: `SEC-${String(state.security.length + 1).padStart(3, "0")}`, name, employee, shift: inputValue("newOfficerShift"), site: inputValue("newOfficerSite"), status: "Scheduled" }));
  finishForm();
}
function manageOfficer(id) {
  const officer = getState().security.find((item) => item.id === id);
  if (!officer) return;
  modal("Manage " + officer.name, `<div class="form-grid"><label>Shift<input class="input" id="officerShift" value="${officer.shift}"></label><label>Assigned site<input class="input" id="officerSite" value="${officer.site}"></label><label>Status<select class="select" id="officerStatus"><option ${officer.status === "On Duty" ? "selected" : ""}>On Duty</option><option ${officer.status === "Scheduled" ? "selected" : ""}>Scheduled</option><option ${officer.status === "Off Duty" ? "selected" : ""}>Off Duty</option></select></label></div><div class="modal-foot"><button class="btn primary" data-action="save-officer" data-officer="${id}">Save changes</button></div>`);
}
function saveOfficer(id) {
  persist((state) => {
    const officer = state.security.find((item) => item.id === id);
    if (!officer) return;
    officer.shift = inputValue("officerShift");
    officer.site = inputValue("officerSite");
    officer.status = inputValue("officerStatus");
  });
  finishForm();
}
function viewParentSickNotice(id) {
  const notice = getState().sickNotices.find((item) => item.id === id && item.submittedBy === userName());
  if (!notice) return;
  modal("Submitted sick notice", `<div class="detail-grid"><div><small>Learner</small><b>${notice.person}</b></div><div><small>Absence date</small><b>${notice.date}</b></div><div><small>Reason</small><b>${notice.reason}</b></div><div><small>Teacher review</small>${badge(notice.status)}</div><div><small>Supporting sick letter</small><b>${notice.letter || "No attachment"}</b></div></div><p class="muted" style="margin-top:16px">The learner has been marked sick for this date. The assigned teacher will review the notice.</p>`);
}
function viewSickNotice(id) {
  const notice = getState().sickNotices.find((item) => item.id === id);
  if (!notice) return;
  modal("Sick notice", `<div class="detail-grid"><div><small>Submitted by</small><b>${notice.submittedBy}</b></div><div><small>Learner / staff</small><b>${notice.person}</b></div><div><small>Date</small><b>${notice.date}</b></div><div><small>Status</small>${badge(notice.status)}</div><div><small>Reason</small><b>${notice.reason}</b></div><div><small>Supporting sick letter</small><b>${notice.letter || "No attachment"}</b></div></div>${notice.status !== "Reviewed" ? `<div class="modal-foot"><button class="btn primary" data-action="review-sick-notice" data-sick="${id}">Review & acknowledge</button></div>` : ""}`);
}
function reviewSickNotice(id) {
  persist((state) => {
    const notice = state.sickNotices.find((item) => item.id === id);
    if (!notice) return;
    notice.status = "Reviewed";
    const learnerRecord = state.learners.find((item) => item.name === notice.person);
    const register = learnerRecord && state.attendanceRegisters?.find((item) => item.class === learnerRecord.class && item.date === notice.date);
    if (register) register.pendingSickNoticeIds = (register.pendingSickNoticeIds || []).filter((noticeId) => noticeId !== id);
    state.notifications.forEach((notification) => { if (notification.sickNoticeId === id) notification.read = true; });
  });
  finishForm();
}
function showPendingSickNoticePopup() {
  if (role() !== "teacher") return;
  const notice = getState().sickNotices.find((item) => {
    const learnerRecord = learners().find((learner) => learner.name === item.person);
    return item.status !== "Reviewed" && learnerRecord && teacherForClass(learnerRecord.class) === userName();
  });
  if (!notice) return;
  const key = `schoolshield:sick-popup:${SCHOOL.code}:${notice.id}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "shown");
  modal("Sick notice requires attention", `<p><b>${notice.person}</b> was reported sick by ${notice.submittedBy} for <b>${notice.date}</b>.</p><p class="muted">The learner has been marked sick in attendance. Review and acknowledge this notice to complete the teacher review.</p><div class="modal-foot"><button class="btn primary" data-action="review-sick-notice" data-sick="${notice.id}">Review & acknowledge</button></div>`);
}
function manageAnnouncement(id) {
  const announcement = getState().announcements.find((item) => item.id === id);
  if (!announcement || announcement.author !== userName()) return;
  modal("Manage announcement", `<div class="form-grid"><label class="full">Title<input class="input" id="editAnnouncementTitle" value="${announcement.title}"></label><label class="full">Message<textarea class="textarea" id="editAnnouncementBody">${announcement.body || ""}</textarea></label></div><div class="modal-foot"><button class="btn" data-action="delete-announcement" data-announcement="${id}">Delete</button><button class="btn primary" data-action="save-announcement" data-announcement="${id}">Save changes</button></div>`);
}
function saveAnnouncement(id) {
  const title = inputValue("editAnnouncementTitle");
  if (!title) return;
  persist((state) => {
    const item = state.announcements.find((announcement) => announcement.id === id && announcement.author === userName());
    if (item) { item.title = title; item.body = inputValue("editAnnouncementBody"); }
  });
  finishForm();
}
function deleteAnnouncement(id) {
  persist((state) => { state.announcements = state.announcements.filter((item) => !(item.id === id && item.author === userName())); });
  finishForm();
}
function manageAppointment(id) {
  const appointment = getState().appointments.find((item) => item.id === id);
  if (!appointment) return;
  const controls = role() === "principal" ? `<div class="modal-foot"><button class="btn" data-action="set-appointment-status" data-appointment="${id}" data-status="Declined">Decline</button><button class="btn" data-action="choose-appointment-slot" data-appointment="${id}">Reschedule</button><button class="btn primary" data-action="set-appointment-status" data-appointment="${id}" data-status="Accepted">Accept</button></div>` : "";
  modal("Appointment review", `<div class="detail-grid"><div><small>Title</small><b>${appointment.title}</b></div><div><small>With</small><b>${appointment.with}</b></div><div><small>Date</small><b>${appointment.date}</b></div><div><small>Time</small><b>${appointment.time}</b></div></div>${controls}`);
}
function chooseAppointmentSlot(id) {
  const slots = ["18 Sep 2026 · 09:00", "18 Sep 2026 · 13:30", "19 Sep 2026 · 10:00", "19 Sep 2026 · 15:00"];
  modal("Available reschedule slots", `<p class="muted">Select an available principal appointment slot.</p><label>Available slots<select class="select" id="rescheduleSlot">${slots.map((slot) => `<option>${slot}</option>`).join("")}</select></label><div class="modal-foot"><button class="btn primary" data-action="confirm-appointment-slot" data-appointment="${id}">Confirm new time</button></div>`);
}
function confirmAppointmentSlot(id) {
  const [date, time] = inputValue("rescheduleSlot").split(" · ");
  persist((state) => {
    const appointment = state.appointments.find((item) => item.id === id);
    if (!appointment) return;
    appointment.date = date;
    appointment.time = time;
    appointment.status = "Rescheduled";
  });
  finishForm();
}
function setAppointmentStatus(id, status) {
  persist((state) => { const item = state.appointments.find((appointment) => appointment.id === id); if (item) item.status = status; });
  finishForm();
}

/* Teacher submits marks; clerk corrects marks already submitted. */
function saveAttendance(classId) {
  const date = inputValue("attendanceDate");
  if (!date) return;
  const entries = Object.fromEntries($$("[data-attendance]").map((input) => [input.dataset.attendance, input.value]));
  persist((state) => {
    state.attendanceRegisters = state.attendanceRegisters || [];
    const index = state.attendanceRegisters.findIndex((register) => register.class === classId && register.date === date);
    const register = { class: classId, date, teacher: userName(), entries, capturedOn: todayLabel() };
    if (index >= 0) state.attendanceRegisters[index] = register;
    else state.attendanceRegisters.unshift(register);
    const classRegisters = state.attendanceRegisters.filter((item) => item.class === classId);
    state.learners.filter((learner) => learner.class === classId).forEach((learner) => {
      const absenceCount = classRegisters.reduce((total, item) => total + (["Absent", "Sick", "Excused"].includes(item.entries?.[learner.id]) ? 1 : 0), 0);
      learner.absentDays = (learner.initialAbsentDays || 0) + absenceCount;
      const totalDays = (learner.attendanceDays || 60) + classRegisters.length;
      learner.attendance = Math.max(0, Math.round(((totalDays - learner.absentDays) / totalDays) * 100));
    });
  });
  render();
}
function saveWeeklyAttendance(classId, weekStart) {
  const inputs = $$('[data-week-status]');
  const weekly = {};
  inputs.forEach((input) => {
    const learnerId = input.dataset.weekLearner;
    const day = input.dataset.weekDay;
    weekly[day] = weekly[day] || {};
    if (!weekly[day][learnerId]) weekly[day][learnerId] = "Present";
    if (input.checked && input.dataset.weekStatus !== "Present") weekly[day][learnerId] = input.dataset.weekStatus;
  });
  persist((state) => {
    state.attendanceRegisters = state.attendanceRegisters || [];
    Object.entries(weekly).forEach(([date, entries]) => {
      const index = state.attendanceRegisters.findIndex((register) => register.class === classId && register.date === date);
      const register = { class: classId, date, teacher: userName(), entries, capturedOn: todayLabel() };
      if (index >= 0) state.attendanceRegisters[index] = register;
      else state.attendanceRegisters.unshift(register);
    });
    state.attendanceWeeks = state.attendanceWeeks || [];
    const summary = { class: classId, weekStart, teacher: userName(), updatedOn: todayLabel() };
    const weekIndex = state.attendanceWeeks.findIndex((week) => week.class === classId && week.weekStart === weekStart);
    if (weekIndex >= 0) state.attendanceWeeks[weekIndex] = summary;
    else state.attendanceWeeks.unshift(summary);
    const classRegisters = state.attendanceRegisters.filter((item) => item.class === classId);
    state.learners.filter((learner) => learner.class === classId).forEach((learner) => {
      const absences = classRegisters.reduce((total, register) => total + (["Absent", "Excused", "Sick"].includes(register.entries?.[learner.id]) ? 1 : 0), 0);
      learner.absentDays = (learner.initialAbsentDays || 0) + absences;
      const totalDays = (learner.attendanceDays || 60) + classRegisters.length;
      learner.attendance = Math.max(0, Math.round(((totalDays - learner.absentDays) / totalDays) * 100));
    });
  });
  render();
}

function saveTestScores(classId, mode, assessmentId = "") {
  const inputs = $$("[data-score]");
  const scores = {};
  for (const input of inputs) {
    const raw = input.value.trim();
    const value = Number(raw);
    if (raw !== "" && (isNaN(value) || value < 0 || value > 100)) {
      modal(
        "Invalid score",
        `<p class="muted">Enter a score between 0 and 100. "${raw}" is not valid.</p>`,
      );
      return;
    }
    if (raw !== "") scores[input.dataset.score] = value;
  }
  persist((state) => {
    const assessment = state.assessments.find((a) => a.id === assessmentId) || state.assessments.find((a) => a.class === classId);
    if (assessment) {
      assessment.scores = { ...assessment.scores, ...scores };
      if (mode === "teacher") {
        assessment.status = "submitted";
        assessment.submittedBy = userName();
        assessment.date = todayLabel();
      }
      if (mode === "clerk" && assessment.status === "draft") {
        assessment.status = "submitted";
        assessment.submittedBy = userName();
      }
    }
    if (mode === "teacher") {
      const report = state.reports.find((r) => r.class === classId);
      if (report && report.status === "awaiting-marks") {
        report.status = "ready";
        report.marksSubmittedOn = todayLabel();
      }
    }
  });
  render();
}

function assignTeacher() {
  const teacherOptions = getState().staff.filter((member) => member.role === "Teacher").map((teacher) => `<option value="${teacher.name}">${teacher.name} — ${teacher.department}</option>`).join("");
  modal("Assign teacher to class", `<p class="muted">This request must be approved by the principal before it changes the class, teacher portal, or parent notification.</p><div class="form-grid"><label>Class<select class="select" id="assignmentClass">${classes().map((schoolClass) => `<option value="${schoolClass.id}">${schoolClass.grade} · ${schoolClass.id} — current: ${schoolClass.teacher}</option>`).join("")}</select></label><label>Registered teacher<select class="select" id="assignmentTeacher">${teacherOptions}</select></label></div><div class="modal-foot"><button class="btn primary" data-action="submit-teacher-assignment">Submit for approval</button></div>`);
}
function submitTeacherAssignment() {
  const classId = inputValue("assignmentClass");
  const teacher = inputValue("assignmentTeacher");
  if (!requireValues([classId, teacher])) return;
  persist((state) => {
    state.teacherAssignments = state.teacherAssignments || [];
    state.teacherAssignments.unshift({ id: `TAS-${Date.now().toString().slice(-6)}`, class: classId, teacher, requestedBy: userName(), requestedOn: todayLabel(), status: "Pending" });
  });
  finishForm();
}
function approveTeacherAssignment(id) {
  persist((state) => {
    const assignment = (state.teacherAssignments || []).find((item) => item.id === id);
    const schoolClass = assignment && state.classes.find((item) => item.id === assignment.class);
    if (!assignment || !schoolClass) return;
    schoolClass.teacher = assignment.teacher;
    assignment.status = "Approved";
    assignment.approvedBy = userName();
    state.notifications.unshift({ id: `NTF-${Date.now().toString().slice(-6)}`, createdAt: notificationTimestamp(), category: "Class update", priority: "Medium", title: `New class teacher for ${schoolClass.class || schoolClass.id}`, description: `${assignment.teacher} is now the class teacher for ${schoolClass.grade} ${schoolClass.id}.`, scope: "parents", class: schoolClass.id, read: false });
  });
  render();
}
function addAssessment(classId = "") {
  const classOptions = classes()
    .map((schoolClass) => `<option value="${schoolClass.id}" ${schoolClass.id === classId ? "selected" : ""}>${schoolClass.grade} · ${schoolClass.id} — ${schoolClass.teacher}</option>`)
    .join("");
  modal("Add assessment", `<p class="muted">Set the assessment details first. Saving opens the full class mark sheet.</p><div class="form-grid"><label>Class<select class="select" id="assessmentClass">${classOptions}</select></label><label>Subject<select class="select" id="assessmentSubject"><option>Mathematics</option><option>Physics</option><option>Life Sciences</option><option>English</option><option>Sesotho</option><option>Life Orientation</option><option>Computer Applications Technology</option><option>History</option><option>Natural Sciences</option><option>Social Sciences</option><option>Technology</option></select></label><label>Assessment title<input class="input" id="assessmentTitle" placeholder="e.g. Controlled Test 1"></label><label>Assessment type<select class="select" id="assessmentType"><option>Test</option><option>Assignment</option><option>Practical</option><option>Project</option><option>Exam</option></select></label><label>Term<select class="select" id="assessmentTerm"><option>${TERM}</option><option>Term 1</option><option>Term 3</option><option>Term 4</option></select></label><label>Date<input class="input" id="assessmentDate" type="date"></label><label>Weighting (%)<input class="input" id="assessmentWeight" type="number" min="1" max="100" value="20"></label><label>Total marks<input class="input" id="assessmentTotal" type="number" min="1" value="100"></label><label class="full">Assessment instructions / notes<textarea class="textarea" id="assessmentNotes" placeholder="Optional instructions or moderation notes"></textarea></label></div><div class="modal-foot"><button class="btn primary" data-action="save-assessment">Save & capture marks</button></div>`);
}
function saveAssessment() {
  const classId = inputValue("assessmentClass");
  const subject = inputValue("assessmentSubject");
  const title = inputValue("assessmentTitle");
  const date = inputValue("assessmentDate");
  if (!requireValues([classId, subject, title, date])) return;
  const schoolClass = classById(classId);
  if (!schoolClass) return;
  const id = `ASM-${Date.now().toString().slice(-7)}`;
  persist((state) => state.assessments.unshift({
    id,
    class: classId,
    grade: schoolClass.grade,
    subject,
    title,
    type: inputValue("assessmentType"),
    term: inputValue("assessmentTerm"),
    date,
    weighting: Number(inputValue("assessmentWeight")),
    total: Number(inputValue("assessmentTotal")),
    notes: inputValue("assessmentNotes"),
    status: "draft",
    submittedBy: "",
    scores: {},
  }));
  $$(".modal-backdrop").forEach((element) => element.remove());
  go(`test-scores.html?class=${classId}&assessment=${id}`);
}

function setReportStatus(classId, status) {
  persist((state) => {
    const report = state.reports.find((r) => r.class === classId);
    const schoolClass = state.classes.find((item) => item.id === classId);
    if (!report) return;
    report.status = status;
    if (status === "compiled") report.compiledOn = todayLabel();
    if (status === "finalised") report.finalisedOn = todayLabel();
    if (status === "published") report.publishedOn = todayLabel();
    if (status === "compiled" && schoolClass) state.notifications.unshift({ id: "NTF-REPORT-" + Date.now(), title: `${classId} learner reports ready for review`, description: `The clerk compiled ${TERM} reports for your class. Review every learner report before release.`, category: "Reports", priority: "Medium", createdAt: notificationTimestamp(), read: false, scope: "teacher", class: classId, recipient: schoolClass.teacher });
    if (status === "published" && schoolClass) state.notifications.unshift({ id: "NTF-PARENT-REPORT-" + Date.now(), title: `${TERM} learner reports released`, description: `Your child’s ${TERM} academic report is now available to view and download.`, category: "Reports", priority: "Medium", createdAt: notificationTimestamp(), read: false, scope: "parents", class: schoolClass.id });
  });
  render();
}
function reviewLearnerReport(classId, learnerId) {
  persist((state) => {
    const report = state.reports.find((item) => item.class === classId);
    if (!report || report.status !== "compiled") return;
    report.learnerReviews = report.learnerReviews || {};
    report.learnerReviews[learnerId] = { by: userName(), date: todayLabel() };
  });
  render();
}
function releaseLearnerReport(classId, learnerId) {
  persist((state) => {
    const report = state.reports.find((item) => item.class === classId);
    const learner = state.learners.find((item) => item.id === learnerId && item.class === classId);
    if (!report || !learner || !report.learnerReviews?.[learnerId] || !["finalised", "published"].includes(report.status)) return;
    report.releasedLearners = report.releasedLearners || {};
    report.releasedLearners[learnerId] = todayLabel();
    state.notifications.unshift({ id: "NTF-LEARNER-REPORT-" + Date.now(), title: `${TERM} report available for ${learner.name}`, description: `${learner.name}'s reviewed term report is ready to view and download.`, category: "Reports", priority: "Medium", createdAt: notificationTimestamp(), read: false, scope: "parents", learnerId });
    const total = state.learners.filter((item) => item.class === classId).length;
    if (Object.keys(report.releasedLearners).length >= total) {
      report.status = "published";
      report.publishedOn = todayLabel();
    }
  });
  render();
}

function sendAnnouncement() {
  const select = $("#audienceSelect");
  const title = $("#annTitle");
  const body = $("#annBody");
  if (!select || !title || !title.value.trim()) {
    modal(
      "Missing title",
      '<p class="muted">Add a title before sending the announcement.</p>',
    );
    return;
  }
  const chosen = select.options[select.selectedIndex];
  persist((state) => {
    state.announcements.unshift({
      id: "ANN-" + Date.now().toString().slice(-4),
      title: title.value.trim(),
      body: body ? body.value.trim() : "",
      audience: chosen.textContent,
      recipients: Number(chosen.dataset.count || 0),
      delivery: $("#deliverySelect")
        ? $("#deliverySelect").value
        : "In-app notification",
      author: userName(),
      date: todayLabel(),
    });
  });
  render();
}

function sendMessage(storeKey, chatIndex = 0, sender = "me") {
  const input = $("#chatInput");
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  if (Array.isArray(getState()[storeKey])) {
    persist((state) => {
      const conversation = state[storeKey][Number(chatIndex)] || state[storeKey][0];
      if (conversation) conversation.messages.push({ from: sender, text, date: todayLabel() });
    });
  } else {
    persist((state) => {
      state.chatExtras = state.chatExtras || {};
      state.chatExtras[storeKey] = state.chatExtras[storeKey] || [];
      state.chatExtras[storeKey].push({ from: sender, text, date: todayLabel() });
    });
  }
  render();
}

function exportCsv() {
  const rows = [
    [
      "Class",
      "Grade",
      "Teacher",
      "Learners",
      "Attendance",
      "Test average",
      "Pass rate",
    ],
  ];
  for (const c of classes()) {
    const st = classStats(c.id);
    rows.push([
      c.id,
      c.grade,
      c.teacher,
      st.learners,
      st.attendance,
      classTestAverage(c.id),
      st.passRate,
    ]);
  }
  const csv = rows
    .map((r) =>
      r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(","),
    )
    .join("\n");
  downloadTextFile("schoolshield-class-report.csv", csv);
}

function filterTable(query, selector) {
  const q = query.toLowerCase();
  $$(selector).forEach((row) => {
    row.style.display = row.innerText.toLowerCase().includes(q) ? "" : "none";
  });
}

/* --------------------------------- render -------------------------------- */
function render() {
  if (!allowed()) {
    const first = ACCESS[role()]?.[0] || "dashboard";
    if (page() !== first) {
      const target = NAV.find((n) => n[0] === first);
      return go(target ? target[2] : "dashboard.html");
    }
  }
  const p = page();
  let html;
  if (p === "dashboard") html = dashboard();
  else if (p === "incidents") html = incidents();
  else if (p === "visitors") html = visitors();
  else if (p === "notifications") html = notifications();
  else if (p === "leadership") html = leadership();
  else if (p === "learners") html = learnersPage();
  else if (p === "class-records") html = classRecords();
  else if (p === "parents") html = parents();
  else if (p === "staff") html = staff();
  else if (p === "security") html = security();
  else if (p === "security-officers") html = securityOfficers();
  else if (p === "reports") html = reports();
  else if (p === "settings") html = settings();
  else if (p === "announcements") html = announcements();
  else if (p === "sick-notices") html = sickNotices();
  else if (p === "sick-notice") html = parentSickNoticePage();
  else if (p === "appointments") html = appointments();
  else if (p === "account-requests") html = accountRequests();
  else if (p === "student-records") html = studentRecords();
  else if (p === "student-record") html = studentRecord();
  else if (p === "student-reports") html = studentReports();
  else if (p === "report-compilation") html = reportCompilationPage();
  else if (p === "test-scores") html = testScores();
  else if (p === "attendance-register") html = dailyAttendanceRegister();
  else if (p === "teacher-chat") html = teacherChat();
  else if (p === "parent-chat") html = parentChat();
  else html = dashboard();
  $("#app").innerHTML = html;
  bind();
}

function accountRequests() {
  return shell(`<div class="page-intro"><div><span class="pill">Account approval</span><h1>Account requests</h1><p>Approve new school accounts. Approval sends an invitation email; the user chooses their own password.</p></div><button class="btn ghost" data-action="refresh-account-requests">Refresh</button></div><section class="panel"><div class="panel-head"><div><h3>Pending requests</h3><p>Only the principal and school clerk can approve access.</p></div></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Requested role</th><th>Approve as</th><th></th></tr></thead><tbody id="accountRequestRows"><tr><td colspan="5" class="muted">Loading pending requests…</td></tr></tbody></table></div></section>`, "Account Requests");
}

async function loadAccountRequestDashboardAlert() {
  const client = window.schoolshieldSupabase;
  if (!client || !["principal", "clerk"].includes(role())) return;
  const { count } = await client.from("account_request_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  window.schoolshieldPendingAccountAlerts = count || 0;
  if (!count || page() !== "dashboard") return;
  const content = $(".content");
  if (!content || $("#accountApprovalDashboardAlert")) return;
  content.insertAdjacentHTML("afterbegin", `<section class="panel" id="accountApprovalDashboardAlert" style="border-left:4px solid #e6a400"><div class="panel-head"><div><span class="pill">Action required</span><h3>${count} new account request${count === 1 ? "" : "s"}</h3><p>A parent, teacher or security officer is waiting for approval.</p></div><a class="btn primary" href="account-requests.html">Review requests</a></div></section>`);
}

async function loadAccountRequests() {
  const client = window.schoolshieldSupabase, rows = $("#accountRequestRows");
  if (!client || !rows) return;
  const { data, error } = await client.from("account_requests").select("id, display_name, email, requested_role, created_at").eq("status", "pending").order("created_at");
  await client.from("account_request_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  window.schoolshieldPendingAccountAlerts = 0;
  if (error) { rows.innerHTML = `<tr><td colspan="5" class="muted">${error.message}</td></tr>`; return; }
  const roles = ["parent", "teacher", "security", "sgb", "deputy", "clerk", "principal"];
  rows.innerHTML = data?.length ? data.map((request) => `<tr><td><b>${request.display_name}</b><small>${new Date(request.created_at).toLocaleDateString()}</small></td><td>${request.email}</td><td>${ROLE_NAMES[request.requested_role]}</td><td><select class="select" data-approval-role="${request.id}">${roles.map((value) => `<option value="${value}" ${value === request.requested_role ? "selected" : ""}>${ROLE_NAMES[value]}</option>`).join("")}</select></td><td><span class="action-row"><button class="btn small primary" data-action="approve-account-request" data-request="${request.id}">Approve &amp; invite</button><button class="btn small ghost" data-action="approve-account-request" data-delivery="setup_link" data-request="${request.id}">Approve &amp; setup link</button><button class="btn small ghost" data-action="reject-account-request" data-request="${request.id}">Reject</button></span></td></tr>`).join("") : '<tr><td colspan="5" class="muted">No pending account requests.</td></tr>';
  $$('[data-action="approve-account-request"]', rows).forEach((button) => button.onclick = () => action(button.dataset.action, button));
  $$('[data-action="reject-account-request"]', rows).forEach((button) => button.onclick = () => action(button.dataset.action, button));
}

async function approveAccountRequest(id, delivery = "email") {
  const client = window.schoolshieldSupabase, approvedRole = $(`[data-approval-role="${id}"]`)?.value;
  if (!client || !approvedRole) return;
  const { data: { session } } = await client.auth.getSession();
  const setupPath = location.pathname.replace(/[^/]+$/, "account-setup.html");
  const response = await fetch(`${window.SCHOOLSHIELD_SUPABASE_CONFIG.url}/functions/v1/approve-account`, { method: "POST", headers: { Authorization: `Bearer ${session?.access_token || ""}`, apikey: window.SCHOOLSHIELD_SUPABASE_CONFIG.publishableKey, "Content-Type": "application/json" }, body: JSON.stringify({ request_id: id, role: approvedRole, delivery, redirect_to: `${location.origin}${setupPath}` }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return alert(result.error || "Could not approve this account.");
  if (delivery === "setup_link" && result.setup_link) {
    const link = String(result.setup_link);
    let trustedLink = "";
    try { if (new URL(link).host === new URL(window.SCHOOLSHIELD_SUPABASE_CONFIG.url).host) trustedLink = link.replace(/&/g, "&amp;").replace(/"/g, "&quot;"); } catch (_) { /* Do not render an invalid link. */ }
    if (trustedLink) {
      modal("Account approved", `<p><b>The account has been approved.</b> No email was sent. Open this one-time setup link to test the applicant onboarding page.</p><div class="modal-foot"><a class="btn primary" href="${trustedLink}" target="_blank" rel="noopener">Open setup page</a><button class="btn ghost" data-action="close-modal">Done</button></div>`);
    } else alert("The account was approved, but the setup link could not be displayed safely.");
  } else {
    modal("Account approved", `<p><b>The account has been approved.</b> An invitation was sent to the applicant's email address with their school code and setup link.</p><div class="modal-foot"><button class="btn primary" data-action="close-modal">Done</button></div>`);
  }
  loadAccountRequests();
}

async function rejectAccountRequest(id) {
  if (!confirm("Reject this account request? The applicant will not receive an invitation.")) return;
  const client = window.schoolshieldSupabase;
  if (!client) return;
  const { data: { session } } = await client.auth.getSession();
  const response = await fetch(`${window.SCHOOLSHIELD_SUPABASE_CONFIG.url}/functions/v1/approve-account`, { method: "POST", headers: { Authorization: `Bearer ${session?.access_token || ""}`, apikey: window.SCHOOLSHIELD_SUPABASE_CONFIG.publishableKey, "Content-Type": "application/json" }, body: JSON.stringify({ request_id: id, action: "reject" }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return alert(result.error || "Could not reject this request.");
  modal("Account request rejected", `<p>The request has been rejected and no account invitation was sent.</p><div class="modal-foot"><button class="btn primary" data-action="close-modal">Done</button></div>`);
  loadAccountRequests();
}

function initWorkspaceChrome() {
  const sidebar = $(".sidebar");
  const main = $(".main");
  const topActions = $(".top-actions");
  if (!sidebar || !main || !topActions) return;
  const nav = sidebar.querySelector("nav");
  const setMobileNav = () => {
    if (!nav) return;
    nav.style.display = "flex";
    nav.style.flexDirection = "column";
    nav.style.gridTemplateColumns = "";
  };
  const setSidebarState = (compact) => {
    sidebar.dataset.compact = String(compact);
    setMobileNav();
    if (innerWidth <= 700) {
      sidebar.style.transform = compact ? "translateX(-105%)" : "translateX(0)";
      sidebar.style.position = "fixed";
      sidebar.style.zIndex = "40";
      sidebar.style.width = "280px";
      main.style.marginLeft = "0";
      main.style.width = "100%";
      return;
    }
    const rail = compact || innerWidth <= 980;
    sidebar.style.transform = "";
    sidebar.style.width = rail ? "70px" : "252px";
    sidebar.querySelectorAll(".brand div, .menu-title, .nav-item span:not(.icon):not(.nav-update), .role-card div:nth-child(2), .logout span").forEach((element) => (element.style.display = rail ? "none" : ""));
    main.style.marginLeft = rail ? "70px" : "252px";
    main.style.width = rail ? "calc(100% - 70px)" : "calc(100% - 252px)";
  };
  if (!$("#sidebarToggle")) {
    const toggle = document.createElement("button");
    toggle.id = "sidebarToggle";
    toggle.className = "icon-btn";
    toggle.title = "Toggle navigation";
    toggle.setAttribute("aria-label", "Toggle navigation");
    toggle.textContent = "☰";
    const titleArea = $(".topbar > div:first-child");
    if (titleArea) {
      titleArea.prepend(toggle);
      titleArea.style.display = "flex";
      titleArea.style.alignItems = "center";
      titleArea.style.gap = "12px";
    } else topActions.prepend(toggle);
    toggle.onclick = () => {
      setSidebarState(sidebar.dataset.compact !== "true");
    };
  }
  if (innerWidth <= 700) {
    setSidebarState(true);
  } else if (sidebar.dataset.compact === "true") {
    setSidebarState(true);
  } else {
    setSidebarState(false);
  }
  if (!window.__schoolshieldResponsiveChrome) {
    window.__schoolshieldResponsiveChrome = true;
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 140);
    });
  }
  if (!$("#notificationCenter")) {
    const drawer = document.createElement("aside");
    drawer.id = "notificationCenter";
    drawer.style.cssText = "display:none;position:fixed;right:22px;top:78px;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 100px);overflow:auto;z-index:60;background:#fff;border:1px solid #dce6e8;border-radius:14px;box-shadow:0 18px 45px rgba(4,34,42,.18);padding:14px";
    document.body.appendChild(drawer);
  }
}
function notificationCenterMarkup() {
  const notices = notificationsForRole();
  return `<div style="display:flex;justify-content:space-between;align-items:start;border-bottom:1px solid #e3e9eb;padding-bottom:11px"><div><b style="font-size:14px">Notification centre</b><small style="display:block;color:#71838a">${notices.filter((notice) => !notice.read).length} unread</small></div><button class="icon-btn" id="closeNotifications" title="Close">×</button></div><input class="input" id="notificationSearch" style="margin:10px 0" placeholder="Search notifications..."><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px"><select class="select"><option>All types</option></select><select class="select"><option>All priority</option></select><select class="select"><option>Any date</option></select></div><div id="notificationItems" style="margin-top:12px">${notices.map((notice) => `<button class="notification-center-item" data-action="view-notification" data-notification="${notice.id}" style="width:100%;text-align:left;border:1px solid #dce6e8;border-radius:12px;background:${notice.read ? "#fff" : "#f2f8ff"};padding:12px;margin-bottom:9px;cursor:pointer"><div style="display:flex;justify-content:space-between;gap:8px"><b>${notice.title}</b>${badge(notice.priority)}</div><small style="display:block;color:#60747a;margin:5px 0">${notice.description}</small><small>${notice.category} · ${notificationTime(notice)}</small></button>`).join("") || '<p class="muted">No notifications.</p>'}</div><div style="display:flex;justify-content:space-between;border-top:1px solid #e3e9eb;padding-top:10px"><button class="btn small" id="drawerMarkRead">Mark all read</button><a class="text-link" href="notifications.html">View all →</a></div>`;
}
function toggleNotificationCenter() {
  const drawer = $("#notificationCenter");
  if (!drawer) return;
  const opening = drawer.style.display === "none";
  drawer.style.display = opening ? "block" : "none";
  if (!opening) return;
  drawer.innerHTML = notificationCenterMarkup();
  $$("[data-action]", drawer).forEach((button) => (button.onclick = () => action(button.dataset.action, button)));
  $("#closeNotifications", drawer).onclick = () => (drawer.style.display = "none");
  $("#drawerMarkRead", drawer).onclick = () => { const ids = new Set(notificationsForRole().map((notice) => notice.id)); persist((state) => state.notifications.forEach((notice) => { if (ids.has(notice.id)) notice.read = true; })); toggleNotificationCenter(); };
  $("#notificationSearch", drawer).oninput = (event) => $$(".notification-center-item", drawer).forEach((item) => (item.style.display = item.innerText.toLowerCase().includes(event.target.value.toLowerCase()) ? "" : "none"));
}
function bind() {
  initWorkspaceChrome();
  if (!window.__schoolshieldCloudRefreshListener) {
    window.__schoolshieldCloudRefreshListener = true;
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refreshCloudWorkspace(true); };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
  }
  if (page() === "account-requests") loadAccountRequests();
  if (page() === "dashboard") loadAccountRequestDashboardAlert();
  if (page() === "dashboard") {
    const quickHeading = $$("h3").find((heading) => heading.textContent === "Quick access");
    const quickPanel = quickHeading && quickHeading.closest("section");
    const dashboardPanels = $(".dashboard-grid");
    if (quickPanel && dashboardPanels) dashboardPanels.before(quickPanel);
  }
  $("#logout")?.addEventListener("click", async () => {
    await window.schoolshieldSupabase?.auth.signOut();
    sessionStorage.removeItem("schoolshieldRole");
    sessionStorage.removeItem("schoolshieldSession");
    location.href = "login.html";
  });
  $("#globalBell")?.addEventListener("click", toggleNotificationCenter);
  $$("[data-nav]").forEach(
    (b) =>
      (b.onclick = () => {
        const target = NAV.find((x) => x[0] === b.dataset.nav);
        if (target) go(target[2]);
      }),
  );
  $$("[data-action]").forEach(
    (b) => (b.onclick = () => action(b.dataset.action, b)),
  );
  $$("[data-week-status]").forEach((box) => {
    box.onchange = () => {
      if (!box.checked) return;
      $$(`[data-week-learner="${box.dataset.weekLearner}"][data-week-day="${box.dataset.weekDay}"]`).forEach((other) => { if (other !== box) other.checked = false; });
    };
  });
  $("#markRead")?.addEventListener("click", () => {
    const visibleIds = new Set(notificationsForRole().map((notice) => notice.id));
    persist((state) => state.notifications.forEach((n) => { if (visibleIds.has(n.id)) n.read = true; }));
    render();
  });
  $$("[data-visitor]").forEach(
    (b) => (b.onclick = () => visitorModal(b.dataset.visitor)),
  );
  $("#visitorSearch")?.addEventListener("input", (e) =>
    filterTable(e.target.value, ".visitor-row"),
  );
  $("#incidentSearch")?.addEventListener("input", (e) =>
    filterTable(e.target.value, ".incident-row"),
  );
  $("#learnerSearch")?.addEventListener("input", (e) =>
    filterTable(e.target.value, ".class-card"),
  );
  $("#studentSearch")?.addEventListener("input", (e) =>
    filterTable(e.target.value, ".student-row"),
  );
  $("#chatSearch")?.addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    $$("[data-chat-contact]").forEach((contact) => (contact.style.display = contact.innerText.toLowerCase().includes(query) ? "" : "none"));
  });
  $("#exportCsv")?.addEventListener("click", exportCsv);
  $("#audienceSelect")?.addEventListener("change", (e) => {
    const opt = e.target.options[e.target.selectedIndex];
    const count = $("#audienceCount");
    if (count) count.textContent = opt.dataset.count || "0";
  });
  $("#chatInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const sendButton = $("[data-action='send-message']");
      sendMessage(sendButton?.dataset.store, sendButton?.dataset.chat, sendButton?.dataset.sender);
    }
  });
  setTimeout(showPendingSickNoticePopup, 0);
}

/* A configured Supabase client is the source of truth. The legacy session path
 * remains solely for opening the original browser-only demo without config. */
async function startWorkspace() {
  const client = window.schoolshieldSupabase;
  if (client) {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return location.replace("login.html");
    const { data: profile } = await client.from("profiles")
      .select("role, display_name, school:schools(id, code, name)")
      .eq("id", session.user.id).maybeSingle();
    const school = Array.isArray(profile?.school) ? profile.school[0] : profile?.school;
    if (!profile || !school) {
      await client.auth.signOut();
      return location.replace("login.html");
    }
    sessionStorage.setItem("schoolshieldSession", JSON.stringify({ userId: session.user.id, schoolId: school.id, schoolCode: school.code, schoolName: school.name, role: profile.role, displayName: profile.display_name, email: session.user.email }));
    sessionStorage.setItem("schoolshieldRole", profile.role);
    SCHOOL = activeSchool();
    await connectCloudWorkspace(session.user, profile, school);
    if (["principal", "clerk"].includes(profile.role)) {
      const { count } = await client.from("account_request_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      window.schoolshieldPendingAccountAlerts = count || 0;
    }
  }
  if (!sessionStorage.getItem("schoolshieldSession") && !sessionStorage.getItem("schoolshieldRole")) return location.replace("login.html");
  render();
}
startWorkspace();
