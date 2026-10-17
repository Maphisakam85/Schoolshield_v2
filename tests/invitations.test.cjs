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
  for (const [suffix, method] of [['?token_hash=abc&type=invite', 'verifyOtp'], ['?token_hash=abc&type=recovery', 'verifyOtp'], ['?code=abc', 'exchangeCodeForSession'], ['#access_token=a&refresh_token=b&type=invite', 'setSession']]) {
    let called = false;
    const session = { user: { id: 'approved-user' } };
    const client = { auth: { [method]: async () => { called = true; return { data: { session } }; } } };
    assert.equal(await exchangeInvitation(client, 'https://school.test/account-setup.html' + suffix), session);
    assert.equal(called, true);
  }
});
test('missing, invalid, expired and reused invitations cannot fall back to another session', async () => {
  await assert.rejects(exchangeInvitation({}, 'https://school.test/account-setup.html'), /invalid, expired or already used/);
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

async function approvalHarness({ role='principal', school='school-1', existing=false, inactive=false, suspended=false, delivery='email' }={}) {
 let handler; const calls=[];
 const pending={id:'00000000-0000-4000-8000-000000000001',school_id:'school-1',email:'parent@example.test',display_name:'Real Parent',phone:'+27821234567',invitation_method:delivery};
 const admin={rpc:async name=>{assert.equal(name,'get_my_school_access');if(suspended)return {error:{message:'School suspended'}};return {data:{school_id:school,features:{announcements:true,appointments:true}}};},auth:{getUser:async()=>({data:{user:{id:'approver'}}})},from(table){const filters={};return {select(){return this},eq(k,v){filters[k]=v;return this},maybeSingle:async()=>({data:table==='profiles'?{id:'approver',school_id:school,role,account_status:inactive?'Inactive':'Active'}:filters.school_id==='school-1'?pending:null}),update(body){calls.push({table,body});return this},then(resolve){resolve({});}}}};
 const manageUser=async args=>{calls.push(args.body);if(existing)throw Error('Email already exists');return {ok:true,user_id:'new-user',message:'Supabase accepted email',setup_link:delivery==='setup_link'?'https://school.test/account-setup.html?token_hash=hash&type=invite':undefined};};
 let source=fs.readFileSync('supabase/functions/approve-account/index.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace('body: unknown','body').replace('(name: string)','(name)').replace(/\)!/g,')');
 vm.runInContext(source,vm.createContext({manageUser,createClient:()=>admin,Deno:{env:{get:()=>''},serve:fn=>handler=fn},Response}));
 const response=await handler(new Request('https://auth.test/functions/v1/approve-account',{method:'POST',headers:{Authorization:'Bearer token'},body:JSON.stringify({request_id:pending.id,role:'parent',delivery:'preferred'})}));
 return {response,calls};
}
test('approval delegates real account creation to the protected user management service',async()=>{
 const {response,calls}=await approvalHarness();assert.equal(response.status,200);const created=calls.find(c=>c.action==='create');assert.equal(created.fields.school_id,'school-1');assert.equal(created.fields.role,'parent');assert.equal(created.fields.first_name,'Real');assert.equal(created.fields.last_name,'Parent');assert.equal(created.delivery,'email');assert.equal(calls.find(c=>c.table==='account_requests').body.status,'approved');
});
test('approval rejects unauthorized, inactive, cross-school and duplicate accounts',async()=>{
 for(const options of [{role:'parent'},{inactive:true},{school:'school-2'},{existing:true}]){const {response,calls}=await approvalHarness(options);assert.ok(response.status>=400);assert.equal(calls.some(c=>c.table==='account_requests'),false);}
});
test('approval respects SMS preference and does not expose bearer links in SMS responses',async()=>{const {response,calls}=await approvalHarness({delivery:'sms'});assert.equal(response.status,200);assert.equal(calls.find(c=>c.action==='create').delivery,'sms');assert.equal((await response.json()).setup_link,undefined);});

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

test('recovery rejects malformed, mixed-purpose and provider-error links before Auth calls', async () => {
  const exchange = context.SchoolShieldInvitation.exchangeRecovery;
  for (const suffix of ['?code=a&code=b','?code=a&token_hash=b&type=recovery','?token_hash=a&type=invite','#access_token=a&type=recovery','?error_code=otp_expired','?error_description=expired']) {
    await assert.rejects(exchange({}, 'https://school.test/login.html'+suffix), /password-reset link is invalid/);
  }
});
test('recovery supports code, token hash and legacy fragment without using a cached login', async () => {
  for (const [suffix,method] of [['?code=a','exchangeCodeForSession'],['?token_hash=a&type=recovery','verifyOtp'],['#access_token=a&refresh_token=b&type=recovery','setSession']]) {
    const session={user:{id:'recovery-user'}};
    assert.equal(await context.SchoolShieldInvitation.exchangeRecovery({auth:{[method]:async()=>({data:{session}})}}, 'https://school.test/login.html'+suffix),session);
  }
  await assert.rejects(context.SchoolShieldInvitation.exchangeRecovery({auth:{exchangeCodeForSession:async()=>{throw Error('missing verifier')}}},'https://school.test/login.html?code=a'),/browser where you requested/);
});

test('a suspended school denies approval before any real account operation',async()=>{const {response,calls}=await approvalHarness({suspended:true});assert.equal(response.status,403);assert.equal(calls.some(c=>c.action==='create'),false);});
