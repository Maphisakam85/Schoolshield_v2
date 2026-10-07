const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ URL, URLSearchParams });
vm.runInContext(fs.readFileSync('SchoolShield/invitation.js', 'utf8'), context);
const { normalizePhone, exchangeInvitation } = context.SchoolShieldInvitation;
const backend = () => import('../supabase/functions/approve-account/invitation.mjs');
test('South African cellphone formats normalize consistently in browser and backend', async () => {
  const server = await backend();
  for (const value of ['082 123 4567', '+27 82 123 4567', '27821234567', '0027821234567']) {
    assert.equal(normalizePhone(value), '+27821234567');
    assert.equal(server.normalizePhone(value), '+27821234567');
  }
  for (const value of ['', '0211234567', '+44821234567', '082123456', '08212345678']) {
    assert.throws(() => normalizePhone(value)); assert.throws(() => server.normalizePhone(value));
  }
});
test('invitation exchanges token hash, PKCE code and legacy fragment sessions', async () => {
  for (const [suffix, method] of [['?token_hash=abc&type=invite', 'verifyOtp'], ['?code=abc', 'exchangeCodeForSession'], ['#access_token=a&refresh_token=b&type=invite', 'setSession']]) {
    let called = false;
    const session = { user: { id: 'approved-user' } };
    const client = { auth: { [method]: async () => { called = true; return { data: { session } }; } } };
    assert.equal(await exchangeInvitation(client, 'https://school.test/account-setup.html' + suffix), session);
    assert.equal(called, true);
  }
});
test('missing, invalid, expired and reused invitations cannot fall back to another session', async () => {
  await assert.rejects(exchangeInvitation({}, 'https://school.test/account-setup.html'), /No valid invitation/);
  await assert.rejects(exchangeInvitation({}, 'https://school.test/account-setup.html#error=access_denied'), /expired or already used/);
  const client = { auth: { verifyOtp: async () => ({ error: { message: 'otp_expired' } }) } };
  await assert.rejects(exchangeInvitation(client, 'https://school.test/account-setup.html?token_hash=used&type=invite'), /expired or already used/);
});
test('production redirects reject localhost and preserve deployment subdirectory', async () => {
  const { setupUrl } = await backend();
  assert.equal(setupUrl('https://school.test/SchoolShield/account-setup.html'), 'https://school.test/SchoolShield/account-setup.html');
  for (const value of ['http://localhost/account-setup.html', 'https://localhost/account-setup.html', 'https://school.test/login.html', 'https://school.test/account-setup.html?x=1']) assert.throws(() => setupUrl(value));
});
test('SMS requires configured secrets and makes a real provider request; failures are reported', async () => {
  const { smsConfig, sendSms } = await backend();
  assert.throws(() => smsConfig(() => undefined), /not configured/);
  const config = { sid: 'AC' + 'a'.repeat(32), token: 'server-secret', from: '+27820000000' };
  let called = false;
  await sendSms(config, '0821234567', 'setup link', async (url, options) => {
    called = true; assert.match(url, /^https:\/\/api.twilio.com/); assert.equal(options.body.get('To'), '+27821234567');
    return { ok: true, json: async () => ({ sid: 'SM123', status: 'queued' }) };
  });
  assert.equal(called, true);
  await assert.rejects(sendSms(config, '0821234567', 'setup', async () => ({ ok: false, json: async () => ({}) })), /did not accept/);
});
test('setup creates a password, completes only personal fields, signs out and returns to first login', async () => {
  const elements = Object.fromEntries(['setupForm','setupWaiting','setupError','setupName','setupPhone','setupPassword','setupConfirmPassword','setupAddress','setupEmergency'].map(id => [id, { hidden: true, style: {}, value: '' }]));
  const button = {}; elements.setupForm.querySelector = () => button;
  const calls = []; let redirect;
  const client = { auth: { updateUser: async body => { calls.push(body); return {}; }, signOut: async () => calls.push('signOut') },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { display_name: 'Approved Parent', phone: '+27821234567', onboarding_completed_at: null, role: 'parent', school_id: 'school-1' } }) }) }) }),
    rpc: async (name, body) => { calls.push({ name, body }); return {}; } };
  const sandbox = vm.createContext({ window: { schoolshieldSupabase: client }, document: { getElementById: id => elements[id] }, history: { replaceState() {} }, location: { href: 'https://school.test/account-setup.html', pathname: '/account-setup.html', replace: value => redirect = value }, sessionStorage: { removeItem() {} }, SchoolShieldInvitation: { normalizePhone, exchangeInvitation: async () => ({ user: { id: 'approved' } }) } });
  await vm.runInContext(fs.readFileSync('SchoolShield/account-setup.js','utf8'), sandbox);
  assert.equal(elements.setupForm.hidden, false);
  elements.setupPassword.value = elements.setupConfirmPassword.value = 'SecurePassword123';
  await elements.setupForm.onsubmit({ preventDefault() {} });
  assert.equal(calls[0].password, 'SecurePassword123');
  assert.equal(calls[1].name, 'complete_my_profile');
  assert.equal(calls[1].body.p_phone, '+27821234567');
  assert.equal('role' in calls[1].body, false); assert.equal('school_id' in calls[1].body, false);
  assert.equal(calls[2], 'signOut'); assert.equal(redirect, 'login.html?setup=complete');
});

