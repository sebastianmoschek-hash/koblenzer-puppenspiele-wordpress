(() => {
  'use strict';
  if (location.hostname !== 'neu.koblenzer-puppenspiele.de') return;
  const api = 'api/code-editor.php';
  let csrf = '', current = null, previewed = false, dialog;
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials:'same-origin', cache:'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen (' + response.status + ')');
    return data;
  }
  async function session() {
    if (!csrf) csrf = (await request(api + '?action=session')).csrf;
    return csrf;
  }
  function status(message, error = false) {
    const box = dialog.querySelector('[data-code-status]');
    box.textContent = message; box.classList.toggle('error', error);
  }
  function changedLines(before, after) {
    const a = before.split('\n'), b = after.split('\n'), out = [];
    for (let i = 0; i < Math.max(a.length,b.length) && out.length < 40; i++) {
      if (a[i] === b[i]) continue;
      out.push('Zeile ' + (i+1) + '\n− ' + (a[i] ?? '') + '\n+ ' + (b[i] ?? ''));
    }
    return out.join('\n\n') || 'Keine Änderung.';
  }
  async function loadFile() {
    const file = dialog.querySelector('[data-code-file]').value;
    status('Lade ' + file + ' …');
    try {
      current = await request(api + '?file=' + encodeURIComponent(file));
      const editor = dialog.querySelector('[data-code-content]');
      editor.value = current.content; previewed = false;
      dialog.querySelector('[data-code-preview]').textContent = '';
      dialog.querySelector('[data-code-visual]').hidden = true;
      dialog.querySelector('[data-code-publish]').disabled = true;
      await loadHistory();
      status(file + ' geladen. Änderungen bleiben bis zum Veröffentlichen lokal.');
    } catch (error) { status(error.message, true); }
  }
  async function loadHistory() {
    const list = dialog.querySelector('[data-code-history]');
    list.replaceChildren(new Option('Sicherung auswählen', ''));
    if (!current) return;
    try {
      const result = await request(api + '?action=history&file=' + encodeURIComponent(current.file));
      for (const name of result.history) list.add(new Option(name.slice(0, 15).replace('-', ' '), name));
    } catch (error) { status(error.message, true); }
  }
  async function useBackup() {
    const name = dialog.querySelector('[data-code-history]').value;
    if (!name || !current) return;
    try {
      const result = await request(api + '?action=backup&file=' + encodeURIComponent(current.file) + '&backup=' + encodeURIComponent(name));
      dialog.querySelector('[data-code-content]').value = result.content;
      previewed = false;
      dialog.querySelector('[data-code-publish]').disabled = true;
      status('Sicherung als Entwurf geladen. Prüfe die Änderung vor dem Veröffentlichen.');
    } catch (error) { status(error.message, true); }
  }
  async function preview() {
    if (!current) return;
    const content = dialog.querySelector('[data-code-content]').value;
    status('Prüfe Änderung …');
    try {
      const result = await request(api, { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body:JSON.stringify({ action:'preview',file:current.file,expectedSha256:current.sha256,content }) });
      dialog.querySelector('[data-code-preview]').textContent =
        'Vorher: ' + result.beforeBytes + ' Bytes · Nachher: ' + result.afterBytes + ' Bytes\n\n' +
        changedLines(current.content,content);
      const visual = dialog.querySelector('[data-code-visual]');
      visual.hidden = current.file === 'kp-inline.js' || result.beforeSha256 === result.afterSha256;
      if (!visual.hidden) {
        // Opaque sandbox: shows static layout, never runs the proposed page's scripts.
        let html=content;
        if(current.file==='kp-inline.css'){
          const response=await fetch('modern.html',{credentials:'same-origin',cache:'no-store'});
          if(!response.ok)throw new Error('Seitenvorschau nicht verfügbar.');
          const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
          parsed.querySelectorAll('link[rel=stylesheet]').forEach(link=>{if(new URL(link.getAttribute('href'),location.href).pathname.endsWith('/kp-inline.css'))link.remove();});
          const style=parsed.createElement('style');style.textContent=content;parsed.head.append(style);html='<!doctype html>'+parsed.documentElement.outerHTML;
        }
        const parsed=new DOMParser().parseFromString(html,'text/html');
        const base=parsed.createElement('base');base.href=location.origin+'/';parsed.head.prepend(base);
        visual.srcdoc='<!doctype html>'+parsed.documentElement.outerHTML;
      } else visual.removeAttribute('srcdoc');
      previewed = true;
      dialog.querySelector('[data-code-publish]').disabled = result.beforeSha256 === result.afterSha256;
      status(visual.hidden ? 'Textvergleich erstellt. Prüfe die Änderung vor dem Veröffentlichen.' :
        'Textvergleich und statische Seitenansicht erstellt. Skripte laufen in der Vorschau nicht.');
    } catch (error) { previewed = false; status(error.message,true); }
  }
  async function publish() {
    if (!previewed || !current) return;
    const content = dialog.querySelector('[data-code-content]').value;
    status('Veröffentliche mit Sicherung …');
    try {
      const result = await request(api, { method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body:JSON.stringify({action:'publish',file:current.file,expectedSha256:current.sha256,content}) });
      current = {file:result.file,sha256:result.sha256,content};
      previewed = false; dialog.querySelector('[data-code-publish]').disabled = true;
      await loadHistory();
      status('Veröffentlicht. Sicherung: ' + result.backup + '. Seite zum Prüfen neu laden.');
    } catch (error) { status(error.message,true); }
  }
  function createDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'kp-code-dialog';
    dialog.innerHTML = '<form method="dialog" class="kp-code-panel"><header><strong>Quellcode der Testseite</strong><button aria-label="Schließen">✕</button></header>' +
      '<p>Nur ausgewählte Dateien unter /neu. Vor dem Veröffentlichen wird eine Sicherung erstellt.</p>' +
      '<label>Datei <select data-code-file><option>kp-inline.css</option><option>kp-inline.js</option><option>modern.html</option></select></label>' +
      '<label>Quellcode <textarea data-code-content spellcheck="false"></textarea></label>' +
      '<div class="kp-code-history"><label>Frühere Sicherung <select data-code-history><option value="">Sicherung auswählen</option></select></label><button type="button" data-code-use-backup>Als Entwurf laden</button></div>' +
      '<div class="kp-code-actions"><button type="button" data-code-check>Änderung prüfen</button><button type="button" data-code-publish disabled>Veröffentlichen</button></div>' +
      '<pre data-code-preview aria-label="Textvergleich"></pre><iframe data-code-visual title="Statische Seitenansicht" sandbox referrerpolicy="no-referrer" hidden></iframe><p role="status" data-code-status></p></form>';
    document.body.append(dialog);
    dialog.querySelector('[data-code-file]').addEventListener('change',loadFile);
    dialog.querySelector('[data-code-content]').addEventListener('input', () => {
      previewed=false; dialog.querySelector('[data-code-publish]').disabled=true;
    });
    dialog.querySelector('[data-code-check]').addEventListener('click',preview);
    dialog.querySelector('[data-code-use-backup]').addEventListener('click',useBackup);
    dialog.querySelector('[data-code-publish]').addEventListener('click',publish);
  }
  async function open() {
    if (!dialog) createDialog();
    dialog.classList.remove('kp-ai-code-preview');
    if(!dialog.open)dialog.showModal();
    try { await session(); await loadFile(); } catch (error) { status(error.message,true); }
  }
  window.addEventListener('kp-ai-code-draft', async (event) => {
    const draft = event.detail;
    if (!draft || !['modern.html','kp-inline.css','kp-inline.js'].includes(draft.file) || typeof draft.content !== 'string') return;
    await open();
    dialog.querySelector('[data-code-file]').value = draft.file;
    await loadFile();
    if (!current || current.file !== draft.file || current.sha256 !== draft.expectedSha256) {
      status('Die Datei hat sich inzwischen geändert. Bitte den KI-Entwurf neu erstellen.', true);
      return;
    }
    dialog.querySelector('[data-code-content]').value = draft.content;
    previewed = false;
    dialog.querySelector('[data-code-publish]').disabled = true;
    dialog.classList.add('kp-ai-code-preview');
    await preview();
    status((draft.message || 'KI-Entwurf geladen.') + (draft.file==='kp-inline.js'?' Programmänderung als Entwurf vorbereitet; Laufzeittest vor Übernahme erforderlich.':' Vorschau erstellt. Veröffentlichen übernimmt die Änderung mit Sicherung.'));
  });
  const observer = new MutationObserver(() => {
    if (!document.body.classList.contains('editing')) return;
    const rows = document.querySelector('.kp-il-sheet.open .kp-il-rows');
    if (!rows || rows.querySelector('[data-code-open]')) return;
    const button = document.createElement('button');
    button.type='button'; button.className='kp-il-row'; button.dataset.codeOpen='';
    button.innerHTML='<span class="kp-il-rico" aria-hidden="true">⌘</span><span>Quellcode der Testseite</span>';
    button.addEventListener('click',open);
    rows.append(button);
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();


