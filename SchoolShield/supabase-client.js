/* Loaded only with the public publishable key. This file never uses a secret key. */
window.schoolshieldSupabase = null;
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
