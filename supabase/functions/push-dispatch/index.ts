import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";
// Scheduled backend only: no browser-supplied recipient, endpoint or message.
Deno.serve(async (request) => {
 const secret=Deno.env.get('PUSH_DISPATCH_SECRET');
 if(!secret || request.headers.get('authorization')!==`Bearer ${secret}`)return new Response('Unauthorized',{status:401});
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const publicKey=Deno.env.get('WEB_PUSH_PUBLIC_KEY'),privateKey=Deno.env.get('WEB_PUSH_PRIVATE_KEY'),subject=Deno.env.get('WEB_PUSH_SUBJECT');
 if(!publicKey||!privateKey||!subject)return Response.json({error:'Push delivery is not configured'},{status:503});
 webpush.setVapidDetails(subject,publicKey,privateKey);
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data,error}=await admin.rpc('claim_web_push');if(error)return Response.json({error:'Delivery queue unavailable'},{status:503});
 let sent=0,failed=0;
 for(const job of data||[]){
  try{
   const url=new URL(job.subscription.endpoint);
   const allowed=url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname==='web.push.apple.com'||url.hostname==='notify.windows.com'||url.hostname.endsWith('.notify.windows.com');
   if(url.protocol!=='https:'||url.port||url.username||url.password||!allowed)throw {statusCode:400};
   await webpush.sendNotification(job.subscription,JSON.stringify({title:'SchoolShield',body:'You have new school activity. Open SchoolShield to review it.'}),{TTL:300,timeout:5000});
   const result=await admin.from('web_push_outbox').update({status:'sent',sent_at:new Date().toISOString(),last_error:null}).eq('id',job.id).eq('status','sending').eq('attempts',job.attempt);
   if(result.error)failed++;else sent++;
  }catch(error){
   failed++;const code=Number((error as {statusCode?:number}).statusCode)||0;
   if(code===404||code===410){await admin.from('web_push_subscriptions').delete().eq('id',job.subscription_id);continue;}
   await admin.from('web_push_outbox').update({status:job.attempt>=5||code===400?'failed':'pending',available_at:new Date(Date.now()+Math.min(3600000,60000*2**job.attempt)).toISOString(),last_error:code?`Push service status ${code}`:'Push service unavailable'}).eq('id',job.id).eq('status','sending').eq('attempts',job.attempt);
  }
 }
 return Response.json({sent,failed});
});
