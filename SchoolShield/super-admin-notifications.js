/* Server statuses remain authoritative. No local read/dismiss flag hides a report. */
(() => {
 const $=id=>document.getElementById(id);
 let client,timer,pending=false,offset=0,generation=0;
 function positionMenu(){
  const panel=$('platformProblems'),menu=panel.querySelector('.platform-problem-menu');
  if(innerWidth<=600){const top=Math.min(panel.querySelector('summary').getBoundingClientRect().bottom+8,innerHeight-160);menu.style.top=top+'px';menu.style.maxHeight=`calc(100dvh - ${top+12}px)`;}
  else{menu.style.top='';menu.style.maxHeight='';}
 }
 async function refresh(){
  if(!client||pending)return;pending=true;const run=generation;let timeout;
  try{
   const {data,error}=await Promise.race([client.rpc('platform_admin_notifications',{p_offset:offset}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),15000);})]);
   if(run!==generation)return;if(error||!data||!Array.isArray(data.items)||!Number.isSafeInteger(data.total)||data.total<0)throw Error('unconfirmed');
   if(offset>0&&!data.items.length){offset=0;pending=false;return await refresh();}
   $('platformProblemCount').textContent=String(data.total);
   $('platformProblems').querySelector('summary').setAttribute('aria-label','Notifications, '+data.total+' items need attention');
   $('platformProblems').classList.toggle('has-problems',data.total>0);
   $('platformProblemList').replaceChildren();
   for(const item of data.items){
    if(!/^[0-9a-f-]{36}$/i.test(item.id)||!/^[0-9a-f-]{36}$/i.test(item.school_id))continue;
    const node=$('platformProblemItem').content.cloneNode(true),link=node.querySelector('a');
    const routes={report:'support',invitation:'accounts',account:'accounts',provisioning:'school'};const kind=item.kind||'report';if(!routes[kind])continue;link.href='super-admin-'+routes[kind]+'.html?school='+encodeURIComponent(item.school_id)+(kind==='report'?'&ticket='+encodeURIComponent(item.id):'');
    node.querySelector('[data-problem-school]').textContent=item.school_name+' ('+item.school_code+')';
    node.querySelector('[data-problem-title]').textContent=item.title;
    node.querySelector('[data-problem-status]').textContent=item.priority+' · '+item.status;
    $('platformProblemList').append(node);
   }
   $('platformProblemStatus').textContent=data.total?'Items remain until resolved or recovered.':'No notifications need attention.';
   $('platformProblemPrevious').disabled=offset===0;
   $('platformProblemNext').disabled=offset+data.items.length>=data.total;
  }catch{
   if(run===generation)$('platformProblemStatus').textContent='Notifications could not be refreshed. Previously loaded items remain listed. Retry.';
  }finally{clearTimeout(timeout);if(run===generation)pending=false;}
 }
 function stop(){generation++;clearInterval(timer);client=null;pending=false;$('platformProblems')?.setAttribute('hidden','');$('platformProblemList')?.replaceChildren();}
 window.SchoolShieldPlatformNotifications={
  start(value){if(!$('platformProblems'))return;stop();client=value;offset=0;$('platformProblems').hidden=false;
   $('platformProblemRefresh').onclick=refresh;
   $('platformProblemPrevious').onclick=()=>{if(!pending){offset=Math.max(0,offset-25);refresh();}};
   $('platformProblemNext').onclick=()=>{if(!pending){offset+=25;refresh();}};
   $('platformProblems').addEventListener('keydown',e=>{if(e.key==='Escape'){$('platformProblems').open=false;$('platformProblems').querySelector('summary').focus();}});
   $('platformProblems').addEventListener('toggle',()=>{if($('platformProblems').open){positionMenu();refresh();}});
   window.addEventListener('resize',()=>{if($('platformProblems').open)positionMenu();});
   document.addEventListener('click',e=>{if(!$('platformProblems').contains(e.target))$('platformProblems').open=false;});
   window.addEventListener('focus',refresh);window.addEventListener('platform-support-updated',refresh);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
   refresh();timer=setInterval(()=>{if(!document.hidden)refresh();},30000);
  },refresh,stop
 };
})();
