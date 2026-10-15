// Real authenticated demo sessions only. No account creation/setup or approval changes.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{const password=process.env.PILOT_TEST_PASSWORD;if(!password)throw Error('Set PILOT_TEST_PASSWORD');const config=fs.readFileSync('SchoolShield/supabase-config.js','utf8'),url=/url:\s*"([^"]+)/.exec(config)[1],key=/publishableKey:\s*"([^"]+)/.exec(config)[1];let checks=0;
async function call(path,session,body){const r=await fetch(url+path,{method:body?'POST':'GET',headers:{apikey:key,'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.access_token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(path+': '+(data.message||data.msg||data.error_description||r.status));return data;}
const rpc=(name,s,args={})=>call('/rest/v1/rpc/'+name,s,args),sessions={};
for(const role of ['principal','deputy','clerk','teacher','parent','sgb','security'])sessions[role]=await call('/auth/v1/token?grant_type=password',null,{email:role+'@setjhabasemaketse.test',password});
const id=crypto.randomUUID(),announcement=await rpc('publish_school_announcement',sessions.principal,{p_id:id,p_title:'QA notification read-state check',p_body:'Explicit QA notice for independent per-user read-state verification.',p_audience_id:'whole-school',p_audience:'Whole school',p_delivery:'In-app notification'}),notice='NOTICE-'+id;
assert.match(announcement.date,/^\d{4}-\d{2}-\d{2}$/);checks++;
for(const role of Object.keys(sessions)){const profiles=await call('/rest/v1/profiles?select=role,school:schools(id,code)&id=eq.'+sessions[role].user.id,sessions[role]);assert.equal(profiles[0].school.code,'SMM-001');checks++;const rows=await rpc('get_notification_reads',sessions[role]);assert.ok(!rows.some(r=>r.notification_id===notice));checks++;if(role!=='parent'){const data=await rpc('read_school_dataset',sessions[role]);assert.ok(data.payload.notifications.some(n=>n.id===notice),role+' receives authorized announcement alert');checks++;}}
await rpc('mark_notifications_read',sessions.principal,{p_ids:[notice]});assert.ok((await rpc('get_notification_reads',sessions.principal)).some(r=>r.notification_id===notice));checks++;
assert.ok(!(await rpc('get_notification_reads',sessions.clerk)).some(r=>r.notification_id===notice));checks++;
for(const role of ['deputy','clerk','teacher','parent','sgb','security']){await rpc('mark_notifications_read',sessions[role],{p_ids:[notice]});assert.ok((await rpc('get_notification_reads',sessions[role])).some(r=>r.notification_id===notice));checks++;}
const loginAgain=await call('/auth/v1/token?grant_type=password',null,{email:'principal@setjhabasemaketse.test',password});assert.ok((await rpc('get_notification_reads',loginAgain)).some(r=>r.notification_id===notice));checks++;
for(const role of ['principal','clerk']){assert.ok(Array.isArray(await rpc('get_account_request_alerts',sessions[role])));checks++;}
const raw=await call('/rest/v1/notification_reads?select=user_id',sessions.clerk);assert.ok(raw.every(r=>r.user_id===sessions.clerk.user.id));checks++;
console.log(checks+' live seven-role notification/date/persistence assertions passed. QA announcement retained for audit. No onboarding or chat changes performed.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
