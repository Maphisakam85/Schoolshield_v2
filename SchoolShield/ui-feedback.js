(function () {
  let pending = 0, timer;
  window.schoolshieldPersistenceFeedback = (state) => {
    let notice = document.getElementById('persistenceFeedback');
    if (!notice) {
      notice = document.createElement('div'); notice.id = 'persistenceFeedback';
      notice.className = 'persistence-feedback'; notice.setAttribute('role','status');
      notice.setAttribute('aria-live','polite'); document.body.appendChild(notice);
    }
    clearTimeout(timer); notice.hidden = false; notice.dataset.state = state;
    notice.textContent = ({saving:'Saving changes…',saved:'Saved successfully',failed:'Save failed. Check the form and retry.',offline:'Offline — changes have not been confirmed.'})[state] || state;
    if (state === 'saved') timer = setTimeout(()=>{notice.hidden=true;},5000);
  };
  window.schoolshieldTrackPersistence = async operation => {
    pending++; window.schoolshieldPersistenceFeedback(navigator.onLine ? 'saving':'offline');
    try {
      const result = await operation(); pending--;
      window.schoolshieldPersistenceFeedback(result?.error ? 'failed' : pending ? 'saving':'saved');
      return result;
    } catch (error) { pending--; window.schoolshieldPersistenceFeedback(navigator.onLine ? 'failed':'offline'); throw error; }
  };
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if(!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target || link.download)return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin || !url.pathname.endsWith('.html') || url.href===location.href)return;
    let loading=document.getElementById('navigationLoading');
    if(!loading){loading=document.createElement('div');loading.id='navigationLoading';loading.className='page-loading';loading.setAttribute('role','status');loading.innerHTML='<span class="loading-spinner" aria-hidden="true"></span><p>Loading page…</p>';document.body.appendChild(loading);}
    loading.hidden=false;
    setTimeout(()=>{loading.hidden=true;},10000);
  });
  window.addEventListener('pageshow',()=>document.getElementById('navigationLoading')?.remove());
})();
