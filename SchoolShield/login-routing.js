/* Password authentication is temporary until the server selects the allowed portal. */
(function(root) {
  async function bounded(task,stage,timeoutMs=15000){
    let timer;try{return await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(stage+' timed out. Check your connection and retry.')),timeoutMs);})]);}finally{clearTimeout(timer);}
  }
  async function signIn({supabase,config,schoolClient,storage,email,password,accessCode,createSchoolSession,timeoutMs=15000}) {
    accessCode=String(accessCode||'').trim().toUpperCase();
    if(!(/^(?:[A-Z]{3}-[0-9]{3}|[A-Z][0-9][A-Z]-[A-Z]{3})$/.test(accessCode)||accessCode==='ADMIN'||root.SchoolShieldAccessCode?.validLogin(accessCode)))throw Error('Use your assigned school or owner access code (ABC-001 or A0A-ABC).');
    const auth = supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    let destinationClient;
    try {
      const {data,error}=await bounded(()=>auth.auth.signInWithPassword({email,password}),'Sign in',timeoutMs);
      if(error){
        if(error.code==='email_not_confirmed')throw Error('Confirm your email using your account invitation, or ask your administrator to resend it.');
        if(error.status===429)throw Error('Too many sign-in attempts. Wait a few minutes before retrying.');
        if(error.status>=500||error.name==='AuthRetryableFetchError')throw Error('The sign-in service is unavailable. Retry shortly.');
        throw Error('Sign in failed. Check your credentials. If this email already has an account, use Reset password instead of creating another account.');
      }
      if(!data?.session || !data.user)throw Error('Sign in could not be confirmed. Retry shortly.');
      const gate=await bounded(()=>auth.rpc('authorize_platform_login',{p_access_code:accessCode}),'Access verification',timeoutMs);
      if(gate.error) throw Error('Access could not be verified. Please try again.');
      if(gate.data?.platform_admin) {
        if(!gate.data.authorized) throw Error('Access code is incorrect or temporarily locked. Try again after 15 minutes if needed.');
        destinationClient=supabase.createClient(config.url,config.publishableKey,{auth:{storageKey:'schoolshield-platform-auth',storage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'}});
      } else {
        if(gate.data?.platform_admin!==false) throw Error('Access could not be verified.');
        destinationClient=schoolClient;
      }
      const saved=await bounded(()=>destinationClient.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token}),'Session setup',timeoutMs);
      if(saved.error) throw saved.error;
      if(gate.data.platform_admin) {
        const context=await bounded(()=>destinationClient.rpc('platform_admin_context'),'Platform verification',timeoutMs);
        if(context.error || context.data?.user_id!==data.user.id) throw Error('Platform access denied.');
        storage.removeItem('schoolshieldSession');storage.removeItem('schoolshieldRole');
        return 'super-admin.html';
      }
      await bounded(()=>createSchoolSession(data.user,accessCode.toUpperCase()),'School profile',timeoutMs);
      return 'dashboard.html';
    } catch(error) {
      try {await bounded(()=>(destinationClient || auth).auth.signOut({scope:'local'}),'Session cleanup',Math.min(timeoutMs,2000));} catch {}
      storage.removeItem('schoolshieldSession');storage.removeItem('schoolshieldRole');
      throw error;
    }
  }
  root.SchoolShieldLogin={signIn};
})(typeof window==='undefined'?globalThis:window);
