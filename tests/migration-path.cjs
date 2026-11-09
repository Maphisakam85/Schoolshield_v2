const fs=require('node:fs'),path=require('node:path');
module.exports=file=>{
 if(path.basename(file)!==file)throw Error('Expected migration filename');
 const active=path.join('supabase','migrations',file);
 return fs.existsSync(active)?active:path.join('supabase','legacy-migrations',file);
};
