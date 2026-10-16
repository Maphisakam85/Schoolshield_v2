const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('SchoolShield/app.js','utf8');
test('deployment build includes the security regression suites',()=>{
  const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  assert.equal(config.buildCommand,'node scripts/build.cjs');
  const build=fs.readFileSync('scripts/build.cjs','utf8');
  assert.match(build,/tests\/security-shifts\.test\.cjs/);
  assert.match(build,/tests\/security-evidence\.test\.cjs/);
});
function harness() {
  const state={security:[{id:'S1',name:'Officer A',shift:'18:00–06:00'},{id:'S2',name:'Officer B'}],securityAttendance:[]};
  const ctx=vm.createContext({window:{},document:{},sessionStorage:{getItem:()=>JSON.stringify({userId:'U1'})}});
  vm.runInContext(source.replace(/startWorkspace\(\);\s*$/,''),ctx);
  Object.assign(ctx,{role:()=> 'security',userName:()=> 'Officer A',getState:()=>state});return {ctx,state};
}
test('attendance table keeps site alignment, profile links and authorised shift editing',()=>{
  const {ctx,state}=harness();
  state.security[0].site='Main Gate';
  state.securityAttendance=[{officerId:'S1',date:'2026-10-07',status:'Clocked In',actualCheckInAt:'2026-10-07T16:04:00Z'}];
  Object.assign(ctx,{todayIso:()=> '2026-10-07',generic:(title,section,description,html)=>html,stat:()=>'',badge:value=>value});
  const html=ctx.securityOfficers();
  const rows=html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].match(/<tr>[\s\S]*?<\/tr>/g);
  for(const row of rows) assert.equal((row.match(/<td\b/g)||[]).length,9);
  assert.match(rows[0],/<td>Main Gate<\/td>/);
  assert.match(rows[0],/data-action="view-security-officer"/);
  assert.match(rows[0],/data-action="save-security-shift"/);
  assert.match(rows[0],/18:04/);
  assert.doesNotMatch(rows[1],/data-action="save-security-shift"/);
});
test('failed clock-out keeps the active record and allows a retry through the server',async()=>{
  const {ctx,state}=harness();
  state.securityAttendance=[{officerId:'S1',date:'2026-10-06',status:'Clocked In'}];
  const before=JSON.stringify(state);let calls=0,saved=0,errorTitle;
  Object.assign(ctx,{persist:()=>assert.fail('must not save attendance through generic persistence'),refreshCloudWorkspace:async()=>true,finishForm:()=>saved++,modal:title=>errorTitle=title});
  ctx.window.schoolshieldSupabase={rpc:async(name,params)=>{
    calls++;assert.equal(name,'record_security_shift');assert.equal(params.p_action,'check-out');
    return calls===1?{error:{message:'Connection failed'}}:{data:{id:'saved'}};
  }};
  await ctx.clockOutSecurityOfficer('S1');
  assert.equal(errorTitle,'Shift not saved');assert.equal(saved,0);
  assert.equal(JSON.stringify(state),before);assert.equal(ctx.window.schoolshieldShiftSaving,false);
  await ctx.clockOutSecurityOfficer('S1');assert.equal(calls,2);assert.equal(saved,1);
  await ctx.clockOutSecurityOfficer('S2');assert.equal(calls,2);
});
test('inline shift saves respect ownership and preserve attendance audit records',()=>{
  const {ctx,state}=harness();
  const audit={officerId:'S1',date:'2026-10-07',scheduledStart:'18:00',scheduledEnd:'06:00',scheduledDurationMinutes:720,actualCheckInAt:'2026-10-07T16:00:00Z'};
  state.securityAttendance=[audit];const before=JSON.stringify(audit);
  Object.assign(ctx,{inputValue:id=>id.startsWith('shift-start-')?'22:00':'07:00',persist:fn=>fn(state),finishForm(){},modal(){}});
  ctx.saveSecurityShift('S2');assert.equal(state.security[1].shift,undefined);
  ctx.saveSecurityShift('S1');assert.equal(state.security[0].shift,'22:00–07:00');assert.equal(JSON.stringify(audit),before);
  ctx.inputValue=()=> '07:00';ctx.saveSecurityShift('S1');assert.equal(state.security[0].shift,'22:00–07:00');
  ctx.manageOfficer('S1');ctx.saveOfficer('S1');assert.equal(state.security[0].shift,'22:00–07:00');
});

test('officer profile displays contacts and canonical attendance timestamps',()=>{
  const {ctx,state}=harness();Object.assign(state.security[0],{phone:'071 123 4567',email:'officer@example.test'});
  state.securityAttendance=[{officerId:'S1',date:'2026-10-07',actualCheckInAt:'2026-10-07T16:04:00Z',clockIn:'wrong legacy time',status:'Clocked In'}];
  let html;ctx.modal=(title,body)=>html=body;ctx.viewSecurityOfficer('S1');
  assert.match(html,/071 123 4567/);assert.match(html,/officer@example.test/);assert.match(html,/18:04/);assert.doesNotMatch(html,/wrong legacy time/);
});

