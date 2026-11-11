const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
test('focused owner pages contain only their intended forms and unique control IDs',()=>{
 const expected={overview:[],directory:['provisionForm'],reports:[],school:['schoolForm'],branding:['brandingForm'],colours:['themeForm'],accounts:['accountForm','bulkInviteForm'],access:['accessForm'],support:['supportForm'],diagnostics:[],audit:['auditFilters'],settings:['ownerProfileForm','ownerPasswordForm']};
 for(const[kind,forms]of Object.entries(expected)){
  const html=fs.readFileSync('SchoolShield/super-admin'+(kind==='overview'?'':'-'+kind)+'.html','utf8');
  assert.deepEqual([...html.matchAll(/<form\b[^>]*id="([^"]+)"/g)].map(m=>m[1]).sort(),forms.sort(),kind);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,kind+' duplicate IDs');
  assert.match(html,/id="platformGlobalRefresh"/);assert.match(html,/src="super-admin-chrome.js"/);assert.doesNotMatch(html,/src="app.js"/);
 }
});
test('legacy operations links retain school and ticket parameters on focused routes',()=>{
 const source=fs.readFileSync('SchoolShield/super-admin-operations-redirect.js','utf8');
 for(const query of ['?school=QA','?school=QA&ticket=REPORT']){let target;vm.runInNewContext(source,{URLSearchParams,location:{search:query,replace:value=>target=value}});assert.equal(target,(query.includes('ticket=')?'super-admin-support.html':'super-admin-access.html')+query);}
});
