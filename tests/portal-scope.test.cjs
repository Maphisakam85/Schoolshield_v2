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
test('security notification filtering does not change other staff visibility', () => {
  const notices = [{ scope: 'clerk' }, { scope: 'whole-school' }, { scope: 'leadership' }];
  for (const role of ['clerk', 'teacher', 'sgb']) {
    const context = portal(role);
    context.getState = () => ({ notifications: notices });
    assert.equal(context.notificationsForRole().length, 2);
  }
  const context = portal('security');
  context.getState = () => ({ notifications: notices });
  assert.equal(context.notificationsForRole().length, 1);
});