async function approvalHarness({ role = 'principal', school = 'school-1', delivery = 'email', existing = false } = {}) {
  const helpers = await backend(); let handler; const calls = [];
  const pending = { id: 'request-1', school_id: 'school-1', email: 'parent@example.test', display_name: 'Parent', status: 'pending', invitation_method: delivery, phone: '+27821234567' };
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'approver' } } }), admin: {
      inviteUserByEmail: async (email, options) => { calls.push({ email, options }); return { data: { user: { id: 'new-user' } } }; },
      generateLink: async options => { calls.push(options); return { data: { user: { id: 'new-user' }, properties: { hashed_token: 'secure-hash' } } }; },
      updateUserById: async (id, body) => { calls.push({ id, body }); return {}; }, deleteUser: async () => ({}) } },
    from(table) {
      const filters = {};
      const builder = { select() { return this; }, eq(key, value) { filters[key] = value; return this; },
        maybeSingle: async () => table === 'profiles' ? { data: filters.id === 'approver' ? { school_id: school, role } : existing ? { id: 'new-user' } : null } : { data: filters.school_id === pending.school_id ? pending : null },
        single: async () => ({ data: { code: 'SCHOOL-1', name: 'School One' } }),
        insert: async body => { calls.push({ table, insert: body }); return {}; },
        update(body) { calls.push({ table, update: body }); return this; }, then(resolve) { resolve({}); } };
      return builder;
    },
  };
  const env = { SUPABASE_URL: 'https://auth.test', SCHOOLSHIELD_ACCOUNT_SETUP_URL: 'https://school.test/SchoolShield/account-setup.html', SCHOOLSHIELD_SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32), TWILIO_AUTH_TOKEN: 'secret', TWILIO_FROM_NUMBER: '+27820000000' };
  let source = fs.readFileSync('supabase/functions/approve-account/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('body: unknown', 'body').replace(': string | undefined', '').replace('(name: string)', '(name)').replace(/\)!/g, ')');
  const sandbox = vm.createContext({ ...helpers, createClient: () => admin, Deno: { env: { get: name => env[name] }, serve: fn => handler = fn }, Response, URL });
  vm.runInContext(source, sandbox);
  // SMS helper remains real code; replace its transport with a provider response.
  sandbox.sendSms = async (config, phone, body) => { calls.push({ sms: body, phone }); return 'SM123'; };
  const response = await handler(new Request('https://auth.test/functions/v1/approve-account', { method: 'POST', headers: { Authorization: 'Bearer approver-token' }, body: JSON.stringify({ request_id: pending.id, role: 'parent', delivery: 'preferred', redirect_to: 'http://localhost/account-setup.html' }) }));
  return { response, calls };
}
test('email approval uses configured URL and assigns only approved school and role', async () => {
  const { response, calls } = await approvalHarness();
  assert.equal(response.status, 200);
  assert.equal(calls[0].options.redirectTo, 'https://school.test/SchoolShield/account-setup.html');
  const profile = calls.find(call => call.insert)?.insert;
  assert.equal(profile.role, 'parent'); assert.equal(profile.school_id, 'school-1');
  assert.equal(calls.find(call => call.body)?.body.app_metadata.role, 'parent');
});
test('approval rejects unauthorized roles, other schools and existing account reassignment', async () => {
  for (const options of [{ role: 'parent' }, { school: 'school-2' }, { existing: true }]) {
    const { response, calls } = await approvalHarness(options);
    assert.ok(response.status >= 400); assert.equal(calls.some(call => call.insert || call.body), false);
  }
});
test('SMS approval passes the direct setup token to provider and never returns it to ordinary approval', async () => {
  const { response, calls } = await approvalHarness({ delivery: 'sms' });
  assert.equal(response.status, 200);
  assert.match(calls.find(call => call.sms)?.sms, /account-setup.html\?token_hash=secure-hash&type=invite/);
  assert.equal((await response.json()).setup_link, undefined);
});
test('first login reads trusted role and school and rejects the wrong school code', async () => {
  const source = fs.readFileSync('SchoolShield/login.html','utf8');
  const fn = source.match(/async function createSession\(user, schoolCode\) \{[^\n]+/)[0];
  const stored = {};
  const sandbox = vm.createContext({ client: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'parent', display_name: 'Parent', school: { id: 'school-1', code: 'SCHOOL-1', name: 'School One' } } }) }) }) }) }, sessionStorage: { setItem: (key, value) => stored[key] = value } });
  vm.runInContext(fn, sandbox);
  await sandbox.createSession({ id: 'new-user', email: 'parent@example.test' }, 'SCHOOL-1');
  assert.equal(JSON.parse(stored.schoolshieldSession).role, 'parent');
  assert.equal(JSON.parse(stored.schoolshieldSession).schoolId, 'school-1');
  await assert.rejects(sandbox.createSession({ id: 'new-user' }, 'OTHER'), /not approved/);
});
