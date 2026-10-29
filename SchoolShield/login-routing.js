/* Password authentication is temporary until the server selects the allowed portal. */
(function(root) {
  async function signIn({supabase,config,schoolClient,storage,email,password,accessCode,createSchoolSession}) {
    const auth = supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    let destinationClient;
    try {
      const {data,error}=await auth.auth.signInWithPassword({email,password});
      if(error || !data?.session || !data.user) throw Error('Sign in failed. Check your credentials.');
      const gate=await auth.rpc('authorize_platform_login',{p_access_code:accessCode});
      if(gate.error) throw Error('Access could not be verified. Please try again.');
      if(gate.data?.platform_admin) {
        if(!gate.data.authorized) throw Error('Access code is incorrect or temporarily locked. Try again after 15 minutes if needed.');
        destinationClient=supabase.createClient(config.url,config.publishableKey,{auth:{storageKey:'schoolshield-platform-auth',storage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'}});
      } else {
        if(gate.data?.platform_admin!==false) throw Error('Access could not be verified.');
        destinationClient=schoolClient;
      }
      const saved=await destinationClient.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
      if(saved.error) throw saved.error;
      if(gate.data.platform_admin) {
        const context=await destinationClient.rpc('platform_admin_context');
        if(context.error || context.data?.user_id!==data.user.id) throw Error('Platform access denied.');
        storage.removeItem('schoolshieldSession');storage.removeItem('schoolshieldRole');
        return 'super-admin.html';
      }
      await createSchoolSession(data.user,accessCode.toUpperCase());
      return 'dashboard.html';
    } catch(error) {
      try {await (destinationClient || auth).auth.signOut({scope:'local'});} catch {}
      storage.removeItem('schoolshieldSession');storage.removeItem('schoolshieldRole');
      throw error;
    }
  }
  root.SchoolShieldLogin={signIn};
})(typeof window==='undefined'?globalThis:window);
