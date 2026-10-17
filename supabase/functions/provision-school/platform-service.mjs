import {normalizePhone,setupUrl} from '../approve-account/invitation.mjs';
const checked = response => { if(response.error)throw Error(response.error.message);return response.data; };
export async function provisionPlatformSchool({admin,actorId,body,env}) {
 if(body.action !== 'create')throw Error('Select school provisioning. Platform access does not support impersonation.');
 if(!/^[0-9a-f-]{36}$/i.test(body.operation_id || ''))throw Error('A stable operation UUID is required');
 const f=body.fields || {};
 const fields={name:String(f.name||'').trim(),code:String(f.code||'').trim().toUpperCase(),purpose:String(f.purpose||'live'),
  emis_number:String(f.emis_number||'').trim(),physical_address:String(f.physical_address||'').trim(),telephone:String(f.telephone||'').trim(),email:String(f.email||'').trim().toLowerCase(),designated_contact:String(f.designated_contact||'').trim(),
  principal_first_name:String(f.principal_first_name||'').trim(),principal_last_name:String(f.principal_last_name||'').trim(),principal_email:String(f.principal_email||'').trim().toLowerCase(),principal_phone:normalizePhone(f.principal_phone)};
 if(!['live','demo','qa'].includes(fields.purpose))throw Error('Select a valid school mode');
 if(fields.purpose!=='live' && env('SCHOOLSHIELD_ALLOW_QA_PROVISIONING')!=='true')throw Error('Demo/QA provisioning is disabled. Enable it explicitly in a development project.');
 if(fields.purpose==='live' && /\.test$/i.test(fields.principal_email))throw Error('Use verified real Principal details for live schools, or fictional details in QA mode.');
 const redirect=setupUrl(env('SCHOOLSHIELD_ACCOUNT_SETUP_URL'));
 let op,stage='School reservation';
 try {
  op=checked(await admin.rpc('reserve_platform_school',{p_actor:actorId,p_operation:body.operation_id,p_fields:fields}));
  stage='Principal Auth account';
  const existing=await admin.auth.admin.getUserById(op.principal_id);
  if(existing.error) {
   if(existing.error.status!==404 && existing.error.code!=='user_not_found')throw Error('Could not verify the reserved Auth identity; retry after checking the connection');
   const created=checked(await admin.auth.admin.createUser({id:op.principal_id,email:fields.principal_email,email_confirm:false,
    app_metadata:{school_code:fields.code,role:'principal',onboarding_required:true},user_metadata:{display_name:fields.principal_first_name+' '+fields.principal_last_name}}));
   if(created.user?.id!==op.principal_id)throw Error('Auth returned a different identity; reservation retained for operator review');
  }
  stage='Principal profile';
  const profile=checked(await admin.rpc('finish_platform_school',{p_actor:actorId,p_operation:op.id}));
  let setup_link;
  if(profile.requires_setup && !profile.onboarding_completed_at && profile.account_status==='Active') {
   stage='Principal setup link';
   const user=checked(await admin.auth.admin.getUserById(profile.id)).user;
   const generated=checked(await admin.auth.admin.generateLink({type:user.email_confirmed_at?'recovery':'invite',email:fields.principal_email,options:{redirectTo:redirect}}));
   if(generated.user?.id!==profile.id || !generated.properties?.hashed_token)throw Error('Could not confirm a setup token for the reserved Principal');
   const link=new URL(redirect);link.searchParams.set('token_hash',generated.properties.hashed_token);link.searchParams.set('type',user.email_confirmed_at?'recovery':'invite');setup_link=link.toString();
  }
  checked(await admin.rpc('record_platform_provision_result',{p_actor:actorId,p_operation:op.id,p_success:true,p_setup_link_generated:Boolean(setup_link)}));
  return {ok:true,school_id:op.school_id,user_id:profile.id,school_code:fields.code,setup_link,message:'School and Principal account confirmed. Deliver the private setup link securely; email/SMS delivery has not been requested.'};
 } catch(error) {
  if(op) {
   try { checked(await admin.rpc('record_platform_provision_result',{p_actor:actorId,p_operation:op.id,p_success:false,p_error:stage+' failed. Retry the same operation; reserved records are retained.'})); } catch { /* No success is claimed if failure logging is unavailable. */ }
  }
  throw Error(stage+' failed: '+(error.message || 'Request unconfirmed')+'. Retry the same operation; do not create a replacement school.');
 }
}
