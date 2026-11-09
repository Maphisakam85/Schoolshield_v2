const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
test('active migration versions are unique and superseded sources remain intact in the archive',()=>{
 const active=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql'));
 const versions=active.map(f=>f.match(/^(\d+)_/)[1]);assert.equal(new Set(versions).size,versions.length,'no duplicate active versions');
 const manifest=JSON.parse(fs.readFileSync('supabase/legacy-migrations/manifest.json','utf8'));assert.equal(manifest.files.length,8);
 for(const item of manifest.files){assert.equal(active.includes(item.file),false);const text=fs.readFileSync('supabase/legacy-migrations/'+item.file,'utf8').replace(/\r\n/g,'\n');assert.equal(crypto.createHash('sha256').update(text).digest('hex'),item.normalized_sha256,item.file);}
});
