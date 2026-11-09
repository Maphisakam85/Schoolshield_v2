const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('invitation and recovery emails explain secure setup with the original Auth link',()=>{
 for(const name of ['invite','recovery']){
  const html=fs.readFileSync('supabase/templates/'+name+'.html','utf8');
  assert.match(html,/href="\{\{ \.ConfirmationURL \}\}"/);
  for(const field of ['display_name','school_name','school_code','school_role'])assert.ok(html.includes('.Data.'+field));
  assert.ok(html.includes('{{ .Email }}'));assert.match(html,/expired|time-limited/);assert.match(html,/school administrator/);
  assert.doesNotMatch(html,/127\.0\.0\.1|localhost|Test@123|\.TokenHash|\.Token \}\}/);
 }
 const invite=fs.readFileSync('supabase/templates/invite.html','utf8');assert.match(invite,/Choose your own password/);assert.match(invite,/do not need to create another account/);
});
