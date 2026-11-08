(() => {
 const $=id=>document.getElementById(id);let client,context,school,branding,report,preview,operation=null,working=false;
 function revoke(){if(preview)URL.revokeObjectURL(preview);preview=null;}
 async function load(options){
  ({client,context,school,status:report}=options);
  const {data,error}=await client.rpc('platform_admin_branding',{p_school:school.id});if(error)throw error;
  if(data.school_id!==school.id)throw Error('Branding does not match the selected school.');
  let source='assets/schoolshield-logo.png';
  if(data.object_path){const r=await client.storage.from('school-branding').download(data.object_path);if(r.error)throw Error('Current logo could not be retrieved.');source=URL.createObjectURL(r.data);}
  const old=$('currentLogo').dataset.objectUrl;$('currentLogo').src=source;
  $('currentLogo').dataset.objectUrl=data.object_path?source:'';if(old)URL.revokeObjectURL(old);
  $('currentLogo').onerror=()=>{$('currentLogo').onerror=null;$('currentLogo').src='assets/schoolshield-logo.png';report('Saved logo could not be displayed. Using the SchoolShield fallback.');};
  branding=data;$('currentLogoStatus').textContent=data.object_path?'Saved school logo · revision '+data.revision:'SchoolShield fallback (no custom logo)';
  document.querySelectorAll('[data-school-management]').forEach(a=>a.href='super-admin-school.html?school='+encodeURIComponent(school.id));
  if(!window.SchoolShieldPlatformDrafts?.has('colourForm')){ $('primaryColour').value=data.primary_colour||'#0a8f62';$('sidebarColour').value=data.sidebar_colour||'#082c36'; previewColours(); }
 }
 function contrast(hex){const v=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]>.179?'#000000':'#ffffff';}
 function previewColours(){
  $('colourPreview').style.background=$('sidebarColour').value;$('colourPreview').style.color=contrast($('sidebarColour').value);
  $('previewPrimary').style.background=$('primaryColour').value;$('previewPrimary').style.color=contrast($('primaryColour').value);
 }
 function bind(){
  $('previewColours').onclick=previewColours;
  $('cancelLogo').onclick=()=>{if(working||window.SchoolShieldPlatformDrafts?.discard('brandingForm')===false)return;revoke();$('brandingForm').reset();$('logoPreview').hidden=true;operation=null;report('Unsaved logo change cancelled.');};
  $('cancelBranding').onclick=()=>{if(working||window.SchoolShieldPlatformDrafts?.discard('colourForm')===false)return;$('colourForm').reset();$('primaryColour').value=branding.primary_colour||'#0a8f62';$('sidebarColour').value=branding.sidebar_colour||'#082c36';previewColours();report('Unsaved colour changes cancelled.');};
  $('colourForm').onsubmit=async event=>{
   event.preventDefault();if(working||!$('colourForm').reportValidity())return;
   const reason=$('colourReason').value.trim();if(reason.length<5){report('Enter a reason of at least 5 characters.');return;}
   working=true;const button=$('colourForm').querySelector('[type=submit]');button.disabled=true;report('Saving portal colours...');
   try {const {data,error}=await client.rpc('platform_admin_save_colours',{p_school:school.id,p_revision:branding.revision,p_primary:$('primaryColour').value,p_sidebar:$('sidebarColour').value,p_reason:reason});if(error)throw error;if(data.school_id!==school.id)throw Error('School response did not match');branding=data;window.SchoolShieldPlatformDrafts?.clear('colourForm');$('colourReason').value='';previewColours();report('Portal colours saved. School users will receive the updated colours on refresh.');}
   catch(error){report(window.SchoolShieldPlatformError(error)+' Your colour selections are retained.');}
   finally{working=false;button.disabled=false;}
  };

  $('logoFile').onchange=async()=>{
   revoke();operation=null;$('logoPreview').hidden=true;const file=$('logoFile').files[0];if(!file)return;
   try{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('Choose PNG, JPEG or WebP up to 2 MB.');
    const bitmap=await createImageBitmap(file);const invalid=bitmap.width>2048||bitmap.height>2048;bitmap.close();if(invalid)throw Error('Maximum dimensions are 2048 × 2048.');
    preview=URL.createObjectURL(file);$('previewLogo').src=preview;$('logoPreview').hidden=false;report('Preview ready. Upload and save to apply this logo.');
   }catch(error){$('logoFile').value='';report(error.message||'The image contents could not be decoded.');}
  };
  async function mutate(action){
   if(working)return;const reason=$('logoReason').value.trim();if(reason.length<5){report('Enter a reason of at least 5 characters.');return;}
   if(action==='replace'&&!$('brandingForm').reportValidity())return;
   if(action==='remove'&&!confirm('Remove the logo for '+school.name+' ('+school.code+') and use the SchoolShield fallback?'))return;
   if(!operation||operation.action!==action||operation.reason!==reason)operation={id:crypto.randomUUID(),action,reason};
   working=true;const buttons=Array.from($('brandingForm').querySelectorAll('button'));buttons.forEach(b=>b.disabled=true);report('Saving branding for '+school.name+'...');
   try{
    const form=new FormData();for(const[k,v]of Object.entries({school_id:school.id,operation_id:operation.id,revision:branding.revision,action,reason}))form.set(k,String(v));if(action==='replace')form.set('file',$('logoFile').files[0]);
    const result=await window.SchoolShieldPlatformRequest('school-branding',form);
    if(result.branding.school_id!==school.id)throw Error('Unexpected school in save response.');
    operation=null;window.SchoolShieldPlatformDrafts?.clear('brandingForm');
    revoke();$('brandingForm').reset();$('logoPreview').hidden=true;
    try {await load({client,context,school,status:report});report('School branding saved.');}
    catch {report('School branding saved. Refresh to retrieve the confirmed logo.');}
   }catch(error){report(window.SchoolShieldPlatformError(error)+' The current logo and selected replacement are retained. Operation: '+operation.id);}
   finally{working=false;buttons.forEach(b=>b.disabled=false);}
  }
  $('brandingForm').onsubmit=e=>{e.preventDefault();mutate('replace');};$('removeLogo').onclick=()=>mutate('remove');
  $('platformRefresh').onclick=()=>{
   if(working||window.SchoolShieldPlatformDrafts?.discard('brandingForm')===false)return;
   revoke();$('brandingForm').reset();$('logoPreview').hidden=true;
   load({client,context,school,status:report}).then(()=>report('Current branding loaded.')).catch(e=>report(window.SchoolShieldPlatformError(e)));
  };
 }
 window.SchoolShieldBrandingPage={load,bind};
})();
