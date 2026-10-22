/* Read-only source/catalog comparison. Never invokes application RPCs. */
const fs=require('node:fs'),path=require('node:path');
function fields(source,start){
 const stack=['{'];let quote='',escape=false,segment='',parts=[];
 for(let i=start+1;i<source.length;i++){
  const c=source[i];
  if(quote){segment+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
  if(c==='"'||c==="'"||c==='`'){quote=c;segment+=c;continue;}
  if('({['.includes(c)){stack.push(c);segment+=c;continue;}
  if(')}]'.includes(c)){stack.pop();if(!stack.length){parts.push(segment);return {keys:parts.map(p=>/^\s*['"]?(p_\w+)['"]?\s*(?::|$)/.exec(p)?.[1]).filter(Boolean),spread:parts.some(p=>/^\s*\.\.\./.test(p))};}segment+=c;continue;}
  if(c===','&&stack.length===1){parts.push(segment);segment='';}else segment+=c;
 }
 return null;
}
function scan(root){
 const calls=[];function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isDirectory()){if(ent.name!=='vendor')walk(file);continue;}if(!/\.(js|mjs|ts|html)$/.test(file))continue;
  const source=fs.readFileSync(file,'utf8');const relative=path.relative(root,file).replaceAll('\\','/');
  for(const m of source.matchAll(/(?:\.rpc|\brpc|\bcall|\bschoolDraftRequest|\bwrite)\s*\(\s*['"]([a-z][a-z_0-9]*)['"]/g)){
   let pos=m.index+m[0].length;while(/\s/.test(source[pos]||'')&&pos<source.length)pos++;
   let args=null;if(source[pos]===')')args={keys:[],spread:false};else if(source[pos]===','){pos++;while(/\s/.test(source[pos]||'')&&pos<source.length)pos++;if(source[pos]==='{')args=fields(source,pos);}
   if(args&&relative==='supabase/functions/manage-users/platform-service.mjs'&&/^call\s*\(/.test(m[0]))args.keys.push('p_actor');
   calls.push({name:m[1],file:relative,line:source.slice(0,m.index).split('\n').length,args,inactive:relative==='SchoolShield/workspace-sync.js'});
  }
 }}for(const folder of ['SchoolShield','supabase/functions'])walk(path.join(root,folder));return calls;
}
function compare(calls,functions){
 const issues=[],inactive=[],dynamic=[];
 for(const call of calls){const candidates=functions.filter(f=>f.name===call.name);
  if(call.inactive){if(!candidates.length)inactive.push(call);continue;}
  if(!candidates.length){issues.push({...call,problem:'Missing function'});continue;}
  if(!call.args){dynamic.push(call);continue;}
  const matches=candidates.filter(f=>{const names=(f.argument_names||[]).slice(0,f.input_count);return call.args.keys.every(k=>names.includes(k))&&(call.args.spread||names.slice(0,f.input_count-f.defaults).every(k=>call.args.keys.includes(k)));});
  if(!matches.length)issues.push({...call,problem:'No matching parameter signature'});
  else if(call.file.startsWith('SchoolShield/')&&!matches.some(f=>f.authenticated))issues.push({...call,problem:'Authenticated browser execution not granted'});
  else if(call.file==='SchoolShield/login.html'&&['request_school_account','list_school_signup_options'].includes(call.name)&&!matches.some(f=>f.anon))issues.push({...call,problem:'Anonymous signup execution not granted'});
 }
 return {issues,inactive,dynamic};
}
if(require.main===module){
 const catalogFile=process.argv[2];if(!catalogFile){console.error('Usage: node scripts/audit-rpc-contracts.cjs <read-only-catalog.json>');process.exit(1);}
 const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8').replace(/^\uFEFF/,''));const functions=catalog.rows?.[0]?.functions||catalog.functions;const calls=scan(process.cwd()),result=compare(calls,functions);
 console.log(JSON.stringify({targets:new Set(calls.filter(c=>!c.inactive).map(c=>c.name)).size,checkedLiteralCalls:calls.filter(c=>!c.inactive&&c.args).length,...result},null,2));if(result.issues.length)process.exitCode=1;
}
module.exports={scan,compare,fields};