test('demo contacts do not overwrite existing contacts or unrelated officers',()=>{
  const {ctx}=harness();const state={security:[{id:'SEC-001',name:'Different Officer'},{id:'SEC-002',name:'Thato Mokoena',phone:'existing'}]};
  assert.equal(ctx.ensureDemoSecurityOfficerDetails(state),true);assert.equal(state.security[0].phone,undefined);assert.equal(state.security[1].phone,'existing');assert.match(state.security[1].profilePicture,/thato-mokoena/);
  assert.equal(ctx.ensureDemoSecurityOfficerDetails(state),false);
});

test('scheduled duration handles normal and overnight shifts and rejects incomplete/equal times',()=>{
  const {ctx}=harness();assert.equal(ctx.scheduledShiftMinutes('06:00','14:00'),480);assert.equal(ctx.scheduledShiftMinutes('18:00','06:00'),720);
  assert.equal(ctx.scheduledShiftMinutes('23:30','00:15'),45);
  for(const pair of [['','06:00'],['24:00','06:00'],['06:00','06:00'],['12:60','14:00']]) assert.throws(()=>ctx.scheduledShiftMinutes(...pair));
});
test('security can only act on their own uniquely assigned officer; management remains authorised',()=>{
  const {ctx,state}=harness();assert.equal(ctx.canRecordSecurityShift(state.security[0]),true);assert.equal(ctx.canRecordSecurityShift(state.security[1]),false);
  state.security[0].userId='U2';assert.equal(ctx.canRecordSecurityShift(state.security[0]),false);
  ctx.role=()=> 'principal';assert.equal(ctx.canRecordSecurityShift(state.security[1]),true);
  ctx.role=()=> 'teacher';assert.equal(ctx.canRecordSecurityShift(state.security[0]),false);
});
test('history shows scheduled duration, dated actual timestamps, legacy times and incomplete status',()=>{
  const {ctx,state}=harness();state.securityAttendance=[{id:'new',officerId:'S1',date:'2026-10-07',scheduledStart:'18:00',scheduledEnd:'06:00',scheduledEndDate:'2026-10-08',scheduledDurationMinutes:720,actualCheckInAt:'2026-10-07T16:04:00Z',status:'Clocked In'},
    {id:'old',officerId:'S1',date:'2026-09-01',shift:'06:00–14:00',clockIn:'06:03',clockOut:'14:02',status:'Completed'}];
  let html;ctx.modal=(title,body)=>html=body;ctx.badge=value=>value;
  ctx.securityAttendanceHistory('S1');assert.match(html,/12h 0m scheduled/);assert.match(html,/Ends 2026-10-08/);assert.match(html,/18:04/);assert.match(html,/06:03/);assert.match(html,/14:02/);assert.match(html,/Clocked In/);assert.match(html,/Completed/);
});
test('an overnight active shift keeps its clock-out control on the following day; other officers have no edit controls',()=>{
  const {ctx,state}=harness();state.securityAttendance=[{officerId:'S1',date:'2026-10-07',status:'Clocked In',clockIn:'18:00'}];
  Object.assign(ctx,{todayIso:()=> '2026-10-08',generic:(title,section,description,html)=>html,stat:()=>'',badge:value=>value});
  const html=ctx.securityOfficers();assert.match(html,/data-action="clock-out-security"\s+data-officer="S1"/);
  assert.ok(!/data-action="clock-in-security"\s+data-officer="S1"/.test(html));
  assert.ok(!/data-action="manage-officer"\s+data-officer="S2"/.test(html));
});
test('check-in submits schedule without client audit timestamps and prevents overlapping submissions',async()=>{
  const {ctx}=harness();let calls=0,params,release;
  ctx.inputValue=id=>({securityShiftDate:'2026-10-07',securityShiftStart:'18:00',securityShiftEnd:'06:00'})[id];
  ctx.window.schoolshieldSupabase={rpc:async(name,value)=>{assert.equal(name,'record_security_shift');calls++;params=value;await new Promise(resolve=>release=resolve);return {data:{id:'saved'}};}};
  ctx.refreshCloudWorkspace=async()=>true;ctx.finishForm=()=>{};ctx.modal=()=>{};
  const first=ctx.recordSecurityShift('S1','check-in');await ctx.recordSecurityShift('S1','check-in');assert.equal(calls,1);
  assert.equal(params.p_start,'18:00');assert.equal(params.actualCheckInAt,undefined);release();await first;
  ctx.window.schoolshieldSupabase.rpc=async(name,value)=>{assert.equal(value.p_action,'check-out');assert.equal(value.p_start,undefined);return {data:{id:'saved'}};};
  await ctx.clockOutSecurityOfficer('S1');
});
