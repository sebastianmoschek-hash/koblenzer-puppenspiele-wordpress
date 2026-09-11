(()=>{
'use strict';
const q=s=>document.querySelector(s);
const qa=s=>Array.from(document.querySelectorAll(s));
const editor=q('#editor'),edit=q('#edit'),close=q('#close'),save=q('#cloudSave'),localSave=q('#save'),add=q('#addSection'),undo=q('#undo'),redo=q('#redo'),status=q('#status');
if(!editor||!edit)return;
let stack=[],redoStack=[],last=capture();
const main=q('main');
function capture(){const m=q('main');return m?m.innerHTML:''}
const say=t=>{if(status)status.textContent=t};
function editable(on){qa('main h1,main h2,main h3,main .lead,main section p:not(.eyebrow):not(.muted)').forEach(el=>el.contentEditable=on?'true':'false');editor.hidden=!on;edit.hidden=on;document.body.classList.toggle('editing',on)}
function sync(){if(undo)undo.disabled=!stack.length;if(redo)redo.disabled=!redoStack.length}
function remember(before){if(before&&stack[stack.length-1]!==before){stack.push(before);if(stack.length>40)stack.shift()}redoStack=[];last=capture();sync()}
function restore(html){const m=q('main');if(!m)return;m.innerHTML=html;editable(true);last=capture();bindInputs();sync()}
function changed(){const now=capture();if(now===last)return;if(last&&stack[stack.length-1]!==last){stack.push(last);if(stack.length>40)stack.shift()}redoStack=[];last=now;sync();say('Nicht gespeichert')}
function bindInputs(){qa('main [contenteditable=true]').forEach(el=>{if(el.dataset.kpUndoBound)return;el.dataset.kpUndoBound='1';el.addEventListener('focus',()=>{last=capture()});el.addEventListener('input',changed)})}
edit.addEventListener('click',()=>{editable(true);last=capture();bindInputs();sync();say('Editor aktiv')});
if(close)close.addEventListener('click',()=>editable(false));
if(add)add.addEventListener('click',()=>{const before=capture();const s=document.createElement('section');s.innerHTML='<div class="wrap"><p class="eyebrow">Neuer Abschnitt</p><h2>Neue Überschrift</h2><p>Hier Text eingeben.</p></div>';q('main').appendChild(s);editable(true);remember(before);bindInputs();say('Abschnitt hinzugefügt – noch speichern')});
if(undo)undo.addEventListener('click',()=>{if(!stack.length)return;redoStack.push(capture());restore(stack.pop());say('Rückgängig')});
if(redo)redo.addEventListener('click',()=>{if(!redoStack.length)return;stack.push(capture());restore(redoStack.pop());say('Wiederholt')});
async function cloud(){try{say('Speichere …');const r=await fetch('./api/editor-state.php',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:3,savedAt:new Date().toISOString(),html:capture(),layout:{}}),cache:'no-store'});if(!r.ok)throw new Error('Server '+r.status);try{localStorage.setItem('kp-webapp-content-v2',capture())}catch(e){}last=capture();say('Dauerhaft auf dem Webspace gespeichert ✓')}catch(e){say('Speichern fehlgeschlagen: '+e.message)}}
if(save)save.addEventListener('click',cloud);
if(localSave)localSave.addEventListener('click',()=>{try{localStorage.setItem('kp-webapp-content-v2',capture());last=capture();say('Auf diesem Gerät gespeichert ✓')}catch(e){say('Gerätespeicher fehlgeschlagen')}});
window.__kpUndoCheckpoint=()=>{const before=capture();return()=>remember(before)};
window.__kpMobileCoreReady=true;sync();
})();
