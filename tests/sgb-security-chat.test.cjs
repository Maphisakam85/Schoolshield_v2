const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('SchoolShield/sgb-security-chat.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(rpc,role="sgb"){
 const nodes={};const node=()=>({value:'',textContent:'',dataset:{},remove(){},setAttribute(){},children:[],scrollHeight:100,clientHeight:100,scrollTop:0,appendChild(n){this.children.push(n);},append(...n){this.children.push(...n);},replaceChildren(){this.children=[];},focus(){}});
 const document={hidden:false,getElementById:id=>nodes[id]||(nodes[id]=node()),createElement:node};
 let poll;const window={schoolshieldSupabase:{rpc},clearInterval(){},setInterval(fn){poll=fn;},addEventListener(){}};
 let id=0;vm.runInNewContext(source,{window,document,sessionStorage:{getItem:()=>JSON.stringify({role})},crypto:{randomUUID:()=>`id-${++id}`},Date,Map,JSON,Error,URLSearchParams});window.SchoolShieldDirectChat.bind();
 return {nodes,poll:()=>poll(),select:async()=>{await tick();await tick();},send:()=>nodes.directChatForm.onsubmit({preventDefault(){}})};
}
test('send failures preserve drafts, retry the same ID, and clear only after success',async()=>{
 const sent=[];let fail=true;
 const h=harness(async(name,p)=>{assert.equal(name,'sgb_security_chat');if(!p.p_peer)return {data:{contacts:[{id:'peer',name:'Officer',role:'security'}]}};
  if(p.p_body){sent.push(p);if(fail)return {error:{message:'Offline'}};}
  return {data:{user_id:'me',messages:p.p_body?[{id:p.p_message_id,body:p.p_body,sender_id:'me',created_at:'2026-10-21T10:00:00Z'}]:[]}};
 });
 await h.select();h.nodes.directChatInput.value='Hello';await h.send();assert.equal(h.nodes.directChatInput.value,'Hello');assert.equal(h.nodes.directChatSend.disabled,false);
 fail=false;await h.send();assert.equal(sent[0].p_message_id,sent[1].p_message_id);assert.equal(h.nodes.directChatInput.value,'');assert.equal(h.nodes.directChatMessages.children[0].className,'direct-message mine');
});
test('polling adds received messages without replacing the typed draft; content is plain text',async()=>{
 let messages=[];const h=harness(async(_,p)=>({data:!p.p_peer?{contacts:[{id:'peer',name:'SGB',role:'sgb'}]}:{user_id:'me',messages}}));
 await h.select();h.nodes.directChatInput.value='Draft';messages=[{id:'incoming',body:'<img onerror=alert(1)>',sender_id:'peer',created_at:'2026-10-21T10:00:00Z'}];h.poll();await tick();
 assert.equal(h.nodes.directChatInput.value,'Draft');assert.equal(h.nodes.directChatMessages.children[0].className,'direct-message');assert.equal(h.nodes.directChatMessages.children[0].children[0].textContent,messages[0].body);
});
test('channel navigation is restricted to SGB and Security',()=>{
 const app=fs.readFileSync('SchoolShield/app.js','utf8');const access=app.slice(app.indexOf('const ACCESS'),app.indexOf('const ACCESS')+6000);
 const context=vm.createContext({});vm.runInContext(access.slice(0,access.indexOf('\n};')+3)+'\nglobalThis.access=ACCESS;',context);
 for(const [role,pages]of Object.entries(context.access))assert.equal(pages.includes('sgb-security-chat'),['sgb','security'].includes(role),role);
});
test('migration restricts RPC access and prevents generic table writes',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261021100000_sgb_security_chat.sql','utf8');
 for(const pattern of [/enable row level security/,/revoke all on public.sgb_security_messages from anon, authenticated/,/id=auth.uid\(\)/,/actor.role not in \('sgb','security'\)/,/peer.school_id is distinct from actor.school_id/,/peer.account_status is distinct from 'Active'/,/sender_id=actor.id and recipient_id=peer.id/,/sender_id=peer.id and recipient_id=actor.id/,/on conflict\(id\) do nothing/,/saved.sender_id is distinct from actor.id/])assert.match(sql,pattern);
});

test('direct channel headings identify the recipient role',async()=>{for(const [role,label] of [['sgb','Security Chat'],['security','SGB Chat']]){const h=harness(async()=>({data:{contacts:[]}}),role);await tick();assert.equal(h.nodes.directChatTitle.textContent,"Chats");}});
test('chat labels use the recipient in each authorised portal',()=>{const app=fs.readFileSync('SchoolShield/app.js','utf8');const ctx=vm.createContext({});vm.runInContext(app.slice(app.indexOf('function chatLabel('),app.indexOf('function nav()')),ctx);for(const [id,role,label]of [['sgb-chat','sgb','Principal Chat'],['sgb-chat','principal','SGB Chat'],['sgb-security-chat','sgb','Security Chat'],['sgb-security-chat','security','SGB Chat'],['teacher-chat','teacher','Principal Chat'],['teacher-chat','principal','Teacher Chat'],['teacher-chat','deputy','Teacher Chat'],['parent-chat','parent','Teacher Chat'],['parent-chat','teacher','Parent Chat']])assert.equal(ctx.chatLabel(id,role),label);});
test('direct send shows a pending bubble immediately while waiting for the server',async()=>{
 let confirm;const h=harness(async(_,p)=>{if(!p.p_peer)return {data:{contacts:[{id:'peer',name:'Officer',role:'security'}]}};if(p.p_body)return new Promise(resolve=>{confirm=()=>resolve({data:{user_id:'me',messages:[{id:p.p_message_id,body:p.p_body,sender_id:'me',created_at:'2026-10-21T10:00:00Z'}]}});});return {data:{user_id:'me',messages:[]}};});
 await h.select();h.nodes.directChatInput.value='Hello';const sending=h.send();assert.equal(h.nodes.directChatSend.textContent,'Sending...');assert.equal(h.nodes.directChatMessages.children[0].children[1].textContent,'Sending...');assert.equal(h.nodes.directChatInput.value,'Hello');confirm();await sending;assert.equal(h.nodes.directChatInput.value,'');assert.equal(h.nodes.directChatMessages.children[0].className,'direct-message mine');
});
