/* Chat-only navigation: keep the application shell mounted. */
(function(root){
 const pages=['parent-chat','teacher-chat','sgb-chat','sgb-security-chat'],drafts=new Map();let busy=false,bound=false,current=location.pathname+location.search;
 const draftKey=href=>{const u=new URL(href,location.href);return u.pathname+'?chat='+(Number(u.searchParams.get('chat'))||0);};
 const workspace=()=>document.querySelector('.chat-layout,.direct-chat');
 async function navigate(href,pop=false){
  const url=new URL(href,location.href),id=url.pathname.split('/').pop().replace(/\.html$/,'');
  if(url.origin!==location.origin||!pages.includes(id)||!root.SchoolShieldChatView?.allowed(id))return false;
  if(busy||root.schoolshieldChatSending||root.SchoolShieldDirectChat?.isSending())return false;
  const old=workspace();if(!old)return false;busy=true;root.schoolshieldChatSwitching=true;old.setAttribute('aria-busy','true');
  const before={page:document.body.dataset.page,url:current},input=old.querySelector('#chatInput'),list=old.querySelector('.chat-contacts,#directChatContacts'),search=old.querySelector('input[type="search"]');
  if(input)drafts.set(draftKey(current),input.value);
  const query=search?.value||'',scroll=list?.scrollTop||0,collapsed=old.dataset.inboxCollapsed;
  let committed=false;
  try{
   if(id==='sgb-security-chat'&&!document.getElementById('directChatTemplate')){
    const response=await fetch(new URL('sgb-security-chat.html',location.href));if(!response.ok)throw Error('Chat could not be loaded. Please try again.');
    const doc=new DOMParser().parseFromString(await response.text(),'text/html'),template=doc.getElementById('directChatTemplate');if(!template)throw Error('Chat view is unavailable.');document.body.append(template);
   }
   // The URL selects the conversation for existing renderers; rollback on failure.
   history.replaceState(history.state,'',url);document.body.dataset.page=id;
   let next;
   if(id==='sgb-security-chat')next=document.getElementById('directChatTemplate').content.firstElementChild.cloneNode(true);
   else {const t=document.createElement('template');t.innerHTML=root.SchoolShieldChatView.render(id);next=t.content.querySelector('.chat-layout');}
   if(!next)throw Error('Conversation is unavailable.');
   root.SchoolShieldDirectChat?.suspend();next.dataset.inboxCollapsed=collapsed||'false';old.replaceWith(next);committed=true;
   if(!pop){history.replaceState(history.state,'',before.url);history.pushState({schoolshieldChat:true},'',url);}
   current=url.pathname+url.search;
   if(id==='sgb-security-chat')root.SchoolShieldDirectChat.bind();else root.SchoolShieldChatView.bind();
   const newInput=next.querySelector('#chatInput');if(newInput)newInput.value=drafts.get(draftKey(current))||'';
   const newSearch=next.querySelector('input[type="search"]');if(newSearch){newSearch.value=query;newSearch.dispatchEvent(new Event('input'));}
   const newList=next.querySelector('.chat-contacts,#directChatContacts');if(newList)newList.scrollTop=scroll;
   next.dataset.view='thread';await root.SchoolShieldChatView.decorate();if(newList)newList.scrollTop=scroll;
   root.resetWorkspaceDraftState?.();
   return true;
  }catch(error){if(!committed){document.body.dataset.page=before.page;history.replaceState(history.state,'',before.url);}let message=document.getElementById('chatSwitchError');if(!message){message=document.createElement('p');message.id='chatSwitchError';message.setAttribute('role','alert');(workspace()||old).prepend(message);}message.textContent=error.message||'Chat could not be loaded. Try again.';return false;}
  finally{busy=false;root.schoolshieldChatSwitching=false;workspace()?.removeAttribute('aria-busy');}
 }
 function bind(){if(bound)return;bound=true;
  document.addEventListener('click',e=>{const a=e.target.closest('a[data-chat-contact]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;const url=new URL(a.href,location.href),id=url.pathname.split('/').pop().replace(/\.html$/,'');if(url.origin!==location.origin||!pages.includes(id))return;e.preventDefault();navigate(url);});
  root.addEventListener('popstate',()=>{if(pages.includes(location.pathname.split('/').pop().replace(/\.html$/,'')))navigate(location.href,true);});
 }
 root.SchoolShieldChatNavigation={bind,navigate};
})(window);
