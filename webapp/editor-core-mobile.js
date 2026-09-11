(()=>{
'use strict';
const q=s=>document.querySelector(s);
const qa=s=>Array.from(document.querySelectorAll(s));
const editor=q('#editor'),edit=q('#edit'),close=q('#close'),save=q('#cloudSave'),localSave=q('#save'),add=q('#addSection'),undo=q('#undo'),redo=q('#redo'),status=q('#status');
if(!editor||!edit)return;
let stack=[],redoStack=[];
const main=q('main');
const capture=()=>main?main.innerHTML:'';
const say=t=>{if(status)status.textContent=t};
function editable(on){
 qa('main h1,main h2,main h3,main .lead,main section p:not(.eyebrow):not(.muted)').forEach(el=>el.contentEditable=on?'true':'false');
 editor.hidden=!on;edit.hidden=on;document.body.classList.toggle('editing',on);
}
function snapshot(){const h=capture();if(stack[stack.length-1]!==h)stack.push(h);if(stack.length>30)stack.shift();redoStack=[];sync()}
function sync(){if(undo)undo.disabled=!stack.length;if(redo)redo.disabled=!redoStack.length}
edit.addEventListener('click',()=>{editable(true);say('Editor aktiv')});
if(close)close.addEventListener('click',()=>editable(false));
if(add)add.addEventListener('click',()=>{snapshot();const s=document.createElement('section');s.innerHTML='<div class="wrap"><p class="eyebrow">Neuer Abschnitt</p><h2>Neue Überschrift</h2><p>Hier Text eingeben.</p></div>';main.appendChild(s);editable(true);say('Abschnitt hinzugefügt – noch speichern')});
if(undo)undo.addEventListener('click',()=>{if(!stack.length)return;redoStack.push(capture());main.innerHTML=stack.pop();editable(true);sync();say('Rückgängig')});
if(redo)redo.addEventListener('click',()=>{if(!redoStack.length)return;stack.push(capture());main.innerHTML=redoStack.pop();editable(true);sync();say('Wiederholt')});
async function cloud(){try{say('Speichere …');const r=await fetch('./api/editor-state.php',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:3,savedAt:new Date().toISOString(),html:capture(),layout:{}}),cache:'no-store'});if(!r.ok)throw new Error('Server '+r.status);try{localStorage.setItem('kp-webapp-content-v2',capture())}catch(e){}say('Dauerhaft auf dem Webspace gespeichert ✓')}catch(e){say('Speichern fehlgeschlagen: '+e.message)}}
if(save)save.addEventListener('click',cloud);
if(localSave)localSave.addEventListener('click',()=>{try{localStorage.setItem('kp-webapp-content-v2',capture());say('Auf diesem Gerät gespeichert ✓')}catch(e){say('Gerätespeicher fehlgeschlagen')}});
qa('main').forEach(el=>el.addEventListener('input',()=>say('Nicht gespeichert')));
sync();
window.__kpMobileCoreReady=true;
})();
