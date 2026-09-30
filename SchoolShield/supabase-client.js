/* Loaded only with the public publishable key. This file never uses a secret key. */
window.schoolshieldSupabase = null;
// Retry only authentication failures: a rejected request has not sent a message.
// Share refreshes between chat sending and the workspace polling timer.
let schoolshieldSessionRefresh = null;
window.schoolshieldFunctionRequest = async (name, body = {}) => {
  const client = window.schoolshieldSupabase;
  const config = window.SCHOOLSHIELD_SUPABASE_CONFIG;
  const signInError = () => new Error("Your session has expired. Sign in again to continue. Your message has not been sent.");
  if (!client || !config) throw signInError();
  const expected = JSON.parse(sessionStorage.getItem("schoolshieldSession") || "{}");
  const checkSession = (session) => {
    if (!session?.access_token || (expected.userId && session.user?.id !== expected.userId)) throw signInError();
    return session;
  };
  const refresh = async () => {
    if (!schoolshieldSessionRefresh) {
      schoolshieldSessionRefresh = client.auth.refreshSession().finally(() => { schoolshieldSessionRefresh = null; });
    }
    const { data, error } = await schoolshieldSessionRefresh;
    if (error) throw signInError();
    return checkSession(data?.session);
  };
  const current = await client.auth.getSession();
  let session = current.error || !current.data?.session ? await refresh() : checkSession(current.data.session);
  const request = () => fetch(`${config.url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let response = await request();
  if (response.status === 401) {
    session = await refresh();
    response = await request();
    if (response.status === 401) throw signInError();
  }
  return response;
};
if (window.SCHOOLSHIELD_SUPABASE_CONFIG && window.supabase) {
  const { url, publishableKey } = window.SCHOOLSHIELD_SUPABASE_CONFIG;
  if (url && publishableKey) {
    // Testers regularly open principal, teacher and parent portals side by
    // side. Supabase's default localStorage session is shared by every tab,
    // which made a parent-labelled tab send another role's token. Keep the
    // Auth session in sessionStorage so every portal tab has its own identity.
    const tabAuthStorage = {
      getItem: (key) => sessionStorage.getItem(key),
      setItem: (key, value) => sessionStorage.setItem(key, value),
      removeItem: (key) => sessionStorage.removeItem(key),
    };
    window.schoolshieldSupabase = window.supabase.createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: tabAuthStorage },
    });
  }
}
