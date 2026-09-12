(()=>{
'use strict';
const q=s=>document.querySelector(s);
const editor=q('#editor'),edit=q('#edit'),status=q('#status');
if(!editor||!edit)return;
let past=[],future=[],current='',restoring=false;
const TRANSIENT_CLASSES=['section-selected','section-editable','image-editable','card-selected','menu-selected','menu-dragging','kp-transform-selected','kp-design-selected','kp-transform-moving','kp-button-label-selected'];
function capture(){const m=q('main');return m?m.innerHTML:''}
const say=t=>{if(status)status.textContent=t};
function clean(html){const box=document.createElement('div');box.innerHTML=html;box.querySelectorAll('[data-kp-history-bound],[data-editor-wired],[data-image-wired],[data-section-wired],[data-card-wired]').forEach(el=>{['data-kp-history-bound','data-editor-wired','data-image-wired','data-section-wired','data-card-wired'].forEach(a=>el.removeAttribute(a))});box.querySelectorAll(TRANSIENT_CLASSES.map(c=>'.'+c).join(',')).forEach(el=>TRANSIENT_CLASSES.forEach(c=>el.classList.remove(c)));box.querySelectorAll('[contenteditable]').forEach(el=>el.setAttribute('contenteditable','false'));return box.innerHTML}
function snapshot(){return clean(capture())}
function sync(){const detail={undo:past.length,redo:future.length,restoring};window.dispatchEvent(new CustomEvent('kp-history-sync',{detail}));return detail}
function trim(){if(past.length>50)past.splice(0,past.length-50);if(future.length>50)future.splice(0,future.length-50)}
function rewire(){try{if(typeof window.wireEditable==='function')window.wireEditable();if(typeof window.wireImages==='function')window.wireImages();if(typeof window.wireSections==='function')window.wireSections();if(document.body.classList.contains('editing')&&typeof window.setEditable==='function')window.setEditable(true)}catch(e){console.error('[kp-history] rewire failed',e)}}
function restore(html){if(restoring)return;restoring=true;const m=q('main');if(m)m.innerHTML=html;rewire();window.dispatchEvent(new CustomEvent('kp-editor-restored'));current=snapshot();restoring=false;sync()}
function checkpoint(){if(restoring)return()=>{};const before=current||snapshot();let done=false;return()=>{if(done||restoring)return;done=true;const now=snapshot();if(now===before){sync();return}past.push(before);trim();current=now;future=[];sync();say('Nicht gespeichert')}}
function doUndo(){if(restoring||!past.length){sync();return}const previous=past.pop();future.push(current);trim();restore(previous);say('Rückgängig')}
function doRedo(){if(restoring||!future.length){sync();return}const next=future.pop();past.push(current);trim();restore(next);say('Wiederholt')}
function adopt(){if(restoring)return;current=snapshot();sync()}
window.__kpHistory={undo:doUndo,redo:doRedo,state:()=>({undo:past.length,redo:future.length,restoring}),checkpoint,sync,adopt,reset(){past=[];future=[];current=snapshot();sync()}};
window.__kpUndoCheckpoint=checkpoint;
edit.addEventListener('click',()=>{past=[];future=[];current=snapshot();setTimeout(()=>{rewire();current=snapshot();sync()},0)},true);
window.addEventListener('load',()=>{rewire();current=snapshot();sync()},{once:true});
window.__kpMobileCoreReady=true;current=snapshot();sync();
})();
