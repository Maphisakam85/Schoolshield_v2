/* Loaded only with the public publishable key. This file never uses a secret key. */
window.schoolshieldSupabase = null;
if (window.SCHOOLSHIELD_SUPABASE_CONFIG && window.supabase) {
  const { url, publishableKey } = window.SCHOOLSHIELD_SUPABASE_CONFIG;
  if (url && publishableKey) {
    window.schoolshieldSupabase = window.supabase.createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
}
