import { createClient } from 'npm:@supabase/supabase-js@2';
import { manageUser } from './service.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(body: unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)return json({error:'Sign in is required'},401);
 const keys=Deno.env.get('SUPABASE_SECRET_KEYS');
 const key=keys?JSON.parse(keys).default:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const url=Deno.env.get('SUPABASE_URL')!;
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await admin.auth.getUser(token);
 if(error||!data.user)return json({error:'Invalid session'},401);
 const {data:actor}=await admin.from('profiles').select('*,school:schools(data_mode)').eq('id',data.user.id).maybeSingle();
 if(!actor||actor.account_status!=='Active'||!['principal','deputy','clerk'].includes(actor.role))return json({error:'User management access denied'},403);
 actor.school_mode=(Array.isArray(actor.school)?actor.school[0]:actor.school)?.data_mode;
 try {
  const body=await request.json();
  const actorClient=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  return json(await manageUser({admin,actorClient,actor,body,env:(name: string)=>Deno.env.get(name)}));
 }catch(error){return json({error:error instanceof Error?error.message:'User management request failed'},400);}
});
