(() => {
 const mark=root=>root.querySelectorAll('input[required],select[required],textarea[required]').forEach(field=>{
  const label=field.closest('label');if(label&&!label.querySelector('.required-mark')&&!label.textContent.includes('*')){const star=document.createElement('span');star.className='required-mark';star.textContent=' *';star.setAttribute('aria-label','Required');label.append(star);}
 });
 mark(document);
 new MutationObserver(()=>mark(document)).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('submit',event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;
  const blank=Array.from(form.querySelectorAll('input[required],textarea[required]')).find(field=>!field.disabled&&!['password','checkbox','radio','file'].includes(field.type)&&!field.value.trim());
  if(blank){event.preventDefault();event.stopImmediatePropagation();blank.setCustomValidity('Complete this required field; spaces alone are not accepted.');blank.reportValidity();blank.addEventListener('input',()=>blank.setCustomValidity(''),{once:true});}
 },true);
})();
