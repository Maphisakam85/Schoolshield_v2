import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// Scheduled backend only. Email contains an operation reference, never ticket contents.
Deno.serve(async request => {
 const secret=Deno.env.get('SUPPORT_DISPATCH_SECRET');
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return new Response('Unauthorized',{status:401});
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const key=Deno.env.get('RESEND_API_KEY'),to=Deno.env.get('SUPPORT_OWNER_EMAIL'),from=Deno.env.get('SUPPORT_EMAIL_FROM');
 if(!key||!to||!from)return Response.json({error:'Support email is not configured'},{status:503});
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data,error}=await admin.from('support_email_queue').select('ticket_id').eq('status','Pending').order('created_at').limit(20);
 if(error)return Response.json({error:'Queue unavailable'},{status:503});
 let sent=0;
 for(const row of data||[]){
  try {
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':'support-'+row.ticket_id},body:JSON.stringify({from,to:[to],subject:'SchoolShield: new problem report',text:'A school user submitted a problem report. Sign into the Super Admin portal and open school support tickets. Reference: '+row.ticket_id}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)continue;
   const saved=await admin.from('support_email_queue').update({status:'Sent',sent_at:new Date().toISOString()}).eq('ticket_id',row.ticket_id).eq('status','Pending');
   if(!saved.error)sent++;
  } catch { /* Retain pending rows for retry. Never log provider credentials or payloads. */ }
 }
 return Response.json({sent,pending_checked:data?.length||0});
});
