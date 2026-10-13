/* Internal teacher term review management; academic evidence never determines a rating. */
(function(root) {
  const statuses=['Not Started','In Progress','Awaiting Teacher Acknowledgement','Completed'];
  const state={data:null,loading:false,loaded:false,error:'',saving:false,saveMessage:'',selected:null,year:new Date().getFullYear(),filters:{teacher:'',department:'',grade:'',subject:'',class:'',term:'',status:''}};
  const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const allowed=()=>['principal','deputy'].includes(role());
  const subject=id=>state.data.subjects.find(s=>s.id===id);
  const schoolClass=id=>state.data.classes.find(c=>c.id===id);
  const contextReview=context=>state.data.reviews.find(r=>r.teaching_context_id===context.id && r.term===Number(state.filters.term));
  function matchingContexts(teacherId,filterStatus=true) {
    return state.data.contexts.filter(context=>context.teacher_id===teacherId &&
      (!state.filters.subject||context.subject_id===state.filters.subject) &&
      (!state.filters.class||context.class_id===state.filters.class) &&
      (!state.filters.grade||schoolClass(context.class_id)?.grade===state.filters.grade) &&
      (!filterStatus||!state.filters.status||(contextReview(context)?.status||'Not Started')===state.filters.status));
  }
  function roster() {
    return state.data.teachers.filter(teacher=>(!state.filters.teacher||teacher.id===state.filters.teacher) &&
      (!state.filters.department||teacher.department===state.filters.department)).map(teacher=>{
      const contexts=matchingContexts(teacher.id), reviews=contexts.map(contextReview).filter(Boolean).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
      return {...teacher,contexts,latest:reviews[0]?.status||'Not Started',overall:'Not assessed'};
    }).filter(teacher=>(!state.filters.subject&&!state.filters.class&&!state.filters.grade&&!state.filters.status)||teacher.contexts.length>0||
      (state.filters.status==='Not Started'&&!state.filters.subject&&!state.filters.class&&!state.filters.grade&&!matchingContexts(teacher.id,false).length));
  }
  function select(label,key,items,all=true) {
    return `<label>${escape(label)}<select class="select" data-performance-filter="${key}">${all?'<option value="">All</option>':''}${items.map(([id,name])=>`<option value="${escape(id)}"${state.filters[key]===String(id)?' selected':''}>${escape(name)}</option>`).join('')}</select></label>`;
  }
  function filters() {
    const data=state.data;
    return `<section class="panel"><div class="form-grid">${select('Teacher','teacher',data.teachers.map(t=>[t.id,t.name]))}${select('Department','department',[...new Set(data.teachers.map(t=>t.department))].sort().map(v=>[v,v]))}${select('Grade','grade',[...new Set(data.classes.map(c=>c.grade))].sort().map(v=>[v,v]))}${select('Subject','subject',data.subjects.map(s=>[s.id,s.name]))}${select('Class','class',data.classes.map(c=>[c.id,c.class_ref]))}${select('Term','term',[1,2,3,4].map(t=>[t,'Term '+t]),false)}${select('Review status','status',statuses.map(v=>[v,v]))}<label>Academic year<input class="input" type="number" min="1900" max="2200" id="performanceYear" value="${state.year}"></label></div></section>`;
  }
  function listing() {
    const rows=roster().map(teacher=>`<tr><td><b>${escape(teacher.name)}</b></td><td>${escape(teacher.employeeId)}</td><td>${escape(teacher.department)}</td><td>${escape([...new Set(teacher.contexts.map(c=>subject(c.subject_id)?.name))].filter(Boolean).join(', ')||'Not linked')}</td><td>${escape([...new Set(teacher.contexts.map(c=>{const value=schoolClass(c.class_id);return value?value.grade+' / '+value.class_ref:'';}))].filter(Boolean).join(', ')||'Not linked')}</td><td>Term ${state.filters.term}</td><td>${escape(teacher.latest)}</td><td>${teacher.overall}</td><td><button class="btn small" data-performance-open="${teacher.id}">Open teacher</button> <button class="btn small" data-performance-history="${teacher.id}">History</button></td></tr>`);
    return `<section class="panel"><h3>Teacher term reviews · ${state.year}</h3>${table(['Teacher','Staff / employee ID','Department','Subjects taught','Grades / classes taught','Current term','Latest review status','Overall performance status',''],rows)}</section>`;
  }
  function detail() {
    const teacher=state.data.teachers.find(t=>t.id===state.selected);
    if(!teacher) return '<section class="panel"><p>Teacher is unavailable.</p></section>';
    const contexts=matchingContexts(teacher.id),groups=new Map();
    for(const context of contexts) {
      const subjectName=subject(context.subject_id)?.name||'Unknown subject',grade=schoolClass(context.class_id)?.grade||'Unknown grade';
      if(!groups.has(subjectName)) groups.set(subjectName,new Map());
      if(!groups.get(subjectName).has(grade)) groups.get(subjectName).set(grade,[]);
      groups.get(subjectName).get(grade).push(context);
    }
    const sections=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([subjectName,grades])=>`<section class="panel"><h3>${escape(subjectName)}</h3>${[...grades].sort(([a],[b])=>a.localeCompare(b)).map(([grade,items])=>`<h4>${escape(grade)}</h4>${table(['Class','Term','Review status','Overall performance status',''],items.map(context=>{
      const review=contextReview(context),status=review?.status||'Not Started';
      return `<tr><td>${escape(schoolClass(context.class_id)?.class_ref)}</td><td>Term ${state.filters.term}</td><td>${escape(status)}</td><td>${escape(root.SchoolShieldTeacherReviewWorkflow?.ratings[review?.internal_rating||0]||'Not assessed')}</td><td></td></tr>${root.SchoolShieldTeacherMetrics?`<tr><td colspan="5">${root.SchoolShieldTeacherMetrics.render(context,state.filters.term)}</td></tr>`:''}${root.SchoolShieldTeacherTargets?`<tr><td colspan="5">${root.SchoolShieldTeacherTargets.render(context,state.filters.term)}</td></tr>`:''}${root.SchoolShieldTeacherReviewWorkflow?`<tr><td colspan="5">${root.SchoolShieldTeacherReviewWorkflow.card(context,state.filters.term)}</td></tr>`:''}${root.SchoolShieldMyPerformance?`<tr><td colspan="5">${root.SchoolShieldMyPerformance.supportCard(context,state.filters.term)}</td></tr>`:''}`;
    }))}`).join('')}</section>`).join('');
    return `<button class="btn" data-performance-back>Back to teachers</button><section class="panel"><h3>${escape(teacher.name)}</h3><button class="btn small" data-performance-history="${teacher.id}">Performance history</button><p>${escape(teacher.employeeId)} · ${escape(teacher.department)} · ${state.year}</p><p class="muted">Each subject, grade, class and term has its own review. Academic evidence informs the review; it does not produce a combined teacher score.</p></section>${sections||'<section class="panel"><p>No teaching contexts match the selected filters. Link an existing subject and class below, or clear the filters.</p></section>'}<section class="panel"><h3>Link teaching context</h3><p class="muted">Choose the subject and class this teacher teaches in ${state.year}. Class-teacher assignment alone does not establish subjects taught.</p><div class="form-grid"><label>Subject<select class="select" id="performanceSubject"><option value="">Choose subject</option>${state.data.subjects.map(s=>`<option value="${s.id}">${escape(s.name)}</option>`).join('')}</select></label><label>Grade / class<select class="select" id="performanceClass"><option value="">Choose class</option>${state.data.classes.map(c=>`<option value="${c.id}">${escape(c.grade+' / '+c.class_ref)}</option>`).join('')}</select></label></div><button class="btn primary" data-performance-link${state.saving?' disabled aria-busy="true"':''}>${state.saving?'Saving...':'Link subject and class'}</button>${!state.data.subjects.length||!state.data.classes.length?'<p class="muted">Existing class and subject records must be available before linking a teaching context.</p>':''}</section>`;
  }
  function view() {
    if(!allowed()) return generic('Teacher Performance','Access restricted','Only the Principal and Deputy Principal can manage teacher term reviews.','');
    if(!state.filters.term) state.filters.term=String(Number((typeof TERM==='string'?TERM:'Term 1').match(/[1-4]/)?.[0])||1);
    const notice='<p class="muted">Internal QMS-Aligned Review</p><p>This term review supports internal performance monitoring and does not replace the formal DBE/ELRC QMS appraisal process.</p>';
    return generic('Teacher Performance','Leadership workspace','Teacher → Subject → Grade → Class → Term',notice+
      `<p role="status" aria-live="polite" id="performanceSaveState">${state.saving?'Saving…':escape(state.saveMessage)}</p>`+
      (state.error?`<section class="panel" role="alert"><p>${escape(state.error)}</p><button class="btn" data-performance-retry>Retry loading</button></section>`:'')+
      (state.data?filters()+(root.SchoolShieldTeacherDashboard?.render()||'')+(state.selected?detail():listing()):(state.error?'':'<section class="panel"><p>Loading teacher term reviews...</p></section>')));
  }
  async function load(sync=true) {
    if(!allowed()||state.loading) return;
    state.loading=true;state.error='';document.querySelectorAll('[data-performance-retry]').forEach(button=>{button.disabled=true;button.textContent='Loading...';});
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
    if(state.selected&&state.data) root.SchoolShieldTeacherMetrics?.bind(matchingContexts(state.selected),state.filters.term);
    if(state.selected&&state.data) root.SchoolShieldTeacherTargets?.bind(matchingContexts(state.selected),state.filters.term);
    if(state.selected&&state.data) root.SchoolShieldTeacherReviewWorkflow?.bind(matchingContexts(state.selected),state.filters.term);
    if(state.selected&&state.data) root.SchoolShieldMyPerformance?.bindManagement(matchingContexts(state.selected),state.filters.term);
    if(state.data) root.SchoolShieldTeacherDashboard?.bind();
    if(state.saving) document.querySelectorAll('[data-performance-filter],#performanceYear,[data-review-status],#performanceSubject,#performanceClass').forEach(field=>field.disabled=true);
    document.querySelectorAll('[data-performance-filter]').forEach(field=>field.onchange=()=>{state.filters[field.dataset.performanceFilter]=field.value;render();});
    document.querySelectorAll('[data-performance-open]').forEach(button=>button.onclick=()=>{state.selected=button.dataset.performanceOpen;render();});
    document.querySelector('[data-performance-back]')?.addEventListener('click',()=>{state.selected=null;render();});
    document.querySelector('[data-performance-retry]')?.addEventListener('click',()=>load());
    document.getElementById('performanceYear')?.addEventListener('change',event=>{const year=Number(event.target.value);if(Number.isInteger(year)&&year>=1900&&year<=2200){state.year=year;load();}});
    document.querySelector('[data-performance-link]')?.addEventListener('click',()=>{
      const selectedSubject=document.getElementById('performanceSubject').value,selectedClass=document.getElementById('performanceClass').value;
      if(!selectedSubject||!selectedClass) {state.error='Choose an existing subject and class.';render();return;}
      write('link_teacher_review_context',{p_teacher:state.selected,p_subject:selectedSubject,p_class:selectedClass,p_year:state.year});
    });
  }
  root.SchoolShieldTeacherPerformance={view,bind,load,state,roster,matchingContexts};
})(window);
