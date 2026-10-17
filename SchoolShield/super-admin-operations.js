(() => {
  const $ = id => document.getElementById(id);
  let ctx, access, tickets = [], editing, accessOp, ticketOp, offset = 0, filtering = false, hasMore = false;
  const message = 'Request could not be confirmed. Refresh and retry using the retained entries and operation reference.';
  const date = v => v ? new Date(v).toLocaleString('en-ZA') : '';
  async function rpc(name, args) {
    let timer;
    try {
      const {data,error} = await Promise.race([ctx.client.rpc(name,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),20000);})]);
      if(error) throw Error(message); // Never render raw provider/database error payloads.
      return data;
    } finally {clearTimeout(timer);}
  }
  async function busy(button, task) {
    if(button.disabled)return; const label=button.textContent;button.disabled=true;button.textContent='Working...';button.setAttribute('aria-busy','true');
    try { await task(); } catch {const ref=$('supportDialog').open?ticketOp?.id:accessOp?.id;const safe=message+(ref?' Operation reference: '+ref:'');ctx.status(safe);if($('supportDialog').open)$('ticketStatus').textContent=safe;}
    finally {button.disabled=button.id==='auditPrevious'?offset===0:button.id==='auditNext'?!hasMore:false;button.textContent=label;button.removeAttribute('aria-busy');}
  }
  function row(template, item) {
    const node=$(template).content.cloneNode(true);
    node.querySelectorAll('[data-cell]').forEach(cell=>{const key=cell.dataset.cell;cell.textContent=key.endsWith('_at')?date(item[key]):item[key]||'';});return node;
  }
  function renderTickets() {
    $('supportRows').replaceChildren();const query=$('supportSearch').value.toLowerCase();
    for(const t of tickets.filter(t=>[t.title,t.category,t.status,t.priority].join(' ').toLowerCase().includes(query))){const node=row('supportRow',t);node.querySelector('[data-edit]').onclick=()=>openTicket(t);$('supportRows').append(node);}
    $('supportEmpty').hidden=$('supportRows').children.length>0;
  }
  function openTicket(ticket) {
    editing=ticket||{id:crypto.randomUUID(),revision:0};ticketOp=null;$('supportForm').reset();
    if(ticket)for(const key of ['title','category','priority','status','description','internal_notes'])$('supportForm').elements[key].value=ticket[key];
    $('ticketSchool').textContent=ctx.school.name+' ('+ctx.school.code+')';$('ticketStatus').textContent='';$('supportDialog').showModal();
  }
  async function history() {
    if(filtering)return;filtering=true;
    try {
      const f=$('auditFilters').elements;
      const data=await rpc('platform_admin_audit_history',{p_school:$('auditSchool').value||null,p_search:f.search.value,p_action:f.action.value,p_from:f.from.value||null,p_to:f.to.value||null,p_offset:offset});
      $('historyRows').replaceChildren();for(const event of data.events.slice(0,100))$('historyRows').append(row('historyRow',{...event,school:[event.school_name,event.school_code].filter(Boolean).join(' / '),actor:event.actor_id||('Database operator: '+event.database_actor)}));
      $('historyEmpty').hidden=data.events.length>0;
      hasMore=data.events.length>100;$('auditPrevious').disabled=offset===0;$('auditNext').disabled=!hasMore;
    } finally {filtering=false;}
  }
  async function refresh() {
    const [a,s]=await Promise.all([rpc('platform_admin_school_access',{p_school:ctx.school.id}),rpc('platform_admin_support',{p_school:ctx.school.id})]);
    if(a?.school_id!==ctx.school.id||s?.school_id!==ctx.school.id)throw Error(message);
    tickets=s.tickets;
    if (!window.SchoolShieldPlatformDrafts?.has('accessForm')) {
      access=a;const f=$('accessForm').elements;f.status.value=a.status;f.announcements.checked=a.features.announcements;f.appointments.checked=a.features.appointments;f.reason.value='';f.confirm.checked=false;accessOp=null;
    }
    $('dataMode').textContent='Data mode: '+ctx.school.data_mode+' (independent of lifecycle status).';renderTickets();$('diagnosticRows').replaceChildren();
    for(const d of [...(s.diagnostics.invitations||[]),...s.diagnostics.account_operations,...s.diagnostics.provisioning.map(x=>({...x,action:'School provisioning'}))])$('diagnosticRows').append(row('diagnosticRow',d));
    $('diagnosticEmpty').hidden=$('diagnosticRows').children.length>0;
    await history();
  }
  window.SchoolShieldOperationsPage={
    async load(value){ctx=value;$('schoolBack').href='super-admin-school.html?school='+encodeURIComponent(ctx.school.id);
      const {data,error}=await ctx.client.rpc('platform_admin_directory');if(error)throw Error(message);
      const all=new Option('All schools','');$('auditSchool').replaceChildren(all);for(const s of data.schools)$('auditSchool').add(new Option(s.name+' ('+s.code+')',s.id));$('auditSchool').value=ctx.school.id;await refresh();},
    bind(){
      $('supportSearch').oninput=renderTickets;$('newTicket').onclick=()=>openTicket();$('closeTicket').onclick=()=>{if(window.SchoolShieldPlatformDrafts?.discard('supportForm')!==false)$('supportDialog').close();};
      $('supportDialog').addEventListener('cancel',e=>{e.preventDefault();$('closeTicket').click();});
      $('operationsRefresh').onclick=()=>busy($('operationsRefresh'),async()=>{if(window.SchoolShieldPlatformDrafts?.discard('accessForm')===false)return;await refresh();ctx.status('Confirmed access, support and history loaded.');});
      $('accessForm').onsubmit=e=>{e.preventDefault();const f=e.currentTarget.elements;const values={p_school:ctx.school.id,p_revision:access.revision,p_status:f.status.value,p_features:{announcements:f.announcements.checked,appointments:f.appointments.checked},p_reason:f.reason.value,p_confirm:f.confirm.checked};
        const signature=JSON.stringify(values);if(accessOp?.signature!==signature)accessOp={signature,id:crypto.randomUUID()};
        busy(e.currentTarget.querySelector('[type=submit]'),async()=>{await rpc('platform_admin_set_school_access',{...values,p_operation:accessOp.id});window.SchoolShieldPlatformDrafts?.clear('accessForm');try{await refresh();ctx.status('Access controls saved and audited.');}catch{ctx.status('Access controls saved and audited. Refresh to load confirmed records.');}});};
      $('supportForm').onsubmit=e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(e.currentTarget));const signature=JSON.stringify(fields);if(ticketOp?.signature!==signature)ticketOp={signature,id:crypto.randomUUID()};
        busy(e.currentTarget.querySelector('[type=submit]'),async()=>{const saved=await rpc('platform_admin_save_support',{p_school:ctx.school.id,p_id:editing.id,p_revision:editing.revision,p_fields:fields,p_operation:ticketOp.id});if(saved.school_id!==ctx.school.id)throw Error(message);window.SchoolShieldPlatformDrafts?.clear('supportForm');$('supportDialog').close();try{await refresh();ctx.status('Owner-created ticket saved and audited. No message sent.');}catch{ctx.status('Ticket saved and audited. Refresh to load confirmed records. No message sent.');}});};
      $('auditFilters').onsubmit=e=>{e.preventDefault();offset=0;busy(e.currentTarget.querySelector('button'),history);};
      $('auditPrevious').onclick=()=>{offset=Math.max(0,offset-100);busy($('auditPrevious'),history);};$('auditNext').onclick=()=>{offset+=100;busy($('auditNext'),history);};
    }
  };
})();
