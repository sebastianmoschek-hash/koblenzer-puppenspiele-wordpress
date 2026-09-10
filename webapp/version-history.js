(()=>{
 const endpoint='./api/editor-state.php';
 async function request(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error(`Server ${r.status}`);return r.json()}
 async function openHistory(){
  setStatus('Versionshistorie wird geladen …');
  try{
   const data=await request(endpoint+'?action=history');const versions=data.versions||[];
   if(!versions.length){setStatus('Noch keine älteren Cloud-Versionen vorhanden');return}
   const lines=versions.slice(0,20).map((v,i)=>`${i+1}. ${v.savedAt?new Date(v.savedAt).toLocaleString('de-DE'):'Version'}`);
   const answer=prompt(`Cloud-Versionen (neueste zuerst)\n\n${lines.join('\n')}\n\nNummer zum Wiederherstellen eingeben:`);
   if(answer===null)return;const n=Number(answer);if(!Number.isInteger(n)||n<1||n>Math.min(20,versions.length)){setStatus('Ungültige Versionsnummer');return}
   const chosen=versions[n-1];const state=await request(endpoint+'?action=version&id='+encodeURIComponent(chosen.id));
   if(!state.html)throw Error('Version enthält keinen Inhalt');
   if(!confirm(`Version vom ${new Date(chosen.savedAt).toLocaleString('de-DE')} wiederherstellen?\n\nDer aktuelle Stand bleibt in der Versionshistorie erhalten, sobald du anschließend auf „Speichern“ tippst.`))return;
   pushUndo();restore(state.html);markDirty('Ältere Version geladen – zum Übernehmen Cloud speichern');
  }catch(e){setStatus('Versionshistorie fehlgeschlagen: '+e.message)}
 }
 document.querySelector('#history')?.addEventListener('click',openHistory);
})();
