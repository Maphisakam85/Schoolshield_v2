const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('administrative errors never echo provider credentials, links or payloads',()=>{
 const vm=require('node:vm'),source=fs.readFileSync('SchoolShield/super-admin.js','utf8'),context={window:{}};
 vm.runInNewContext(source.slice(source.indexOf('window.SchoolShieldPlatformError ='),source.indexOf('  const hasDraft =')),context);
 for(const input of [
  'Provider failed: access_token=SECRET&refresh_token=SECRET',
  'https://example.test/account-setup.html?token_hash=SECRET&type=invite',
  '<img src=x onerror=SECRET> jwt SECRET',
  'last active Principal; upstream credentials=SECRET',
  'record changed; private payload SECRET',
 ]){const output=context.window.SchoolShieldPlatformError({message:input});assert.doesNotMatch(output,/SECRET|token_hash|access_token|<img|https:/);assert.ok(output.length>20);}
});
test('platform pages expose no academic, family-link or impersonation controls',()=>{
 const pages=fs.readdirSync('SchoolShield').filter(n=>/^super-admin.*\.html$/.test(n));
 for(const page of pages){
  const html=fs.readFileSync('SchoolShield/'+page,'utf8');
  for(const [,href] of html.matchAll(/href="([^"]+)"/g))assert.doesNotMatch(href,/teacher-performance|test-scores|learners|student-record|school-records|attendance-register/);
  for(const [,name] of html.matchAll(/name="([^"]+)"/g))assert.doesNotMatch(name,/learner_id|subject_id|class_id|grade_id|guardian_id|app_metadata|impersonate/);
 }
 const scripts=fs.readdirSync('SchoolShield').filter(n=>/^super-admin.*\.js$/.test(n));
 for(const script of scripts){const source=fs.readFileSync('SchoolShield/'+script,'utf8');assert.doesNotMatch(source,/rpc\(['"](?:read_school_dataset|get_school_records|assign_teacher_subject_class|get_teacher_performance)/);assert.doesNotMatch(source,/\.from\(['"](?:school_learners|teacher_performance_reviews|teacher_teaching_contexts)['"]\)/);}
});
test('all school HTML changes only wire the authenticated branding helper',()=>{
 // Explicit regression boundary for the colleague-owned Security module.
 for(const file of ['security.html','security-officers.html']){
  const html=fs.readFileSync('SchoolShield/'+file,'utf8');
  assert.equal((html.match(/src="school-branding\.js"/g)||[]).length,1);
  assert.ok(html.indexOf('src="school-branding.js"')<html.indexOf('src="app.js"'));
 }
});
