const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../SchoolShield/app.js'), 'utf8');
function portal(role) {
  const context = vm.createContext({ sessionStorage: { getItem: () => null }, document: {}, window: {} });
  vm.runInContext(source.replace(/startWorkspace\(\);\s*$/, ''), context);
  Object.assign(context, {
    role: () => role, page: () => 'dashboard', navHasNewUpdates: () => false,
    icon: () => '', shell: html => html, stat: title => `<article>${title}</article>`,
    getState: () => ({ visitors: [], incidents: [], announcements: [], sgbPrincipalChat: [] }),
    scopeStats: () => ({ learners: 1, attendance: 90, passRate: 80, passing: 1 }),
    classesForScope: () => [], openIncidents: () => 0, table: () => '', quickForRole: () => '',
  });
  return context;
}
test('academic navigation stays available to authorised non-security roles', () => {
  for (const role of ['principal', 'deputy', 'teacher', 'clerk']) {
    const html = portal(role).nav();
    assert.match(html, /Learning/);
    assert.match(html, /test-scores.html/);
  }
  const security = portal('security').nav();
  assert.doesNotMatch(security, /Learning|test-scores.html/);
  assert.match(security, /security-officers.html/);
});
test('incidents-only dashboard layout is limited to security', () => {
  for (const role of ['principal', 'deputy', 'teacher', 'clerk']) {
    const html = portal(role).dashboard();
    assert.match(html, /Class performance/);
    assert.doesNotMatch(html, /security-dashboard-stats|security-dashboard-panels/);
    assert.equal((html.match(/<article>/g) || []).length, 4);
  }
  const html = portal('security').dashboard();
  assert.doesNotMatch(html, /Class performance/);
  assert.match(html, /security-dashboard-stats/);
  assert.match(html, /security-dashboard-panels/);
  assert.equal((html.match(/<article>/g) || []).length, 3);
});
test('notifications are limited to their role and whole-school audience', () => {
  const notices = [{ scope: 'clerk' }, { scope: 'whole-school' }, { scope: 'leadership' }];
  for (const role of ['principal', 'deputy', 'clerk', 'teacher', 'sgb', 'security', 'parent']) {
    const context = portal(role);
    context.getState = () => ({ notifications: notices, incidents: [] });
    assert.equal(context.notificationsForRole().length, ['clerk', 'principal', 'deputy'].includes(role) ? 2 : 1);
  }
});

test('teacher incidents, alerts and reports exclude other classes', () => {
  const context = portal('teacher');
  const incidents = [
    { id: 'mine', learnerId: 'L1' }, { id: 'other', learnerId: 'L2' },
    { id: 'school', scope: 'whole-school' }, { id: 'teachers', scope: 'teachers' },
    { id: 'reported', reporter: 'Teacher A' },
  ];
  const notifications = incidents.map(i => ({ id: i.id, incidentId: i.id }));
  notifications.push({ id: 'private', scope: 'teacher', recipient: 'Teacher B', learnerId: 'L1' });
  notifications.push({ id: 'class', scope: 'teacher', class: '8A' });
  notifications.push({ id: 'other-class', scope: 'teacher', class: '8B' });
  context.userName = () => 'Teacher A';
  context.teacherClasses = () => [{ id: '8A' }];
  context.learnerById = id => ({ class: id === 'L1' ? '8A' : '8B' });
  context.getState = () => ({ incidents, notifications });
  assert.deepEqual(Array.from(context.incidentsForRole(), i => i.id), ['mine', 'school', 'teachers', 'reported']);
  assert.deepEqual(Array.from(context.notificationsForRole(), i => i.id), ['mine', 'school', 'teachers', 'reported', 'class']);
});
