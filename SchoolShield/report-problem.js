/* No auth tokens, query strings, screenshots or account secrets enter tickets. */
(() => {
 if(document.getElementById('reportProblemButton'))return;
 const button=document.createElement('button');button.id='reportProblemButton';button.className='btn report-problem-button';button.type='button';button.textContent='Report a problem';
 const dialog=document.createElement('dialog');dialog.className='problem-dialog';
 dialog.innerHTML='<h2>Report a problem</h2><p>Your report goes to your school’s super-admin support queue. Do not include passwords or learner information.</p><form><label>Title *<input class="input" name="title" required minlength="3" maxlength="160"></label><label>Category *<select class="select" name="category" required><option>Access</option><option>Invitations</option><option>Branding</option><option>Platform</option><option>Other</option></select></label><label>What happened? *<textarea class="textarea" name="description" required minlength="5" maxlength="3000"></textarea></label><p role="status"></p><div class="action-row"><button class="btn primary" type="submit">Submit report</button><button class="btn" type="button" data-close>Close</button></div></form>';
 document.body.append(button,dialog);const form=dialog.querySelector('form'),status=dialog.querySelector('[role=status]'),submit=form.querySelector('[type=submit]');let reference=null,signature=null;
 button.onclick=()=>dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 form.onsubmit=async event=>{
  event.preventDefault();if(submit.disabled)return;
  const title=form.elements.title.value.trim(),description=form.elements.description.value.trim();
  if(title.length<3||description.length<5){status.textContent='Enter a title and description; spaces alone are not accepted.';return;}
  const body={title,description,category:form.elements.category.value,page:location.pathname};
  const next=JSON.stringify(body);if(signature!==next){reference=crypto.randomUUID();signature=next;}body.id=reference;
  submit.disabled=true;status.textContent='Submitting report...';
  try{
   if(!window.schoolshieldFunctionRequest)throw Error('Sign in to your school account to submit a report. If you cannot sign in, ask your school administrator to raise an Access ticket.');
   const response=await window.schoolshieldFunctionRequest('report-problem',body);const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'Report not confirmed. Retry.');
   status.textContent='Report saved. Reference: '+result.ticket_id+'. '+(result.email_status==='Sent'?'Email provider accepted the notification.':'Your report is in the super-admin queue; email delivery is not confirmed.');form.reset();signature=null;reference=null;
  }catch(error){status.textContent=error.message+' Reference: '+reference;}
  finally{submit.disabled=false;}
 };
})();
