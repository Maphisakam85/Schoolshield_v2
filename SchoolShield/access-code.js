/* Access codes are identifiers; backend Auth, tenancy and owner checks remain authoritative. */
(function(root){
 const legacy=new Set(),states=new WeakMap();
 const schoolPattern='[A-Z]{3}-[0-9]{3}',ownerPattern='[A-Z][0-9][A-Z]-[A-Z]{3}';
 const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 function format(value,allowAdmin=false){
  const upper=String(value||'').trim().toUpperCase(),compact=upper.replace(/-/g,'').slice(0,6);
  const existing=Array.from(legacy).find(code=>code.replace(/-/g,'')===compact);if(existing)return existing;
  if(allowAdmin&&compact.length>3&&'ADMIN'.startsWith(compact))return compact;
  if(allowAdmin&&/^[A-Z][0-9][A-Z][A-Z]{0,3}$/.test(compact))return compact.slice(0,3)+'-'+compact.slice(3);
  if(/^[A-Z]{0,3}$/.test(compact))return compact.length===3?compact+'-':compact;
  if(/^[A-Z]{3}[0-9]{1,3}$/.test(compact))return compact.slice(0,3)+'-'+compact.slice(3);
  return compact.length>3?compact.slice(0,3)+'-'+compact.slice(3):compact;
 }
 function validSchool(value){return /^[A-Z]{3}-[0-9]{3}$/.test(value);}
 function validOwner(value){return /^[A-Z][0-9][A-Z]-[A-Z]{3}$/.test(value)||validSchool(value)||value==='ADMIN';}
 function validLogin(value){return validOwner(value)||legacy.has(value);}
 function update(field){
  const kind=field.dataset.schoolCode;
  field.pattern=kind==='owner'?'(?:'+ownerPattern+'|'+schoolPattern+'|ADMIN)':kind==='school'?schoolPattern:'(?:'+[schoolPattern,ownerPattern,'ADMIN',...Array.from(legacy,escape)].join('|')+')';
 }
 function partial(value,kind='login'){
  const code=value.replace(/-/g,'');
  if(/^(?:[A-Z]{0,3}|[A-Z]{3}[0-9]{0,3})$/.test(code))return true;
  if(kind!=='school'&&(/^[A-Z][0-9][A-Z]{0,4}$/.test(code)||'ADMIN'.startsWith(code)))return true;
  return kind==='login'&&Array.from(legacy).some(item=>item.replace(/-/g,'').startsWith(code));
 }
 function complete(field){return field.dataset.schoolCode==='school'?validSchool(field.value):field.dataset.schoolCode==='owner'?validOwner(field.value):validLogin(field.value);}
 function validate(field,show=false,override=''){
  const ok=complete(field)||(!field.required&&!field.value);
  const message=override||(!field.value?'Enter your access code.':field.dataset.schoolCode==='school'?'Use three letters followed by three numbers, for example ABC-001.':'Use ABC-001 or your assigned owner code, for example A0A-ABC.');
  field.setCustomValidity(ok?'':message);
  if(show&&!ok)field.setAttribute('aria-invalid','true');else field.removeAttribute('aria-invalid');
  const feedback=field.closest('label')?.querySelector('[data-access-code-error]');
  if(feedback){feedback.textContent=ok||!show?'':message;feedback.hidden=ok||!show;}
  return ok;
 }
 function bind(){
  for(const field of document.querySelectorAll('[data-school-code]')){
   field.maxLength=7;update(field);if(field.dataset.codeBound){validate(field,states.get(field)?.touched);continue;}field.dataset.codeBound='true';
   const state={last:field.value,touched:false};states.set(field,state);
   field.addEventListener('input',event=>{
    const start=field.selectionStart,end=field.selectionEnd,old=field.value;
    const next=event.inputType?.startsWith('delete')&&/^[A-Za-z]{0,3}$/.test(old)?old.toUpperCase():format(old,field.dataset.schoolCode!=='school');
    if(!partial(next,field.dataset.schoolCode)){field.value=state.last;state.touched=true;validate(field,true,'Start with a letter. Use ABC-001 or your assigned owner code, for example A0A-ABC.');return;}
    field.value=next;state.last=next;const delta=next.length-old.length;if(start!==null)field.setSelectionRange(Math.max(0,start+delta),Math.max(0,end+delta));validate(field,state.touched);
   });
   field.addEventListener('blur',()=>{state.touched=true;validate(field,true);});
   field.addEventListener('keydown',event=>{if(event.key==='Tab'&&!event.shiftKey&&!validate(field,true)){state.touched=true;event.preventDefault();field.reportValidity();}});
   if(field.form)field.form.addEventListener('focusin',event=>{
    if(event.target===field||!state.touched||!(field.compareDocumentPosition(event.target)&4)||!event.target.matches('input,select,textarea,button[type=submit]'))return;
    if(!validate(field,true)){field.focus();field.reportValidity();}
   });
  }
 }
 function setLegacyCodes(codes){for(const code of codes){const value=String(code||'').trim().toUpperCase();if(/^[A-Z]/.test(value)&&value.replace(/-/g,'').length<=6&&value.length<=7&&!validSchool(value)&&value!=='ADMIN')legacy.add(value);}if(typeof document!=='undefined')bind();}
 root.SchoolShieldAccessCode={format,validSchool,validOwner,validLogin,partial,bind,setLegacyCodes};
 if(typeof document!=='undefined')bind();
})(typeof window==='undefined'?globalThis:window);
