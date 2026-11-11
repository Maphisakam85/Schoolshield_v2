/* Shared presentation only: group actions and progressively disclose optional guidance. */
(() => {
 let nextId=0,queued=false;
 function guidance(paragraph){
  if(typeof paragraph.showPopover!=='function')return;
  if(paragraph.dataset.guidanceReady||paragraph.closest('[role=alert],[role=status],.guidance-control'))return;
  paragraph.dataset.guidanceReady='true';
  const control=document.createElement('span'),button=document.createElement('button');
  const section=paragraph.closest('.panel-head,.page-intro,section.panel,dialog');
  const anchor=section?.querySelector('.panel-actions')||section?.querySelector('h1,h2,h3,h4');
  control.className='guidance-control';button.type='button';button.className='guidance-toggle';button.textContent='i';
  const label=paragraph.dataset.guidance||'More information';button.setAttribute('aria-label',label);
  paragraph.id='portal-guidance-'+(++nextId);paragraph.classList.add('guidance-content');paragraph.popover='auto';
  button.setAttribute('aria-describedby',paragraph.id);button.setAttribute('aria-expanded','false');
  paragraph.replaceWith(control);control.append(button,paragraph);
  if(anchor)anchor.append(control);
  function show(){
   if(!paragraph.isConnected)return;const box=button.getBoundingClientRect();
   paragraph.style.left=Math.max(12,Math.min(box.left,innerWidth-372))+'px';
   paragraph.style.top=Math.max(12,Math.min(box.bottom+8,innerHeight-180))+'px';
   if(!paragraph.matches(':popover-open'))paragraph.showPopover();button.setAttribute('aria-expanded','true');
  }
  function hide(){if(paragraph.matches(':popover-open'))paragraph.hidePopover();button.setAttribute('aria-expanded','false');delete paragraph.dataset.pinned;}
  button.onclick=()=>{if(paragraph.dataset.pinned)hide();else{show();paragraph.dataset.pinned='true';}};
  control.onmouseenter=show;button.onfocus=show;
  control.onmouseleave=()=>{if(!paragraph.dataset.pinned&&document.activeElement!==button)hide();};
  button.onblur=()=>{if(!paragraph.dataset.pinned)hide();};
  paragraph.addEventListener('toggle',event=>{if(event.newState==='closed'){button.setAttribute('aria-expanded','false');delete paragraph.dataset.pinned;}});
 }
 function enhance(){
  document.querySelectorAll('.panel-head').forEach(header=>{
   const actions=[...header.children].filter(child=>child.matches('button,a.btn,a.text-link'));
   if(!actions.length)return;const group=document.createElement('div');group.className='panel-actions';header.append(group);actions.forEach(action=>group.append(action));
  });
  document.querySelectorAll('p[data-guidance],.panel-head p,.page-intro p').forEach(p=>{if(p.hasAttribute('data-guidance')||p.textContent.trim().length>140)guidance(p);});
 }
 enhance();new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;enhance();});}).observe(document.body,{childList:true,subtree:true});
 window.SchoolShieldPortalUI={enhance};
})();
