import {createClient} from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try {
  const token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return json({error:'Sign in first'},401);
  const url=Deno.env.get('SUPABASE_URL')!;
  const keys=Deno.env.get('SUPABASE_SECRET_KEYS');const key=keys?JSON.parse(keys).default:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await admin.auth.getUser(token);if(verified.error||!verified.data.user)return json({error:'Invalid session'},401);
  const caller=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const body=await request.json();
  const {data:ticket,error}=await caller.rpc('report_school_problem',{p_id:body.id,p_title:body.title,p_category:body.category,p_description:body.description,p_page:body.page});
  if(error)return json({error:error.message},400);
  // The durable ticket is authoritative; email failures never discard it.
  let emailStatus=ticket.email_status;
  const claim=await admin.rpc('claim_problem_email',{p_id:ticket.id,p_actor:verified.data.user.id});
  if(!claim.error&&claim.data){
   const apiKey=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('SCHOOLSHIELD_SUPPORT_FROM'),to=Deno.env.get('SCHOOLSHIELD_SUPPORT_EMAIL');
   emailStatus='Unconfigured';
   if(apiKey&&from&&to){
    try {
     const t=claim.data;
     const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'schoolshield-problem-'+ticket.id},body:JSON.stringify({from,to:[to],subject:'SchoolShield problem report '+ticket.id,text:['Ticket: '+ticket.id,'School ID: '+t.school_id,'Category: '+t.category,'Page: '+t.page_path,'Title: '+t.title,'',t.description,'','Review this report in Super Admin → School → Operations.'].join('\n')}),signal:AbortSignal.timeout(10000)});
     emailStatus=response.ok?'Sent':'Failed';
    }catch{emailStatus='Failed';}
   }
   const saved=await admin.from('platform_support_tickets').update({email_status:emailStatus}).eq('id',ticket.id).eq('created_by',verified.data.user.id);
   if(saved.error)emailStatus='Unconfirmed';
  }
  return json({ok:true,ticket_id:ticket.id,email_status:emailStatus});
 }catch{return json({error:'Report could not be confirmed. Retry with the same reference.'},400);}
});
