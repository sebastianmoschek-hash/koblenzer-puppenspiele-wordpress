(()=>{
'use strict';
const q=s=>document.querySelector(s),qa=s=>Array.from(document.querySelectorAll(s));
const editor=q('#editor'),edit=q('#edit'),close=q('#close'),save=q('#cloudSave'),localSave=q('#save'),add=q('#addSection'),undo=q('#undo'),redo=q('#redo'),status=q('#status');
if(!editor||!edit)return;
let past=[],future=[],current='',timer=0,restoring=false;
function capture(){const m=q('main');return m?m.innerHTML:''}
const say=t=>{if(status)status.textContent=t};
function clean(html){const box=document.createElement('div');box.innerHTML=html;box.querySelectorAll('[data-kp-history-bound]').forEach(el=>el.removeAttribute('data-kp-history-bound'));return box.innerHTML}
function snapshot(){return clean(capture())}
function badge(button,id){if(!button)return null;let b=q('#'+id);if(!b){b=document.createElement('span');b.id=id;b.className='kp-history-count';button.appendChild(b)}return b}
function sync(){const ub=badge(undo,'kpUndoCount'),rb=badge(redo,'kpRedoCount');if(undo){undo.disabled=!past.length;undo.title='Rückgängig · '+past.length}if(redo){redo.disabled=!future.length;redo.title='Wiederholen · '+future.length}if(ub)ub.textContent=String(past.length);if(rb)rb.textContent=String(future.length)}
function clearSelection(){qa('.kp-transform-selected,.kp-design-selected,.kp-transform-moving').forEach(el=>el.classList.remove('kp-transform-selected','kp-design-selected','kp-transform-moving'));const h=q('#kpTransformHandles');if(h)h.hidden=true;window.dispatchEvent(new CustomEvent('kp-editor-restored'))}
function editable(on){qa('main h1,main h2,main h3,main .lead,main section p:not(.eyebrow):not(.muted)').forEach(el=>el.contentEditable=on?'true':'false');editor.hidden=!on;edit.hidden=on;document.body.classList.toggle('editing',on);if(on)bindInputs()}
function trim(){if(past.length>40)past.splice(0,past.length-40);if(future.length>40)future.splice(0,future.length-40)}
function commit(now){if(restoring)return;now=clean(now||capture());if(!current){current=now;sync();return}if(now===current){sync();return}past.push(current);trim();current=now;future=[];sync();say('Nicht gespeichert')}
function scheduleCommit(){clearTimeout(timer);timer=setTimeout(()=>commit(snapshot()),450)}
function beforeEdit(){clearTimeout(timer);if(!current)current=snapshot()}
function restore(html){restoring=true;clearSelection();const m=q('main');if(m)m.innerHTML=html;current=clean(html);editable(true);clearSelection();restoring=false;sync()}
function bindInputs(){qa('main [contenteditable=true]').forEach(el=>{if(el.dataset.kpHistoryBound)return;el.dataset.kpHistoryBound='1';el.addEventListener('beforeinput',beforeEdit);el.addEventListener('input',scheduleCommit);el.addEventListener('blur',()=>{clearTimeout(timer);commit(snapshot())})})}
edit.addEventListener('click',()=>{editable(true);current=snapshot();past=[];future=[];sync();say('Editor aktiv')});
if(close)close.addEventListener('click',()=>{clearTimeout(timer);commit(snapshot());clearSelection();editable(false)});
if(add)add.addEventListener('click',()=>{clearTimeout(timer);commit(snapshot());const before=snapshot();const s=document.createElement('section');s.innerHTML='<div class="wrap"><p class="eyebrow">Neuer Abschnitt</p><h2>Neue Überschrift</h2><p>Hier Text eingeben.</p></div>';q('main').appendChild(s);current=before;commit(snapshot());editable(true)});
if(undo)undo.addEventListener('click',()=>{clearTimeout(timer);const now=snapshot();if(now!==current)commit(now);if(!past.length){sync();return}future.push(current);trim();const previous=past.pop();restore(previous);say('Rückgängig')});
if(redo)redo.addEventListener('click',()=>{clearTimeout(timer);if(!future.length){sync();return}past.push(current);trim();const next=future.pop();restore(next);say('Wiederholt')});
async function cloud(){clearTimeout(timer);commit(snapshot());try{say('Speichere …');const r=await fetch('./api/editor-state.php',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:3,savedAt:new Date().toISOString(),html:capture(),layout:{}}),cache:'no-store'});if(!r.ok)throw new Error('Server '+r.status);try{localStorage.setItem('kp-webapp-content-v2',capture())}catch(e){}say('Dauerhaft auf dem Webspace gespeichert ✓')}catch(e){say('Speichern fehlgeschlagen: '+e.message)}}
if(save)save.addEventListener('click',cloud);
if(localSave)localSave.addEventListener('click',()=>{clearTimeout(timer);commit(snapshot());try{localStorage.setItem('kp-webapp-content-v2',capture());say('Auf diesem Gerät gespeichert ✓')}catch(e){say('Gerätespeicher fehlgeschlagen')}});
window.__kpUndoCheckpoint=()=>{clearTimeout(timer);commit(snapshot());const before=snapshot();return()=>{if(restoring)return;const now=snapshot();if(now===before){sync();return}past.push(before);trim();current=now;future=[];sync();say('Nicht gespeichert')}};
window.__kpMobileCoreReady=true;current=snapshot();sync();
})();