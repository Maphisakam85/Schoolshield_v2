import {createClient} from 'npm:@supabase/supabase-js@2';
import {PNG} from 'npm:pngjs@7.0.0';
import jpeg from 'npm:jpeg-js@0.4.4';
import {createLogoCodec,MAX_LOGO_BYTES} from './image-codec.mjs';
const decode=createLogoCodec({PNG,jpeg,readWasm:()=>Deno.readFile(new URL('./vendor/webp_dec.wasm',import.meta.url))});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const checked=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try {
  const token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return json({error:'Sign in required'},401);
  const keys=Deno.env.get('SUPABASE_SECRET_KEYS');const key=keys?JSON.parse(keys).default:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');const url=Deno.env.get('SUPABASE_URL')!;
  const admin=createClient(url,key!,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=checked(await admin.auth.getUser(token)).user;
  const caller=createClient(url,key!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:context,error}=await caller.rpc('platform_admin_context');if(error||context?.user_id!==verified.id)return json({error:'Platform access denied'},403);
  const chunks=[];let size=0;const reader=request.body?.getReader();if(!reader)throw Error('Request body required');
  while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>MAX_LOGO_BYTES+16384){await reader.cancel();return json({error:'Choose an image up to 2 MB'},413);}chunks.push(item.value);}
  const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
  const form=await new Response(data,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData();
  const school=String(form.get('school_id')),operation=String(form.get('operation_id')),revision=Number(form.get('revision')),reason=String(form.get('reason')||'');
  if(!/^[0-9a-f-]{36}$/i.test(school)||!/^[0-9a-f-]{36}$/i.test(operation)||!Number.isInteger(revision)||reason.trim().length<5)throw Error('School, revision, operation and reason are required');
  let path=null,width=null,height=null;
  if(form.get('action')==='replace') {
   const file=form.get('file');if(!(file instanceof File))throw Error('Select a logo file');
   const result=await decode(new Uint8Array(await file.arrayBuffer()),file.type);path=school+'/'+operation+'.png';width=result.width;height=result.height;
   const uploaded=await admin.storage.from('school-branding').upload(path,result.bytes,{contentType:'image/png',upsert:false,cacheControl:'60'});
   if(uploaded.error) {
    // A retry may have uploaded this immutable path before a response was lost.
    const existing=await admin.storage.from('school-branding').download(path);if(existing.error)throw uploaded.error;
    const old=new Uint8Array(await existing.data.arrayBuffer());if(old.length!==result.bytes.length||old.some((b:number,i:number)=>b!==result.bytes[i]))throw Error('Operation already contains a different logo. Refresh before retrying.');
   }
  } else if(form.get('action')!=='remove')throw Error('Choose replace or remove');
  const result=checked(await admin.rpc('commit_school_branding',{p_actor:verified.id,p_school:school,p_revision:revision,p_operation:operation,p_path:path,p_width:width,p_height:height,p_reason:reason.trim()}));
  return json({ok:true,branding:result});
 }catch(error){return json({error:error instanceof Error?error.message:'Branding update failed. The current logo is retained.'},400);}
});
