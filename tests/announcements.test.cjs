const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('SchoolShield/app.js','utf8');
function portal(role = 'principal') {
  const fields = Object.fromEntries(Object.entries({ annTitle: '  Notice  ', annBody: '  First line\nSecond line  ', audienceSelect: role === 'teacher' ? 'my-classes-parents' : 'whole-school', deliverySelect: 'In-app notification' }).map(([id,value]) => ['#'+id,{value}]));
  const button = {}; fields["[data-action='send-announcement']"] = button;
  const state = { announcements: [], notifications: [] }, stored = {}, errors = [], writes = [];
  const ctx = vm.createContext({ window: {}, document: { querySelector: key => fields[key], querySelectorAll: () => [] }, crypto: require('node:crypto').webcrypto, sessionStorage: { getItem: key => stored[key] || (key === 'schoolshieldSession' ? JSON.stringify({ userId: 'author', schoolId: 'school', role }) : null), setItem: (key,value) => stored[key] = value } });
  vm.runInContext(source.replace(/startWorkspace\(\);\s*$/, ''),ctx);
  Object.assign(ctx, { role: () => role, userName: () => 'Author', getState: () => state, workspaceCacheKey: () => 'cache', $: key => fields[key], inputValue: id => (fields['#'+id]?.value || '').trim(), audienceOptions: () => [{ id: role === 'teacher' ? 'my-classes-parents' : 'whole-school', label: 'Whole school', count: 12 }], modal: (...args) => errors.push(args), render() {}, finishForm() {}, learners: () => [{ class: '8A', grade: 'Grade 8' }] });
  ctx.window.schoolshieldCloudWorkspaceReady = true;
  ctx.window.schoolshieldSupabase = { rpc: async (name, params) => {
    writes.push({ name, params });
    return { data: { id: params.p_id, title: params.p_title, body: params.p_body, audienceId: params.p_audience_id, audience: params.p_audience, author: 'Author', authorId: 'author', date: '08 Oct 2026' } };
  } };
  return { ctx, fields, button, errors, writes, stored, state };
}
test('every authorized role publishes title/body/audience and caches only a confirmed server record', async () => {
  for (const role of ['principal','deputy','clerk','teacher']) {
    const { ctx, writes, stored, fields } = portal(role);
    await ctx.sendAnnouncement();
    assert.equal(writes.length,1); assert.equal(writes[0].name,'publish_school_announcement');
    assert.equal(writes[0].params.p_title,'Notice'); assert.equal(writes[0].params.p_body,'First line\nSecond line');
    const saved = JSON.parse(stored.cache).announcements[0];
    assert.equal(saved.authorId,'author'); assert.equal(saved.audienceId,role === 'teacher' ? 'my-classes-parents' : 'whole-school'); assert.equal(saved.date,'08 Oct 2026');
    assert.equal(fields['#annBody'].value,'');
  }
});
test('blank messages and titles never invoke Supabase', async () => {
  for (const field of ['#annTitle','#annBody']) {
    const { ctx, fields, writes, errors } = portal(); fields[field].value = ' \t\n ';
    await ctx.sendAnnouncement(); assert.equal(writes.length,0); assert.equal(errors.length,1);
  }
});
test('duplicate clicks share one submission; retry after uncertain failure reuses its ID', async () => {
  const { ctx, fields, button, writes, errors } = portal(); let release;
  ctx.window.schoolshieldSupabase.rpc = (name,params) => { writes.push(params); return new Promise(resolve => release = resolve); };
  const first = ctx.sendAnnouncement(); await ctx.sendAnnouncement(); assert.equal(writes.length,1); assert.equal(button.disabled,true);
  release({ error: { message: 'network failure' } }); await first;
  assert.equal(fields['#annBody'].value.trim(),'First line\nSecond line'); assert.equal(errors.length,1);
  const retry = ctx.sendAnnouncement(); await Promise.resolve(); await Promise.resolve(); assert.equal(writes[0].p_id,writes[1].p_id);
  release({ data: { id: writes[1].p_id } }); await retry; assert.equal(button.disabled,false);
});
test('unauthorized roles cannot publish, and recipients match selected audience', async () => {
  for (const role of ['parent','security','sgb']) {
    const { ctx, writes } = portal(role); await ctx.sendAnnouncement(); assert.equal(writes.length,0);
  }
  const audienceRoles = { 'whole-school': ['principal','deputy','clerk','teacher','parent','sgb','security'], 'all-parents': ['parent'], 'all-staff': ['principal','deputy','clerk','teacher','security'], teachers: ['teacher'], leadership: ['principal','deputy'], administration: ['clerk'], sgb: ['sgb'], security: ['security'] };
  for (const [audienceId, allowed] of Object.entries(audienceRoles)) for (const role of Object.keys({ principal:1,deputy:1,clerk:1,teacher:1,parent:1,sgb:1,security:1 })) {
    assert.equal(portal(role).ctx.announcementIsVisible({ audienceId,authorId:'other' }),allowed.includes(role));
  }
  const { ctx } = portal('parent');
  assert.equal(ctx.announcementIsVisible({ audienceId:'class-8A' }),true);
  assert.equal(ctx.announcementIsVisible({ audienceId:'class-8B' }),false);
  assert.equal(ctx.announcementIsVisible({ audienceId:'grade-Grade-8' }),true);
  assert.equal(ctx.announcementIsVisible({ audienceId:'my-classes-parents',classIds:['8B'] }),false);
});
test('blank edits are rejected and failed edits keep the original saved announcement', async () => {
  const { ctx, fields, writes, state } = portal();
  state.announcements.push({ id:'ANN-original', title:'Original', body:'Original message', author:'Author' });
  fields['#editAnnouncementTitle'] = { value:'Edited' }; fields['#editAnnouncementBody'] = { value:'  ' };
  await ctx.saveAnnouncement('ANN-original'); assert.equal(writes.length,0);
  fields['#editAnnouncementBody'].value = 'Edited message';
  ctx.window.schoolshieldSupabase.rpc = async () => ({ error:{message:'Permission denied'} });
  await ctx.saveAnnouncement('ANN-original'); assert.equal(state.announcements[0].body,'Original message');
});
test('a fresh login/refresh restores announcements and in-app notices from Supabase', async () => {
  const publisher = portal(); await publisher.ctx.sendAnnouncement();
  const databasePayload = JSON.parse(publisher.stored.cache);
  const reader = portal('teacher');
  reader.ctx.window.schoolshieldSupabase = { from: table => {
    assert.equal(table,'school_workspaces');
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { payload: databasePayload, version: 13 } }) }) }) };
  } };
  assert.equal(await reader.ctx.refreshCloudWorkspace(false),true);
  const refreshed = JSON.parse(reader.stored.cache);
  assert.equal(refreshed.announcements[0].body,'First line\nSecond line');
  assert.equal(refreshed.notifications[0].announcementId,refreshed.announcements[0].id);
});
test('network rejection can be retried without blocking the save queue', async () => {
  const { ctx, writes } = portal();
  ctx.window.schoolshieldSupabase.rpc = async () => { throw new Error('Offline'); };
  await ctx.sendAnnouncement();
  const id = ctx.window.schoolshieldAnnouncementDraft.id;
  ctx.window.schoolshieldSupabase.rpc = async (name, params) => { writes.push(params); return { data: { id:params.p_id } }; };
  await ctx.sendAnnouncement(); assert.equal(writes.length,1); assert.equal(writes[0].p_id,id);
});
