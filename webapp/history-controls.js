(()=>{
'use strict';
function install(){
 const api=window.__kpHistory;if(!api)return;
 let pending=null;
 const legacyMark=window.markDirty;
 function finishPending(){if(!pending)return;const done=pending;pending=null;done()}
 window.pushUndo=function(){finishPending();pending=api.checkpoint()};
 window.markDirty=function(...args){const out=typeof legacyMark==='function'?legacyMark.apply(this,args):undefined;finishPending();return out};
 const undo=document.getElementById('undo'),redo=document.getElementById('redo');if(!undo||!redo)return;
 const fresh=old=>{const b=old.cloneNode(false);old.replaceWith(b);return b},u=fresh(undo),r=fresh(redo);
 u.textContent='↶';r.textContent='↷';
 const badge=(button,id)=>{const b=document.createElement('span');b.id=id;b.className='kp-history-count';button.appendChild(b);return b},ub=badge(u,'kpUndoCount'),rb=badge(r,'kpRedoCount');
 function render(state=api.state()){ub.textContent=String(state.undo);rb.textContent=String(state.redo);u.disabled=state.undo===0;r.disabled=state.redo===0;u.title='Rückgängig · '+state.undo;r.title='Wiederholen · '+state.redo}
 u.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();finishPending();api.undo()},true);r.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();finishPending();api.redo()},true);
 window.addEventListener('kp-history-sync',e=>render(e.detail));window.addEventListener('kp-editor-restored',()=>{pending=null;render()});render();
 window.__kpLegacyHistoryDisabled=true;
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
