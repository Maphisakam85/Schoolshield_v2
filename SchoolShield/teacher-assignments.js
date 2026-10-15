(function(root) {
 const escape=value=>escapeHtml(value);
 const own=new Map(),loading=new Set(),errors=new Map();
 const manager=()=>['principal','deputy'].includes(role());
 const source=()=>root.SchoolShieldTeacherPerformance.state;
 function assignmentRows(items,editable=false) {
  return table(['Subject','Grade','Class','Academic year','Start date','End date','Status',...(editable?['']:[])],items.map(a=>`<tr><td>${escape(a.subject)}</td><td>${escape(a.grade||a.assignment_grade)}</td><td>${escape(a.class)}</td><td>${escapeHtml(a.academic_year)}</td><td>${escape(a.start_date||'Not recorded (legacy)')}</td><td>${escape(a.end_date||'Not set')}</td><td>${escape(a.status)}</td>${editable?`<td><button class="btn small" data-assignment-end="${escapeHtml(a.id)}">End / change end date</button></td>`:''}</tr>`));
 }
 function managementCard(teacher) {
  if(!manager()) return '';
  const state=source(),assignments=state.data.contexts.filter(c=>c.teacher_id===teacher.id);
  return `<section class="panel"><h3>Teaching assignments</h3>${assignments.length?assignmentRows(assignments,true):'<p><b>No teaching assignments found for this teacher.</b></p>'}<button class="btn primary" data-assignment-new="${escapeHtml(teacher.id)}">Assign Subject &amp; Class</button><p>Existing approved subject/class links are reused automatically. Class-teacher approvals without a subject need confirmation; no subjects are inferred from a class-teacher name.</p>${state.data.unmappedClassApprovals?`<p>${escapeHtml(state.data.unmappedClassApprovals)} approved class-only record(s) in this school have no recorded subject.</p>`:''}${state.data.unmappedSubjectApprovals?`<p role="alert">${escapeHtml(state.data.unmappedSubjectApprovals)} explicit approved record(s) could not be imported. Confirm their teacher, class, year, dates and any overlapping assignments.</p>`:''}<p>Changes end a dated assignment; existing links, reviews and other teachers are retained. New overlapping co-teaching is blocked because no existing co-teaching permission was found.</p></section><section class="panel"><h3>Review term dates</h3><p>Set the school's actual dates so dated assignments appear in the correct terms. No term dates are guessed.</p>${(state.data.termPeriods||[]).map(t=>`<p>Term ${escapeHtml(t.term)}: ${escape(t.start_date)} — ${escape(t.end_date)}</p>`).join('')||'<p>Term dates have not been configured for this academic year.</p>'}<button class="btn" data-assignment-term-dates>Set selected term dates</button></section>`;
 }
 function openAssignment(teacherId) {
  const state=source(),data=state.data;
  modal('Assign Subject & Class',`<form data-assignment-form><div class="form-grid"><label>Academic year<input class="input" name="year" type="number" min="1900" max="2200" required value="${escapeHtml(state.year)}"></label><label>Teacher<select class="select" name="teacher" required>${data.teachers.map(t=>`<option value="${escapeHtml(t.id)}"${escapeHtml(t.id===teacherId?' selected':'')}>${escape(t.name)}</option>`).join('')}</select></label><label>Grade<select class="select" name="grade" required><option value="">Choose grade</option>${[...new Set(data.classes.map(c=>c.grade))].sort().map(g=>`<option>${escape(g)}</option>`).join('')}</select></label><label>Class<select class="select" name="class" required><option value="">Choose grade first</option></select></label><label>Subject<select class="select" name="subject" required><option value="">Choose class first</option></select></label><label>Start date<input class="input" name="start" type="date" required></label><label>End date (optional)<input class="input" name="end" type="date"></label><label>Notes (optional)<textarea class="textarea" name="notes" maxlength="4000"></textarea></label></div><p>Only subjects valid for the selected class/grade are offered. Existing assignments are not overwritten.</p><p role="status" data-assignment-feedback></p><button class="btn primary" type="submit">Save assignment & notify teacher</button></form>`);
  const form=document.querySelector('.modal-backdrop:last-child [data-assignment-form]'),field=name=>form.elements.namedItem(name);let busy=false;
  field('grade').onchange=()=>{
   field('class').innerHTML='<option value="">Choose class</option>'+data.classes.filter(c=>c.grade===field('grade').value).map(c=>`<option value="${escapeHtml(c.id)}">${escape(c.class_ref)}</option>`).join('');
   field('subject').innerHTML='<option value="">Choose class first</option>';
  };
  field('class').onchange=()=>{
   const valid=new Set((data.classSubjects||[]).filter(c=>c.class_id===field('class').value).map(c=>c.subject_id));
   field('subject').innerHTML='<option value="">Choose subject</option>'+data.subjects.filter(s=>valid.has(s.id)).map(s=>`<option value="${escapeHtml(s.id)}">${escape(s.name)}</option>`).join('');
   form.querySelector('[role="status"]').textContent=valid.size?'':'No existing subject choices are recorded for this class. Confirm the class subject catalogue before assigning.';
  };
  form.onsubmit=async event=>{
   event.preventDefault();if(busy) return;
   const status=form.querySelector('[role="status"]'),year=Number(field('year').value);
   const args={p_teacher:field('teacher').value,p_subject:field('subject').value,p_class:field('class').value,p_year:year,p_start:field('start').value,p_end:field('end').value||null,p_notes:field('notes').value};
   if(!args.p_teacher||!args.p_subject||!args.p_class||!args.p_start||args.p_end&&args.p_end<args.p_start||!args.p_start.startsWith(year+'-')||args.p_end&&!args.p_end.startsWith(year+'-')) {status.textContent='Choose a teacher, valid subject/class and dates within the academic year.';return;}
   const finish=root.schoolshieldButtonBusy?.(event.submitter,'Saving...');busy=true;form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);status.textContent='Saving assignment and teacher notification…';let confirmed=false;
   try {
    const response=await root.schoolshieldSupabase.rpc('assign_teacher_subject_class',args);if(response.error||!response.data) throw new Error(response.error?.message||'Assignment was not saved.');
    confirmed=true;state.year=year;state.selected=args.p_teacher;if(state.filters.teacher) state.filters.teacher=args.p_teacher;await root.SchoolShieldTeacherPerformance.load(false);status.textContent=state.error?'Assignment and teacher notification saved; reload failed. Retry loading.':'Assignment saved. The teacher has been notified.';
   } catch(error) {status.textContent='Not saved: '+error.message;form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=false);}
   finally {busy=false;finish?.(confirmed?'Saved':undefined,confirmed);}
  };
 }
 function endAssignment(assignment) {
  modal('End teaching assignment',`<p>${escape(assignment.subject)} · ${escape(assignment.grade)} / ${escape(assignment.class)}. Previous reviews remain unchanged.</p><form data-assignment-end-form><label>Last teaching date<input class="input" type="date" name="end" required value="${escape(assignment.end_date||'')}"></label><label>Reason<textarea class="textarea" name="reason" required minlength="5" maxlength="4000"></textarea></label><p role="status"></p><button class="btn primary" type="submit">Save end date</button></form>`);
  const form=document.querySelector('.modal-backdrop:last-child [data-assignment-end-form]');let busy=false;
  form.onsubmit=async event=>{
   event.preventDefault();if(busy) return;const status=form.querySelector('[role="status"]'),end=form.elements.namedItem('end').value,reason=form.elements.namedItem('reason').value;
   if(!end||reason.trim().length<5) {status.textContent='Provide an end date and a reason of at least 5 characters.';return;}
   const finish=root.schoolshieldButtonBusy?.(event.submitter,'Saving...');busy=true;status.textContent='Saving…';let confirmed=false;
   try {const response=await root.schoolshieldSupabase.rpc('end_teacher_assignment',{p_assignment:assignment.id,p_end:end,p_expected_revision:assignment.revision,p_reason:reason});if(response.error) throw new Error(response.error.message);confirmed=true;await root.SchoolShieldTeacherPerformance.load(false);status.textContent='End date saved. Historical reviews and the previous assignment value are retained.';form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);}
   catch(error) {status.textContent='Not saved: '+error.message;}
   finally {busy=false;finish?.(confirmed?'Saved':undefined,confirmed);}
  };
 }
 function termDates() {
  const state=source(),term=Number(state.filters.term),saved=state.data.termPeriods?.find(t=>t.term===term);
  modal('Set review term dates',`<p>Enter the actual school dates for Term ${escapeHtml(term)}, ${escapeHtml(state.year)}. Changing dates does not rewrite a saved review's assignment snapshot.</p><form data-assignment-term-form><label>Term start<input class="input" type="date" required name="start" value="${escape(saved?.start_date||'')}"></label><label>Term end<input class="input" type="date" required name="end" value="${escape(saved?.end_date||'')}"></label><p role="status"></p><button class="btn primary" type="submit">Save term dates</button></form>`);
  const form=document.querySelector('.modal-backdrop:last-child [data-assignment-term-form]');let busy=false;
  form.onsubmit=async event=>{event.preventDefault();if(busy) return;busy=true;const finish=root.schoolshieldButtonBusy?.(event.submitter,'Saving...'),status=form.querySelector('[role="status"]');let confirmed=false;
   try {const response=await root.schoolshieldSupabase.rpc('set_teacher_review_term_dates',{p_year:state.year,p_term:term,p_start:form.elements.namedItem('start').value,p_end:form.elements.namedItem('end').value});if(response.error) throw new Error(response.error.message);confirmed=true;await root.SchoolShieldTeacherPerformance.load(false);status.textContent='Term dates saved.';}
   catch(error) {status.textContent='Not saved: '+error.message;}finally{busy=false;finish?.(confirmed?'Saved':undefined,confirmed);}
  };
 }
 function bindManagement() {
  if(!manager()) return;
  document.querySelectorAll('[data-assignment-new]').forEach(button=>button.onclick=()=>openAssignment(button.dataset.assignmentNew));
  document.querySelectorAll('[data-assignment-end]').forEach(button=>button.onclick=()=>endAssignment(source().data.contexts.find(c=>c.id===button.dataset.assignmentEnd)));
  document.querySelector('[data-assignment-term-dates]')?.addEventListener('click',termDates);
 }
 function ownCard(year) {
  if(role()!=='teacher') return '';
  const items=own.get(year);
  const current=items?.filter(a=>a.status!=='Ended'),ended=items?.filter(a=>a.status==='Ended');
  return `<section class="panel" id="myTeachingAssignments"><h3>My Teaching Assignments · ${escapeHtml(year)}</h3>${errors.has(year)?`<p role="alert">${escape(errors.get(year))}</p>`:''}${items?items.length?`<h4>Current / upcoming assignments</h4>${current.length?assignmentRows(current):'<p>No current teaching assignments for this year.</p>'}${ended.length?`<details><summary>Previous teaching assignments</summary>${assignmentRows(ended)}</details>`:''}`:'<p>No teaching assignments found for this teacher. Ask the Principal or Deputy to confirm your subject/class assignments.</p>':errors.has(year)?'':'<p>Loading teaching assignments…</p>'}<button class="btn" data-my-assignments-refresh${escapeHtml(loading.has(year)?' disabled aria-busy="true"':'')}>${escapeHtml(loading.has(year)?'Loading...':'Refresh teaching assignments')}</button><p>Assignments are read-only. Dates and status are approved by school leadership.</p></section>`;
 }
 async function loadOwn(year) {
  if(role()!=='teacher'||loading.has(year)) return;loading.add(year);errors.delete(year);
  const panel=document.getElementById('myTeachingAssignments');if(panel) panel.outerHTML=ownCard(year);
  try {const response=await root.schoolshieldSupabase.rpc('get_teacher_assignments',{p_year:year});if(response.error||!Array.isArray(response.data)) throw new Error(response.error?.message||'Assignments could not be loaded.');own.set(year,response.data);}
  catch(error) {errors.set(year,error.message);}finally {loading.delete(year);const panel=document.getElementById('myTeachingAssignments');if(panel) {panel.outerHTML=ownCard(year);bindOwn(year);}}
 }
 function bindOwn(year) {if(role()!=='teacher') return;if(!own.has(year)&&!errors.has(year)&&!loading.has(year)) loadOwn(year);document.querySelector('[data-my-assignments-refresh]')?.addEventListener('click',()=>loadOwn(year));}
 root.SchoolShieldTeacherAssignments={managementCard,bindManagement,ownCard,bindOwn,loadOwn};
})(window);
