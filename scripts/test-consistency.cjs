const {spawnSync}=require('node:child_process');
// All entries use isolated PGlite fixtures. None contacts Supabase or sends mail.
const suites=['platform-consistency-db.cjs','pilot-readiness-rls.cjs','identity-notifications-rls.cjs','school-records-rls.cjs','teacher-performance-final-rls.cjs','teacher-my-performance-rls.cjs','security-shifts-rls.cjs','sgb-security-chat-db.cjs','user-management-rls.cjs','account-request-delivery-rls.cjs','learner-registration-rls.cjs'];
for(const suite of suites){console.log('Database verification: '+suite);const result=spawnSync(process.execPath,['tests/'+suite],{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
console.log(suites.length+' isolated PostgreSQL suites passed. This does not verify deployed Supabase services.');
