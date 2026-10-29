(() => {
 const $=id=>document.getElementById(id);let client,school,status,current,operation=null,saving=false;
 function values(){return {primary_color:$('themePrimary').value.toUpperCase(),navigation_color:$('themeNavigation').value.toUpperCase()};}
 function preview(){const theme=values();window.SchoolShieldTheme.apply($('themePreview'),theme);$('themePrimaryHex').textContent=theme.primary_color;$('themeNavigationHex').textContent=theme.navigation_color;}
 async function load(options){
  ({client,school,status}=options);
  const {data,error}=await client.rpc('platform_admin_theme',{p_school:school.id});if(error)throw error;
  if(data?.school_id!==school.id)throw Error('Colours do not match the selected school.');
  current=data;$('themePrimary').value=data.primary_color;$('themeNavigation').value=data.navigation_color;
  $('themePreset').value=Object.keys(SchoolShieldTheme.presets).find(key=>JSON.stringify(SchoolShieldTheme.presets[key])===JSON.stringify({primary_color:data.primary_color,navigation_color:data.navigation_color}))||'custom';
  $('themePreviewName').textContent=school.name;$('themeRevision').textContent='Saved colours · revision '+data.revision;preview();operation=null;
 }
 function bind(){
  $('themePreset').onchange=()=>{const preset=SchoolShieldTheme.presets[$('themePreset').value];if(preset){$('themePrimary').value=preset.primary_color;$('themeNavigation').value=preset.navigation_color;preview();}};
  for(const id of ['themePrimary','themeNavigation'])$(id).oninput=()=>{$('themePreset').value='custom';preview();};
  $('themeReload').onclick=async()=>{if(saving||window.SchoolShieldPlatformDrafts?.discard('themeForm')===false)return;try{await load({client,school,status});$('themeReason').value='';status('Saved school colours loaded.');}catch(error){status(window.SchoolShieldPlatformError(error));}};
  $('themeForm').onsubmit=async event=>{
   event.preventDefault();if(saving)return;
   const fields=values(),reason=$('themeReason').value.trim();if(reason.length<5){status('Enter a reason of at least 5 characters.');return;}
   const signature=JSON.stringify({...fields,reason,revision:current.revision});if(operation?.signature!==signature)operation={id:crypto.randomUUID(),signature};
   saving=true;const controls=Array.from($('themeForm').querySelectorAll('input,select,textarea,button'));controls.forEach(el=>el.disabled=true);
   try{
    const {data,error}=await client.rpc('save_platform_school_theme',{p_school:school.id,p_revision:current.revision,p_primary:fields.primary_color,p_navigation:fields.navigation_color,p_operation:operation.id,p_reason:reason});
    if(error)throw error;if(data?.school_id!==school.id)throw Error('Save did not match the selected school.');
    current=data;operation=null;$('themeReason').value='';$('themeRevision').textContent='Saved colours · revision '+data.revision;
    window.SchoolShieldPlatformDrafts?.clear('themeForm');status('School colours saved. They apply across this school’s portal on refresh.');
   }catch(error){status(window.SchoolShieldPlatformError(error)+' Your colour selection is retained.');}
   finally{saving=false;controls.forEach(el=>el.disabled=false);}
  };
 }
 window.SchoolShieldThemePage={load,bind};
})();
