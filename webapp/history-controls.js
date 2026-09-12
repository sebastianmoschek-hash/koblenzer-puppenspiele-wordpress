(()=>{
'use strict';
function install(){
  const api=window.__kpHistory;
  if(!api)return;
  const oldUndo=document.getElementById('undo'),oldRedo=document.getElementById('redo');
  if(!oldUndo||!oldRedo)return;
  const undo=oldUndo.cloneNode(false),redo=oldRedo.cloneNode(false);
  undo.id='undo'; redo.id='redo'; undo.textContent='↶'; redo.textContent='↷';
  oldUndo.replaceWith(undo); oldRedo.replaceWith(redo);
  const badge=(button,id)=>{let b=document.createElement('span');b.id=id;b.className='kp-history-count';button.appendChild(b);return b};
  const ub=badge(undo,'kpUndoCount'),rb=badge(redo,'kpRedoCount');
  function render(state=api.state()){
    ub.textContent=String(state.undo);rb.textContent=String(state.redo);
    undo.disabled=state.undo===0;redo.disabled=state.redo===0;
    undo.title='Rückgängig · '+state.undo;redo.title='Wiederholen · '+state.redo;
  }
  undo.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();api.undo();setTimeout(()=>render(),0)},true);
  redo.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();api.redo();setTimeout(()=>render(),0)},true);
  window.addEventListener('kp-history-sync',e=>render(e.detail));
  // app.js still owns legacy history internally and may toggle disabled. Keep the visible
  // controls bound only to the canonical history state.
  new MutationObserver(()=>render()).observe(undo,{attributes:true,attributeFilter:['disabled']});
  new MutationObserver(()=>render()).observe(redo,{attributes:true,attributeFilter:['disabled']});
  render();
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();