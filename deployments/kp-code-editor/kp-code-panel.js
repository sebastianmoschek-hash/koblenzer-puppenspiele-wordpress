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
      dialog.querySelector('[data-code-publish]').disabled = true;
      status(file + ' geladen. Änderungen bleiben bis zum Veröffentlichen lokal.');
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
      previewed = true;
      dialog.querySelector('[data-code-publish]').disabled = result.beforeSha256 === result.afterSha256;
      status('Vorschau erstellt. Prüfe die Änderung vor dem Veröffentlichen.');
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
      '<div class="kp-code-actions"><button type="button" data-code-check>Änderung prüfen</button><button type="button" data-code-publish disabled>Veröffentlichen</button></div>' +
      '<pre data-code-preview aria-label="Änderungsvorschau"></pre><p role="status" data-code-status></p></form>';
    document.body.append(dialog);
    dialog.querySelector('[data-code-file]').addEventListener('change',loadFile);
    dialog.querySelector('[data-code-content]').addEventListener('input', () => {
      previewed=false; dialog.querySelector('[data-code-publish]').disabled=true;
    });
    dialog.querySelector('[data-code-check]').addEventListener('click',preview);
    dialog.querySelector('[data-code-publish]').addEventListener('click',publish);
  }
  async function open() {
    if (!dialog) createDialog();
    dialog.showModal();
    try { await session(); await loadFile(); } catch (error) { status(error.message,true); }
  }
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
