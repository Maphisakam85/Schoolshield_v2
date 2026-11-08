const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function run({token=true,valid=true,denied=false,configured=false,emailOk=true,claimed=true}={}){
 let handler,sent=0,params,stored;let n=0;
 const admin={auth:{getUser:async()=>valid?{data:{user:{id:'verified-user'}}}:{error:{message:'bad'}}},rpc:async(name,args)=>{assert.equal(args.p_actor,'verified-user');return {data:claimed?{id:'ticket',school_id:'school',title:'Issue',category:'Access',description:'Cannot log in',page_path:'/login.html'}:null}},from:()=>({update:value=>{stored=value;return {eq(){return this},then(resolve){resolve({});}}}})};
 const caller={rpc:async(name,args)=>{params=args;return denied?{error:{message:'School account required'}}:{data:{id:'ticket',email_status:'Not requested'}}}};
 const source=fs.readFileSync('supabase/functions/report-problem/index.ts','utf8').replace(/^import.*\n/m,'').replace('(body:unknown,status=200)','(body,status=200)').replaceAll("get('SUPABASE_URL')!","get('SUPABASE_URL')").replaceAll("get('SUPABASE_SERVICE_ROLE_KEY')!","get('SUPABASE_SERVICE_ROLE_KEY')");
 vm.runInNewContext(source,{Response,AbortSignal,Error,JSON,Deno:{serve:fn=>handler=fn,env:{get:name=>configured&&['RESEND_API_KEY','SCHOOLSHIELD_SUPPORT_FROM','SCHOOLSHIELD_SUPPORT_EMAIL'].includes(name)?'fixture':undefined}},createClient:()=>n++===0?admin:caller,fetch:async(url,options)=>{sent++;assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],'schoolshield-problem-ticket');assert.equal(JSON.parse(options.body).to[0],'fixture');return {ok:emailOk};}});
 const response=await handler(new Request('https://fixture.test/report-problem',{method:'POST',headers:token?{Authorization:'Bearer test'}:{},body:JSON.stringify({id:'ticket',title:'Issue',category:'Access',description:'Cannot log in',page:'/login.html',school_id:'forged',actor_id:'forged',to:'attacker@example.test'})}));
 return {status:response.status,body:await response.json(),sent,params,stored};
}
test('problem reports reject absent/invalid sessions and denied profiles before sending email',async()=>{
 for(const options of [{token:false},{valid:false},{denied:true}]){const r=await run(options);assert.ok([400,401].includes(r.status));assert.equal(r.sent,0);}
});
test('problem report keeps saved ticket when email is unconfigured or fails',async()=>{
 for(const options of [{},{configured:true,emailOk:false}]){const r=await run(options);assert.equal(r.status,200);assert.equal(r.body.ticket_id,'ticket');assert.equal(r.body.email_status,options.configured?'Failed':'Unconfigured');assert.equal(r.params.p_school,undefined);assert.equal(r.params.p_actor,undefined);}
});
test('support email destination is server configured and duplicate claims do not send twice',async()=>{
 const r=await run({configured:true});assert.equal(r.body.email_status,'Sent');assert.equal(r.sent,1);assert.equal(r.stored.email_status,'Sent');
 assert.equal((await run({configured:true,claimed:false})).sent,0);
});
