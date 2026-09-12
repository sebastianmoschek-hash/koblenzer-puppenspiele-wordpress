(()=>{
'use strict';
function install(){
 const api=window.__kpHistory;if(!api)return;
 let legacyFinish=null;
 const legacyPush=window.pushUndo,legacyMark=window.markDirty;
 window.pushUndo=function(){if(legacyFinish)legacyFinish();legacyFinish=api.checkpoint()};
 window.markDirty=function(...args){const out=typeof legacyMark==='function'?legacyMark.apply(this,args):undefined;if(legacyFinish){const finish=legacyFinish;legacyFinish=null;finish()}return out};
 const undo=document.getElementById('undo'),redo=document.getElementById('redo');if(!undo||!redo)return;
 undo.onclick=null;redo.onclick=null;
 undo.replaceChildren(document.createTextNode('↶'));redo.replaceChildren(document.createTextNode('↷'));
 const badge=(button,id)=>{const b=document.createElement('span');b.id=id;b.className='kp-history-count';button.appendChild(b);return b},ub=badge(undo,'kpUndoCount'),rb=badge(redo,'kpRedoCount');
 function render(state=api.state()){ub.textContent=String(state.undo);rb.textContent=String(state.redo);undo.disabled=state.undo===0;redo.disabled=state.redo===0;undo.title='Rückgängig · '+state.undo;redo.title='Wiederholen · '+state.redo}
 undo.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();api.undo()},true);redo.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();api.redo()},true);
 window.addEventListener('kp-history-sync',e=>render(e.detail));render();
 window.__kpLegacyHistory={pushUndo:legacyPush};
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
