(()=>{
  'use strict';
  function boot(){
    const edit=document.getElementById('edit');
    const editor=document.getElementById('editor');
    const close=document.getElementById('close');
    if(!edit||!editor)return;
    const open=()=>{
      editor.hidden=false;
      edit.hidden=true;
      document.body.classList.add('editing');
      document.querySelectorAll('main h1,main h2,main h3,main .lead,main section p:not(.eyebrow):not(.muted)').forEach(el=>el.contentEditable='true');
      const status=document.getElementById('status');
      if(status)status.textContent='Lokaler Editor aktiv';
    };
    const shut=()=>{
      document.querySelectorAll('[contenteditable]').forEach(el=>el.contentEditable='false');
      editor.hidden=true;
      edit.hidden=false;
      document.body.classList.remove('editing');
    };
    edit.addEventListener('click',()=>{
      if(!editor.hidden)return;
      setTimeout(()=>{ if(editor.hidden) open(); },0);
    });
    if(close)close.addEventListener('click',()=>setTimeout(()=>{ if(!editor.hidden) shut(); },0));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
