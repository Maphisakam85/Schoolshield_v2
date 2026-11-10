/* Shared owner UI only. Authorization and school scope stay on the server. */
(() => {
 const $=id=>document.getElementById(id),side=$('platformSidebar');if(!side)return;
 document.body.classList.add('platform-shell');
 let compact=sessionStorage.getItem('platform-nav-compact')==='true',mobileOpen=false;
 const mobile=()=>innerWidth<=700;
 const width=()=>Math.max(220,Math.min(400,Math.floor(innerWidth*.4),Number(sessionStorage.getItem('platform-nav-width'))||240));
 function draw(){
  const small=mobile(),visible=!small||mobileOpen;
  document.body.classList.toggle('platform-nav-compact',!small&&compact);
  document.body.classList.toggle('platform-nav-open',small&&mobileOpen);
  document.body.style.setProperty('--platform-nav-width',small?'0px':compact?'72px':width()+'px');
  side.style.width=small?'min(280px,85vw)':compact?'72px':width()+'px';side.inert=!visible;
  side.setAttribute('aria-hidden',String(!visible));$('platformNavToggle').setAttribute('aria-expanded',String(small?mobileOpen:!compact));
  $('platformNavBackdrop').hidden=!small||!mobileOpen;
  $('platformNavResize').setAttribute('aria-valuenow',String(width()));
  $('platformNavResize').setAttribute('aria-valuemax',String(Math.min(400,Math.floor(innerWidth*.4))));
 }
 $('platformNavToggle').onclick=()=>{if(mobile())mobileOpen=!mobileOpen;else{compact=!compact;sessionStorage.setItem('platform-nav-compact',String(compact));}draw();};
 const close=()=>{mobileOpen=false;draw();$('platformNavToggle').focus();};
 $('platformNavBackdrop').onclick=close;side.onkeydown=e=>{if(e.key==='Escape'&&mobile())close();};
 const handle=$('platformNavResize'),resize=value=>{sessionStorage.setItem('platform-nav-width',String(Math.max(220,Math.min(400,innerWidth*.4,value))));draw();};
 handle.onpointerdown=e=>{if(mobile()||compact)return;e.preventDefault();handle.setPointerCapture(e.pointerId);handle.onpointermove=move=>resize(move.clientX);};
 handle.onpointerup=handle.onpointercancel=()=>{handle.onpointermove=null;};
 handle.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();resize(e.key==='Home'?220:e.key==='End'?400:width()+(e.key==='ArrowLeft'?-10:10));}};
 function connection(){const offline=navigator.onLine===false;$('platformConnection').hidden=!offline;$('platformConnection').textContent=offline?'Offline — changes need a connection':'';}
 window.addEventListener('online',connection);window.addEventListener('offline',connection);window.addEventListener('resize',()=>{mobileOpen=false;draw();});
 window.addEventListener('platform-ready',event=>{
  const school=event.detail?.school;
  if(school){$('platformSchoolNav').hidden=false;$('platformNavSchool').textContent=school.name+' ('+school.code+')';
   for(const link of side.querySelectorAll('[data-platform-nav]'))if(link.dataset.platformNav!=='directory')link.href='super-admin-'+link.dataset.platformNav+'.html?school='+encodeURIComponent(school.id);
  }
  for(const link of side.querySelectorAll('[data-platform-nav]'))if(link.dataset.platformNav===document.body.dataset.platformPage)link.setAttribute('aria-current','page');
 });
 document.addEventListener('click',e=>{const summary=e.target.closest('#platformProblems summary');if(summary&&mobileOpen)close();});
 connection();draw();
})();
