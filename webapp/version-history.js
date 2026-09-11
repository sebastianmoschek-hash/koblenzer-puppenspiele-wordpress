(()=>{
'use strict';
const endpoint='./api/editor-state.php';
const q=s=>document.querySelector(s);
const status=t=>{const el=q('#status');if(el)el.textContent=t};
async function request(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Server '+r.status);return r.json()}
async function openHistory(e){
 if(e){e.preventDefault();e.stopPropagation()}
 status('Versionshistorie wird geladen …');
 try{
  const data=await request(endpoint+'?action=history');
  const versions=Array.isArray(data.versions)?data.versions:[];
  if(!versions.length){status('Noch keine älteren Cloud-Versionen vorhanden');return}
  const shown=versions.slice(0,20);
  const lines=shown.map((v,i)=>(i+1)+'. '+(v.savedAt?new Date(v.savedAt).toLocaleString('de-DE'):'Version'));
  const answer=window.prompt('Cloud-Versionen (neueste zuerst)\n\n'+lines.join('\n')+'\n\nNummer zum Wiederherstellen eingeben:');
  if(answer===null)return;
  const n=parseInt(answer,10);
  if(!Number.isFinite(n)||n<1||n>shown.length){status('Ungültige Versionsnummer');return}
  const chosen=shown[n-1];
  const state=await request(endpoint+'?action=version&id='+encodeURIComponent(chosen.id));
  if(!state.html)throw Error('Version enthält keinen Inhalt');
  const when=chosen.savedAt?new Date(chosen.savedAt).toLocaleString('de-DE'):'gewählte Version';
  if(!window.confirm('Version vom '+when+' wiederherstellen?\n\nDanach Online speichern, um sie dauerhaft zu übernehmen.'))return;
  const main=q('main');
  if(!main)throw Error('Seiteninhalt nicht gefunden');
  try{localStorage.setItem('kp-webapp-before-version-restore',main.innerHTML)}catch(err){}
  main.innerHTML=state.html;
  document.body.classList.add('editing');
  q('#editor').hidden=false;
  q('#edit').hidden=true;
  Array.from(document.querySelectorAll('main h1,main h2,main h3,main .lead,main section p:not(.eyebrow):not(.muted)')).forEach(el=>el.contentEditable='true');
  status('Ältere Version geladen – jetzt Online speichern');
 }catch(err){status('Versionshistorie fehlgeschlagen: '+err.message)}
}
const button=q('#history');
if(button)button.addEventListener('click',openHistory,true);
})();
