(() => {
 const $=id=>document.getElementById(id);
 let client,pending=false;
 async function refresh(){
  if(!client||pending)return;pending=true;let timer;
  try{
   $('dashboardStatus').textContent='Refreshing summary...';
   const {data,error}=await Promise.race([client.rpc('platform_admin_dashboard'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),15000);})]);
   if(error||!data?.metrics||!Array.isArray(data.reports))throw Error('unconfirmed');
   for(const cell of document.querySelectorAll('[data-kpi]')){const value=data.metrics[cell.dataset.kpi];cell.textContent=Number.isSafeInteger(value)&&value>=0?value.toLocaleString('en-ZA'):'Unavailable';}
   if($('dashboardReports')){ $('dashboardReports').replaceChildren();
   for(const item of data.reports){
    const row=$('dashboardReportRow').content.cloneNode(true);
    row.querySelectorAll('[data-cell]').forEach(cell=>cell.textContent=cell.dataset.cell==='school'?item.school_name+' ('+item.school_code+')':item[cell.dataset.cell]);
    row.querySelector('[data-open-report]').href='super-admin-support.html?school='+encodeURIComponent(item.school_id)+'&ticket='+encodeURIComponent(item.id);
    $('dashboardReports').append(row);
   }
   $('dashboardReportsEmpty').hidden=data.reports.length>0; }
   $('dashboardStatus').textContent='Updated '+new Date(data.generated_at).toLocaleString('en-ZA')+'.';
  }catch{$('dashboardStatus').textContent='Summary could not be refreshed. Previously confirmed values are retained. Retry.';}
  finally{clearTimeout(timer);pending=false;}
 }
 window.SchoolShieldDashboard={start(value){client=value;$('dashboardRefresh').onclick=refresh;refresh();window.addEventListener('focus',refresh);window.addEventListener('platform-support-updated',refresh);setInterval(()=>{if(!document.hidden)refresh();},30000);},refresh};
})();
