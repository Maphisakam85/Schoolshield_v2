(function(root) {
 const escape=value=>escapeHtml(value);
 const cache=new Map(),pending=new Set(),errors=new Map();let generation=0;
 const manager=()=>['principal','deputy'].includes(role());
 const scope=()=>{const state=root.SchoolShieldTeacherPerformance.state;return {p_year:state.year,p_term:Number(state.filters.term),p_filters:Object.fromEntries(['department','subject','grade','class','teacher'].map(k=>[k,state.filters[k]||'']))};};
 const key=()=>JSON.stringify(scope());
 const completed=r=>['Awaiting Teacher Acknowledgement','Completed'].includes(r?.status);
 const achieved=t=>['Target Achieved','Target Exceeded','Completed'].includes(t.status);
 function summaries(data) {
  const targets=data.contexts.flatMap(c=>c.targets),support=new Set(),track=new Set();
  for(const teacher of data.teachers) {
   const contexts=data.contexts.filter(c=>c.teacherId===teacher.id),goals=contexts.flatMap(c=>c.targets);
   if(contexts.some(c=>c.supportActions.some(a=>['Planned','In Progress'].includes(a.status))||c.review?.internal_rating===1||String(c.review?.review_content?.concerns||'').trim()||String(c.review?.review_content?.recommendedSupport||'').trim()||c.targets.some(t=>['Below Target','Not Achieved'].includes(t.status)))) support.add(teacher.id);
   if(!support.has(teacher.id)&&goals.length&&goals.every(t=>achieved(t)||t.status==='Near Target')) track.add(teacher.id);
  }
  return {teachers:data.teachers.length,completed:data.contexts.filter(c=>completed(c.review)).length,outstanding:data.contexts.filter(c=>!completed(c.review)).length,onTrack:track.size,support:support.size,
   unassigned:data.teachers.filter(t=>!data.contexts.some(c=>c.teacherId===t.id)).length,targets:targets.length,achieved:targets.filter(achieved).length,near:targets.filter(t=>t.status==='Near Target').length,below:targets.filter(t=>['Below Target','Not Achieved'].includes(t.status)).length,unmeasured:targets.filter(t=>['Not Yet Measured','Not Started','In Progress'].includes(t.status)).length};
 }
 const value=(number,suffix='')=>number==null?'Not enough data':Number(number).toLocaleString('en-ZA',{maximumFractionDigits:2})+suffix;
 function render() {
  if(!manager()) return '';
  const id=key(),data=cache.get(id);
  if(!data) return `<section class="panel"><h3>Teacher Performance summary</h3><p>${escape(errors.get(id)||'Loading confidential performance summary…')}</p>${errors.has(id)?'<button class="btn" data-performance-summary-refresh>Retry summary</button>':''}</section>`;
  const counts=summaries(data),names=new Map(data.teachers.map(t=>[t.id,t.name]));
  return `<section class="panel"><h3>Teacher Performance summary · Term ${escapeHtml(scope().p_term)}</h3><p><b>Confidential personnel information.</b> Access is limited to authorised school leadership and each teacher's own view. No teacher rankings or league tables.</p><div class="detail-grid">${[['Total teachers',counts.teachers],['Reviews completed',counts.completed],['Reviews outstanding',counts.outstanding],['Teachers on track',counts.onTrack],['Teachers requiring support',counts.support],['Total active targets',counts.targets],['Achieved',counts.achieved],['Near target',counts.near],['Below target',counts.below],['Not yet measured / in progress',counts.unmeasured]].map(([label,count])=>`<div><small>${escapeHtml(label)}</small><b>${escapeHtml(count)}</b></div>`).join('')}</div><p class="muted">Reviews are counted separately per subject/class for the selected year and term. Reviewer-completed reviews include those awaiting teacher acknowledgement. ${escapeHtml(counts.unassigned)} teacher(s) have no linked subject/class. Target totals include all management-set targets for this period, including achieved targets.</p><p class="muted">On track means all recorded targets are achieved or near target and no support flag is present. Support flags reflect open support actions, recorded concerns/recommended support, an internal rating of 1, or below/not-achieved targets. Missing targets are not treated as success. These indicators do not rank teachers or infer ratings from marks.</p><button class="btn small" data-performance-summary-refresh${escapeHtml(pending.has(id)?' disabled aria-busy="true"':'')}>${escapeHtml(pending.has(id)?'Refreshing...':'Refresh summary')}</button><h4>Academic evidence by subject/class</h4><p>Department, subject, grade, class and teacher filters above apply to this summary. Review-status filtering applies to the directory below.</p>${data.contexts.length?table(['Teacher','Subject','Grade / class','Baseline','Current','Improvement','Pass rate','Review'],data.contexts.map(c=>`<tr><td>${escape(names.get(c.teacherId))}</td><td>${escape(c.subject)}</td><td>${escape(c.grade+' / '+c.class)}</td><td>${escape(value(c.metrics?.baseline_average,'%'))}</td><td>${escape(value(c.metrics?.current_average,'%'))}</td><td>${escape(value(c.metrics?.improvement_percentage_points,' percentage points'))}</td><td>${escape(value(c.metrics?.pass_rate,'%'))}</td><td>${escape(c.review?.status||'Not Started')}</td></tr>`)):'<p>Not enough data for this filter selection.</p>'}</section>`;
 }
 async function load(force=false) {
  if(!manager()) return;const id=key(),args=scope();if(pending.has(id)||!force&&cache.has(id)) return;
  pending.add(id);errors.delete(id);const requestGeneration=generation;root.render();
  try {const response=await root.schoolshieldSupabase.rpc('get_teacher_performance_overview',args);if(response.error||!response.data) throw new Error(response.error?.message||'Summary unavailable');if(requestGeneration===generation) cache.set(id,response.data);}
  catch(error) {errors.set(id,error.message);}
  finally {pending.delete(id);root.render();}
 }
 function termContext(context) {
  const r=context.review,m=context.metrics||{},targets=root.SchoolShieldTeacherTargets;
  const content=r?.review_content||{};
  return `<section class="panel"><h4>${escape(context.subject)} → ${escape(context.grade)} / ${escape(context.class)}</h4><p>Baseline ${escape(value(m.baseline_average,'%'))} · Current ${escape(value(m.current_average,'%'))} · Improvement ${escape(value(m.improvement_percentage_points,' percentage points'))} · Pass rate ${escape(value(m.pass_rate,'%'))}</p><p>Curriculum coverage: ${escape(value(m.curriculum_coverage,'%'))} · Assessments: ${escape(value(m.assessments_completed))} completed / ${escape(value(m.assessments_planned))} planned</p><h4>Targets / actual results / margins</h4>${context.targets.length?table(['Target','Actual result','Margin','Status'],context.targets.map(t=>`<tr><td>${escape(t.description)}<p>${escape(targets.format(t.target_value,t.measurement_type))}</p></td><td>${escape(targets.numeric(t.measurement_type)?targets.format(t.actual_value,t.measurement_type):t.actual_text||'Not Yet Measured')}</td><td>${escape(targets.margin(t))}</td><td>${escape(t.status)}</td></tr>`)):'<p>No targets recorded.</p>'}<p>Review result: ${escape(r?.status||'Not Started')} · ${escape(root.SchoolShieldTeacherReviewWorkflow.ratings[r?.internal_rating||0])}</p>${(content.areas||[]).map(a=>`<h4>${escape(a.area)}</h4><p>${escape(a.comment)}</p><p>Evidence: ${escape(a.evidence||'Not recorded')}</p>`).join('')}${[['strengths','Strengths'],['concerns','Concerns'],['recommendedSupport','Recommended support'],['nextTermFocus','Next-term focus']].map(([key,label])=>`<p><b>${escapeHtml(label)}:</b> ${escape(content[key]||'Not recorded')}</p>`).join('')}<p><b>Contextual factors:</b> ${escape((content.contextualFactors||[]).join(', ')||'None recorded')} · ${escape(content.contextNotes||'')}</p><p><b>Teacher acknowledgement:</b> ${escapeHtml(r?.teacher_acknowledged_at?new Date(r.teacher_acknowledged_at).toLocaleString():'Not acknowledged')} — Receipt does not mean agreement.</p><p><b>Teacher response:</b> ${escape(r?.teacher_comment||'None recorded')}</p><h4>Support actions</h4>${context.supportActions.map(a=>`<p>${escape(a.support_area)} · ${escape(a.intervention)} · ${escape(a.status)} · ${escape(a.outcome||'No outcome recorded')}</p>`).join('')||'<p>None recorded.</p>'}</section>`;
 }
 async function history(teacherId,year=root.SchoolShieldTeacherPerformance.state.year) {
  if(!manager()) return;
  modal('Teacher Performance History','<p>Loading confidential history…</p>');
  const backdrop=document.querySelector('.modal-backdrop:last-child'),body=backdrop.querySelector('.modal-body');
  try {
   const response=await root.schoolshieldSupabase.rpc('get_teacher_performance_history',{p_teacher:teacherId,p_year:Number(year)});
   if(response.error||!response.data) throw new Error(response.error?.message||'History unavailable');
   const data=response.data;if(!backdrop.isConnected) return;
   body.innerHTML=`<p><b>Confidential personnel information</b> · ${escape(data.teacher.display_name)}</p><label>Academic year<select class="select" data-history-year>${[...new Set([Number(year),...data.years])].sort((a,b)=>b-a).map(y=>`<option${escapeHtml(y===Number(year)?' selected':'')}>${escapeHtml(y)}</option>`).join('')}</select></label>${data.terms.map(t=>`<details open><summary>Term ${escapeHtml(t.term)}</summary>${escapeHtml(t.contexts.map(termContext).join(''))||'<p>Not enough data — no subjects/classes recorded for this year.</p>'}</details>`).join('')}<h4>Audit trail</h4><p>Events record authenticated actor, server time and previous/new values. Earlier review versions remain available below.</p>${data.events.map(e=>`<details><summary>${escape(e.event)} · Term ${escapeHtml(e.term)} · ${escape(new Date(e.changed_at).toLocaleString())}</summary><p>Changed by: ${escape(e.changed_by)}</p><p>Previous value</p><pre>${escape(JSON.stringify(e.previous_value,null,2))}</pre><p>New value</p><pre>${escape(JSON.stringify(e.new_value,null,2))}</pre></details>`).join('')||'<p>No event entries recorded for this year.</p>'}<h4>Review versions and amendment reasons</h4>${data.reviewHistory.map(h=>`<details><summary>${escape(h.action)} · ${escape(h.reason)} · ${escape(new Date(h.changed_at).toLocaleString())}</summary><p>Changed by: ${escape(h.changed_by)}</p><pre>${escape(JSON.stringify({previous:h.previous_value,current:h.new_value},null,2))}</pre></details>`).join('')||'<p>No saved review versions.</p>'}`;
   body.querySelector('[data-history-year]').onchange=event=>{backdrop.remove();history(teacherId,Number(event.target.value));};
  } catch(error) {if(backdrop.isConnected) body.innerHTML=`<p role="alert">${escape(error.message)}</p>`;}
 }
 function bind() {
  if(!manager()) return;
  if(!cache.has(key())&&!pending.has(key())&&!errors.has(key())) load();
  document.querySelector('[data-performance-summary-refresh]')?.addEventListener('click',()=>load(true));
  document.querySelectorAll('[data-performance-history]').forEach(button=>button.onclick=async()=>{const finish=root.schoolshieldButtonBusy?.(button,'Loading...');try{await history(button.dataset.performanceHistory);}finally{finish?.();}});
 }
 const home={data:null,pending:false,error:''};
 function renderHome() {
  if(!manager()) return '';
  const counts=home.data?summaries(home.data):null;
  return `<section class="panel"><h3>Teacher Performance</h3><p>Confidential personnel information · ${escapeHtml(typeof TERM==='string'?TERM:'Current term')} · ${escapeHtml(new Date().getFullYear())}</p>${counts?`<div class="detail-grid">${[['Total teachers',counts.teachers],['Reviews completed',counts.completed],['Reviews outstanding',counts.outstanding],['Teachers on track',counts.onTrack],['Teachers requiring support',counts.support],['Total active targets',counts.targets],['Achieved',counts.achieved],['Near target',counts.near],['Below target',counts.below]].map(([label,value])=>`<div><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join('')}</div><p class="muted">Reviews count subject/class records. Target totals cover this term, including achieved targets. Status indicators reflect targets and recorded support, not a ranking from learner marks.</p>`:`<p role="status">${escape(home.error||'Loading performance summary…')}</p>`}<a class="btn" href="teacher-performance.html">Open Teacher Performance / filters / history</a>${home.error?'<button class="btn" data-home-performance-retry>Retry summary</button>':''}</section>`;
 }
 async function loadHome() {
  if(!manager()||home.pending) return;home.pending=true;home.error='';root.render();
  try {const response=await root.schoolshieldSupabase.rpc('get_teacher_performance_overview',{p_year:new Date().getFullYear(),p_term:Number((typeof TERM==='string'?TERM:'Term 1').match(/[1-4]/)?.[0])||1,p_filters:{}});if(response.error||!response.data) throw new Error(response.error?.message||'Performance summary unavailable');home.data=response.data;}
  catch(error) {home.error=error.message;}finally{home.pending=false;root.render();}
 }
 function bindHome() {if(!manager()) return;if(!home.data&&!home.error&&!home.pending) loadHome();document.querySelector('[data-home-performance-retry]')?.addEventListener('click',loadHome);}
 root.SchoolShieldTeacherDashboard={render,bind,renderHome,bindHome,history,summaries,invalidate:()=>{generation++;cache.clear();errors.clear();}};
})(window);
