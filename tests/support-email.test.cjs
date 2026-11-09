const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness({configured=true,providerOK=true,authorized=true}={}){
 let handler;const calls=[],updates=[];
 const source=fs.readFileSync('supabase/functions/support-email-dispatch/index.ts','utf8').replace(/^import .*;\r?\n/,'').replace(/Deno.env.get\(([^)]*)\)!/g,'Deno.env.get($1)');
 const env={SUPPORT_DISPATCH_SECRET:'test-secret',SUPABASE_URL:'https://fixture.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-key',...(configured?{RESEND_API_KEY:'fixture-mail-key',SUPPORT_OWNER_EMAIL:'owner@example.test',SUPPORT_EMAIL_FROM:'support@example.test'}:{})};
 const client={from:()=>({select:()=>({eq:()=>({order:()=>({limit:async()=>({data:[{ticket_id:'ticket-reference'}]})})})}),update:fields=>{updates.push(fields);return{eq:()=>({eq:async()=>({})})};}})};
 vm.runInNewContext(source,{Deno:{env:{get:k=>env[k]},serve:h=>handler=h},createClient:()=>client,Response,AbortSignal,fetch:async(url,options)=>{calls.push({url,options});return{ok:providerOK};}});
 return{calls,updates,run:()=>handler(new Request('https://fixture.test',{method:'POST',headers:{authorization:authorized?'Bearer test-secret':'Bearer wrong'}}))};
}
test('support email dispatcher denies unauthorised and unconfigured requests',async()=>{for(const options of [{authorized:false},{configured:false}]){const h=harness(options),r=await h.run();assert.ok([401,503].includes(r.status));assert.equal(h.calls.length,0);}});
test('mail contains reference only and marks queue after provider acceptance',async()=>{const h=harness();assert.equal((await h.run()).status,200);const email=JSON.parse(h.calls[0].options.body);assert.deepEqual(email.to,['owner@example.test']);assert.match(email.text,/ticket-reference/);assert.ok(!email.text.includes('description'));assert.equal(h.updates[0].status,'Sent');});
test('failed provider request retains pending queue for retry',async()=>{const h=harness({providerOK:false});await h.run();assert.equal(h.updates.length,0);});
