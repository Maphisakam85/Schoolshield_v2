const fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../../SchoolShield/app.js'),'utf8');
module.exports=app.slice(app.indexOf('function escapeHtml('),app.indexOf('/* -------------------------------- roles'));
