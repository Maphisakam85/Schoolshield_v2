/* Self-service Auth settings. Platform authorization remains database-owned. */
(() => {
 const $=id=>document.getElementById(id);let client,context,user,working=false;
 async function load(options){
  ({client,context}=options);const result=await client.auth.getUser();
  if(result.error||result.data?.user?.id!==context.user_id)throw Error('Platform identity verification failed.');
  user=result.data.user;$('ownerAccountEmail').textContent=user.email;
  $('ownerDisplayName').value=user.user_metadata?.display_name||'';
 }
 async function save(form,status,operation){
  if(working||!form.reportValidity())return;working=true;
  const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>{b.disabled=true;b.setAttribute('aria-busy','true');});
  status.textContent='Saving...';
  try{await operation();window.SchoolShieldPlatformDrafts?.clear(form.id);}
  catch(error){status.textContent=error.message||'The change could not be confirmed. Retry after checking your connection.';}
  finally{working=false;buttons.forEach(b=>{b.disabled=false;b.removeAttribute('aria-busy');});}
 }
 function bind(){
  $('ownerProfileForm').onsubmit=e=>{e.preventDefault();save(e.currentTarget,$('ownerProfileStatus'),async()=>{
   const name=$('ownerDisplayName').value.trim();if(name.length<2)throw Error('Enter a display name of at least 2 characters.');
   const result=await client.auth.updateUser({data:{display_name:name}});if(result.error)throw result.error;
   if(result.data?.user?.id!==context.user_id)throw Error('Account change could not be verified.');
   user=result.data.user;$('ownerProfileStatus').textContent='Profile saved.';
  });};
  $('ownerPasswordForm').onsubmit=e=>{e.preventDefault();save(e.currentTarget,$('ownerPasswordStatus'),async()=>{
   const password=$('ownerNewPassword').value;
   if(password!==$('ownerConfirmPassword').value)throw Error('New passwords must match.');
   const current=$('ownerCurrentPassword').value;
   if(password===current)throw Error('Choose a different new password.');
   const auth=await client.auth.signInWithPassword({email:user.email,password:current});
   if(auth.error||auth.data?.user?.id!==context.user_id)throw Error('Current password could not be verified.');
   const verified=await client.rpc('platform_admin_context');
   if(verified.error||verified.data?.user_id!==context.user_id)throw Error('Platform access could not be verified.');
   const result=await client.auth.updateUser({password});if(result.error)throw result.error;
   $('ownerPasswordForm').reset();$('ownerPasswordStatus').textContent='Password updated.';
  });};
  document.querySelectorAll('[data-settings-cancel]').forEach(button=>button.onclick=()=>{
   if(working)return;const id=button.dataset.settingsCancel;$(id).reset();
   if(id==='ownerProfileForm')$('ownerDisplayName').value=user.user_metadata?.display_name||'';
   window.SchoolShieldPlatformDrafts?.clear(id);$(id==='ownerProfileForm'?'ownerProfileStatus':'ownerPasswordStatus').textContent='Changes cancelled.';
  });
 }
 window.SchoolShieldOwnerSettings={load,bind,isBusy:()=>working};
})();
