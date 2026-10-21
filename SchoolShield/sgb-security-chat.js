/* Private channel: the server derives participants and school from Auth. */
(function(root){
 const state={peer:'',contacts:[],drafts:{},pending:{},messages:[],busy:false,version:0,recipient:'Security',loading:null,opened:{}};
 const el=id=>document.getElementById(id),status=text=>{el('directChatStatus').textContent=text;};
 const initials=name=>String(name||'?').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
 function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
 async function rpc(params){const client=root.schoolshieldSupabase;if(!client)throw Error('Sign in to connect to chat.');const {data,error}=await client.rpc('sgb_security_chat',params);if(error)throw Error(error.code==='PGRST202'?'Chat service is unavailable. Ask your administrator to apply the chat migration.':error.message||'Chat could not be loaded.');if(!data)throw Error('No response received. Please retry.');return data;}
 function controls(){el('directChatInput').disabled=!state.peer||state.busy;el('directChatSend').disabled=!state.peer||state.busy;el('directChatSend').textContent=state.busy?'Sending...':'Send';}
 function renderContacts(){
  const box=el('directChatContacts'),query=el('directChatSearch').value.trim().toLowerCase();box.replaceChildren();
  const rows=state.contacts.filter(c=>(c.name+' '+(c.last_message?.body||'')).toLowerCase().includes(query));el('directChatCount').textContent=String(rows.length);
  for(const c of rows){const button=node('button',undefined,'direct-chat-contact');button.type='button';button.setAttribute('aria-pressed',String(c.id===state.peer));button.dataset.peer=c.id;
   const copy=node('span',undefined,'direct-chat-contact-copy'),line=node('span',undefined,'direct-chat-contact-line');line.append(node('strong',c.name||state.recipient));
   if(c.last_message){const time=node('time',new Date(c.last_message.created_at).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'}));time.dateTime=c.last_message.created_at;line.append(time);}
   copy.append(line,node('span',c.last_message?.body||'Start a conversation','direct-chat-preview'));button.append(node('span',initials(c.name),'avatar'),copy);button.onclick=()=>select(c.id,true);box.appendChild(button);
  }
  if(!rows.length)box.appendChild(node('p',query?'No conversations match your search.':'No active '+state.recipient+' contacts available at your school.','direct-chat-empty'));
  root.SchoolShieldChatInbox?.decorate();
 }
 function select(id,open=false){if(state.busy)return;if(open){el('directChatWorkspace').dataset.view='thread';if(!state.opened[id]){el('directChatMessages').scrollTop=el('directChatMessages').scrollHeight;state.opened[id]=true;}}if(id===state.peer)return;
  if(state.peer)state.drafts[state.peer]=el('directChatInput').value;state.peer=id;state.version++;state.messages=[];el('directChatMessages').replaceChildren();el('directChatOlder').hidden=true;el('directChatEmpty').hidden=true;
  el('directChatInput').value=state.drafts[id]||'';const c=state.contacts.find(c=>c.id===id);el('directChatName').textContent=c?.name||'Your conversations';el('directChatAvatar').textContent=initials(c?.name);el('directChatPeerInfo').textContent=c?(c.role==='sgb'?'SGB':'Security')+' · Private school conversation':'Private messages within your school';controls();renderContacts();status(id?'Loading messages...':'');if(id)load();
 }
 function draw(data,older=false){const box=el('directChatMessages'),bottom=box.scrollHeight-box.clientHeight-box.scrollTop<70,height=box.scrollHeight,scroll=box.scrollTop;
  const merged=new Map(state.messages.map(m=>[m.id,m]));for(const m of data.messages||[])merged.set(m.id,m);const next=[...merged.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
  if(JSON.stringify(next)!==JSON.stringify(state.messages)){state.messages=next;box.replaceChildren();for(const m of next){const bubble=node('div',undefined,'direct-message'+(m.sender_id===data.user_id?' mine':'')),time=node('time',new Date(m.created_at).toLocaleString('en-ZA'));time.dateTime=m.created_at;bubble.append(node('span',m.body),time);box.appendChild(bubble);}if(older)box.scrollTop=scroll+box.scrollHeight-height;else if(bottom)box.scrollTop=box.scrollHeight;}
  el('directChatEmpty').hidden=!!next.length;const contact=state.contacts.find(c=>c.id===state.peer),last=next.at(-1);if(contact&&last&&(!contact.last_message||last.created_at>=contact.last_message.created_at)){contact.last_message=last;renderContacts();}
 }
 async function load(older=false){const version=state.version;if(!state.peer||state.loading===version||state.busy)return;const peer=state.peer;state.loading=version;
  try{const params={p_peer:peer};if(older&&state.messages.length)params.p_before=state.messages[0].created_at;const data=await rpc(params);if(version!==state.version)return;draw(data,older);if(older||!state.messages.length||state.messages.length<100)el('directChatOlder').hidden=(data.messages||[]).length<100;status('');}
  catch(e){if(version===state.version)status(e.message+' Use Refresh to retry.');}finally{if(state.loading===version)state.loading=null;}
 }
 async function send(event){event.preventDefault();if(state.busy||!state.peer)return;const peer=state.peer,body=el('directChatInput').value.trim();if(!body||body.length>4000)return;
  const pending=state.pending[peer],id=pending?.body===body?pending.id:crypto.randomUUID();state.pending[peer]={id,body};state.busy=true;state.version++;controls();status('Sending...');
  try{const data=await rpc({p_peer:peer,p_body:body,p_message_id:id});draw(data);state.drafts[peer]='';el('directChatInput').value='';delete state.pending[peer];status('Sent');el('directChatMessages').scrollTop=el('directChatMessages').scrollHeight;}
  catch(e){status(e.message+' Your draft is kept. Press Send to retry.');}finally{state.busy=false;controls();el('directChatInput').focus({preventScroll:true});}
 }
 async function contacts(){const mount=el('directChatWorkspace');try{const data=await rpc({});if(mount!==el('directChatWorkspace'))return;state.contacts=(data.contacts||[]).sort((a,b)=>(b.last_message?.created_at||'').localeCompare(a.last_message?.created_at||'')||String(a.name).localeCompare(String(b.name)));if(!state.contacts.some(c=>c.id===state.peer))select(state.contacts.find(c=>c.id===new URLSearchParams(root.location?.search||'').get('peer'))?.id||state.contacts[0]?.id||'');else renderContacts();controls();if(!state.contacts.length)status('No active '+state.recipient+' accounts have completed setup at your school. Ask management to check their accounts.');}catch(e){if(mount!==el('directChatWorkspace'))return;status(e.message+' Use Refresh to retry.');if(!state.contacts.length)el('directChatContacts').replaceChildren(node('p',e.message+' Use Refresh to retry.','direct-chat-empty'));}}
 function bind(){if(new URLSearchParams(root.location?.search||'').has('peer'))el('directChatWorkspace').dataset.view='thread';let viewer=root.schoolshieldSession?.role;try{viewer=viewer||JSON.parse(sessionStorage.getItem('schoolshieldSession')||'{}').role;}catch{}state.recipient=viewer==='security'?'SGB':'Security';el('directChatTitle').textContent='Chats';el('directChatDescription').textContent='Private conversations with '+state.recipient+' accounts at your school.';
  el('directChatForm').onsubmit=send;el('directChatInput').oninput=()=>{state.drafts[state.peer]=el('directChatInput').value;};el('directChatSearch').oninput=renderContacts;el('directChatBack').onclick=()=>{const layout=el('directChatWorkspace'),button=el('directChatBack');if(root.innerWidth<=700){layout.dataset.view='list';button.setAttribute('aria-expanded','true');}else{const collapsed=layout.dataset.inboxCollapsed!=='true';layout.dataset.inboxCollapsed=String(collapsed);button.setAttribute('aria-expanded',String(!collapsed));}};
  el('directChatRefresh').onclick=async()=>{if(state.busy)return;const b=el('directChatRefresh');b.disabled=true;b.textContent='Refreshing...';try{await contacts();await load();}finally{b.disabled=false;b.textContent='Refresh';}};el('directChatOlder').onclick=()=>load(true);contacts();root.clearInterval(state.timer);state.timer=root.setInterval(()=>{if(!document.hidden&&!state.busy){contacts();load();}},15000);
  if(!state.listeners){root.addEventListener('online',()=>{contacts();load();});root.addEventListener('focus',()=>load());state.listeners=true;}
 }
 root.SchoolShieldDirectChat={bind,isSending:()=>state.busy,suspend(){if(state.peer&&el('directChatInput'))state.drafts[state.peer]=el('directChatInput').value;state.peer='';state.version++;state.loading=null;root.clearInterval(state.timer);}};
})(window);
