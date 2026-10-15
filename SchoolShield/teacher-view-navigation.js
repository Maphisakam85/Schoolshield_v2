(function(root) {
  const pages=['teacher-targets','my-performance'];
  const links=['teacher-targets.html','my-performance.html'];
  function tabs() {
    if(role()!=='teacher') return '';
    const current=document.body.dataset.page;
    return `<nav class="teacher-view-tabs" aria-label="My teacher performance views"><a href="${links[0]}" data-teacher-view="0"${current===pages[0]?' aria-current="page"':''}>Targets</a><a href="${links[1]}" data-teacher-view="1"${current===pages[1]?' aria-current="page"':''}>Performance</a></nav><p class="teacher-view-hint">Choose a tab or swipe left/right to switch views.</p><p role="status" aria-live="polite" data-teacher-view-feedback></p>`;
  }
  function bind() {
    if(role()!=='teacher'||!pages.includes(document.body.dataset.page)) return;
    function navigate(index) {
      if(index<0||index>1||pages[index]===document.body.dataset.page) return;
      if(document.querySelector('[data-teacher-ack] button[aria-busy="true"]')) {
        const status=document.querySelector('[data-teacher-view-feedback]');if(status) status.textContent='Please wait while your acknowledgement is saving.';return;
      }
      const response=[...document.querySelectorAll('[data-teacher-response]')].some(field=>!field.disabled&&field.value.trim());
      if(response) {const status=document.querySelector('[data-teacher-view-feedback]');if(status) status.textContent='Your response is not saved. Acknowledge receipt to save it, or clear the response before switching views.';return;}
      root.location.assign(links[index]);
    }
    document.querySelectorAll('[data-teacher-view]').forEach(link=>link.onclick=event=>{event.preventDefault();navigate(Number(link.dataset.teacherView));});
    if(document.body.dataset.teacherSwipeBound) return;
    document.body.dataset.teacherSwipeBound='true';let start=null;
    document.addEventListener('touchstart',event=>{
      start=null;if(event.touches.length!==1||event.target.closest('input,textarea,select,button,a,.table-wrap,.modal-backdrop')) return;
      const touch=event.touches[0];if(touch.clientX<24||touch.clientX>root.innerWidth-24) return;
      start={x:touch.clientX,y:touch.clientY,time:Date.now()};
    },{passive:true});
    document.addEventListener('touchend',event=>{
      if(!start||event.changedTouches.length!==1) {start=null;return;}
      const touch=event.changedTouches[0],dx=touch.clientX-start.x,dy=touch.clientY-start.y,duration=Date.now()-start.time;start=null;
      if(duration>900||Math.abs(dx)<80||Math.abs(dx)<Math.abs(dy)*1.8) return;
      navigate(pages.indexOf(document.body.dataset.page)+(dx<0?1:-1));
    },{passive:true});
    document.addEventListener('touchcancel',()=>{start=null;},{passive:true});
  }
  root.SchoolShieldTeacherViews={tabs,bind};
})(window);
