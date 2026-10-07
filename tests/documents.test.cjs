const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('SchoolShield/documents.js','utf8');
function service(client, session = {userId:'uploader',schoolId:'school-one'}) {
  const context=vm.createContext({window:{schoolshieldSupabase:client},sessionStorage:{getItem:()=>JSON.stringify(session)},crypto:require('node:crypto').webcrypto});
  vm.runInContext(code,context); return context.window.SchoolShieldDocuments;
}
function cloud() {
  const rows=[],files=new Map(),calls=[];
  const client={
    from(table) {
      const filters={};
      const query={
        insert:async row=>{rows.push(row);calls.push({metadata:row});return {};},
        select(){return this;},eq(key,value){filters[key]=value;return this;},order(){return this;},
        then(resolve){resolve({data:rows.filter(row=>Object.entries(filters).every(([key,value])=>row[key]===value))});},
        single:async()=>({data:rows.find(row=>Object.entries(filters).every(([key,value])=>row[key]===value))}),
      };return query;
    },
    storage:{from:bucket=>{
      assert.equal(bucket,'school-documents');
      return {upload:async(path,file,options)=>{files.set(path,file);calls.push({path,file,options});return {};},
        createSignedUrl:async(path,seconds,options)=>{calls.push({signed:path,seconds,options});return {data:{signedUrl:'https://storage.test/private?signature=fresh'}};}};
    }},
    rpc:async(name,{p_id})=>{assert.equal(name,'complete_document_attachment');const row=rows.find(row=>row.id===p_id);assert.ok(files.has(row.storage_path));row.status='ready';return {};},
  };
  return {client,rows,files,calls};
}
test('file bytes and record metadata persist and another fresh authorized session retrieves them',async()=>{
  const db=cloud(),file={name:'inspection.pdf',size:120,type:'application/pdf',bytes:'real file contents'};
  const first=service(db.client); const row=await first.upload('visitor','VIS-123',file);
  assert.match(row.storage_path,/^school-one\/visitor-documents\/VIS-123\/[\w-]+\.pdf$/);
  assert.equal(db.files.get(row.storage_path),file);
  assert.equal(row.record_id,'VIS-123');assert.equal(row.entity_type,'visitor');assert.equal(row.filename,'inspection.pdf');
  const next=service(db.client,{userId:'authorized-reader',schoolId:'school-one'});
  const listed=await next.list('visitor','VIS-123');assert.equal(listed[0].storage_path,row.storage_path);
  assert.equal(await next.download(row.id),'https://storage.test/private?signature=fresh');
  assert.equal(db.calls.at(-1).seconds,60);
  assert.ok(!Object.values(db.rows[0]).some(value=>String(value).includes('signature=')));
});
test('upload rejects invalid/empty/oversized files before touching Storage',async()=>{
  const db=cloud(),api=service(db.client);
  for(const file of [{name:'script.html',size:10},{name:'empty.pdf',size:0},{name:'large.pdf',size:10485761}]) await assert.rejects(api.upload('incident','INC-1',file),/Choose a PDF/);
  assert.equal(db.calls.length,0);
});
test('failed upload retains metadata ID and retries without duplicating the object or metadata',async()=>{
  const db=cloud();const original=db.client.storage.from;let failed=true;
  db.client.storage.from=bucket=>{const storage=original(bucket);const upload=storage.upload;storage.upload=async(...args)=>{if(failed){failed=false;return {error:{message:'Offline'}};}return upload(...args);};return storage;};
  const api=service(db.client),retry={};const file={name:'evidence.jpg',size:100};
  await assert.rejects(api.upload('incident','INC-1',file,retry),/Upload failed: Offline/);
  const id=retry.id;await api.upload('incident','INC-1',file,retry);
  assert.equal(retry.id,id);assert.equal(db.rows.length,1);assert.equal(db.files.size,1);
});
test('retrieval and metadata failures are clear and never return a public download URL',async()=>{
  const client={from:()=>({select(){return this;},eq(){return this;},single:async()=>({error:{message:'Denied'}}),order:async()=>({error:{message:'Offline'}})})};
  const api=service(client);
  await assert.rejects(api.download('private'),/permission/);
  await assert.rejects(api.list('visitor','VIS-1'),/Documents could not be loaded: Offline/);
});
test('record/file retry and duplicate clicks retain the same record and form',async()=>{
  const state={visitors:[],notifications:[]},fileInput={files:[{name:'id.pdf',size:5}]};
  const fields={'#visitorDocument':fileInput},messages=[];let uploads=0;
  const context=vm.createContext({window:{schoolshieldSupabase:{},schoolshieldCloudWorkspaceReady:true},document:{querySelector:selector=>fields[selector],querySelectorAll:()=>[]},crypto:require('node:crypto').webcrypto,sessionStorage:{getItem:()=>null}});
  const app=fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'');vm.runInContext(app,context);
  Object.assign(context,{getState:()=>state,role:()=> 'security',render(){},modal:(...args)=>messages.push(args),refreshCloudWorkspace:async()=>false});
  context.saveVisitor=()=>{state.visitors.unshift({id:context.window.schoolshieldDocumentCapture.recordId});context.window.schoolshieldWorkspaceSaveQueue=Promise.resolve(true);context.finishForm();};
  context.window.SchoolShieldDocuments={validate(){},upload:async()=>{uploads++;if(uploads===1)throw new Error('Upload offline');}};
  const first=context.saveRecordDocuments('visitor');await context.saveRecordDocuments('visitor');await first;
  assert.equal(state.visitors.length,1);assert.equal(uploads,1);assert.equal(fields['#visitorDocument'],fileInput);
  await context.saveRecordDocuments('visitor');assert.equal(state.visitors.length,1);assert.equal(uploads,2);
  assert.equal(context.window.schoolshieldPendingDocumentRecord,null);
});
