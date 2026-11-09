/* Mark existing required fields and reject whitespace without making optional fields mandatory. */
(() => {
 function mark(root){
  for(const field of root.querySelectorAll('input[required],select[required],textarea[required]')){
   const label=field.closest('label')||(field.id&&document.querySelector('label[for="'+CSS.escape(field.id)+'"]'));
   if(!label)continue;
   const caption=label.querySelector('[data-required-label]');
   if(caption?.querySelector('[data-required-mark]'))continue;
   const existing=label.querySelector('[data-required-mark],.required-mark');
   if(!existing&&Array.from(label.childNodes).some(node=>node.nodeType===3&&node.textContent.includes('*')))continue;
   if(existing)existing.remove();
   const text=caption||document.createElement('span');text.dataset.requiredLabel='';
   if(!caption){for(const node of Array.from(label.childNodes))if(node.nodeType===3)text.append(node);label.prepend(text);}
   const star=document.createElement('span');star.dataset.requiredMark='';star.className='required-mark';star.textContent=' *';star.setAttribute('aria-label','required');text.append(star);
  }
 }
 mark(document);
 new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length||r.type==='attributes'))mark(document);}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['required']});
 document.addEventListener('input',e=>{if(e.target.dataset?.blankRequired){e.target.setCustomValidity('');delete e.target.dataset.blankRequired;}},true);
 document.addEventListener('submit',e=>{
  for(const field of e.target.querySelectorAll('input[required],textarea[required]')){
   if(field.disabled||['file','checkbox','radio','hidden'].includes(field.type))continue;
   if(!field.value.trim()){field.dataset.blankRequired='true';field.setCustomValidity('This field is required.');field.reportValidity();e.preventDefault();e.stopImmediatePropagation();return;}
  }
 },true);
})();
