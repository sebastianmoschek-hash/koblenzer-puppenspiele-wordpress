(()=>{
'use strict';
const q=s=>document.querySelector(s),qa=s=>Array.from(document.querySelectorAll(s));
const editor=q('#editor'),edit=q('#edit'),close=q('#close'),save=q('#cloudSave'),localSave=q('#save'),add=q('#addSection'),undo=q('#undo'),redo=q('#redo'),status=q('#status');
if(!editor||!edit)return;
let past=[],future=[],current='',timer=0,restoring=false;
function capture(){const m=q('main');return m?m.innerHTML:''}
const say=t=>{if(status)status.textContent=t};
function sync(){if(undo){undo.disabled=!past.length;undo.title=past.length?'Rückgängig · '+past.length:'Rückgängig'}if(redo){redo.disabled=!future.length;redo.title=future.length?'Wiederholen · '+future.length:'Wiederholen'}}
function clearSelection(){qa('.kp-transform-selected,.kp-design-selected,.kp-transform-moving').forEach(el=>el.classList.remove('kp-transform-selected','kp-design-selected','kp-transform-moving'));const h=q('#kpTransformHandles');if(h)h.hidden=true;window.dispatchEvent(new CustomEvent('kp-editor-restored'))}
function editable(on){qa('main h1,main h2,main h3,main .lead,main section p:not(.eyebrow):not(.muted)').forEach(el=>el.contentEditable=on?'true':'false');editor.hidden=!on;edit.hidden=on;document.body.classList.toggle('editing',on);if(on)bindInputs()}
function trim(){if(past.length>40)past.splice(0,past.length-40);if(future.length>40)future.splice(0,future.length-40)}
function commit(now){if(restoring)return;now=now||capture();if(!current){current=now;sync();return}if(now===current){sync();return}past.push(current);trim();current=now;future=[];sync();say('Rückgängig · '+past.length+' '+(past.length===1?'Schritt':'Schritte'))}
function scheduleCommit(){clearTimeout(timer);timer=setTimeout(()=>commit(capture()),450)}
function beforeEdit(){clearTimeout(timer);const now=capture();if(!current)current=now}
function restore(html){restoring=true;clearSelection();const m=q('main');if(m)m.innerHTML=html;current=html;editable(true);clearSelection();restoring=false;sync()}
function bindInputs(){qa('main [contenteditable=true]').forEach(el=>{if(el.dataset.kpHistoryBound)return;el.dataset.kpHistoryBound='1';el.addEventListener('beforeinput',beforeEdit);el.addEventListener('input',scheduleCommit);el.addEventListener('blur',()=>{clearTimeout(timer);commit(capture())})})}
edit.addEventListener('click',()=>{editable(true);current=capture();sync();say(past.length?'Rückgängig · '+past.length+' '+(past.length===1?'Schritt':'Schritte'):'Editor aktiv')});
if(close)close.addEventListener('click',()=>{clearTimeout(timer);commit(capture());clearSelection();editable(false)});
if(add)add.addEventListener('click',()=>{clearTimeout(timer);commit(capture());const before=capture();const s=document.createElement('section');s.innerHTML='<div class="wrap"><p class="eyebrow">Neuer Abschnitt</p><h2>Neue Überschrift</h2><p>Hier Text eingeben.</p></div>';q('main').appendChild(s);current=before;commit(capture());editable(true);say('Rückgängig · '+past.length+' '+(past.length===1?'Schritt':'Schritte'))});
if(undo)undo.addEventListener('click',()=>{clearTimeout(timer);commit(capture());if(!past.length){sync();return}future.push(current||capture());trim();const previous=past.pop();restore(previous);say(past.length?'Rückgängig · '+past.length+' '+(past.length===1?'Schritt':'Schritte'):'Kein weiterer Rückgängig-Schritt')});
if(redo)redo.addEventListener('click',()=>{clearTimeout(timer);if(!future.length){sync();return}past.push(current||capture());trim();const next=future.pop();restore(next);say(future.length?'Wiederholen · '+future.length+' '+(future.length===1?'Schritt':'Schritte'):'Kein weiterer Wiederholen-Schritt')});
async function cloud(){clearTimeout(timer);commit(capture());try{say('Speichere …');const r=await fetch('./api/editor-state.php',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:3,savedAt:new Date().toISOString(),html:capture(),layout:{}}),cache:'no-store'});if(!r.ok)throw new Error('Server '+r.status);try{localStorage.setItem('kp-webapp-content-v2',capture())}catch(e){}say('Dauerhaft auf dem Webspace gespeichert ✓')}catch(e){say('Speichern fehlgeschlagen: '+e.message)}}
if(save)save.addEventListener('click',cloud);
if(localSave)localSave.addEventListener('click',()=>{clearTimeout(timer);commit(capture());try{localStorage.setItem('kp-webapp-content-v2',capture());say('Auf diesem Gerät gespeichert ✓')}catch(e){say('Gerätespeicher fehlgeschlagen')}});
window.__kpUndoCheckpoint=()=>{clearTimeout(timer);commit(capture());const before=capture();return()=>{current=before;commit(capture())}};
window.__kpMobileCoreReady=true;current=capture();sync();
})();