/* Shared invitation helpers; contains no provider credentials. */
(function (root) {
  function normalizePhone(value) {
    let phone = String(value || '').replace(/[\s()-]/g, '');
    if (phone.startsWith('0027')) phone = '+' + phone.slice(2);
    if (/^0[6-8]\d{8}$/.test(phone)) phone = '+27' + phone.slice(1);
    if (/^27[6-8]\d{8}$/.test(phone)) phone = '+' + phone;
    if (!/^\+27[6-8]\d{8}$/.test(phone)) throw new Error('Enter a South African cellphone number, for example 082 123 4567 or +27 82 123 4567.');
    return phone;
  }
  async function exchangeAuthLink(client, href, purpose = 'invite') {
    const url = new URL(href), query = url.searchParams, hash = new URLSearchParams(url.hash.slice(1));
    const invalid = purpose === 'recovery' ? 'This password-reset link is invalid, expired or already used. Request a new reset link. For a code link, use the browser where you requested it.' : 'This invitation is invalid, expired or already used. Ask your school administrator for a new invitation.';
    const keys = ['code','token_hash','access_token','refresh_token','type'];
    if (keys.some(key => query.getAll(key).length + hash.getAll(key).length > 1) || ['error','error_code','error_description'].some(key=>query.has(key)||hash.has(key))) throw new Error(invalid);
    const type = query.get('type') || hash.get('type');
    if (type && !(purpose === 'invite' ? ['invite','recovery'] : ['recovery']).includes(type)) throw new Error(invalid);
    const methods = Number(query.has('code')) + Number(query.has('token_hash')) + Number(hash.has('access_token') || hash.has('refresh_token'));
    if (methods !== 1) throw new Error(invalid);
    let result;
    try {
    if (query.get('token_hash') && ['invite','recovery'].includes(query.get('type'))) {
      result = await client.auth.verifyOtp({ token_hash: query.get('token_hash'), type: query.get('type') });
    } else if (query.get('code')) {
      result = await client.auth.exchangeCodeForSession(query.get('code'));
    } else if (hash.get('access_token') && hash.get('refresh_token') && ['invite','recovery'].includes(hash.get('type'))) {
      result = await client.auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') });
    } else throw new Error(invalid);
    } catch { throw new Error(invalid); }
    if (result.error || !result.data?.session) throw new Error(invalid);
    return result.data.session;
  }
  const exchangeInvitation = (client, href) => exchangeAuthLink(client, href, 'invite');
  const exchangeRecovery = (client, href) => exchangeAuthLink(client, href, 'recovery');
  root.SchoolShieldInvitation = { normalizePhone, exchangeInvitation, exchangeRecovery };
})(typeof window === 'undefined' ? globalThis : window);
