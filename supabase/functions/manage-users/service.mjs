import { normalizePhone, setupUrl, smsConfig, sendSms } from '../approve-account/invitation.mjs';

export const roles = ['principal','deputy','clerk','teacher','parent','sgb','security'];
export function validateFields(body, actor) {
  const f = body.fields || {};
  if (f.school_id && f.school_id !== actor.school_id) throw new Error('Cross-school user management denied');
  if (!roles.includes(f.role)) throw new Error('Select a valid role');
  if (actor.role !== 'principal' && ['principal','deputy','clerk'].includes(f.role)) throw new Error('Only Principal may assign administrative roles');
  const first_name = String(f.first_name || '').trim(), last_name = String(f.last_name || '').trim();
  const email = String(f.email || '').trim().toLowerCase();
  if (!first_name || first_name.length>60 || !last_name || last_name.length>60) throw new Error('Enter first and last names (up to 60 characters each)');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length>254) throw new Error('Enter a valid email');
  if (actor.school_mode==='live' && /\.test$/i.test(email)) throw new Error('Use a real invitation email for a live school. Test accounts belong in a Demo or QA school.');
  const account_status=f.account_status || 'Active';
  if (!['Active','Inactive'].includes(account_status)) throw new Error('Select Active or Inactive');
  return {first_name,last_name,email,phone:normalizePhone(f.phone),role:f.role,school_id:actor.school_id,employee_id:String(f.employee_id || '').trim(),account_status,revision:f.revision,staff_id:f.staff_id || null,learner_ids:Array.isArray(f.learner_ids)?f.learner_ids:[]};
}

