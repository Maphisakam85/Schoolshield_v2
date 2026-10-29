/* Shared colour validation and readable foregrounds for school portal themes. */
(() => {
 const defaults={primary_color:'#0A8F62',navigation_color:'#082C36'};
 const presets={default:defaults,blue:{primary_color:'#1C4C97',navigation_color:'#10295B'},burgundy:{primary_color:'#8B2443',navigation_color:'#351526'},purple:{primary_color:'#6941A5',navigation_color:'#291C45'},gold:{primary_color:'#B78212',navigation_color:'#26382E'}};
 const valid=value=>/^#[0-9a-f]{6}$/i.test(value);
 const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16));
 const luminance=hex=>rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const foreground=hex=>luminance(hex)>.179?'#000000':'#FFFFFF';
 const mix=(hex,other,weight)=>'#'+rgb(hex).map((v,i)=>Math.round(v*(1-weight)+rgb(other)[i]*weight).toString(16).padStart(2,'0')).join('').toUpperCase();
 const properties=['--green','--green2','--navy','--navy2','--mint','--school-primary-ink','--school-nav-ink','--school-nav-muted','--school-link'];
 function apply(root,theme){
  if(!valid(theme?.primary_color)||!valid(theme?.navigation_color))throw Error('Choose valid six-digit hex colours.');
  const primary=theme.primary_color.toUpperCase(),nav=theme.navigation_color.toUpperCase(),ink=foreground(nav);
  const values=[primary,mix(primary,'#000000',.18),nav,mix(nav,'#FFFFFF',.08),mix(primary,'#FFFFFF',.92),foreground(primary),ink,mix(nav,ink,.78),luminance(primary)>.18?mix(primary,'#000000',.6):primary];
  properties.forEach((name,i)=>root.style.setProperty(name,values[i]));root.dataset.schoolTheme='true';
 }
 function clear(root){properties.forEach(name=>root.style.removeProperty(name));delete root.dataset.schoolTheme;}
 window.SchoolShieldTheme={defaults,presets,valid,foreground,apply,clear};
})();
