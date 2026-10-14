(function(root) {
  const cache=new Map(),pending=new Set(),drafts=new Map(),errors=new Map(),messages=new Map();
  const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const key=(context,term)=>context.id+':'+term;
  const value=(number,suffix='')=>number===null||number===undefined?'Not enough data':Number(number).toLocaleString('en-ZA',{maximumFractionDigits:2})+suffix;
  function render(context,term) {
    const id=key(context,term),review=root.SchoolShieldTeacherReviewWorkflow?.find(context,term),isLocked=root.SchoolShieldTeacherReviewWorkflow?.locked(review),metrics=isLocked?(review.evidence_snapshot?.metrics||cache.get(id)):cache.get(id),draft=drafts.get(id);
    if(!metrics) return `<section class="panel" data-metrics-card="${id}"><p>${errors.has(id)?escape(errors.get(id)):'Loading subject/class performance…'}</p>${errors.has(id)?`<button class="btn small" data-metrics-retry="${id}">Retry metrics</button>`:''}</section>`;
    const delta=metrics.improvement_percentage_points;
    const items=[['Baseline class average',value(metrics.baseline_average,'%')],['Current class average',value(metrics.current_average,'%')],['Previous term average',value(metrics.previous_term_average,'%')],['Pass rate',value(metrics.pass_rate,'%')],['Number of learners',value(metrics.number_of_learners)],['Learners improving',value(metrics.learners_improving)],['Learners declining',value(metrics.learners_declining)],['Learners at risk',value(metrics.learners_at_risk)]];
    const details=metrics.calculation_details||{};
    return `<section class="panel" data-metrics-card="${id}"><h4>Subject / class academic evidence · Term ${term}</h4><div class="detail-grid">${items.map(([label,number])=>`<div><small>${label}</small><b>${escape(number)}</b></div>`).join('')}</div><p><b>Improvement from baseline: ${delta==null?'Not enough data':(Number(delta)>0?'+':'')+value(delta)+' percentage points'}</b></p><p class="muted">Current marks cover ${value(metrics.learners_with_marks)} of ${value(metrics.number_of_learners)} learners. Improvement compares ${value(metrics.comparable_learners)} matched learners${metrics.comparable_learners>0?` (${value(metrics.comparison_baseline_average,'%')} baseline → ${value(metrics.comparison_current_average,'%')} current)`:''}. Performance and improvement are separate indicators, not a teacher rating.</p><p class="muted">Current average uses submitted assessments, excluding the selected baseline. Valid assessment weights are used when all are available; otherwise equal weights apply. The pass / at-risk indicator uses SchoolShield's existing 50% threshold.</p>${details.ignored_unscoped_assessments?`<p class="muted">${details.ignored_unscoped_assessments} matching assessment(s) lack a usable term/year and were excluded.</p>`:''}<div class="detail-grid"><div><small>Curriculum coverage</small><b>${value(metrics.curriculum_coverage,'%')}</b></div><div><small>Assessments planned</small><b>${value(metrics.assessments_planned)}</b></div><div><small>Assessments completed</small><b>${value(metrics.assessments_completed)}</b></div><div><small>Marks outstanding</small><b>${value(metrics.marks_outstanding)}</b></div></div><p class="muted">Planned assessments are the recorded assessment tasks for this subject/class/term. Completed means submitted or finalised; outstanding marks are missing/invalid marks on those completed tasks. Curriculum coverage is reviewer-reported.</p>${isLocked?`<p>Locked submission evidence. Reviewer comment: ${escape(metrics.reviewer_comment||'None')}</p></section>`:`<div class="form-grid"><label>Baseline assessment<select class="select" data-metrics-baseline="${id}"><option value="">No baseline selected</option>${(metrics.baseline_candidates||[]).map(a=>`<option value="${escape(a.id)}"${(draft?.baseline??metrics.baseline_assessment_id)===a.id?' selected':''}>${escape(a.title)}</option>`).join('')}</select></label><label>Curriculum coverage (%, optional)<input class="input" type="number" min="0" max="100" step="0.01" data-metrics-coverage="${id}" value="${escape(draft?.coverage??metrics.curriculum_coverage??'')}"></label><label class="full">Reviewer comment<textarea class="textarea" maxlength="4000" data-metrics-comment="${id}">${escape(draft?.comment??metrics.reviewer_comment??'')}</textarea></label></div><p role="status">${pending.has(id)?'Saving…':errors.has(id)?escape(errors.get(id)):escape(messages.get(id)||'')}</p><button class="btn small primary" data-metrics-save="${id}"${pending.has(id)?' disabled':''}>Save and recalculate</button></section>`}`;
  }
  async function calculate(context,term,update=false) {
    const id=key(context,term);if(pending.has(id)) return;
    pending.add(id);errors.delete(id);messages.delete(id);
    try {
      const draft=drafts.get(id),coverage=draft?.coverage;
      if(update&&coverage!==''&&coverage!=null&&(!Number.isFinite(Number(coverage))||Number(coverage)<0||Number(coverage)>100)) throw new Error('Curriculum coverage must be between 0 and 100.');
      const args={p_context:context.id,p_term:Number(term)};
      if(update) Object.assign(args,{p_update_review_fields:true,p_baseline_id:draft.baseline||null,p_curriculum_coverage:coverage===''?null:Number(coverage),p_reviewer_comment:draft.comment});
      const response=await root.schoolshieldSupabase.rpc('refresh_teacher_subject_performance',args);
      if(response.error||!response.data) throw new Error(response.error?.message||'The academic evidence could not be saved.');
      root.SchoolShieldTeacherDashboard?.invalidate();cache.set(id,response.data);if(update) {drafts.delete(id);messages.set(id,'Saved');}
      if(root.CustomEvent) root.dispatchEvent(new root.CustomEvent('schoolshield:teacher-metrics-saved',{detail:{contextId:context.id,term:Number(term)}}));
    } catch(error) {errors.set(id,'Not saved: '+error.message);}
    finally {pending.delete(id);}
  }
  function bind(contexts,term) {
    const missing=contexts.filter(c=>!cache.has(key(c,term))&&!pending.has(key(c,term))&&!errors.has(key(c,term)));
    if(missing.length) Promise.all(missing.map(c=>calculate(c,term))).then(()=>root.render());
    for(const context of contexts) {
      const id=key(context,term);
      const field=name=>document.querySelector(`[data-metrics-${name}="${id}"]`);
      if(pending.has(id)) for(const name of ['baseline','coverage','comment']) {if(field(name)) field(name).disabled=true;}
      const capture=()=>drafts.set(id,{baseline:field('baseline').value,coverage:field('coverage').value,comment:field('comment').value});
      for(const name of ['baseline','coverage','comment']) field(name)?.addEventListener('input',capture);
      field('save')?.addEventListener('click',async()=>{capture();const work=calculate(context,term,true);root.render();await work;root.render();});
      document.querySelector(`[data-metrics-retry="${id}"]`)?.addEventListener('click',async()=>{errors.delete(id);await calculate(context,term);root.render();});
    }
  }
  root.SchoolShieldTeacherMetrics={render,bind,value,cache};
})(window);
