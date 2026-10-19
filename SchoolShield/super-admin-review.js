(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const schools={alpha:{name:'Mmulakgoro QA (fictional)',code:'QA-MMU'},beta:{name:'Ntebaleng QA (fictional)',code:'QA-NTE'}};
  for(const school of Object.values(schools))Object.assign(school,{emis:'',contact:'Fictional QA contact',email:'office@example.test',address:'Fictional QA address',status:'Pilot',announcements:true,appointments:true,tickets:[],audit:[],logo:null});
  let selected='alpha',preview;
  const current=()=>schools[selected];
  function notice(text){$('reviewStatus').textContent=text;}
  function list(id,items){$(id).replaceChildren();for(const text of items){const li=document.createElement('li');li.textContent=text;$(id).append(li);}}
  function event(text){current().audit.unshift(new Date().toLocaleString('en-ZA')+' — '+text);list('reviewAudit',current().audit);notice('Demo change saved in memory only. Refresh resets all changes.');}
  function render(){
    const school=current();$('reviewName').textContent=school.name;$('reviewCode').textContent=school.code;
    for(const key of ['name','emis','contact','email','address'])$('reviewDetails').elements[key].value=school[key];
    $('reviewAccess').elements.status.value=school.status;for(const key of ['announcements','appointments'])$('reviewAccess').elements[key].checked=school[key];
    $('reviewLogo').src=school.logo||'assets/schoolshield-logo.png';$('reviewFile').value='';$('reviewSupport').reset();
    $('reviewUsers').replaceChildren();for(const role of ['Principal','Deputy Principal','Clerk','Teacher','Parent','SGB','Security Officer']){const tr=document.createElement('tr');for(const value of [school.code+' '+role,role,'Active']){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('reviewUsers').append(tr);}
    list('reviewTickets',school.tickets.length?school.tickets:['No owner-created demo tickets.']);list('reviewAudit',school.audit.length?school.audit:['No demo changes yet.']);
  }
  $('reviewSchool').onchange=()=>{selected=$('reviewSchool').value;render();notice('Selected '+current().name+'. No real school data is loaded.');};
  $('reviewDetails').onsubmit=e=>{e.preventDefault();Object.assign(current(),Object.fromEntries(new FormData(e.currentTarget)));render();event('Demo school details changed');};
  $('reviewAccess').onsubmit=e=>{e.preventDefault();const f=e.currentTarget.elements;current().status=f.status.value;for(const key of ['announcements','appointments'])current()[key]=f[key].checked;event('Demo access controls changed');};
  $('reviewSupport').onsubmit=e=>{e.preventDefault();current().tickets.push(e.currentTarget.elements.title.value+' — Open (Owner-created demo)');e.currentTarget.reset();list('reviewTickets',current().tickets);event('Demo support ticket added');};
  $('reviewInvite').onclick=()=>notice('Demo only: no invitation sent. The real portal requires authenticated platform permission and configured delivery.');
  $('reviewFile').onchange=async()=>{
    const file=$('reviewFile').files[0],school=current();if(!file)return;
    try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2097152)throw Error();const bitmap=await createImageBitmap(file);const valid=bitmap.width<=2048&&bitmap.height<=2048;bitmap.close();if(!valid)throw Error();if(school!==current())return;
      if(school.logo)URL.revokeObjectURL(school.logo);preview=URL.createObjectURL(file);school.logo=preview;$('reviewLogo').src=preview;event('Demo logo preview changed');
    }catch{notice('Choose a valid PNG, JPEG or WebP up to 2 MB and 2048 × 2048 pixels.');}
  };
  $('reviewReset').onclick=()=>{if(current().logo)URL.revokeObjectURL(current().logo);current().logo=null;render();event('Demo logo reset');};
  render();
})();
