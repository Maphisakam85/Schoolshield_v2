const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('SchoolShield/app.js','utf8');
function portal(role = 'principal') {
  const state = { visitors: [], notifications: [], incidents: [], announcements: [], sgbPrincipalChat: [] };
  const ctx = vm.createContext({ window: {}, document: {}, sessionStorage: { getItem: () => null } });
  vm.runInContext(source.replace(/startWorkspace\(\);\s*$/, ''),ctx);
  Object.assign(ctx, { role: () => role, userName: () => 'Test User', getState: () => state,
    shell: html => html, stat: title => `<article>${title}</article>`, table: (headers,rows) => rows.join(''),
    scopeStats: () => ({ learners: 1, attendance:90,passRate:80,passing:1 }),
    classesForScope: () => [], openIncidents: () => 0, quickForRole: () => '',
    parentLearner: () => ({ id:'L1',name:'Learner Name',class:'8A',grade:'Grade 8',attendance:90,average:80 }),
    classStats: () => ({courseAverage:75}), teacherForClass: () => 'Teacher Name', notificationsForRole: () => [],
    publishedReportsForClass: () => [], badge: () => '', standingFor: () => 'On Track' });
  return { ctx,state };
}
test('local-time greeting respects every boundary including midnight', () => {
  const {ctx} = portal();
  for (const [hour,minute,expected] of [[0,0,'Good morning'],[11,59,'Good morning'],[12,0,'Good afternoon'],[17,59,'Good afternoon'],[18,0,'Good evening'],[23,59,'Good evening']]) {
    assert.equal(ctx.localTimeGreeting(new Date(2026,9,7,hour,minute)),expected);
  }
});
test('all seven dashboard roles use the shared greeting and preserve their naming', () => {
  const names = { principal:'Principal',deputy:'Deputy Principal',clerk:'School Clerk',teacher:'Teacher',security:'Security Officer',parent:'Parent / Guardian',sgb:'SGB Member' };
  for (const [role,name] of Object.entries(names)) for (const greeting of ['Good morning','Good afternoon','Good evening']) {
    const {ctx} = portal(role); ctx.localTimeGreeting = () => greeting;
    assert.ok(ctx.dashboard().includes(`<h1>${greeting}, ${name}</h1>`),`${role}: ${greeting}`);
  }
});
function visitorHarness() {
  const {ctx,state} = portal('security');
  const fields = { visitorName:'Official Name',visitorHost:'Principal',visitorPurpose:'School inspection',visitorIdentity:'P12345678',visitorType:'Government Official',visitorIdType:'Passport' };
  const errors = []; let saved;
  Object.assign(ctx,{ inputValue: id => fields[id] || '',requireValues: values => values.every(Boolean),
    todayLabel: () => '07 Oct 2026', notificationTimestamp: () => '2026-10-07T10:00:00Z',
    persist: fn => { fn(state); saved = JSON.stringify(state); }, finishForm() {},modal: (...args) => errors.push(args),
    generic: (title,eyebrow,desc,html) => html, isLeadership: () => false });
  return {ctx,state,fields,errors,saved: () => saved};
}
test('Government Official saves unchanged and displays in visitor history, detail and report', () => {
  const h = visitorHarness(); h.ctx.saveVisitor();
  assert.equal(JSON.parse(h.saved()).visitors[0].type,'Government Official');
  assert.match(h.ctx.visitors(),/Government Official/);
  assert.ok(h.ctx.visitorReportLines().some(line => line.includes('Government Official')));
  h.ctx.visitorModal(h.state.visitors[0].id);
  assert.ok(h.errors.some(args => args.join(' ').includes('Government Official')));
});
test('visitor dropdown retains all original choices alongside Government Official', () => {
  const {ctx,errors} = visitorHarness(); ctx.validateRequiredFields = ctx.validateFieldFormats = () => true; ctx.action('register',{dataset:{}});
  const html = errors.map(args=>args.join(' ')).join(' ');
  const dropdown = html.match(/id="visitorType">([\s\S]*?)<\/select>/)?.[1];
  assert.ok(dropdown);
  for (const value of ['Parent','Visitor','Service Provider','Contractor','Government Official']) assert.ok(dropdown.includes(`<option>${value}</option>`));
});
test('existing South African ID validation and same-day duplicate blocking still apply', () => {
  const h = visitorHarness(); h.fields.visitorIdType='South African ID'; h.fields.visitorIdentity='123';
  h.ctx.saveVisitor(); assert.equal(h.state.visitors.length,0); assert.equal(h.errors[0][0],'Invalid South African ID');
  h.fields.visitorIdentity='1234567890123'; h.ctx.saveVisitor(); assert.equal(h.state.visitors.length,1);
  h.ctx.saveVisitor(); assert.equal(h.state.visitors.length,1); assert.equal(h.errors.at(-1)[0],'Duplicate visitor');
});
