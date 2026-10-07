const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('SchoolShield/app.js','utf8');
function harness(category, items = []) {
  const fields = {incidentCategory:category,incidentLocation:'Gate',incidentDescription:'Reported property incident'};
  const state = {incidents:[],notifications:[]}, errors=[];
  const rows = items.map(item => ({querySelector: selector => ({value:String(item[selector.match(/"(.*?)"/)[1]] ?? '')})}));
  const ctx = vm.createContext({window:{},document:{querySelectorAll:()=>rows},sessionStorage:{getItem:()=>null}});
  vm.runInContext(source.replace(/startWorkspace\(\);\s*$/,''),ctx);
  Object.assign(ctx,{inputValue:id=>fields[id]||'',role:()=> 'security',requireValues:values=>values.every(Boolean),
    todayIso:()=> '2026-10-07',todayLabel:()=> '07 Oct 2026',userName:()=> 'Security Officer',notificationTimestamp:()=> '2026-10-07T10:00:00Z',
    persist:fn=>fn(state),finishForm(){},modal:(...args)=>errors.push(args)});
  return {ctx,state,errors};
}
test('every affected category requires at least one valid item; unrelated categories ignore drafts',()=>{
  for(const category of ['Theft / Stolen Items','Missing Property','Property Damage / Broken Items']) {
    const h=harness(category);h.ctx.saveIncident();assert.equal(h.state.incidents.length,0);assert.match(h.errors[0][1],/at least one/);
  }
  const h=harness('Medical',[{description:'',quantity:0}]);h.ctx.saveIncident();assert.equal(h.state.incidents.length,1);assert.equal(h.state.incidents[0].affectedItems.length,0);
});
test('rejects whitespace, invalid quantities, negative values and invalid statuses',()=>{
  for(const invalid of [{description:'  '},{quantity:0},{quantity:1.5},{estimatedValue:-1},{status:'Other'}]) {
    const h=harness('Missing Property',[{description:'Laptop',quantity:1,status:'Missing',...invalid}]);
    h.ctx.saveIncident();assert.equal(h.state.incidents.length,0);assert.equal(h.errors.length,1);
  }
});
test('multiple items survive serialization and display optional fields safely; legacy records work',()=>{
  const h=harness('Property Damage / Broken Items',[
    {description:'Window',quantity:2,status:'Damaged-Broken',estimatedValue:350,owner:'School',notes:'West wing'},
    {description:'<script>alert(1)</script>',quantity:1,status:'Missing'}]);
  h.ctx.saveIncident();const restored=JSON.parse(JSON.stringify(h.state)).incidents[0];
  assert.equal(restored.affectedItems.length,2);assert.equal(restored.affectedItems[0].estimatedValue,350);
  const html=h.ctx.affectedItemsDetails(restored.affectedItems);assert.match(html,/Window/);assert.match(html,/West wing/);assert.match(html,/Damaged-Broken/);assert.ok(!html.includes('<script>'));
  assert.equal(h.ctx.affectedItemsDetails(undefined),'');
});
test('security camera controls preserve independent gallery selection and upload entity association',()=>{
  const h=harness('Security');assert.match(h.ctx.photoCaptureField('visitor'),/capture="environment"/);
  assert.match(h.ctx.photoCaptureField('incident'),/id="incidentCamera"/);
  h.ctx.role=()=> 'teacher';assert.equal(h.ctx.photoCaptureField('incident'),'');
  assert.match(source,/fields: \["visitorCamera", "visitorPhoto", "visitorDocument"\]/);
  assert.match(source,/fields: \["incidentCamera", "incidentPhotos", "incidentFiles"\]/);
});
