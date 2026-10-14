(function(root) {
  root.schoolshieldButtonBusy=function(button,label='Loading…') {
    if(!button) return ()=>{};
    const text=button.textContent,disabled=button.disabled;
    button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=label;
    return (message,keepDisabled=false)=>{
      button.removeAttribute('aria-busy');button.textContent=message||text;button.disabled=keepDisabled||disabled;
    };
  };
})(window);
