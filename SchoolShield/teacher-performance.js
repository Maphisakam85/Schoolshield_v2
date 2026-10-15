/* Internal teacher term review management; academic evidence never determines a rating. */
(function(root) {
  const statuses=['Not Started','In Progress','Awaiting Teacher Acknowledgement','Completed'];
  const state={data:null,loading:false,loaded:false,error:'',saving:false,saveMessage:'',selected:null,selectedSubject:null,selectedGrade:null,selectedContext:null,reviewOpen:false,assignmentView:false,includeInactive:false,year:new Date().getFullYear(),filters:{teacher:'',department:'',grade:'',subject:'',class:'',term:'',status:''}};
  const escape=value=>escapeHtml(value);
  const allowed=()=>['principal','deputy'].includes(role());
  const subject=id=>state.data.subjects.find(s=>s.id===id);
  const schoolClass=id=>state.data.classes.find(c=>c.id===id);
  const contextReview=context=>state.data.reviews.find(r=>r.teaching_context_id===context.id && r.term===Number(state.filters.term));
  function matchingContexts(teacherId,filterStatus=true,filterTerm=true) {
    return state.data.contexts.filter(context=>context.teacher_id===teacherId &&
      (!filterTerm||!Array.isArray(context.eligibleTerms)||context.eligibleTerms.includes(Number(state.filters.term))) &&
      (!state.filters.subject||context.subject_id===state.filters.subject) &&
      (!state.filters.class||context.class_id===state.filters.class) &&
      (!state.filters.grade||schoolClass(context.class_id)?.grade===state.filters.grade) &&
      (!filterStatus||!state.filters.status||(contextReview(context)?.status||'Not Started')===state.filters.status));
  }
  function roster() {
    return state.data.teachers.filter(teacher=>(state.includeInactive||(teacher.accountStatus||'Active')==='Active')&&(!state.filters.teacher||teacher.id===state.filters.teacher) &&
      (!state.filters.department||teacher.department===state.filters.department)).map(teacher=>{
      const contexts=matchingContexts(teacher.id), reviews=contexts.map(contextReview).filter(Boolean).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
      const assignmentContexts=matchingContexts(teacher.id,false,false);
      return {...teacher,contexts,assignmentContexts,latest:reviews[0]?.status||'Not Started',overall:reviews.some(r=>r.internal_rating!=null)?'See subject/class reviews':'Not assessed'};
    }).filter(teacher=>(!state.filters.subject&&!state.filters.class&&!state.filters.grade&&!state.filters.status)||teacher.contexts.length>0||
      (state.filters.status==='Not Started'&&!state.filters.subject&&!state.filters.class&&!state.filters.grade&&!matchingContexts(teacher.id,false).length));
  }
  function select(label,key,items,all=true) {
    return `<label>${escape(label)}<select class="select" data-performance-filter="${escapeHtml(key)}">${all?'<option value="">All</option>':''}${items.map(([id,name])=>`<option value="${escape(id)}"${escapeHtml(state.filters[key]===String(id)?' selected':'')}>${escape(name)}</option>`).join('')}</select></label>`;
  }
  function filters() {
    const data={...state.data,teachers:state.data.teachers.filter(t=>state.includeInactive||(t.accountStatus||'Active')==='Active')};
    return `<section class="panel"><div class="form-grid">${select('Teacher','teacher',data.teachers.map(t=>[t.id,t.name]))}${select('Department','department',[...new Set(data.teachers.map(t=>t.department).filter(Boolean))].sort().map(v=>[v,v]))}${select('Grade','grade',[...new Set(data.classes.map(c=>c.grade))].sort().map(v=>[v,v]))}${select('Subject','subject',data.subjects.map(s=>[s.id,s.name]))}${select('Class','class',data.classes.map(c=>[c.id,c.class_ref]))}${select('Term','term',[1,2,3,4].map(t=>[t,'Term '+t]),false)}${select('Review status','status',statuses.map(v=>[v,v]))}<label>Academic year<input class="input" type="number" min="1900" max="2200" id="performanceYear" value="${escapeHtml(state.year)}"></label><label><input type="checkbox" data-view-control data-performance-inactive ${state.includeInactive?'checked':''}> Include inactive teachers</label></div></section>`;
  }
  function listing() {
    const rows=roster().map(teacher=>`<tr><td><b>${escape(teacher.name)}</b></td><td>${escape(employeeLabel(teacher))}</td><td>${escape(teacher.department||'Department not set')}</td><td>${escape([...new Set(teacher.assignmentContexts.map(c=>subject(c.subject_id)?.name))].filter(Boolean).join(', ')||'Not assigned')}</td><td>${escape([...new Set(teacher.assignmentContexts.map(c=>c.assignment_grade||schoolClass(c.class_id)?.grade))].filter(Boolean).join(', ')||'Not linked')}</td><td>${escape([...new Set(teacher.assignmentContexts.map(c=>schoolClass(c.class_id)?.class_ref))].filter(Boolean).join(', ')||'Not linked')}</td><td>Term ${escapeHtml(state.filters.term)}</td><td>${escape(teacher.latest)}</td><td>${escapeHtml(teacher.overall)}</td><td><button class="btn small" data-performance-open="${escapeHtml(teacher.id)}">Open teacher</button> <button class="btn small" data-performance-history="${escapeHtml(teacher.id)}">History</button> <button class="btn small" data-performance-staff="${escapeHtml(teacher.id)}">Staff details</button></td></tr>`);
    return `<section class="panel"><h3>Teacher term reviews · ${escapeHtml(state.year)}</h3>${table(['Teacher','Staff / employee ID','Department','Subjects taught','Grades taught','Classes taught','Current term','Latest review status','Overall performance status',''],rows)}</section>`;
  }
  const teacherContexts=()=>state.data.contexts.filter(c=>c.teacher_id===state.selected);
  const gradeKey=context=>String(schoolClass(context.class_id)?.grade_id||schoolClass(context.class_id)?.gradeId||context.assignment_grade||schoolClass(context.class_id)?.grade||'Unknown grade');
  const gradeLabel=context=>context.assignment_grade||schoolClass(context.class_id)?.grade||'Grade not captured';
  const employeeLabel=teacher=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(teacher.employeeId||'')?teacher.staffRef||'Staff ID not captured':teacher.employeeId||teacher.staffRef||'Staff ID not captured';
  function reviewContexts(){return state.reviewOpen?teacherContexts().filter(c=>c.id===state.selectedContext&&c.subject_id===state.selectedSubject&&gradeKey(c)===state.selectedGrade):[];}
  function breadcrumbs(teacher) {
    const context=teacherContexts().find(c=>c.id===state.selectedContext);
    const links=[['teachers','Teachers'],['teacher',teacher.name]];
    if(state.assignmentView)links.push(['assignments','Teaching assignments']);
    else {
      if(state.selectedSubject)links.push(['subject',subject(state.selectedSubject)?.name||'Subject']);
      if(state.selectedGrade)links.push(['grade',context?gradeLabel(context):gradeLabel(teacherContexts().find(c=>gradeKey(c)===state.selectedGrade)||{})]);
      if(context)links.push(['class',schoolClass(context.class_id)?.class_ref||'Class']);
      if(state.reviewOpen)links.push(['review','Term '+state.filters.term]);
    }
    return '<nav class="performance-breadcrumbs" aria-label="Teacher performance breadcrumb">'+links.map(([step,label],i)=>i===links.length-1?'<span aria-current="page">'+escape(label)+'</span>':'<button class="btn small" data-performance-step="'+step+'">'+escape(label)+'</button>').join('<span aria-hidden="true"> / </span>')+'</nav>';
  }
  function choice(label,description,attribute,value){return '<button class="performance-choice" '+attribute+'="'+escape(value)+'"><strong>'+escape(label)+'</strong><span>'+escape(description)+'</span><span class="text-link">Open &rarr;</span></button>';}
  function detail() {
    const teacher=state.data.teachers.find(t=>t.id===state.selected);
    if(!teacher)return '<button class="btn" data-performance-step="teachers">Back to teachers</button><section class="panel"><p>Teacher is unavailable.</p></section>';
    const contexts=teacherContexts();
    const header=breadcrumbs(teacher)+'<section class="panel"><h2>'+escape(teacher.name)+'</h2><p>'+escape(employeeLabel(teacher))+' &middot; '+escape(teacher.department||'Department not captured')+'</p><div class="performance-detail-actions"><label>Academic year<input class="input" id="performanceYear" type="number" min="1900" max="2200" value="'+state.year+'"></label><button class="btn small" data-performance-history="'+escape(teacher.id)+'">Performance history</button><button class="btn small" data-performance-staff="'+escape(teacher.id)+'">Staff details</button><button class="btn small" data-performance-assignments>Manage teaching assignments</button></div></section>';
    if(state.assignmentView)return header+(root.SchoolShieldTeacherAssignments?.managementCard(teacher)||'<section class="panel">Assignment management is unavailable.</section>');
    if(!state.selectedSubject){
      const subjects=[...new Set(contexts.map(c=>c.subject_id))];
      return header+'<section class="panel"><h3>Select a subject</h3><p>Open a subject to choose its grade, class and term.</p><div class="performance-choices">'+subjects.map(id=>choice(subject(id)?.name||'Subject not captured',contexts.filter(c=>c.subject_id===id).length+' class assignment(s)','data-performance-subject',id)).join('')+'</div>'+(subjects.length?'':'<p>No teaching assignments for '+state.year+'. Assign a subject and class to begin.</p><button class="btn primary" data-performance-assignments>Assign Subject &amp; Class</button>')+'</section>';
    }
    const scoped=contexts.filter(c=>c.subject_id===state.selectedSubject);
    if(!state.selectedGrade){
      const grades=[...new Map(scoped.map(c=>[gradeKey(c),gradeLabel(c)])).entries()];
      return header+'<section class="panel"><h3>Select a grade</h3><div class="performance-choices">'+grades.map(([id,label])=>choice(label,scoped.filter(c=>gradeKey(c)===id).length+' class assignment(s)','data-performance-grade',id)).join('')+'</div></section>';
    }
    const inGrade=scoped.filter(c=>gradeKey(c)===state.selectedGrade);
    if(!state.selectedContext)return header+'<section class="panel"><h3>Select a class</h3><div class="performance-choices">'+inGrade.map(c=>choice(schoolClass(c.class_id)?.class_ref||'Class',gradeLabel(c),'data-performance-context',c.id)).join('')+'</div></section>';
    const context=inGrade.find(c=>c.id===state.selectedContext);
    if(!context)return header+'<section class="panel"><p>This assignment is unavailable. Use the breadcrumb to choose another class.</p></section>';
    if(!state.reviewOpen)return header+'<section class="panel"><h3>Select a term</h3><div class="performance-choices">'+[1,2,3,4].map(term=>{
      const review=state.data.reviews.find(r=>r.teaching_context_id===context.id&&Number(r.term)===term);
      const eligible=!Array.isArray(context.eligibleTerms)||context.eligibleTerms.includes(term);
      return eligible?choice('Term '+term,review?.status||'Not Started','data-performance-term',term):'<div class="performance-choice unavailable"><strong>Term '+term+'</strong><span>No eligible assignment for this term. Check assignment and term dates in Manage teaching assignments.</span></div>';
    }).join('')+'</div></section>';
    return header+'<section class="panel"><h3>'+escape(subject(context.subject_id)?.name)+' &middot; '+escape(gradeLabel(context))+' / '+escape(schoolClass(context.class_id)?.class_ref)+' &middot; Term '+escape(state.filters.term)+'</h3><p>Academic evidence, targets, review and support below apply to this subject/class/term only.</p></section>'+(root.SchoolShieldTeacherMetrics?.render(context,state.filters.term)||'')+(root.SchoolShieldTeacherTargets?.render(context,state.filters.term)||'')+(root.SchoolShieldTeacherReviewWorkflow?.card(context,state.filters.term)||'')+(root.SchoolShieldMyPerformance?.supportCard(context,state.filters.term)||'');
  }
  function writeRoute(push=true){
    if(!/^https?:$/.test(root.location?.protocol||''))return;
    const url=new URL(root.location.href);
    for(const key of ['teacher','subject','grade','context','term','year','view'])url.searchParams.delete(key);
    if(state.selected){url.searchParams.set('teacher',state.selected);url.searchParams.set('year',state.year);if(state.selectedSubject)url.searchParams.set('subject',state.selectedSubject);if(state.selectedGrade)url.searchParams.set('grade',state.selectedGrade);if(state.selectedContext)url.searchParams.set('context',state.selectedContext);if(state.reviewOpen)url.searchParams.set('term',state.filters.term);if(state.assignmentView)url.searchParams.set('view','assignments');}
    root.history[push?'pushState':'replaceState']({},'',url);
  }
  function readRoute(){
    const p=new URLSearchParams(root.location?.search||'');
    state.selected=p.get('teacher');state.selectedSubject=p.get('subject');state.selectedGrade=p.get('grade');state.selectedContext=p.get('context');state.reviewOpen=/^[1-4]$/.test(p.get('term')||'');if(state.reviewOpen)state.filters.term=p.get('term');state.assignmentView=p.get('view')==='assignments';const year=Number(p.get('year'));if(Number.isInteger(year)&&year>=1900&&year<=2200)state.year=year;
  }
  function editStaffDetails(teacherId){
    const teacher=state.data.teachers.find(t=>t.id===teacherId);if(!allowed()||!teacher)return;
    modal('Teacher staff details','<form data-teacher-staff-form><p>'+escape(teacher.name)+'</p><div class="form-grid"><label>School staff reference<input class="input" readonly value="'+escape(teacher.staffRef||'Not linked')+'"></label><label>Employee / payroll ID (optional)<input class="input" name="employee" maxlength="50" value="'+escape(teacher.employeeId||'')+'"></label><label>Department<input class="input" name="department" required maxlength="120" value="'+escape(teacher.department||'')+'"></label></div><p role="status" data-teacher-staff-feedback></p><button class="btn primary" type="submit">Save staff details</button></form>');
    const form=document.querySelector('.modal-backdrop:last-child [data-teacher-staff-form]'),operation=crypto.randomUUID();let busy=false;
    form.onsubmit=async event=>{event.preventDefault();if(busy)return;const button=form.querySelector('[type="submit"]'),feedback=form.querySelector('[role="status"]');busy=true;button.disabled=true;feedback.textContent='Saving staff details...';
      try{const response=await root.schoolshieldSupabase.rpc('save_teacher_staff_details',{p_operation:operation,p_teacher:teacher.id,p_revision:teacher.staffRevision,p_department:form.elements.department.value.trim(),p_employee_id:form.elements.employee.value.trim()||null});if(response.error||!response.data)throw Error(response.error?.message||'The server did not confirm the save.');form.dataset.complete='true';form.closest('.modal-backdrop').remove();state.saveMessage='Staff details saved.';await load(false);}
      catch(error){feedback.textContent='Not saved: '+error.message+' Your entries are retained.';button.disabled=false;}
      finally{busy=false;}
    };
  }
  function canLeaveReview(){
    if(root.schoolshieldPendingDocumentRecord||root.schoolshieldDocumentCapture)return false;
    if(typeof workspaceHasUnsavedChanges==='function'&&workspaceHasUnsavedChanges()){
      if(!root.confirm('You have unsaved changes. Leave this draft?'))return false;
      document.querySelectorAll('.modal-backdrop').forEach(modal=>modal.remove());
      if(typeof resetWorkspaceDraftState==='function')resetWorkspaceDraftState();
      document.activeElement?.blur();
    }
    return true;
  }
  function navigate(change){
    if(!canLeaveReview())return false;
    Object.assign(state,change);writeRoute();render();root.scrollTo?.({top:0,behavior:'instant'});return true;
  }
  function step(level){
    const change={assignmentView:false,reviewOpen:false};
    if(level==='teachers')Object.assign(change,{selected:null,selectedSubject:null,selectedGrade:null,selectedContext:null});
    if(level==='teacher')Object.assign(change,{selectedSubject:null,selectedGrade:null,selectedContext:null});
    if(level==='subject')Object.assign(change,{selectedGrade:null,selectedContext:null});
    if(level==='grade')change.selectedContext=null;
    if(level==='review')change.reviewOpen=true;
    if(level==='assignments')change.assignmentView=true;
    navigate(change);
  }
  function view() {
    if(!allowed()) return generic('Teacher Performance','Access restricted','Only the Principal and Deputy Principal can manage teacher term reviews.','');
    if(!state.filters.term) state.filters.term=String(Number((typeof TERM==='string'?TERM:'Term 1').match(/[1-4]/)?.[0])||1);
    const notice='<p class="muted">Internal QMS-Aligned Review</p><p>This term review supports internal performance monitoring and does not replace the formal DBE/ELRC QMS appraisal process.</p>';
    return generic('Teacher Performance','Leadership workspace','Teacher → Subject → Grade → Class → Term',notice+
      `<p role="status" aria-live="polite" id="performanceSaveState">${escapeHtml(state.saving?'Saving…':state.saveMessage)}</p>`+
      (state.error?`<section class="panel" role="alert"><p>${escape(state.error)}</p><button class="btn" data-performance-retry>Retry loading</button></section>`:'')+
      (state.data?(state.selected?detail():filters()+(root.SchoolShieldTeacherDashboard?.render()||'')+listing()):(state.error?'':'<section class="panel"><p>Loading teacher term reviews...</p></section>')));
  }
  async function load(sync=true) {
    if(!allowed()||state.loading) return;
    state.loading=true;state.error='';document.querySelectorAll('[data-performance-retry]').forEach(button=>{button.disabled=true;button.textContent='Loading...';});
    const feedback=document.getElementById('performanceSaveState');if(feedback)feedback.textContent='Loading teacher records...';
    try {
      const client=root.schoolshieldSupabase;if(!client) throw new Error('Sign in and connect to load teacher reviews.');
      if(sync) {const response=await client.rpc('sync_teacher_review_catalogue');if(response.error) throw new Error(response.error.message);}
      const response=await client.rpc('get_teacher_performance_directory',{p_year:state.year});
      if(response.error||!response.data) throw new Error(response.error?.message||'Teacher reviews could not be loaded.');
      state.data=response.data;root.SchoolShieldTeacherDashboard?.invalidate();
    } catch(error) {state.error=error.message;}
    finally {state.loaded=true;state.loading=false;render();}
  }
  async function write(name,args) {
    if(!allowed()||state.saving) return;
    state.saving=true;state.error='';state.saveMessage='';render();
    try {
      const response=await root.schoolshieldSupabase.rpc(name,args);
      if(response.error||!response.data) throw new Error(response.error?.message||'The review change was not saved.');
      await load(false);
      state.saveMessage=state.error?'Saved; reload failed. Retry loading to see the latest review.':'Saved';
    } catch(error) {state.error='Not saved: '+error.message;}
    finally {state.saving=false;render();}
  }
  function bind() {
    if(!allowed()) return;
    if(!state.loaded&&!state.loading) {load();return;}
    if(state.selected&&state.data) root.SchoolShieldTeacherMetrics?.bind(reviewContexts(),state.filters.term);
    if(state.selected&&state.data) root.SchoolShieldTeacherTargets?.bind(reviewContexts(),state.filters.term);
    if(state.selected&&state.data) root.SchoolShieldTeacherReviewWorkflow?.bind(reviewContexts(),state.filters.term);
    if(state.selected&&state.data) root.SchoolShieldMyPerformance?.bindManagement(reviewContexts(),state.filters.term);
    if(state.data&&!state.selected) root.SchoolShieldTeacherDashboard?.bind();
    if(state.selected&&state.data) root.SchoolShieldTeacherAssignments?.bindManagement();
    if(state.saving) document.querySelectorAll('[data-performance-filter],#performanceYear,[data-review-status],#performanceSubject,#performanceClass').forEach(field=>field.disabled=true);
    document.querySelectorAll('[data-performance-filter]').forEach(field=>field.onchange=()=>{state.filters[field.dataset.performanceFilter]=field.value;render();});
    document.querySelectorAll('[data-performance-open]').forEach(button=>button.onclick=async()=>{if(!navigate({selected:button.dataset.performanceOpen,selectedSubject:null,selectedGrade:null,selectedContext:null,reviewOpen:false,assignmentView:false}))return;await load(true);});
    document.querySelectorAll('[data-performance-staff]').forEach(button=>button.onclick=()=>editStaffDetails(button.dataset.performanceStaff));
    document.querySelector('[data-performance-inactive]')?.addEventListener('change',event=>{state.includeInactive=event.target.checked;render();});
    document.querySelectorAll('[data-performance-step]').forEach(button=>button.onclick=()=>step(button.dataset.performanceStep));
    document.querySelectorAll('[data-performance-assignments]').forEach(button=>button.onclick=()=>navigate({assignmentView:true,reviewOpen:false}));
    document.querySelectorAll('[data-performance-subject]').forEach(button=>button.onclick=()=>navigate({selectedSubject:button.dataset.performanceSubject,selectedGrade:null,selectedContext:null,reviewOpen:false,assignmentView:false}));
    document.querySelectorAll('[data-performance-grade]').forEach(button=>button.onclick=()=>navigate({selectedGrade:button.dataset.performanceGrade,selectedContext:null,reviewOpen:false}));
    document.querySelectorAll('[data-performance-context]').forEach(button=>button.onclick=()=>navigate({selectedContext:button.dataset.performanceContext,reviewOpen:false}));
    document.querySelectorAll('[data-performance-term]').forEach(button=>button.onclick=()=>{if(navigate({reviewOpen:true,filters:{...state.filters,term:button.dataset.performanceTerm}}))return;});
    document.querySelector('[data-performance-retry]')?.addEventListener('click',()=>load());
    document.getElementById('performanceYear')?.addEventListener('change',event=>{const year=Number(event.target.value);if(Number.isInteger(year)&&year>=1900&&year<=2200){state.year=year;state.selectedSubject=null;state.selectedGrade=null;state.selectedContext=null;state.reviewOpen=false;writeRoute();load();}});

  }
  readRoute();root.addEventListener?.('popstate',()=>{if(!canLeaveReview()){writeRoute();return;}const year=state.year;readRoute();if(state.year!==year)load(false);else render();});
  root.SchoolShieldTeacherPerformance={view,bind,load,state,roster,matchingContexts};
})(window);
