const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'SchoolShield');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'supabase-client.js'), 'utf8');
const storage = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
};
function clientHarness({ status = 200, refreshError = false, userId = 'parent', fetchError = false } = {}) {
  const calls = [];
  let refreshes = 0;
  const context = vm.createContext({ window: {}, sessionStorage: storage() });
  vm.runInContext(clientSource, context);
  context.sessionStorage.setItem('schoolshieldSession', JSON.stringify({ userId: 'parent' }));
  context.window.SCHOOLSHIELD_SUPABASE_CONFIG = { url: 'https://example.test', publishableKey: 'public' };
  context.window.schoolshieldSupabase = { auth: {
    getSession: async () => ({ data: { session: { access_token: 'old', user: { id: userId } } } }),
    refreshSession: async () => {
      refreshes++;
      return { error: refreshError ? new Error('expired') : null, data: { session: { access_token: 'new', user: { id: userId } } } };
    },
  } };
  context.fetch = async (url, options) => {
    calls.push({ url, ...options });
    if (fetchError) throw new Error('Network offline');
    return { status: calls.length === 1 ? status : 200 };
  };
  return { context, calls, refreshes: () => refreshes, request: context.window.schoolshieldFunctionRequest };
}
test('rejected chat token refreshes once and retries the same message', async () => {
  const h = clientHarness({ status: 401 });
  await h.request('parent-chat', { learner_id: 'L1', text: 'hello' });
  assert.equal(h.refreshes(), 1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].headers.Authorization, 'Bearer new');
  assert.equal(h.calls[0].body, h.calls[1].body);
});
test('parent inbox refresh uses the same session recovery', async () => {
  const h = clientHarness({ status: 401 });
  await h.request('parent-workspace');
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1].url, /parent-workspace$/);
});
test('expired refresh token asks for sign-in without retrying a send', async () => {
  const h = clientHarness({ status: 401, refreshError: true });
  await assert.rejects(h.request('parent-chat'), /Sign in again/);
  assert.equal(h.calls.length, 1);
});
test('wrong user session cannot send from another portal', async () => {
  const h = clientHarness({ userId: 'teacher' });
  await assert.rejects(h.request('parent-chat'), /Sign in again/);
  assert.equal(h.calls.length, 0);
});
test('network and permission errors do not automatically repeat messages', async () => {
  const offline = clientHarness({ fetchError: true });
  await assert.rejects(offline.request('parent-chat'), /Network offline/);
  assert.equal(offline.calls.length, 1);
  const denied = clientHarness({ status: 403 });
  assert.equal((await denied.request('parent-chat')).status, 403);
  assert.equal(denied.calls.length, 1);
});
test('parent and teacher workspace caches are isolated', () => {
  const source = app.slice(app.indexOf('function workspaceCacheKey()'), app.indexOf('function save(state)'));
  const read = (userId, tabStorage) => {
    tabStorage.setItem('schoolshieldSession', JSON.stringify({ userId, schoolCode: 'S1' }));
    const context = vm.createContext({ sessionStorage: tabStorage, SCHOOL: { code: 'S1' }, WORKSPACE_VERSION: 13,
      emptyWorkspace: () => ({ learners: [], notifications: [] }), save: () => {} });
    vm.runInContext(source, context);
    return context;
  };
  const teacher = read('teacher', storage());
  const parent = read('parent', storage());
  teacher.sessionStorage.setItem(teacher.workspaceCacheKey(), JSON.stringify({ learners: ['L1', 'L2'] }));
  parent.sessionStorage.setItem(parent.workspaceCacheKey(), JSON.stringify({ learners: ['L1'] }));
  assert.equal(teacher.getState().learners.length, 2);
  assert.equal(parent.getState().learners.length, 1);
  assert.notEqual(teacher.workspaceCacheKey(), parent.workspaceCacheKey());
});
function sendHarness({ reject = false } = {}) {
  const input = { value: 'hello parent' };
  const button = { disabled: false };
  const calls = [];
  let refreshed = false;
  let error = '';
  const context = vm.createContext({
    window: { schoolshieldFunctionRequest: async (name, body) => {
      calls.push({ name, body });
      return { ok: !reject, json: async () => reject ? { error: 'Invalid session' } : { ok: true } };
    } },
    $: selector => selector === '#chatInput' ? input : button,
    role: () => 'teacher',
    getState: () => ({ parentChat: [{ learnerId: 'L1' }] }),
    learnerById: id => ({ id }),
    refreshCloudWorkspace: async () => { refreshed = true; },
    modal: (title, message) => { error = message; },
  });
  vm.runInContext(app.slice(app.indexOf('async function sendMessage('), app.indexOf('function exportCsv()')), context);
  return { context, input, button, calls, refreshed: () => refreshed, error: () => error };
}
test('teacher sends to the selected learner, blocks duplicate clicks and clears only after success', async () => {
  const h = sendHarness();
  await Promise.all([h.context.sendMessage('parentChat'), h.context.sendMessage('parentChat')]);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].body.learner_id, 'L1');
  assert.equal(h.input.value, '');
  assert.equal(h.refreshed(), true);
  assert.equal(h.button.disabled, false);
});
test('failed messages retain the draft and restore the send button', async () => {
  const h = sendHarness({ reject: true });
  await h.context.sendMessage('parentChat');
  assert.equal(h.input.value, 'hello parent');
  assert.equal(h.refreshed(), false);
  assert.match(h.error(), /Invalid session/);
  assert.equal(h.button.disabled, false);
});

