import {manageUser} from './service.mjs';
const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};
export async function managePlatformAccount({admin,actorId,body,env}) {
 const schoolId=body.school_id;
 if(!/^[0-9a-f-]{36}$/i.test(schoolId||''))throw Error('Select a school by UUID');
 if(body.fields?.staff_id!==undefined||body.fields?.learner_ids!==undefined||body.fields?.app_metadata!==undefined)throw Error('Assignments, family links and platform privileges are not editable here');
 const school=checked(await admin.from('schools').select('id,data_mode').eq('id',schoolId).single());
 const actor={id:actorId,role:'platform',platform_admin_authorized:true,school_id:school.id,school_mode:school.data_mode,account_status:'Active'};
 const call=(name,args)=>admin.rpc(name,{p_actor:actorId,...args});
 const actorClient={rpc:async(name,args)=>{
  if(name!=='begin_user_management')throw Error('Unsupported platform operation');
  const fields={...args.p_fields,_delivery:body.delivery||'email'};delete fields.staff_id;delete fields.learner_ids;
  return call('begin_platform_account',{p_school:schoolId,p_operation:args.p_operation,p_action:args.p_action,p_target:args.p_target,p_fields:fields,p_confirm:body.confirmed===true,p_reason:String(body.reason||'').trim()});
 }};
 const facade={auth:admin.auth,from:admin.from.bind(admin),rpc:(name,args)=>{
  if(name==='ensure_managed_auth_profile')return call('finish_platform_account',{p_operation:args.p_operation,p_prepare_only:true});
  if(name==='finish_user_management')return call('finish_platform_account',{p_operation:args.p_operation});
  if(name==='fail_user_management')return call('platform_account_result',{p_operation:args.p_operation,p_success:false,p_error:args.p_error});
  throw Error('Unsupported platform persistence operation');
 }};
 const result=await manageUser({admin:facade,actorClient,actor,body,env});
 checked(await call('platform_account_result',{p_operation:body.operation_id,p_success:true}));
 return result;
}
