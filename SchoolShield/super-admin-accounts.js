(() => {
 const $=id=>document.getElementById(id);let client,context,school,report,users=[],operations=[],editing=null,action,requestId,working=false;
 const roles={principal:'Principal',deputy:'Deputy Principal',clerk:'Clerk',teacher:'Teacher',parent:'Parent',sgb:'SGB',security:'Security Officer'};
 async function load(options){
  ({client,context,school,status:report}=options);
  const {data,error}=await client.rpc('platform_admin_accounts',{p_school:school.id});if(error)throw error;if(data.school_id!==school.id)throw Error('Accounts do not match the selected school.');
  users=data.users;operations=data.operations||[];
  document.querySelector('[data-school-management]').href='super-admin-school.html?school='+encodeURIComponent(school.id);draw();
 }
 function draw(){
  $('accountRows').replaceChildren();const query=$('accountSearch').value.toLowerCase();
  const filtered=users.filter(u=>(!$('accountRole').value||u.role===$('accountRole').value)&&(!$('accountStatus').value||u.account_status===$('accountStatus').value)&&[u.display_name,u.email,u.employee_id].join(' ').toLowerCase().includes(query));
  for(const user of filtered){
   const row=$('accountRow').content.cloneNode(true);
   for(const[key,value]of Object.entries({name:user.display_name,email:user.email,phone:user.phone,employee:user.employee_id,role:roles[user.role],status:user.account_status,invitation:user.onboarding_completed_at?'Setup complete':(user.invitation?.status||'Not sent')+(user.invitation?.error?' — '+'Delivery not confirmed; see diagnostics':'')}))row.querySelector('[data-account-'+key+']').textContent=value||'';
   row.querySelector('[data-account-edit]').onclick=()=>open('edit',user);
   const access=row.querySelector('[data-account-access]');access.textContent=user.account_status==='Active'?'Deactivate':'Activate';access.onclick=()=>open('status',user);
   const invite=row.querySelector('[data-account-invite]');invite.hidden=user.account_status!=='Active'||Boolean(user.onboarding_completed_at);invite.textContent=user.invitation?'Resend invitation':'Send invitation';invite.onclick=()=>open('invite',user);
   const reset=row.querySelector('[data-account-reset]');reset.hidden=user.account_status!=='Active'||user.requires_setup||!user.onboarding_completed_at;reset.onclick=()=>open('reset',user);
   if(user.pending_operation)row.querySelectorAll('button').forEach(b=>b.disabled=true);
   $('accountRows').append(row);
  }
  $('accountEmpty').hidden=filtered.length>0;$('accountPending').replaceChildren();
  for(const op of operations){const row=$('accountPendingRow').content.cloneNode(true);row.querySelector('[data-pending-description]').textContent=op.action+' · '+(op.fields.email||op.target_id)+' · '+(op.error?'Request failed; see diagnostics':'Request awaiting completion');const button=row.querySelector('[data-account-resume]');button.disabled=op.actor_id!==context.user_id;button.onclick=()=>resume(op);$('accountPending').append(row);}
 }
 function open(next,user){
  editing=user||null;action=next;requestId=crypto.randomUUID();const form=$('accountForm');form.reset();$('accountResult').hidden=true;$('accountSubmit').hidden=false;
  $('accountDialogTitle').textContent=next==='create'?'Create account':next==='edit'?'Edit account':next==='status'?(user.account_status==='Active'?'Deactivate account':'Activate account'):next==='invite'?(user.invitation?'Resend account invitation':'Send account invitation'):'Send password reset';
  $('accountSchoolIdentity').textContent=school.name+' ('+school.code+') · '+(user?.display_name||'New account');
  const identity=['create','edit'].includes(next);$('accountIdentityFields').hidden=!identity;
  $('accountIdentityFields').querySelectorAll('input,select').forEach(input=>input.disabled=!identity);
  for(const field of ['first_name','last_name','email','phone','employee_id','role'])form.elements[field].value=user?.[field]||(field==='role'?'teacher':'');
  $('accountStateLabel').hidden=!['create','edit','status'].includes(next);form.elements.account_status.value=next==='status'?(user.account_status==='Active'?'Inactive':'Active'):user?.account_status||'Active';
  $('accountDeliveryLabel').hidden=!['create','invite','reset'].includes(next);$('accountFormStatus').textContent='';$('accountDialog').showModal();
 }
 async function send(body){
  const {data:own,error}=await client.auth.getSession();if(error||!own.session)throw Error('Sign in again.');const config=window.SCHOOLSHIELD_SUPABASE_CONFIG;
  const response=await fetch(config.url+'/functions/v1/manage-users',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+own.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({...body,platform:true,school_id:school.id}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'The account request was not confirmed.');return result;
 }
 async function perform(body){
  if(working)return;working=true;$('accountSubmit').disabled=true;$('accountClose').disabled=true;$('accountFormStatus').textContent='Saving account for '+school.name+'...';
  try{const result=await send(body);window.SchoolShieldPlatformDrafts?.clear('accountForm');$('accountResult').hidden=false;$('accountResultMessage').textContent=result.message;$('accountResultLink').value=result.setup_link||'';$('accountResultLinkLabel').hidden=!result.setup_link;$('accountSubmit').hidden=true;$('accountFormStatus').textContent='';
   try{await load({client,context,school,status:report});report(result.message);}catch{report('Account operation confirmed. Refresh to load current users.');}}
  catch(error){const safe=window.SchoolShieldPlatformError(error)+(body.action==='create'?' Any created account is retained.':' Your entries are retained.')+' Refresh and resume the original request. Operation: '+body.operation_id;$('accountFormStatus').textContent=safe;report(safe);try{await load({client,context,school,status:report});}catch{}}
  finally{working=false;$('accountSubmit').disabled=false;$('accountClose').disabled=false;}
 }
 function resume(op){
  if(working||!confirm('Resume '+op.action+' for '+(op.fields.email||op.target_id)+' at '+school.name+' ('+school.code+')?'))return;
  open(op.action,users.find(u=>u.id===op.target_id));
  for(const [key,value] of Object.entries(op.fields))if($('accountForm').elements[key])$('accountForm').elements[key].value=value||'';
  $('accountForm').elements.reason.value=op.reason;
  $('accountForm').elements.delivery.value=op.fields._delivery||'email';
  $('accountForm').elements.confirmed.checked=true;
  const f={...op.fields};delete f._delivery;
  perform({action:op.action,operation_id:op.id,user_id:op.target_id,fields:f,revision:f.revision,account_status:f.account_status,delivery:op.fields._delivery||'email',reason:op.reason,confirmed:true});
 }
 function bind(){
  let batch=[];
  const eligible=user=>user.account_status==='Active'&&!user.onboarding_completed_at&&!user.pending_operation&&(!user.invitation?.status||/^(failed|not sent|link generated)$/i.test(user.invitation.status));
  $('sendAllInvitations').onclick=async()=>{
   if(working)return;
   working=true;$('sendAllInvitations').disabled=true;
   try{await load({client,context,school,status:report});}catch(error){report(window.SchoolShieldPlatformError(error));return;}
   finally{working=false;$('sendAllInvitations').disabled=false;}
   batch=users.filter(eligible).map(user=>({user,operation:crypto.randomUUID(),done:false}));
   $('bulkInviteForm').reset();$('bulkInviteStatus').textContent='';$('bulkInviteSubmit').disabled=!batch.length;
   $('bulkInviteScope').textContent=school.name+' ('+school.code+') - '+batch.length+' eligible accounts';
   $('bulkInviteRecipients').replaceChildren();for(const item of batch){const li=document.createElement('li');li.textContent=item.user.display_name+' - '+item.user.email;$('bulkInviteRecipients').append(li);}
   $('bulkInviteDialog').showModal();
  };
  $('bulkInviteClose').onclick=()=>{if(!working)$('bulkInviteDialog').close();};
  $('bulkInviteDialog').addEventListener('cancel',event=>{event.preventDefault();$('bulkInviteClose').click();});
  $('bulkInviteForm').onsubmit=async event=>{
   event.preventDefault();if(working||!event.currentTarget.reportValidity())return;
   const reason=$('bulkInviteReason').value.trim();if(reason.length<5)return;
   working=true;$('bulkInviteSubmit').disabled=true;$('bulkInviteClose').disabled=true;
   let failure='';
   try{
    for(const item of batch.filter(item=>!item.done)){
     $('bulkInviteStatus').textContent='Requesting invitation for '+item.user.display_name+'...';
     try{await send({action:'invite',operation_id:item.operation,user_id:item.user.id,revision:item.user.management_revision,delivery:'email',reason,confirmed:true});item.done=true;}
     catch(error){failure=window.SchoolShieldPlatformError(error);break;}
    }
    const count=batch.filter(item=>item.done).length;
    $('bulkInviteStatus').textContent=count+' of '+batch.length+' invitation requests accepted by Supabase.'+(failure?' Stopped: '+failure+' Resume pending operations before starting another batch.':' Email receipt is not confirmed.');
    await load({client,context,school,status:report});
   }catch{report('Refresh accounts to check the confirmed invitation statuses.');}
   finally{working=false;$('bulkInviteClose').disabled=false;$('bulkInviteSubmit').disabled=true;}
  };
  for(const id of ['accountSearch','accountRole','accountStatus'])$(id).oninput=draw;
  $('addSchoolAccount').onclick=()=>open('create');
  $('platformRefresh').onclick=()=>{if(!working)load({client,context,school,status:report}).then(()=>report('Accounts refreshed.')).catch(e=>report(window.SchoolShieldPlatformError(e)));};
  $('accountClose').onclick=()=>{if(!working&&window.SchoolShieldPlatformDrafts?.discard('accountForm')!==false)$('accountDialog').close();};$('accountDialog').addEventListener('cancel',e=>{e.preventDefault();$('accountClose').click();});
  $('accountForm').onsubmit=event=>{
   event.preventDefault();const form=event.currentTarget;const values=Object.fromEntries(new FormData(form));
   const fields={};for(const key of ['first_name','last_name','email','phone','employee_id','role','account_status'])fields[key]=values[key];fields.school_id=school.id;fields.revision=editing?.management_revision;
   perform({action,operation_id:requestId,user_id:editing?.id,fields,revision:editing?.management_revision,account_status:values.account_status,delivery:values.delivery,reason:values.reason,confirmed:form.elements.confirmed.checked});
  };
 }
 window.SchoolShieldAccountsPage={load,bind,isBusy:()=>working};
})();
