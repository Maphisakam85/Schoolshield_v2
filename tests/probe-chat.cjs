const fs = require('fs');
const vm = require('vm');
(async () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync('SchoolShield/supabase-config.js', 'utf8'), context);
  const { url, publishableKey: key } = context.window.SCHOOLSHIELD_SUPABASE_CONFIG;
  const r = await fetch(url + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'parent@setjhabasemaketse.test', password: 'Test@123' }),
  });
  const auth = await r.json();
  console.log('Login status', r.status);
  if (!auth.access_token) return;
  for (const endpoint of ['/auth/v1/user', '/functions/v1/parent-workspace', '/functions/v1/parent-chat']) {
    const fn = endpoint.includes('functions');
    const response = await fetch(url + endpoint, {
      method: fn ? 'POST' : 'GET',
      headers: { apikey: key, Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' },
      ...(fn ? { body: '{}' } : {}),
    });
    const result = await response.json();
    console.log(endpoint, response.status, result.error || result.message || (result.payload ? 'Workspace received' : 'User verified'));
  }
})().catch(error => { console.error(error.message); process.exit(1); });
