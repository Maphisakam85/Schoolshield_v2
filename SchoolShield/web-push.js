/* Explicit opt-in; this module never asks for permission on page load. */
(function(root){
 let busy=false;
 const status=text=>{const n=document.getElementById('pushStatus');if(n)n.textContent=text;};
 const supported=()=>root.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in root&&'Notification'in root;
 const client=()=>root.schoolshieldSupabase;
 const owner=()=>JSON.parse(sessionStorage.getItem('schoolshieldSession')||'{}').userId;
 async function subscription(){const reg=await navigator.serviceWorker.getRegistration(new URL('.',location.href));return {reg,sub:await reg?.pushManager.getSubscription()};}
 function keyBytes(key){const value=atob(key.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(key.length/4)*4,'='));return Uint8Array.from(value,c=>c.charCodeAt(0));}
 async function enable(){if(busy)return;const key=root.SCHOOLSHIELD_SUPABASE_CONFIG?.webPushPublicKey;
  if(!supported()){status('Push notifications are unavailable here. On iPhone/iPad, add SchoolShield to your Home Screen first.');return;}
  if(!key){status('Outside-app notifications need administrator configuration.');return;}
  busy=true;let sub,created=false;const button=document.getElementById('enablePush');button.disabled=true;button.textContent='Enabling...';
  try{
   const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifications were not enabled. You can change permission in your browser settings.');
   await navigator.serviceWorker.register(new URL('push-sw.js',location.href),{scope:new URL('.',location.href).pathname});const reg=await navigator.serviceWorker.ready;
   sub=await reg.pushManager.getSubscription();const previous=localStorage.getItem('schoolshieldPushOwner');if(sub&&previous&&previous!==owner()){await sub.unsubscribe();sub=null;}
   if(!sub){sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)});created=true;}
   const {error}=await client().rpc('register_web_push',{p_subscription:sub.toJSON()});if(error)throw Error(error.code==='PGRST202'?'Push setup is not installed yet. Ask your administrator to apply the push migration.':'Could not save notification preferences. Please retry.');
   localStorage.setItem('schoolshieldPushOwner',owner());status('Notifications enabled on this device.');document.getElementById('disablePush').disabled=false;
  }catch(error){if(created&&sub)await sub.unsubscribe().catch(()=>{});status(error.message||'Could not enable notifications.');}
  finally{busy=false;button.disabled=false;button.textContent='Enable notifications';}
 }
 async function stop(){if(!supported())return;const {sub}=await subscription();if(!sub)return;let serverError;
  try{let timer;const result=await Promise.race([client().rpc('unregister_web_push',{p_endpoint:sub.endpoint}),new Promise(resolve=>{timer=setTimeout(()=>resolve({error:true}),5000);})]).finally(()=>clearTimeout(timer));serverError=result.error;}finally{await sub.unsubscribe();localStorage.removeItem('schoolshieldPushOwner');}
  if(serverError)throw Error('Notifications are disabled on this device. Server cleanup will finish when the expired subscription is processed.');
 }
 async function bind(){if(document.body.dataset.page!=='notifications')return;let panel=document.getElementById('pushSettings');if(!panel){const template=document.getElementById('pushSettingsTemplate');if(!template)return;document.querySelector('.content').prepend(template.content.cloneNode(true));panel=document.getElementById('pushSettings');}
  document.getElementById('enablePush').onclick=enable;document.getElementById('disablePush').onclick=async()=>{if(busy)return;busy=true;const b=document.getElementById('disablePush');b.disabled=true;try{await stop();status('Notifications disabled on this device.');}catch(error){status(error.message);}finally{busy=false;b.disabled=false;}};
  if(!supported()){status('This browser cannot receive push notifications. On iPhone/iPad, use the Home Screen app.');document.getElementById('enablePush').disabled=true;return;}
  try{const {sub}=await subscription();status(sub&&localStorage.getItem('schoolshieldPushOwner')===owner()?'Notifications enabled on this device.':root.SCHOOLSHIELD_SUPABASE_CONFIG?.webPushPublicKey?'Enable notifications to receive alerts when SchoolShield is closed.':'Outside-app notifications are not configured yet.');document.getElementById('disablePush').disabled=!sub;}catch{status('Could not check this device. Try enabling notifications again.');}
 }
 root.SchoolShieldPush={bind,stop};
})(window);
