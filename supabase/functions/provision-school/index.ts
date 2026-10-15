import {createClient} from 'npm:@supabase/supabase-js@2';
import {normalizePhone,setupUrl} from '../approve-account/invitation.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const checked=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try{
 const keys=Deno.env.get('SUPABASE_SECRET_KEYS');const key=keys?JSON.parse(keys).default:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=checked(await admin.auth.getUser(request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||''));
 const actor=checked(await admin.from('profiles').select('id,role,school_id,account_status,requires_setup,onboarding_completed_at,school:schools(data_mode)').eq('id',auth.user.id).single());
 const allowlist=(Deno.env.get('SCHOOLSHIELD_PILOT_ADMIN_IDS')||'').split(',').map(s=>s.trim());
 if(!allowlist.includes(actor.id)||actor.role!=='principal'||actor.account_status!=='Active'||actor.requires_setup&&!actor.onboarding_completed_at)return json({error:'School provisioning requires an explicitly configured pilot administrator. User Management remains limited to your school.'},403);
 const deploymentMode=Deno.env.get('SCHOOLSHIELD_DEPLOYMENT_MODE')||'live';
 const actorMode=(Array.isArray(actor.school)?actor.school[0]:actor.school)?.data_mode;
 if(actorMode!=='live'&&deploymentMode!=='demo')return json({error:'A real live-school administrator is required outside the demo deployment.'},403);
 const body=await request.json();if(body.action==='capabilities')return json({ok:true,can_provision:true});
 if(body.action==='close_qa_school'){
  const provision=checked(await admin.from('pilot_school_provisions').select('*').eq('school_id',body.school_id).eq('actor_id',actor.id).single());
  const school=checked(await admin.from('schools').select('code').eq('id',provision.school_id).single());
  if(provision.fields.purpose!=='qa'||body.confirm_school_code!==school.code)return json({error:'Only a QA school provisioned by this pilot administrator can be closed, with its exact school code.'},403);
  const users=checked(await admin.from('profiles').select('*').eq('school_id',provision.school_id));
  for(const user of users){
   checked(await admin.from('profiles').update({account_status:'Inactive'}).eq('id',user.id));
   checked(await admin.auth.admin.updateUserById(user.id,{ban_duration:'876000h'}));
   checked(await admin.from('user_management_audit').insert({school_id:provision.school_id,user_id:user.id,actor_id:actor.id,action:'QA school closed',previous_value:{account_status:user.account_status},new_value:{account_status:'Inactive'}}));
  }
  return json({ok:true,message:'QA school accounts deactivated. All school records and Auth identities are retained.',count:users.length});
 }
 const f=body.fields||{};const fields={code:String(f.code||'').trim().toUpperCase(),name:String(f.name||'').trim(),first_name:String(f.first_name||'').trim(),last_name:String(f.last_name||'').trim(),email:String(f.email||'').trim().toLowerCase(),phone:normalizePhone(f.phone),purpose:['qa','demo'].includes(f.purpose)?f.purpose:'pilot'};
 if(fields.purpose==='pilot'&&/\.test$/i.test(fields.email))throw Error('Use a real Principal email for a live school, or explicitly select Demo mode for school-name/role test accounts.');
 if(fields.purpose==='qa'&&deploymentMode!=='demo')throw Error('QA provisioning is disabled outside the demo deployment.');
 const redirect=setupUrl(Deno.env.get('SCHOOLSHIELD_ACCOUNT_SETUP_URL'));
 const op=checked(await admin.rpc('reserve_pilot_school',{p_actor:actor.id,p_operation:body.operation_id,p_fields:fields}));
 const existing=await admin.auth.admin.getUserById(op.principal_id);
 if(existing.error){checked(await admin.auth.admin.createUser({id:op.principal_id,email:fields.email,email_confirm:false,app_metadata:{school_code:fields.code,role:'principal',onboarding_required:true},user_metadata:{display_name:fields.first_name+' '+fields.last_name}}));}
 const profile=checked(await admin.rpc('finish_pilot_school',{p_operation:op.id}));
 let setup_link;
 if(profile.requires_setup&&profile.account_status==='Active'){
  const user=checked(await admin.auth.admin.getUserById(profile.id)).user;const type=user.email_confirmed_at?'recovery':'invite';
  const generated=checked(await admin.auth.admin.generateLink({type,email:profile.email,options:{redirectTo:redirect}}));
  if(generated.user?.id!==profile.id||!generated.properties?.hashed_token)throw Error('Could not generate Principal setup invitation');
  const link=new URL(redirect);link.searchParams.set('token_hash',generated.properties.hashed_token);link.searchParams.set('type',type);setup_link=link.toString();
  checked(await admin.from('user_invitations').upsert({school_id:op.school_id,user_id:profile.id,operation_id:op.id,delivery:'setup_link',status:'Link generated',sent_at:new Date().toISOString()},{onConflict:'operation_id'}));
 }
 return json({ok:true,school_id:op.school_id,user_id:profile.id,school_code:fields.code,setup_link,message:'School created with an empty authoritative dataset. Complete the new Principal account setup, then sign in with this school code.'});
 }catch(error){return json({error:error instanceof Error?error.message:'School provisioning failed; existing records are retained.'},400);}
});
