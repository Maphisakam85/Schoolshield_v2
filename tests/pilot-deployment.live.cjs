// Read-only deployment checks; never logs tokens or passwords.
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const password=process.env.PILOT_TEST_PASSWORD;if(!password)throw Error('Set PILOT_TEST_PASSWORD');
 const config=fs.readFileSync('SchoolShield/supabase-config.js','utf8'),url=/url:\s*"([^"]+)/.exec(config)[1],key=/publishableKey:\s*"([^"]+)/.exec(config)[1];
 const auth=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:'principal@setjhabasemaketse.test',password})}).then(r=>r.json());
 if(!auth.access_token)throw Error('Demo administrator authentication failed');
 const headers={apikey:key,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'};
 const response=await fetch(url+'/rest/v1/rpc/school_integrity_report',{method:'POST',headers,body:'{}'});assert.equal(response.ok,true);
 const report=await response.json();assert.equal(report.data_mode,'demo');console.log('Existing demo school integrity:',JSON.stringify(report));
 const bootstrap=await fetch(url+'/functions/v1/bootstrap-demo-masters',{method:'POST',headers,body:'{}'});assert.equal(bootstrap.status,403);console.log('PASS automatic demo bootstrap disabled');
 const credentials=await fetch('https://schoolshieldv2.vercel.app/demo-credentials.md');assert.equal(credentials.status,404);console.log('PASS demo credential document is not published');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
