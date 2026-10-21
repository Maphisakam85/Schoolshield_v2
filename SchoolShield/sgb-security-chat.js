/* Independent private channel; messages never enter shared workspace payloads. */
(function(root){
 const state={peer:'',drafts:{},pending:{},messages:[],busy:false,loading:false,version:0};
 const el=id=>document.getElementById(id);
 const status=text=>{el('directChatStatus').textContent=text;};
 async function rpc(params){
  const client=root.schoolshieldSupabase;
  if(!client)throw Error('Sign in to connect to chat.');
  const {data,error}=await client.rpc('sgb_security_chat',params);
  if(error)throw Error(error.message||'Chat could not be loaded.');
  if(!data)throw Error('No response received. Please retry.');
  return data;
 }
 function controls(){el('directChatInput').disabled=!state.peer||state.busy;el('directChatSend').disabled=!state.peer||state.busy;el('directChatPeer').disabled=state.busy;}
 function draw(data,older=false){
  const box=el('directChatMessages');const atBottom=box.scrollHeight-box.clientHeight-box.scrollTop<70;
  const height=box.scrollHeight,scroll=box.scrollTop;
  const merged=new Map(state.messages.map(m=>[m.id,m]));
  for(const m of data.messages||[])merged.set(m.id,m);
  const next=[...merged.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
  if(JSON.stringify(next)===JSON.stringify(state.messages))return;
  state.messages=next;box.replaceChildren();
  for(const m of next){const bubble=document.createElement('div');bubble.className='direct-message'+(m.sender_id===data.user_id?' mine':'');
   const body=document.createElement('span');body.textContent=m.body;
   const time=document.createElement('time');time.dateTime=m.created_at;time.textContent=new Date(m.created_at).toLocaleString('en-ZA');bubble.append(body,time);box.appendChild(bubble);}
  if(older)box.scrollTop=scroll+box.scrollHeight-height;else if(atBottom)box.scrollTop=box.scrollHeight;
 }
 async function load(older=false){
  if(!state.peer||state.loading||state.busy)return;
  const peer=state.peer,version=state.version;state.loading=true;
  try{const params={p_peer:peer};if(older&&state.messages.length)params.p_before=state.messages[0].created_at;
   const data=await rpc(params);if(version!==state.version)return;
   draw(data,older);el('directChatOlder').hidden=(data.messages||[]).length<100;
   status(state.messages.length?'':'No messages yet. Start a conversation.');
  }catch(e){if(version===state.version)status(e.message+' Use Refresh to retry.');}
  finally{state.loading=false;}
 }
 async function send(event){
  event.preventDefault();if(state.busy||!state.peer)return;
  const peer=state.peer,body=el('directChatInput').value.trim();if(!body||body.length>4000)return;
  // Reuse the ID after uncertain network outcomes so retries cannot duplicate a message.
  const pending=state.pending[peer];const id=pending?.body===body?pending.id:crypto.randomUUID();state.pending[peer]={id,body};
  state.busy=true;state.version++;controls();status('Sending…');
  try{const data=await rpc({p_peer:peer,p_body:body,p_message_id:id});draw(data);state.drafts[peer]='';el('directChatInput').value='';delete state.pending[peer];status('Sent');el('directChatMessages').scrollTop=el('directChatMessages').scrollHeight;}
  catch(e){status(e.message+' Your draft is kept. Press Send to retry.');}
  finally{state.busy=false;controls();el('directChatInput').focus({preventScroll:true});}
 }
 async function contacts(){
  try{const data=await rpc({});const select=el('directChatPeer');select.replaceChildren();
   const empty=document.createElement('option');empty.value='';empty.textContent=data.contacts.length?'Choose a contact':'No active contacts available';select.appendChild(empty);
   for(const contact of data.contacts){const option=document.createElement('option');option.value=contact.id;option.textContent=contact.name+' · '+(contact.role==='sgb'?'SGB':'Security');select.appendChild(option);}
   if(data.contacts.some(c=>c.id===state.peer))select.value=state.peer;else{state.peer='';state.version++;state.messages=[];el('directChatMessages').replaceChildren();el('directChatInput').value='';}
   controls();status(data.contacts.length?'Choose a contact to view your messages.':'No active SGB/Security accounts are available at your school.');
  }catch(e){status(e.message+' Use Refresh to retry.');}
 }
 function bind(){
  el('directChatForm').onsubmit=send;
  el('directChatInput').oninput=()=>{state.drafts[state.peer]=el('directChatInput').value;};
  el('directChatPeer').onchange=()=>{state.peer=el('directChatPeer').value;state.version++;state.messages=[];el('directChatMessages').replaceChildren();el('directChatOlder').hidden=true;el('directChatInput').value=state.drafts[state.peer]||'';controls();status('');load();};
  el('directChatRefresh').onclick=async()=>{if(state.busy)return;await contacts();await load();};
  el('directChatOlder').onclick=()=>load(true);
  contacts();
  root.clearInterval(state.timer);state.timer=root.setInterval(()=>{if(!document.hidden)load();},5000);
  root.addEventListener('online',()=>load());root.addEventListener('focus',()=>load());
 }
 root.SchoolShieldDirectChat={bind};
})(window);
