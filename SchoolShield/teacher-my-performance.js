(function(root) {
  const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const supportAreas=['Subject-content support','Classroom management support','Lesson planning','CAPS pacing','Assessment design','Moderation support','Peer observation','Departmental support','Professional development','Other'];
  const supportStatuses=['Planned','In Progress','Completed','Cancelled'];
  const state={year:new Date().getFullYear(),term:null,data:null,loading:false,error:'',message:''};
  const supportCache=new Map(),supportErrors=new Map(),supportLoading=new Set(),responses=new Map();
  const management=()=>['principal','deputy'].includes(role());
  const number=(value,suffix='')=>value==null?'Not enough data':Number(value).toLocaleString('en-ZA',{maximumFractionDigits:2})+suffix;
  const disclaimer='This term review supports internal performance monitoring and does not replace the formal DBE/ELRC QMS appraisal process.';
  function supportList(actions) {
    return actions.length?actions.map(a=>`<section class="panel"><h4>${escape(a.support_area)}</h4><p>${escape(a.intervention)}</p><p>Responsible person: ${escape(a.responsible_person)} · Due: ${escape(a.due_date)} · Follow-up: ${escape(a.follow_up_date||'Not set')}</p><p>Status: ${escape(a.status)}</p><p>Outcome: ${escape(a.outcome||'Not recorded')}</p>${management()?`<button class="btn small" data-support-edit="${a.id}">Update support action</button>`:''}</section>`).join(''):'<p class="muted">No development/support actions recorded.</p>';
  }
  function targets(items) {
    const targetModule=root.SchoolShieldTeacherTargets;
    return items.length?table(['Target','Baseline','Target value','Actual performance','Margin','Status'],items.map(t=>`<tr><td>${escape(t.subject)} · ${escape(t.target_category)}<p>${escape(t.description)}</p></td><td>${escape(targetModule.format(t.baseline,t.measurement_type))}</td><td>${escape(targetModule.format(t.target_value,t.measurement_type))}</td><td>${escape(targetModule.numeric(t.measurement_type)?targetModule.format(t.actual_value,t.measurement_type):t.actual_text||'Not Yet Measured')}</td><td>${escape(targetModule.margin(t))}</td><td>${escape(t.status)}</td></tr>`)):'<p>No targets set for this subject/class/term.</p>';
  }
  function reviewView(review) {
    if(!review) return '<p>Management review has not yet been shared. Draft management comments and ratings remain private.</p>';
    const content=review.review_content||{},ratings=['Not rated','1 — Unacceptable','2 — Acceptable','3 — Good','4 — Outstanding'];
    return `<h4>Internal QMS-Aligned Review</h4><p>${disclaimer}</p><p>${escape(review.status)} · Internal rating: ${escape(ratings[review.internal_rating||0])}</p>${(content.areas||[]).map(a=>`<h4>${escape(a.area)}</h4><p>${escape(a.comment)}</p><p>Evidence: ${escape(a.evidence||'Not recorded')}</p>`).join('')}${[['strengths','Strengths'],['concerns','Concerns'],['recommendedSupport','Recommended support'],['nextTermFocus','Next-term focus']].map(([key,label])=>`<h4>${label}</h4><p>${escape(content[key]||'Not recorded')}</p>`).join('')}<h4>Contextual factors</h4><p>${escape((content.contextualFactors||[]).join(', ')||'None recorded')}</p><p>${escape(content.contextNotes||'')}</p><h4>Support recorded with the review</h4>${(content.supportActions||[]).map(a=>`<p>${escape(a.description)}</p>`).join('')||'<p>None recorded</p>'}<p><b>Acknowledgement confirms receipt of the review and does not mean agreement.</b></p>${review.teacher_acknowledged_at?`<p>Acknowledged: ${escape(new Date(review.teacher_acknowledged_at).toLocaleString())}</p><p>Your response: ${escape(review.teacher_comment||'No response added')}</p>`:`<form data-teacher-ack="${review.id}"><label>Your response/comment (optional)<textarea class="textarea" maxlength="6000" data-teacher-response="${review.id}">${escape(responses.get(review.id)||'')}</textarea></label><p role="status" aria-live="polite" data-ack-feedback="${review.id}"></p><button class="btn primary" type="submit">Acknowledge receipt / save response</button></form>`}`;
  }
  function view() {
    if(role()!=='teacher') return generic('My Performance','Access restricted','Only teachers can view their own performance.','');
    if(!state.term) state.term=Number((typeof TERM==='string'?TERM:'Term 1').match(/[1-4]/)?.[0])||1;
    return generic('My Performance','Teacher development','Your subjects, classes, targets and term reviews',`${root.SchoolShieldTeacherViews?.tabs()||''}<p>${disclaimer}</p><section class="panel"><div class="form-grid"><label>Academic year<input class="input" type="number" min="1900" max="2200" data-own-performance-year value="${state.year}"></label><label>Term<select class="select" data-own-performance-term>${[1,2,3,4].map(t=>`<option value="${t}"${t===state.term?' selected':''}>Term ${t}</option>`).join('')}</select></label></div><button class="btn" data-own-performance-refresh${state.loading?' disabled aria-busy="true"':''}>${state.loading?'Loading...':'Refresh performance'}</button><p role="status">${escape(state.loading?'Loading…':state.message)}</p>${state.error?`<p role="alert">${escape(state.error)}</p>`:''}</section>${state.data?state.data.length?state.data.map(context=>{
      const m=context.metrics||{};
      return `<section class="panel"><h3>${escape(context.subject)} → ${escape(context.grade)} / ${escape(context.class)} → Term ${state.term}</h3><h4>Actual subject/class performance</h4><div class="detail-grid">${[['Baseline average',m.baseline_average,'%'],['Current average',m.current_average,'%'],['Improvement from baseline',m.improvement_percentage_points,' percentage points'],['Previous term average',m.previous_term_average,'%'],['Pass rate',m.pass_rate,'%'],['Learners',m.number_of_learners,''],['Learners improving',m.learners_improving,''],['Learners declining',m.learners_declining,''],['Learners at risk',m.learners_at_risk,''],['Curriculum coverage',m.curriculum_coverage,'%'],['Assessments planned',m.assessments_planned,''],['Assessments completed',m.assessments_completed,''],['Marks outstanding',m.marks_outstanding,'']].map(([label,value,suffix])=>`<div><small>${label}</small><b>${escape(number(value,suffix))}</b></div>`).join('')}</div><p>Academic indicators show current performance and improvement separately. They do not automatically determine an internal rating.</p><h4>Targets and target margins</h4>${targets(context.targets)}${reviewView(context.review)}<h4>Development / Support Actions</h4>${supportList(context.supportActions)}</section>`;
    }).join(''):'<section class="panel"><p>No subjects/classes are linked to your account for this year. Ask school leadership to confirm your teaching assignments.</p></section>':(state.error?'':'<section class="panel"><p>Loading your performance...</p></section>')}`);
  }
  async function load() {
    if(role()!=='teacher'||state.loading) return;
    state.loading=true;state.error='';root.render();
    try {
      const response=await root.schoolshieldSupabase.rpc('get_my_teacher_performance',{p_year:state.year,p_term:state.term});
      if(response.error||!Array.isArray(response.data)) throw new Error(response.error?.message||'Performance could not be loaded.');
      state.data=response.data;
    } catch(error) {state.error=error.message;}
    finally {state.loading=false;root.render();}
  }
  function bindOwn() {
    if(role()!=='teacher') return;
    root.SchoolShieldTeacherViews?.bind();
    if(state.data===null&&!state.loading&&!state.error) {load();return;}
    for(const [selector,key] of [['[data-own-performance-year]','year'],['[data-own-performance-term]','term']]) {
      const field=document.querySelector(selector);if(field) field.disabled=state.loading;
      field?.addEventListener('change',()=>{const value=Number(field.value);if(!Number.isInteger(value)||key==='year'&&(value<1900||value>2200)||key==='term'&&(value<1||value>4)) return;state[key]=value;state.data=null;state.message='';load();});
    }
    document.querySelector('[data-own-performance-refresh]')?.addEventListener('click',load);
    document.querySelectorAll('[data-teacher-response]').forEach(field=>field.oninput=()=>responses.set(field.dataset.teacherResponse,field.value));
    document.querySelectorAll('[data-teacher-ack]').forEach(form=>{
      let busy=false;
      form.onsubmit=async event=>{
        event.preventDefault();if(busy) return;
        const id=form.dataset.teacherAck,review=state.data.map(c=>c.review).find(r=>r?.id===id),field=form.querySelector('textarea'),button=form.querySelector('button'),feedback=form.querySelector('[role="status"]');
        const finish=root.schoolshieldButtonBusy?.(button,'Saving...');
        const comment=field.value;responses.set(id,comment);busy=true;field.disabled=true;button.disabled=true;feedback.textContent='Saving acknowledgement…';
        try {
          const response=await root.schoolshieldSupabase.rpc('acknowledge_teacher_review',{p_review:id,p_expected_revision:review.revision,p_comment:comment});
          if(response.error||!response.data) throw new Error(response.error?.message||'Acknowledgement was not saved.');
          // Reflect confirmed receipt before refresh so a failed reload cannot offer a repeat write.
          state.data.find(c=>c.review?.id===id).review=response.data;responses.delete(id);state.message='Acknowledgement saved. Receipt does not mean agreement.';await load();
        } catch(error) {feedback.textContent='Not saved: '+error.message+' Your response is retained. Refresh if the review has changed.';field.disabled=false;button.disabled=false;}
        finally {busy=false;finish?.();}
      };
    });
  }
  function supportCard(context,term) {
    const review=root.SchoolShieldTeacherReviewWorkflow.find(context,term),actions=review?supportCache.get(review.id):null;
    return `<section class="panel"><h4>Development / Support Actions</h4><p>Developmental support is recorded separately from the locked review. These actions do not automatically create disciplinary records.</p>${review?.teacher_acknowledged_at?`<p>Teacher acknowledged receipt: ${escape(new Date(review.teacher_acknowledged_at).toLocaleString())}. This does not mean agreement.</p><p>Teacher response: ${escape(review.teacher_comment||'No response added')}</p>`:''}${review&&supportErrors.has(review.id)?`<p role="alert">${escape(supportErrors.get(review.id))}</p><button class="btn small" data-support-retry="${review.id}">Retry support actions</button>`:''}${actions?supportList(actions):review?'<p>Loading support actions…</p>':'<p>No support actions recorded.</p>'}<button class="btn" data-support-new="${context.id}">Add development / support action</button></section>`;
  }
  async function loadSupport(review) {
    if(supportLoading.has(review.id)) return;
    supportLoading.add(review.id);supportErrors.delete(review.id);
    try {const response=await root.schoolshieldSupabase.from('teacher_support_actions').select('*').eq('review_id',review.id).order('due_date');if(response.error) throw new Error(response.error.message);supportCache.set(review.id,response.data);}
    catch(error) {supportErrors.set(review.id,error.message);}
    finally {supportLoading.delete(review.id);}
  }
  function openSupport(review,action=null) {
    function uuid() {
      if(root.crypto.randomUUID) return root.crypto.randomUUID();
      const bytes=root.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
    }
    const actionId=action?.id||uuid();
    modal(action?'Update development / support action':'Add development / support action',`<form data-support-form><div class="form-grid"><label>Support area<input class="input" required maxlength="200" list="support-area-examples" name="support_area" value="${escape(action?.support_area||'')}"><datalist id="support-area-examples">${supportAreas.map(a=>`<option value="${a}">`).join('')}</datalist></label><label>Responsible person<input class="input" required maxlength="300" name="responsible_person" value="${escape(action?.responsible_person||'')}"></label><label class="full">Intervention<textarea class="textarea" required maxlength="6000" name="intervention">${escape(action?.intervention||'')}</textarea></label><label>Due date<input class="input" type="date" required name="due_date" value="${escape(action?.due_date||'')}"></label><label>Follow-up date (optional)<input class="input" type="date" name="follow_up_date" value="${escape(action?.follow_up_date||'')}"></label><label>Status<select class="select" name="status">${supportStatuses.map(s=>`<option${action?.status===s?' selected':''}>${s}</option>`).join('')}</select></label><label class="full">Outcome<textarea class="textarea" maxlength="6000" name="outcome">${escape(action?.outcome||'')}</textarea></label></div><p role="status" data-support-feedback></p><button type="submit" class="btn primary">Save support action</button></form>`);
    const form=document.querySelector('.modal-backdrop:last-child [data-support-form]');let busy=false;
    form.onsubmit=async event=>{
      event.preventDefault();if(busy) return;
      const details=Object.fromEntries(new FormData(form)),feedback=form.querySelector('[role="status"]');
      if(['support_area','intervention','responsible_person'].some(key=>!details[key].trim())) {feedback.textContent='Support area, intervention and responsible person are required.';return;}
      const finish=root.schoolshieldButtonBusy?.(event.submitter,'Saving...');let confirmed=false;
      busy=true;form.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);feedback.textContent='Saving…';
      try {
        const response=await root.schoolshieldSupabase.rpc('save_teacher_support_action',{p_id:actionId,p_review:review.id,p_details:details,p_expected_revision:action?.revision??null});
        if(response.error||!response.data) throw new Error(response.error?.message||'Support action was not saved.');
        confirmed=true;
        root.SchoolShieldTeacherDashboard?.invalidate();await loadSupport(review);root.render();feedback.textContent=supportErrors.has(review.id)?'Saved; reload failed. Retry loading support actions.':'Support action saved.';
      } catch(error) {feedback.textContent='Not saved: '+error.message;form.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=false);}
      finally {busy=false;finish?.(confirmed?'Saved':undefined,confirmed);}
    };
  }
  function bindManagement(contexts,term) {
    if(!management()) return;
    for(const context of contexts) {
      const review=root.SchoolShieldTeacherReviewWorkflow.find(context,term);
      if(review&&!supportCache.has(review.id)&&!supportErrors.has(review.id)&&!supportLoading.has(review.id)) loadSupport(review).then(()=>root.render());
      document.querySelector(`[data-support-new="${context.id}"]`)?.addEventListener('click',async()=>{
        if(review) {openSupport(review);return;}
        try {const response=await root.schoolshieldSupabase.rpc('set_teacher_term_review_status',{p_context:context.id,p_term:Number(term),p_status:'Not Started'});if(response.error) throw new Error(response.error.message);await root.SchoolShieldTeacherPerformance.load(false);const created=root.SchoolShieldTeacherReviewWorkflow.find(context,term);if(!created) throw new Error('Reload the review before adding support.');openSupport(created);}
        catch(error) {modal('Support unavailable',`<p role="alert">${escape(error.message)}</p>`);}
      });
      if(review) {
        document.querySelector(`[data-support-retry="${review.id}"]`)?.addEventListener('click',()=>loadSupport(review).then(()=>root.render()));
        for(const action of supportCache.get(review.id)||[]) document.querySelector(`[data-support-edit="${action.id}"]`)?.addEventListener('click',()=>openSupport(review,action));
      }
    }
  }
  root.SchoolShieldMyPerformance={view,bindOwn,state,load,supportCard,bindManagement,supportAreas,supportStatuses};
})(window);
