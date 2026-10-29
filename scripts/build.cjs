const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const files=['school-theme.js','super-admin-theme.js','login-routing.js','analytics.js','app.js','super-admin-review.js','super-admin.js','school-branding.js','super-admin-branding.js','super-admin-accounts.js','super-admin-operations.js','supabase-client.js','supabase-config.js','speed-insights-init.js','speed-insights.mjs','invitation.js','sgb-security-chat.js','chat-navigation.js','ui-feedback.js','web-push.js','push-sw.js'];
function run(args){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
for(const file of files)run(['--check','SchoolShield/'+file]);
// Preserve main's invitation/platform checks and include every local unit suite.
const tests=fs.readdirSync(path.join(root,'tests')).filter(file=>file.endsWith('.test.cjs')).sort().map(file=>'tests/'+file);
run(['--test',...tests]);
