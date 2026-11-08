/* Branding is held in memory only after server-confirmed tenant identification. */
(() => {
 let client,identity=null,current=null,generation=0,refreshing=null;
 let colours=null;
 const fallback='assets/schoolshield-logo.png';
 const readData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
 async function bounded(task){let timer;try{return await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Logo retrieval timed out.')),8000);})]);}finally{clearTimeout(timer);}}
 function apply(root=document) {
  const style=document.documentElement.style;
  const contrast=hex=>{const v=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]>.179?'#000000':'#ffffff';};
  for(const [key,value] of Object.entries({'--green':colours?.primary_colour,'--green2':colours?.primary_colour,'--navy':colours?.sidebar_colour,'--navy2':colours?.sidebar_colour,'--brand-primary-text':colours?contrast(colours.primary_colour):null,'--brand-sidebar-text':colours?contrast(colours.sidebar_colour):null})){
   if(value&&/^#[0-9a-f]{6}$/i.test(value))style.setProperty(key,value);else style.removeProperty(key);
  }

  root.querySelectorAll('.sidebar .brand img,[data-school-logo]').forEach(img=>{
   img.src=current?.dataUrl||fallback;img.alt=current?identity.name+' logo':'SchoolShield';
   img.style.objectFit='contain';img.onerror=()=>{img.onerror=null;img.src=fallback;};
  });
 }
 function clear(){generation++;identity=null;current=null;colours=null;refreshing=null;apply();}
 async function refresh(){
  if(!client||!identity)return;
  if(refreshing)return refreshing;
  const ticket=generation,own=identity;
  const task=(async()=>{
   const {data,error}=await bounded(()=>client.rpc('get_my_school_branding'));
   if(ticket!==generation)return;
   if(data?.school_id && data.school_id!==own.schoolId){clear();throw Error('School branding did not match the authenticated school.');}
   if(error){if(error.code==='42501')clear();throw Error('School branding could not be verified.');}
   if(!data)throw Error('School branding could not be verified.');
   colours={primary_colour:/^#[0-9a-f]{6}$/i.test(data.primary_colour||'')?data.primary_colour:'#0a8f62',sidebar_colour:/^#[0-9a-f]{6}$/i.test(data.sidebar_colour||'')?data.sidebar_colour:'#082c36'};apply();
   if(!data.object_path){current=null;apply();return;}
   if(current?.revision===data.revision&&current.schoolId===own.schoolId)return;
   const downloaded=await bounded(()=>client.storage.from('school-branding').download(data.object_path));
   if(downloaded.error)throw Error('School logo could not be retrieved.');
   const dataUrl=await readData(downloaded.data);
   if(!/^data:image\/png;base64,/.test(dataUrl))throw Error('Invalid logo response.');
   if(ticket!==generation)return;
   current={dataUrl,schoolId:own.schoolId,revision:data.revision,width:data.width,height:data.height};apply();
  })();
  refreshing=task;
  try{await task;}catch(error){console.warn(error.message);}finally{if(refreshing===task)refreshing=null;}
 }
 async function identify(authClient,userId,schoolId,name){clear();client=authClient;identity={userId,schoolId,name};await refresh();}
 function snapshot(){return identity&&current?.schoolId===identity.schoolId?{...current}:null;}
 async function addToPdf(pdf,x=16,y=10,maxWidth=24,maxHeight=18){
  await refresh();const logo=snapshot();if(!logo)return 0;
  const scale=Math.min(maxWidth/logo.width,maxHeight/logo.height);
  try{pdf.addImage(logo.dataUrl,'PNG',x,y,logo.width*scale,logo.height*scale);return maxHeight+5;}catch{return 0;}
 }
 window.SchoolShieldBranding={identify,refresh,clear,apply,snapshot,addToPdf};
 window.addEventListener('pageshow',()=>{refresh();});
 window.addEventListener('focus',()=>{refresh();});
})();
