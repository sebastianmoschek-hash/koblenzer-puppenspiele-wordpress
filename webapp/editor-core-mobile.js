(()=>{
'use strict';
const q=s=>document.querySelector(s),qa=s=>Array.from(document.querySelectorAll(s));
const editor=q('#editor'),edit=q('#edit'),undo=q('#undo'),redo=q('#redo'),status=q('#status');
if(!editor||!edit)return;
let past=[],future=[],current='',timer=0,restoring=false;
function capture(){const m=q('main');return m?m.innerHTML:''}
const say=t=>{if(status)status.textContent=t};
function clean(html){const box=document.createElement('div');box.innerHTML=html;box.querySelectorAll('[data-kp-history-bound],[data-editor-wired],[data-image-wired],[data-section-wired]').forEach(el=>{el.removeAttribute('data-kp-history-bound');el.removeAttribute('data-editor-wired');el.removeAttribute('data-image-wired');el.removeAttribute('data-section-wired')});box.querySelectorAll('.section-selected,.section-editable,.image-editable,.kp-transform-selected,.kp-design-selected,.kp-transform-moving').forEach(el=>el.classList.remove('section-selected','section-editable','image-editable','kp-transform-selected','kp-design-selected','kp-transform-moving'));return box.innerHTML}
function snapshot(){return clean(capture())}
function badge(button,id){if(!button)return null;let b=q('#'+id);if(!b){b=document.createElement('span');b.id=id;b.className='kp-history-count';button.appendChild(b)}return b}
function sync(){const ub=badge(undo,'kpUndoCount'),rb=badge(redo,'kpRedoCount');if(undo){undo.disabled=!past.length;undo.title='Rückgängig · '+past.length}if(redo){redo.disabled=!future.length;redo.title='Wiederholen · '+future.length}if(ub)ub.textContent=String(past.length);if(rb)rb.textContent=String(future.length)}
function trim(){if(past.length>50)past.splice(0,past.length-50);if(future.length>50)future.splice(0,future.length-50)}
function record(now){if(restoring)return;now=clean(now||capture());if(!current){current=now;sync();return}if(now===current){sync();return}past.push(current);trim();current=now;future=[];sync();say('Nicht gespeichert')}
function flush(){clearTimeout(timer);const now=snapshot();if(now!==current)record(now)}
function bindInputs(){qa('main [contenteditable=true]').forEach(el=>{if(el.dataset.kpHistoryBound)return;el.dataset.kpHistoryBound='1';el.addEventListener('input',()=>{if(restoring)return;clearTimeout(timer);timer=setTimeout(()=>record(snapshot()),400)});el.addEventListener('blur',()=>{if(!restoring)flush()})})}
function restore(html){restoring=true;clearTimeout(timer);const m=q('main');if(m)m.innerHTML=html;current=clean(html);qa('main h1,main h2,main h3,main .lead,main section p:not(.eyebrow):not(.muted)').forEach(el=>el.contentEditable='true');bindInputs();window.dispatchEvent(new CustomEvent('kp-editor-restored'));requestAnimationFrame(()=>{restoring=false;current=snapshot();sync()})}
function doUndo(){clearTimeout(timer);if(restoring)return;const live=snapshot();if(live!==current)record(live);if(!past.length){sync();return}const previous=past.pop();future.push(current);trim();sync();restore(previous);say('Rückgängig')}
function doRedo(){clearTimeout(timer);if(restoring||!future.length){sync();return}const next=future.pop();past.push(current);trim();sync();restore(next);say('Wiederholt')}
window.__kpHistory={undo:doUndo,redo:doRedo,checkpoint(){if(restoring)return()=>{};flush();const before=current||snapshot();let done=false;return()=>{if(done||restoring)return;done=true;const now=snapshot();if(now===before){sync();return}past.push(before);trim();current=now;future=[];sync();say('Nicht gespeichert')}},sync};
window.__kpUndoCheckpoint=()=>window.__kpHistory.checkpoint();
edit.addEventListener('click',()=>{current=snapshot();past=[];future=[];setTimeout(bindInputs,0);sync()},true);
function ownButtons(){if(undo){undo.onclick=null;undo.addEventListener('pointerdown',e=>e.stopImmediatePropagation(),true);undo.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();doUndo()},true)}if(redo){redo.onclick=null;redo.addEventListener('pointerdown',e=>e.stopImmediatePropagation(),true);redo.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();doRedo()},true)}}
window.addEventListener('load',()=>{ownButtons();bindInputs();current=snapshot();sync()},{once:true});
window.__kpMobileCoreReady=true;current=snapshot();sync();
})();