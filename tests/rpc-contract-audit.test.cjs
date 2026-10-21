const {test}=require('node:test'),assert=require('node:assert/strict');
const {compare,fields}=require('../scripts/audit-rpc-contracts.cjs');
const rpc={name:'example',argument_names:['p_id','p_optional'],input_count:2,defaults:1,authenticated:true,anon:false};
const call={name:'example',file:'SchoolShield/example.js',line:1,args:{keys:['p_id'],spread:false}};
test('RPC audit catches missing functions, wrong parameters and denied browser execution',()=>{
 assert.equal(compare([call],[]).issues[0].problem,'Missing function');
 assert.equal(compare([{...call,args:{keys:['p_wrong'],spread:false}}],[rpc]).issues[0].problem,'No matching parameter signature');
 assert.equal(compare([call],[{...rpc,authenticated:false}]).issues[0].problem,'Authenticated browser execution not granted');
 assert.equal(compare([call],[rpc]).issues.length,0);
 assert.equal(compare([{...call,args:{keys:[],spread:false}}],[rpc]).issues.length,1);
});
test('RPC audit recognises default parameters and isolates unresolved/dormant calls',()=>{
 assert.equal(compare([{...call,args:{keys:[],spread:false}}],[{...rpc,defaults:2}]).issues.length,0);
 const result=compare([{...call,args:null},{...call,name:'unused',inactive:true}],[rpc]);assert.equal(result.issues.length,0);assert.equal(result.dynamic.length,1);assert.equal(result.inactive.length,1);
 const object="{ p_id: fn({a:1,b:'x,y'}), p_optional: value, ...more }";assert.deepEqual(fields(object,0),{keys:['p_id','p_optional'],spread:true});
});
