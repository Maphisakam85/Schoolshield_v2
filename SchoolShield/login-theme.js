/* Optional school palette preview. Never authenticates or grants access. */
(() => {
 const field=document.getElementById('schoolCode'),request=document.getElementById('requestSchoolCode');
 const root=document.documentElement;let generation=0,timer,last='';
 const code=()=>String(!document.getElementById('requestForm')?.hidden?request?.value:field?.value||'').trim().toUpperCase();
 function refresh(){
  const value=code();if(value===last)return;last=value;const ticket=++generation;clearTimeout(timer);
  window.SchoolShieldTheme?.clear(root);
  const knownSelection=request?.value===value&&!document.getElementById('requestForm')?.hidden;
  if(!value||value==='ADMIN'||(!knownSelection&&!window.SchoolShieldAccessCode?.validLogin(value))||/^[A-Z][0-9][A-Z]-[A-Z]{3}$/.test(value))return;
  timer=setTimeout(async()=>{
   let timeout;
   try{
    const response=await Promise.race([
     window.schoolshieldSupabase.rpc('get_login_school_palette',{p_code:value}),
     new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Palette lookup timed out')),5000);})
    ]);
    if(ticket!==generation||code()!==value||response.error||!response.data)return;
    window.SchoolShieldTheme.apply(root,response.data);
   }catch{/* A preview failure must never block sign-in. */}
   finally{clearTimeout(timeout);}
  },250);
 }
 field?.addEventListener('input',refresh);field?.addEventListener('change',refresh);request?.addEventListener('change',refresh);
 for(const form of new Set([field?.form,request?.form]))form?.addEventListener('reset',()=>queueMicrotask(refresh));
 const form=document.getElementById('requestForm');if(form)new MutationObserver(refresh).observe(form,{attributes:true,attributeFilter:['hidden']});
 refresh();
})();
