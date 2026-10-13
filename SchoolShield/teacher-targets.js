(function(root) {
  const categories=['Learner Achievement','Pass Rate','Learner Improvement','Curriculum Coverage','Assessment Completion','Marks Submission','Learner Support / Intervention','Lesson Planning','Classroom Practice','Professional Development','Extra / Co-curricular','Other'];
  const types=['Percentage','Percentage Point Improvement','Number','Yes / No','Completion','Qualitative'];
  const progress=['Not Started','In Progress','Completed','Not Achieved'];
  const sources={Percentage:[['current_average','Current class average'],['pass_rate','Pass rate'],['curriculum_coverage','Curriculum coverage']],
    'Percentage Point Improvement':[['improvement_percentage_points','Improvement from baseline']],Number:[['learners_improving','Learners improving'],['learners_declining','Learners declining'],['learners_at_risk','Learners at risk'],['assessments_planned','Assessments planned'],['assessments_completed','Assessments completed'],['marks_outstanding','Marks outstanding'],['number_of_learners','Number of learners']]};
  const cache=new Map(),loading=new Set(),errors=new Map(),generations=new Map();let own=null,ownLoading=false,ownError='';
  const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const management=()=>['principal','deputy'].includes(role());
  const numeric=type=>['Percentage','Percentage Point Improvement','Number'].includes(type);
  const sourceTitle=target=>target.measurement_source==='manual'?'Reviewer-entered actual':'Saved '+(Object.values(sources).flat().find(([key])=>key===target.measurement_source)?.[1]||'subject/class evidence');
  const key=(context,term)=>context.id+':'+term;
  const format=(value,type)=>value==null?'Not Yet Measured':numeric(type)?Number(value).toLocaleString('en-ZA',{maximumFractionDigits:2})+(type==='Percentage'?'%':type==='Percentage Point Improvement'?' percentage points':''):String(value);
  function margin(target) {
    if(!numeric(target.measurement_type)) return 'Not applicable';
    if(target.margin==null) return 'Not Yet Measured';
    return (Number(target.margin)>0?'+':'')+Number(target.margin).toLocaleString('en-ZA',{maximumFractionDigits:2})+(target.measurement_type==='Number'?'':' percentage points');
  }
  function rows(targets,edit=false) {
    return targets.map(target=>`<tr><td><b>${escape(target.target_category)}</b><small>${escape(target.description)}</small><small>${escape(target.measurement_type)}${numeric(target.measurement_type)?` · ${escape(target.direction)} · Near tolerance: ${escape(target.near_tolerance)} · Source: ${escape(sourceTitle(target))}`:''}</small></td><td>${escape(format(target.baseline,target.measurement_type))}</td><td>${escape(format(target.target_value,target.measurement_type))}</td><td>${escape(numeric(target.measurement_type)?format(target.actual_value,target.measurement_type):target.actual_text||'Not Yet Measured')}</td><td>${escape(margin(target))}</td><td>${escape(target.status)}</td><td>${escape(target.due_date)}</td><td>${escape(target.priority)}</td>${edit?`<td><button class="btn small" data-target-edit="${target.id}">Edit / record actual</button></td>`:''}</tr>`);
  }
  function render(context,term) {
    const id=key(context,term),review=root.SchoolShieldTeacherReviewWorkflow?.find(context,term),isLocked=root.SchoolShieldTeacherReviewWorkflow?.locked(review),data=isLocked?(review.evidence_snapshot?.targets||cache.get(id)):cache.get(id);
    return `<section class="panel"><div class="panel-head"><div><h4>Management-set targets · Term ${term}</h4><p>Margins are Actual − Target. Near Target uses the stated tolerance. Metric actuals refresh when subject/class evidence is recalculated; no overall teacher score is calculated.</p></div>${isLocked?'<p>Locked submission targets</p>':`<button class="btn primary" data-target-new="${id}">Set Target</button>`}</div>${errors.has(id)?`<p role="alert">${escape(errors.get(id))}</p>`:''}${data?data.length?table(['Category / description','Baseline','Target','Actual','Margin','Status','Due date','Priority',''],rows(data,!isLocked)):'<p class="muted">No targets have been set for this subject/class/term.</p>':'<p>Loading targets…</p>'}<button class="btn small ghost" data-target-refresh="${id}">Refresh targets</button></section>`;
  }
  async function load(context,term) {
    const id=key(context,term);if(loading.has(id)) return;
    const generation=generations.get(id)||0;loading.add(id);errors.delete(id);
    try {const response=await root.schoolshieldSupabase.rpc('get_teacher_targets',{p_context:context.id,p_term:Number(term)});
      if(response.error||!Array.isArray(response.data)) throw new Error(response.error?.message||'Targets could not be loaded.');
      if(generation===(generations.get(id)||0)) cache.set(id,response.data);
    } catch(error) {errors.set(id,error.message);}
    finally {loading.delete(id);}
  }
  function uuid() {
    if(root.crypto.randomUUID) return root.crypto.randomUUID();
    const bytes=root.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  function open(context,term,target=null) {
    if(!management()) return;
    const id=target?.id||uuid(),options=(values,current)=>values.map(value=>`<option${value===current?' selected':''}>${escape(value)}</option>`).join('');
    const label=root.SchoolShieldTeacherPerformance?.state.data;
    const teacher=label?.teachers.find(t=>t.id===context.teacher_id),subject=label?.subjects.find(s=>s.id===context.subject_id),schoolClass=label?.classes.find(c=>c.id===context.class_id);
    modal(target?'Edit target':'Set Target',`<p>${escape(teacher?.name)} → ${escape(subject?.name)} → ${escape(schoolClass?.grade)} / ${escape(schoolClass?.class_ref)} → Term ${term} · ${context.academic_year}</p><form data-target-form><div class="form-grid"><label>Target category<select class="select" data-target-field="category">${options(categories,target?.target_category)}</select></label><label>Measurement type<select class="select" data-target-field="type">${options(types,target?.measurement_type)}</select></label><label class="full">Description<textarea class="textarea" required maxlength="4000" data-target-field="description">${escape(target?.description||'')}</textarea></label><label>Baseline (optional)<input class="input" data-target-field="baseline" value="${escape(target?.baseline??'')}"></label><label data-target-input-label>Target value<input class="input" required data-target-field="target" value="${escape(target?.target_value??'')}"></label><label data-target-yesno-label>Target value<select class="select" data-target-field="yesno">${options(['Yes','No'],target?.target_value)}</select></label><label data-target-numeric>Actual source<select class="select" data-target-field="source"></select></label><label data-target-manual>Actual value (optional)<input class="input" type="number" step="any" data-target-field="actual" value="${escape(target?.actual_value??'')}"></label><label data-target-numeric>Direction<select class="select" data-target-field="direction">${options(['Higher is better','Lower is better'],target?.direction)}</select></label><label data-target-numeric>Near Target tolerance (same units)<input class="input" type="number" min="0" step="any" data-target-field="tolerance" value="${target?.near_tolerance??0}"></label><label data-target-qualitative>Progress status<select class="select" data-target-field="status">${options(progress,progress.includes(target?.status)?target.status:'Not Started')}</select></label><label class="full">Progress / evidence note (optional)<textarea class="textarea" maxlength="4000" data-target-field="evidence">${escape(target?.actual_text||'')}</textarea></label><label>Due date<input class="input" type="date" required data-target-field="due" value="${escape(target?.due_date||'')}"></label><label>Priority<select class="select" data-target-field="priority">${options(['Low','Medium','High'],target?.priority||'Medium')}</select></label></div><p class="muted">A zero tolerance treats every shortfall as Below Target. Set a tolerance to define Near Target. Qualitative targets use progress states, with no numeric margin.</p><p role="status" data-target-save-state></p><div class="modal-foot"><button class="btn primary" type="submit">Save target</button></div></form>`);
    const backdrop=document.querySelector('.modal-backdrop:last-child'),form=backdrop.querySelector('[data-target-form]');
    const field=name=>form.querySelector(`[data-target-field="${name}"]`),hide=(selector,hidden)=>form.querySelectorAll(selector).forEach(el=>{el.style.display=hidden?'none':'';el.querySelectorAll('input,select').forEach(input=>input.disabled=hidden);});
    function update(initial=false) {
      const type=field('type').value,isNumeric=numeric(type),current=initial?target?.measurement_source:field('source').value;
      field('source').innerHTML=[['manual','Reviewer-entered actual'],...(sources[type]||[])].map(([value,title])=>`<option value="${value}"${value===current?' selected':''}>${title}</option>`).join('');
      field('target').type=isNumeric?'number':'text';field('target').step='any';field('baseline').type=isNumeric?'number':'text';field('baseline').step='any';
      hide('[data-target-numeric]',!isNumeric);hide('[data-target-qualitative]',isNumeric);hide('[data-target-input-label]',type==='Yes / No');hide('[data-target-yesno-label]',type!=='Yes / No');
      hide('[data-target-manual]',!isNumeric||field('source').value!=='manual');
      field('target').required=type!=='Yes / No';
    }
    field('type').onchange=()=>update();field('source').onchange=()=>hide('[data-target-manual]',field('source').value!=='manual');update(true);
    form.onsubmit=async event=>{
      event.preventDefault();if(form.dataset.saving==='true') return;
      const type=field('type').value,isNumeric=numeric(type),text=value=>value.trim(),number=value=>value.trim()===''?null:Number(value);
      const details={targetCategory:field('category').value,description:text(field('description').value),measurementType:type,
        baseline:field('baseline').value.trim()===''?null:isNumeric?number(field('baseline').value):text(field('baseline').value),
        targetValue:type==='Yes / No'?field('yesno').value:isNumeric?number(field('target').value):text(field('target').value),
        measurementSource:isNumeric?field('source').value:'manual',actualText:text(field('evidence').value),
        direction:isNumeric?field('direction').value:'Higher is better',nearTolerance:isNumeric?number(field('tolerance').value)??0:0,
        dueDate:field('due').value,priority:field('priority').value,status:isNumeric?'Not Yet Measured':field('status').value};
      if(isNumeric&&details.measurementSource==='manual') details.actualValue=number(field('actual').value);
      const status=form.querySelector('[data-target-save-state]');
      if(!details.description||!details.dueDate||details.targetValue===null||details.targetValue===''||[details.targetValue,details.baseline,details.actualValue,details.nearTolerance].some(v=>typeof v==='number'&&!Number.isFinite(v))) {status.textContent='Complete the required fields with valid values.';return;}
      form.dataset.saving='true';status.textContent='Saving…';const controls=[...form.querySelectorAll('input,select,textarea,button')];const previouslyDisabled=controls.map(c=>c.disabled);const finish=root.schoolshieldButtonBusy?.(event.submitter,'Saving...');controls.forEach(c=>c.disabled=true);
      try {
        const response=await root.schoolshieldSupabase.rpc('save_teacher_target',{p_id:id,p_context:context.id,p_term:Number(term),p_details:details,p_expected_revision:target?.revision??null});
        if(response.error||!response.data?.id) throw new Error(response.error?.message||'Supabase did not confirm the target save.');
        root.SchoolShieldTeacherDashboard?.invalidate();cache.delete(key(context,term));await load(context,term);backdrop.remove();root.render();
      } catch(error) {status.textContent='Not saved: '+error.message;}
      finally {finish?.();form.dataset.saving='false';controls.forEach((control,i)=>control.disabled=previouslyDisabled[i]);}
    };
  }
  function bind(contexts,term) {
    if(!management()) return;
    const missing=contexts.filter(c=>!cache.has(key(c,term))&&!loading.has(key(c,term))&&!errors.has(key(c,term)));
    if(missing.length) Promise.all(missing.map(c=>load(c,term))).then(()=>root.render());
    for(const context of contexts) {
      const id=key(context,term);
      document.querySelector(`[data-target-new="${id}"]`)?.addEventListener('click',()=>open(context,term));
      document.querySelector(`[data-target-refresh="${id}"]`)?.addEventListener('click',async event=>{const done=root.schoolshieldButtonBusy?.(event.currentTarget,'Loading...');try{await load(context,term);root.render();}finally{done?.();}});
      for(const target of cache.get(id)||[]) document.querySelector(`[data-target-edit="${target.id}"]`)?.addEventListener('click',()=>open(context,term,target));
    }
  }
  function viewOwn() {
    if(role()!=='teacher') return generic('My Targets','Access restricted','Only Teacher accounts can open this page.','');
    return generic('My Targets','Teacher workspace','Management-set targets for your own subjects, classes and terms.',
      `${root.SchoolShieldTeacherViews?.tabs()||''}<p class="muted">Targets are read-only. Numeric margins show Actual − Target; qualitative progress has no numeric margin.</p><button class="btn" data-my-targets-refresh${ownLoading?' disabled aria-busy="true"':''}>${ownLoading?'Loading...':'Refresh targets'}</button>${ownError?`<p role="alert">${escape(ownError)}</p>`:''}${own===null?(ownError?'':'<p>Loading targets...</p>'):own.length?table(['Subject / class / term','Category / description','Baseline','Target','Actual','Margin','Status','Due date','Priority'],own.map(target=>`<tr><td>${escape(target.subject)}<small>${escape(target.grade+' / '+target.class_ref+' · Term '+target.term+' · '+target.academic_year)}</small></td>`+rows([target])[0].replace(/^<tr>/,''))):'<p>No targets have been set for you.</p>'}`);
  }
  async function loadOwn() {
    if(role()!=='teacher'||ownLoading) return;ownLoading=true;ownError='';root.render();
    try {const response=await root.schoolshieldSupabase.rpc('get_teacher_targets',{});if(response.error||!Array.isArray(response.data)) throw new Error(response.error?.message||'Targets could not be loaded.');own=response.data;}
    catch(error){ownError=error.message;}finally{ownLoading=false;root.render();}
  }
  function bindOwn() {if(role()!=='teacher') return;root.SchoolShieldTeacherViews?.bind();if(own===null&&!ownLoading&&!ownError) loadOwn();document.querySelector('[data-my-targets-refresh]')?.addEventListener('click',loadOwn);}
  root.addEventListener?.('schoolshield:teacher-metrics-saved',event=>{const id=event.detail.contextId+':'+event.detail.term;generations.set(id,(generations.get(id)||0)+1);cache.delete(id);});
  root.SchoolShieldTeacherTargets={render,bind,viewOwn,bindOwn,format,margin,numeric,cache,categories,types};
})(window);
