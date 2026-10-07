export function setupUrl(value, allowLocal = false) {
  const url = new URL(value || '');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(allowLocal && local && url.protocol === 'http:')) || (local && !allowLocal) || url.username || url.password || !url.pathname.endsWith('/account-setup.html') || url.search || url.hash) throw new Error('Configure SCHOOLSHIELD_ACCOUNT_SETUP_URL as the deployed HTTPS account-setup.html URL.');
  return url.toString();
}
export function normalizePhone(value) {
  let phone = String(value || '').replace(/[\s()-]/g, '');
  if (phone.startsWith('0027')) phone = '+' + phone.slice(2);
  if (/^0[6-8]\d{8}$/.test(phone)) phone = '+27' + phone.slice(1);
  if (/^27[6-8]\d{8}$/.test(phone)) phone = '+' + phone;
  if (!/^\+27[6-8]\d{8}$/.test(phone)) throw new Error('A valid South African cellphone number is required for SMS.');
  return phone;
}
export function smsConfig(env) {
  const sid = env('TWILIO_ACCOUNT_SID'), token = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM_NUMBER');
  if (env('SCHOOLSHIELD_SMS_PROVIDER') !== 'twilio' || !/^AC[0-9a-f]{32}$/i.test(sid || '') || !token || !from) throw new Error('SMS delivery is not configured. Configure the backend Twilio secrets or use email/manual setup link.');
  return { sid, token, from };
}
export async function sendSms(config, phone, message, fetcher = fetch) {
  const response = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${config.sid}/Messages.json`, {
    method: 'POST', headers: { Authorization: 'Basic ' + btoa(config.sid + ':' + config.token), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: normalizePhone(phone), From: config.from, Body: message }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.sid || !['accepted', 'queued', 'sending', 'sent', 'delivered'].includes(data.status)) throw new Error('SMS provider did not accept the invitation. Check backend provider configuration and retry; no delivery is claimed.');
  return data.sid;
}
