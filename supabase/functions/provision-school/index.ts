import {createClient} from 'npm:@supabase/supabase-js@2';
import {provisionPlatformSchool} from './platform-service.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)return json({error:'Sign in is required'},401);
 try {
  const url=Deno.env.get('SUPABASE_URL')!;
  const keys=Deno.env.get('SUPABASE_SECRET_KEYS');
  const key=keys?JSON.parse(keys).default:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const admin=createClient(url,key!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error}=await admin.auth.getUser(token);
  if(error||!auth.user)return json({error:'Invalid session'},401);
  // Authorisation derives from the verified JWT, never request fields or school roles.
  const caller=createClient(url,key!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:context,error:denied}=await caller.rpc('platform_admin_context');
  if(denied||context?.user_id!==auth.user.id)return json({error:'Platform administrator access denied'},403);
  const body=await request.json();
  return json(await provisionPlatformSchool({admin,actorId:auth.user.id,body,env:(name:string)=>Deno.env.get(name)}));
 }catch(error){return json({error:error instanceof Error?error.message:'Provisioning failed; existing records are retained.'},400);}
});