function pollingHarness() {
  const timers = [];
  const events = {};
  let payload = { parentChat: [{ learnerId: 'L1', messages: [] }] };
  let renders = 0;
  const context = vm.createContext({
    window: {
      schoolshieldSupabase: {},
      schoolshieldFunctionRequest: async () => ({ ok: true, json: async () => ({ payload, linked: true }) }),
      addEventListener: (name, callback) => { events[name] = callback; },
    },
    document: { visibilityState: 'visible', addEventListener: (name, callback) => { events[name] = callback; } },
    sessionStorage: storage(),
    workspaceCacheKey: () => 'parent-cache',
    page: () => 'parent-chat',
    render: () => { renders++; },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    console: { warn: () => {} },
  });
  context.sessionStorage.setItem('schoolshieldSession', JSON.stringify({ schoolId: 'S1', role: 'parent' }));
  vm.runInContext(app.slice(app.indexOf('async function refreshCloudWorkspace('), app.indexOf('async function refreshWorkspaceManually(')), context);
  context.startWorkspaceAutoRefresh();
  return { context, timers, events, renders: () => renders, receive: () => {
    payload = { parentChat: [{ learnerId: 'L1', messages: [{ sender: 'teacher', text: 'New message' }] }] };
  } };
}
test('idle receiver loads an incoming teacher message without sending anything', async () => {
  const h = pollingHarness();
  assert.equal(h.timers[0].delay, 3000);
  await h.timers.shift().callback();
  h.receive();
  await h.timers.shift().callback();
  const cached = JSON.parse(h.context.sessionStorage.getItem('parent-cache'));
  assert.equal(cached.parentChat[0].messages[0].text, 'New message');
  assert.equal(h.renders(), 2);
  await h.timers.shift().callback();
  assert.equal(h.renders(), 2, 'unchanged polls do not redraw the conversation');
});
test('automatic refresh resumes after a failure and refreshes on reconnect', async () => {
  const h = pollingHarness();
  const original = h.context.refreshCloudWorkspace;
  h.context.refreshCloudWorkspace = async () => { throw new Error('offline'); };
  await h.timers.shift().callback();
  assert.equal(h.timers.length, 1);
  h.context.refreshCloudWorkspace = original;
  h.receive();
  await h.events.online();
  assert.equal(h.renders(), 1);
});
test('hidden tabs pause polling and overlapping focus events share a request', async () => {
  const h = pollingHarness();
  h.context.document.visibilityState = 'hidden';
  await h.timers.shift().callback();
  assert.equal(h.renders(), 0);
  h.context.document.visibilityState = 'visible';
  let finish;
  let requests = 0;
  h.context.refreshCloudWorkspace = () => { requests++; return new Promise(resolve => { finish = resolve; }); };
  const one = h.events.focus();
  const two = h.events.visibilitychange();
  assert.equal(requests, 1);
  finish();
  await Promise.all([one, two]);
  h.context.startWorkspaceAutoRefresh();
  assert.equal(h.timers.length, 1, 'starting twice does not duplicate the timer');
});

test('parent link screen distinguishes failed loading from a confirmed missing link', () => {
  const context = vm.createContext({ window: {}, generic: (...args) => args.join(' ') });
  vm.runInContext(app.slice(app.indexOf('function parentLinkRequired('), app.indexOf('/* ----------------------------- domain: audience')), context);
  assert.match(context.parentLinkRequired(), /Retry loading/);
  assert.doesNotMatch(context.parentLinkRequired(), /ask the school clerk/);
  context.window.schoolshieldParentWorkspaceError = 'Session expired';
  assert.match(context.parentLinkRequired(), /Session expired/);
  context.window.schoolshieldParentWorkspaceError = '';
  context.window.schoolshieldParentLearnerLinked = true;
  assert.match(context.parentLinkRequired(), /Your account is linked/);
  context.window.schoolshieldParentLearnerLinked = false;
  assert.match(context.parentLinkRequired(), /ask the school clerk/);
});

test('parent loading failure redraws its error and recovery redraws unchanged data', async () => {
  const h = pollingHarness();
  await h.timers.shift().callback();
  const original = h.context.window.schoolshieldFunctionRequest;
  h.context.window.schoolshieldFunctionRequest = async () => { throw Error('Session expired'); };
  await h.timers.shift().callback();
  assert.equal(h.context.window.schoolshieldParentWorkspaceError, 'Session expired');
  assert.equal(h.renders(), 2);
  h.context.window.schoolshieldFunctionRequest = original;
  await h.timers.shift().callback();
  assert.equal(h.context.window.schoolshieldParentWorkspaceError, '');
  assert.equal(h.renders(), 3);
});
