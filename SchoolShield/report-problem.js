(() => {
 const client=window.schoolshieldSupabase;if(!client||!document.getElementById('problemReportDialog'))return;
 const dialog=document.getElementById('problemReportDialog'),form=document.getElementById('problemReportForm'),status=document.getElementById('problemReportStatus');
 let operation=null,busy=false;
 const reportButton=document.getElementById('reportProblem');
 function positionButton(){const actions=document.querySelector('.top-actions')||document.querySelector('[data-startup-report]');if(actions&&!actions.contains(reportButton))actions.prepend(reportButton);}
 positionButton();const app=document.getElementById('app');if(app)new MutationObserver(positionButton).observe(app,{childList:true,subtree:true});
 document.getElementById('reportProblem').onclick=()=>dialog.showModal();
 document.getElementById('cancelProblemReport').onclick=()=>{if(!busy)dialog.close();};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 form.addEventListener('input',()=>{operation=null;});
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||!form.reportValidity())return;
  for(const name of ['title','description']){const field=form.elements[name];field.setCustomValidity(field.value.trim().length<(name==='title'?3:5)?'Enter meaningful text.':'');if(!field.reportValidity())return;}
  operation ||= crypto.randomUUID();busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='Sending report…';
  try{
   const {data,error}=await client.rpc('report_school_problem',{p_id:operation,p_title:form.elements.title.value.trim(),p_description:form.elements.description.value.trim(),p_category:form.elements.category.value,p_priority:form.elements.priority.value}).abortSignal(AbortSignal.timeout(20000));
   if(error)throw error;if(data?.id!==operation)throw Error('Unconfirmed response');
   status.textContent='Ticket saved. Reference: '+data.id+'. Owner email '+(data.email_status==='Sent'?'accepted by the mail provider.':'queued; delivery depends on the configured mail service.');form.reset();operation=null;
   }catch(error){
   const message=['PGRST202','42883'].includes(error?.code)?'Problem reporting is not configured on the server. Ask the platform owner to finish support setup.':error?.code==='42501'?'Your school access could not be verified. Sign in again before retrying.':'Report not confirmed. Retry when your connection is available.';
   status.textContent=message+' Your entries are retained. Reference: '+operation+'.';
  }
  finally{busy=false;button.disabled=false;}
 };
 for(const name of ['title','description'])form.elements[name].addEventListener('input',e=>e.target.setCustomValidity(''));
})();
