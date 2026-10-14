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
  async function exchangeInvitation(client, href) {
    const url = new URL(href), query = url.searchParams, hash = new URLSearchParams(url.hash.slice(1));
    if (query.has('error') || hash.has('error')) throw new Error('This invitation is invalid, expired or already used. Ask your school administrator for a new invitation.');
    let result;
    if (query.get('token_hash') && query.get('type') === 'invite') {
      result = await client.auth.verifyOtp({ token_hash: query.get('token_hash'), type: 'invite' });
    } else if (query.get('code')) {
      result = await client.auth.exchangeCodeForSession(query.get('code'));
    } else if (hash.get('access_token') && hash.get('refresh_token') && hash.get('type') === 'invite') {
      result = await client.auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') });
    } else throw new Error('No valid invitation was found. Open the invitation sent by your school administrator.');
    if (result.error || !result.data?.session) throw new Error('This invitation is invalid, expired or already used. Ask your school administrator for a new invitation.');
    return result.data.session;
  }
  root.SchoolShieldInvitation = { normalizePhone, exchangeInvitation };
})(typeof window === 'undefined' ? globalThis : window);
