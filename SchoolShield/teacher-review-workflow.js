(function(root) {
  const areas=['Positive learning and teaching environment','Curriculum knowledge, planning and presentation','Learner assessment and achievement','Professional development','Extra/co-curricular participation'];
  const factors=['Teacher joined class during term','Extended absence','Learner attendance problems','Timetable disruptions','LTSM shortages','Overcrowding','Infrastructure problems','High learner support needs','Other'];
  const ratings=['Not rated','1 — Unacceptable','2 — Acceptable','3 — Good','4 — Outstanding'];
  const disclaimer='This term review supports internal performance monitoring and does not replace the formal DBE/ELRC QMS appraisal process.';
  const drafts=new Map();
  const escape=value=>escapeHtml(value);
  const locked=review=>['Awaiting Teacher Acknowledgement','Completed'].includes(review?.status);
  const find=(context,term)=>root.SchoolShieldTeacherPerformance.state.data?.reviews.find(r=>r.teaching_context_id===context.id&&r.term===Number(term));
  function card(context,term) {
    const review=find(context,term);
    return `<section class="panel"><h4>Internal QMS-Aligned Review</h4><p>${escapeHtml(disclaimer)}</p><p>Review subjects/classes and targets above, then record evidence, context and support. The final optional rating is the reviewer's judgement.</p><p>${escape(review?.status||'Not Started')} · ${escape(ratings[review?.internal_rating||0])}${escapeHtml(review?.completed_at?` · Reviewer completed: ${new Date(review.completed_at).toLocaleString()}`:'')}</p><button class="btn primary" data-workflow-open="${escapeHtml(context.id)}">${escapeHtml(locked(review)?'View submitted review / amendments':'Add evidence / review draft')}</button></section>`;
  }
  async function open(context,term) {
    if(!['principal','deputy'].includes(role())) return;
    const id=context.id+':'+term;
    try {
      const response=await root.schoolshieldSupabase.rpc('set_teacher_term_review_status',{p_context:context.id,p_term:Number(term),p_status:'Not Started'});
      if(response.error) throw new Error(response.error.message);
      await root.SchoolShieldTeacherPerformance.load(false);
      if(root.SchoolShieldTeacherPerformance.state.error) throw new Error(root.SchoolShieldTeacherPerformance.state.error);
    } catch(error) {modal('Review unavailable',`<p role="alert">${escape(error.message)}</p>`);return;}
    const review=find(context,term),isLocked=locked(review);
    if(!review) {modal('Review unavailable','<p role="alert">Reload the teacher before reviewing.</p>');return;}
    const saved=review.review_content||{},draft=drafts.get(id),content=draft?.revision===review.revision&&!isLocked?draft.content:saved;
    const narrative=[['strengths','Strengths'],['concerns','Concerns'],['recommendedSupport','Recommended support'],['nextTermFocus','Next-term focus'],['contextNotes','Contextual factor notes']];
    modal('Internal QMS-Aligned Review',`<p>${escapeHtml(disclaimer)}</p><p>Term ${escapeHtml(term)} · ${escapeHtml(context.academic_year)} · ${escape(review.status)} · Revision ${escapeHtml(review.revision)}</p><form data-review-form><fieldset ${escapeHtml(isLocked?'disabled':'')} data-review-fields><legend>Reviewer evidence and judgement</legend>${areas.map((area,i)=>`<section><h4>${escapeHtml(i+1)}. ${escapeHtml(area)}</h4><label>Reviewer comment<textarea class="textarea" maxlength="6000" data-area-comment="${escapeHtml(i)}">${escape(content.areas?.[i]?.comment||'')}</textarea></label><label>Evidence / document reference notes (optional)<textarea class="textarea" maxlength="6000" data-area-evidence="${escapeHtml(i)}">${escape(content.areas?.[i]?.evidence||'')}</textarea></label></section>`).join('')}<p class="muted">Record evidence descriptions and document references here. No file is uploaded by this form.</p><div class="form-grid">${narrative.map(([key,label])=>`<label>${escapeHtml(label)}<textarea class="textarea" maxlength="6000" data-review-text="${escapeHtml(key)}">${escape(content[key]||'')}</textarea></label>`).join('')}<label>Optional internal rating<select class="select" data-review-rating>${ratings.map((label,i)=>`<option value="${escapeHtml(i||'')}"${escapeHtml((draft?.revision===review.revision&&!isLocked?draft.rating:review.internal_rating)===(i||null)?' selected':'')}>${escapeHtml(label)}</option>`).join('')}</select></label></div><h4>Contextual factors</h4>${factors.map(f=>`<label><input type="checkbox" data-review-factor value="${escape(f)}"${escapeHtml(content.contextualFactors?.includes(f)?' checked':'')}> ${escapeHtml(f)}</label>`).join('')}<h4>Support actions</h4><div data-support-actions></div><button type="button" class="btn small" data-support-add>Add support action</button></fieldset>${isLocked?'<p>Submitted reviews and their academic evidence/targets are locked. An amendment retains the prior review and requires a reason. Amending returns the review to Awaiting Teacher Acknowledgement.</p><button type="button" class="btn" data-review-amend>Start amendment</button><label hidden data-amend-reason-label>Amendment reason<textarea class="textarea" minlength="5" maxlength="4000" data-amend-reason></textarea></label>':''}<p role="status" aria-live="polite" data-review-feedback></p><div class="modal-foot">${!isLocked?'<button type="submit" class="btn" data-review-action="draft">Save Draft</button><button type="submit" class="btn primary" data-review-action="submit">Complete Review → Await Teacher Acknowledgement</button>':'<button hidden type="submit" class="btn primary" data-review-action="amend">Save amendment</button>'}</div></form><details><summary>Review audit history</summary><div data-review-history>Loading history…</div></details>`);
    const form=document.querySelector('.modal-backdrop:last-child [data-review-form]'),fields=form.querySelector('[data-review-fields]'),feedback=form.querySelector('[data-review-feedback]');
    let actions=structuredClone(content.supportActions||[]),busy=false,amending=false;
    const text=key=>form.querySelector(`[data-review-text="${key}"]`).value;
    function capture() {
      const result={areas:areas.map((area,i)=>({area,comment:form.querySelector(`[data-area-comment="${i}"]`).value,evidence:form.querySelector(`[data-area-evidence="${i}"]`).value})),...Object.fromEntries(narrative.map(([key])=>[key,text(key)])),contextualFactors:[...form.querySelectorAll('[data-review-factor]:checked')].map(el=>el.value),supportActions:structuredClone(actions)};
      const rating=Number(form.querySelector('[data-review-rating]').value)||null;
      drafts.set(id,{revision:review.revision,content:result,rating});return {content:result,rating};
    }
    function drawActions() {
      form.querySelector('[data-support-actions]').innerHTML=actions.map((a,i)=>`<div><label>Action ${escapeHtml(i+1)}<textarea class="textarea" maxlength="4000" data-support-description="${escapeHtml(i)}">${escape(a.description)}</textarea></label><button type="button" class="btn small" data-support-remove="${escapeHtml(i)}">Remove action</button></div>`).join('');
      form.querySelectorAll('[data-support-description]').forEach(el=>el.oninput=()=>{actions[Number(el.dataset.supportDescription)].description=el.value;capture();});
      form.querySelectorAll('[data-support-remove]').forEach(el=>el.onclick=()=>{actions.splice(Number(el.dataset.supportRemove),1);drawActions();capture();});
    }
    drawActions();form.addEventListener('input',capture);
    form.querySelector('[data-support-add]').onclick=()=>{actions.push({description:''});drawActions();capture();};
    form.querySelector('[data-review-amend]')?.addEventListener('click',event=>{
      amending=true;fields.disabled=false;event.target.hidden=true;form.querySelector('[data-amend-reason-label]').hidden=false;form.querySelector('[data-review-action="amend"]').hidden=false;
    });
    form.onsubmit=async event=>{
      event.preventDefault();if(busy) return;
      const action=event.submitter?.dataset.reviewAction;if(!action||isLocked&&!amending) return;
      const value=capture(),reason=form.querySelector('[data-amend-reason]')?.value||'';
      if(action!=='draft'&&value.content.areas.some(a=>!a.comment.trim())) {feedback.textContent='Add a reviewer comment for each of the five areas before completion.';return;}
      if(action==='amend'&&reason.trim().length<5) {feedback.textContent='Enter an amendment reason of at least 5 characters.';return;}
      const finish=root.schoolshieldButtonBusy?.(event.submitter,'Saving...');
      busy=true;fields.disabled=true;form.querySelectorAll('button').forEach(el=>el.disabled=true);feedback.textContent='Saving…';
      try {
        const response=await root.schoolshieldSupabase.rpc('save_teacher_review',{p_context:context.id,p_term:Number(term),p_content:value.content,p_rating:value.rating,p_action:action,p_expected_revision:review.revision,p_reason:reason});
        if(response.error||!response.data) throw new Error(response.error?.message||'Review was not saved.');
        drafts.delete(id);root.SchoolShieldTeacherMetrics?.cache.delete(id);root.SchoolShieldTeacherTargets?.cache.delete(id);
        await root.SchoolShieldTeacherPerformance.load(false);
        feedback.textContent=root.SchoolShieldTeacherPerformance.state.error?'Saved; reload failed. Close and retry loading before making further changes.':action==='draft'?'Draft saved.':'Saved — Awaiting Teacher Acknowledgement.';
        // Keep a confirmed save visible; reopening loads the next server revision.
        form.querySelectorAll('button').forEach(el=>el.disabled=true);
      } catch(error) {feedback.textContent='Not saved: '+error.message+' Your text is retained. Close and reopen to reload the latest revision if there is a conflict.';fields.disabled=false;form.querySelectorAll('button').forEach(el=>el.disabled=false);}
      finally {busy=false;finish?.(fields.disabled?'Saved':undefined,fields.disabled);}
    };
    const history=document.querySelector('.modal-backdrop:last-child [data-review-history]');
    try {
      const response=await root.schoolshieldSupabase.from('teacher_review_history').select('action,previous_value,new_value,changed_by,changed_at,reason').eq('review_id',review.id).order('changed_at',{ascending:false});
      if(response.error) throw new Error(response.error.message);
      history.innerHTML=response.data.length?response.data.map(entry=>`<details><summary>${escape(entry.action)} · ${escape(new Date(entry.changed_at).toLocaleString())}</summary><p>Changed by: ${escape(entry.changed_by)} · Reason: ${escape(entry.reason)}</p><p>Previous value</p><pre>${escape(JSON.stringify(entry.previous_value,null,2))}</pre><p>Recorded value</p><pre>${escape(JSON.stringify(entry.new_value,null,2))}</pre></details>`).join(''):'No workflow changes recorded yet.';
    } catch(error) {history.textContent='History unavailable: '+error.message;}
  }
  function bind(contexts,term) {for(const context of contexts) document.querySelector(`[data-workflow-open="${context.id}"]`)?.addEventListener('click',async event=>{const finish=root.schoolshieldButtonBusy?.(event.currentTarget,'Loading...');try{await open(context,term);}finally{finish?.();}});}
  root.SchoolShieldTeacherReviewWorkflow={card,bind,locked,find,areas,factors,ratings,disclaimer,drafts};
})(window);