const checked = result => {if(result.error) throw new Error(result.error.message);return result.data;};
export async function manageUser({admin, actorClient, actor, body, env}) {
  if (actor.account_status !== 'Active' || actor.requires_setup && !actor.onboarding_completed_at || !['principal','deputy','clerk'].includes(actor.role)) throw new Error('User management access denied');
  if(body.school_id && body.school_id!==actor.school_id)throw new Error('Cross-school user management denied');
  if (body.action==='list') return checked(await actorClient.rpc('list_school_users'));
  if (!['create','edit','status','invite'].includes(body.action)) throw new Error('Invalid management action');
  const delivery = body.delivery || 'email';
  if (!['email','sms','setup_link'].includes(delivery)) throw new Error('Invalid invitation delivery');
  // Validate delivery configuration before creating any Auth account.
  const willInvite = ['create','invite'].includes(body.action);
  const redirect = willInvite ? setupUrl(delivery==='setup_link' ? env('SCHOOLSHIELD_MANUAL_SETUP_URL') || env('SCHOOLSHIELD_ACCOUNT_SETUP_URL') : env('SCHOOLSHIELD_ACCOUNT_SETUP_URL'), delivery==='setup_link' && env('SCHOOLSHIELD_ALLOW_LOCAL_SETUP')==='true') : null;
  const provider = willInvite && delivery==='sms' ? smsConfig(env) : null;
  let fields;
  if (['create','edit'].includes(body.action)) fields=validateFields(body,actor);
  else fields={school_id:actor.school_id,revision:body.revision,account_status:body.account_status};
  const operationId = body.operation_id;
  if (!/^[0-9a-f-]{36}$/i.test(operationId || '')) throw new Error('A UUID operation ID is required');
  const proposedId=body.action==='create' ? crypto.randomUUID() : body.user_id;
  // Only this authenticated RPC may reserve permissions. It stores sanitized
  // fields and derives actor and tenant from the user's actual JWT/profile.
  const op=checked(await actorClient.rpc('begin_user_management',{p_operation:operationId,p_action:body.action,p_target:proposedId,p_fields:fields}));
  if(op.status==='Failed') throw new Error('This attempt failed. Refresh the user list and start a new attempt. '+(op.error||''));
  if(op.status==='Completed') return {ok:true,user_id:op.target_id,message:'This request was already completed. Refresh the user list.'};
  if(op.replayed) throw new Error('This request is already in progress. Refresh User Management before retrying.');
  fields=op.fields;
  let invitation;
  try {
    const school=checked(await admin.from('schools').select('code,name').eq('id',op.school_id).single());
    const display_name=[fields.first_name,fields.last_name].filter(Boolean).join(' ');
    if(body.action==='create') {
      // Creation is real Auth, without a known/default password. Trusted metadata
      // is supplied only by this backend after the database permission check.
      const result=await admin.auth.admin.createUser({id:op.target_id,email:fields.email,email_confirm:false,
        app_metadata:{school_code:school.code,role:fields.role,onboarding_required:true},user_metadata:{display_name}});
      if(result.error) throw new Error(result.error.message);
      if(result.data?.user?.id!==op.target_id) throw new Error('Auth returned an unexpected account identity');
      checked(await admin.rpc('ensure_managed_auth_profile',{p_operation:operationId}));
    }
    if(body.action==='edit' || body.action==='status') {
      const user=checked(await admin.auth.admin.getUserById(op.target_id)).user;
      if(!user) throw new Error('Auth account is unavailable');
      const attrs={app_metadata:{...user.app_metadata,school_code:school.code,role:fields.role},ban_duration:fields.account_status==='Inactive'?'876000h':'none'};
      if(body.action==='edit') {attrs.email=fields.email;attrs.user_metadata={...user.user_metadata,display_name};}
      checked(await admin.auth.admin.updateUserById(op.target_id,attrs));
    }
    if(body.action==='create' && fields.account_status==='Inactive') checked(await admin.auth.admin.updateUserById(op.target_id,{ban_duration:'876000h'}));
    if(body.action==='invite') {
      const user=checked(await admin.from('profiles').select('*').eq('id',op.target_id).eq('school_id',op.school_id).single());
      fields={...fields,...user};
    }
    // No success until Auth assignment AND durable profile/audit commit succeed.
    const profile=checked(await admin.rpc('finish_user_management',{p_operation:operationId}));
    let setup_link;
    if(willInvite && profile.account_status==='Active') {
      invitation=checked(await admin.from('user_invitations').insert({school_id:op.school_id,user_id:op.target_id,operation_id:operationId,delivery,status:'Pending'}).select().single());
      const authUser=checked(await admin.auth.admin.getUserById(op.target_id)).user;
      const type=authUser.email_confirmed_at?'recovery':'invite';
      if(delivery==='email') {
        if(type==='invite') checked(await admin.auth.admin.inviteUserByEmail(profile.email,{redirectTo:redirect,data:{display_name:profile.display_name}}));
        else checked(await admin.auth.resetPasswordForEmail(profile.email,{redirectTo:redirect}));
      } else {
        const generated=checked(await admin.auth.admin.generateLink({type,email:profile.email,options:{redirectTo:redirect}}));
        if(generated.user?.id!==op.target_id || !generated.properties?.hashed_token) throw new Error('Could not generate the account setup link');
        const link=new URL(redirect);link.searchParams.set('token_hash',generated.properties.hashed_token);link.searchParams.set('type',type);
        if(delivery==='sms') {
          const reference=await sendSms(provider,profile.phone,`SchoolShield: your account at ${school.name} is ready for setup. School code: ${school.code}. ${link}`);
          checked(await admin.from('user_invitations').update({provider_reference:reference}).eq('id',invitation.id));
        } else setup_link=link.toString();
      }
      checked(await admin.from('user_invitations').update({status:delivery==='setup_link'?'Link generated':'Sent',sent_at:new Date().toISOString()}).eq('id',invitation.id));
    }
    return {ok:true,user_id:op.target_id,setup_link,message:willInvite ? profile.account_status==='Inactive'?'Inactive account created. Activate it before sending an invitation.':delivery==='setup_link'?'Account saved. Secure setup link generated.':delivery==='sms'?'Account saved. SMS provider accepted the setup invitation.':'Account saved. Supabase accepted the setup email request.':'Account changes confirmed.'};
  } catch(error) {
    if(invitation) await admin.from('user_invitations').update({status:'Failed',error:'Invitation could not be sent. Check backend delivery configuration and resend.'}).eq('id',invitation.id);
    await admin.rpc('fail_user_management',{p_operation:operationId,p_error:String(error.message || error)});
    // No hard deletion or password resets to a shared/default credential.
    throw new Error('Request incomplete: '+error.message+'. Refresh User Management before retrying; any account already created is retained.');
  }
}
