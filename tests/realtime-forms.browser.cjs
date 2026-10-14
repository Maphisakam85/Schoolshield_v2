const assert=require('node:assert/strict'),fs=require('fs'),http=require('http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=http.createServer((req,res)=>res.end('<body data-page="incidents"><div id="app"></div></body>'));
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const width of [1366,390]){const page=await browser.newPage({viewport:{width,height:844}});await page.goto('http://127.0.0.1:'+server.address().port);
 await page.addScriptTag({content:fs.readFileSync('SchoolShield/app.js','utf8').replace(/startWorkspace\(\);\s*$/,'')});
 const result=await page.evaluate(()=>{document.getElementById('app').innerHTML='<form><textarea id="incidentDescription"></textarea></form>';initWorkspaceDraftProtection();const field=document.querySelector('textarea');field.focus();field.value='Unsaved incident';field.dispatchEvent(new Event('input',{bubbles:true}));field.setSelectionRange(2,5);render();return {same:field===document.querySelector('textarea'),value:field.value,start:field.selectionStart,end:field.selectionEnd,notice:!!document.getElementById('workspaceUpdatesAvailable'),disabled:document.querySelector('#workspaceUpdatesAvailable button').disabled};});
 assert.deepEqual(result,{same:true,value:'Unsaved incident',start:2,end:5,notice:true,disabled:true});await page.close();console.log('PASS dirty form preservation '+width);
 }
 }finally{await browser?.close();server.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
