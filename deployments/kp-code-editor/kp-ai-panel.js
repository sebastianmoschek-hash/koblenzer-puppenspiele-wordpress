(() => {
  'use strict';
  if (location.hostname !== 'neu.koblenzer-puppenspiele.de') return;
  let panel, csrf = '', recognition, listening = false, busy = false;
  const request = async (url, options = {}) => {
    const response = await fetch(url, {credentials:'same-origin', cache:'no-store', ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen (' + response.status + ')');
    return data;
  };
  const status = (message) => { if (panel) panel.querySelector('[data-ai-status]').textContent = message; };
  function stopSpeech() { if (recognition && listening) recognition.stop(); listening = false; }
  function create() {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'kp-ai-float'; button.textContent = '✦ KI';
    button.setAttribute('aria-label', 'KI-Assistent öffnen'); button.hidden = true;
    panel = document.createElement('section');
    panel.className = 'kp-ai-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'KI-Assistent');
    panel.innerHTML = '<header><strong>KI-Assistent</strong><button type="button" data-ai-close aria-label="Schließen">×</button></header>' +
      '<p>Beschreibe deine Änderung. Die KI erstellt einen Entwurf im Code-Fenster; sie veröffentlicht nichts.</p>' +
      '<details open><summary>Gemini-Schlüssel einrichten</summary><p>Nur auf dem Testserver gespeichert. Bei Bereinigung des privaten Serverspeichers erneut eingeben.</p><label>API-Schlüssel <input type="password" data-ai-key autocomplete="off"></label><button type="button" data-ai-save-key>Schlüssel speichern</button></details>' +
      '<label>Datei <select data-ai-file><option value="modern.html">Seite</option><option value="kp-inline.css">Design</option><option value="kp-inline.js">Interaktionen</option></select></label>' +
      '<label>Dein Wunsch <textarea data-ai-prompt rows="3" placeholder="Mach die Überschrift oben kleiner"></textarea></label>' +
      '<div class="kp-ai-actions"><button type="button" data-ai-mic>🎙 Sprechen</button><button type="button" data-ai-send>Entwurf erstellen</button></div>' +
      '<p data-ai-status role="status" aria-live="polite"></p>';
    document.body.append(button, panel);
    button.addEventListener('click', async () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        try { csrf = (await request('api/code-editor.php?action=session')).csrf; status('Bereit.'); }
        catch (error) { status(error.message); }
        panel.querySelector('[data-ai-prompt]').focus();
      } else stopSpeech();
    });
    panel.querySelector('[data-ai-save-key]').addEventListener('click', async () => {
      const input = panel.querySelector('[data-ai-key]');
      const save = panel.querySelector('[data-ai-save-key]');
      if (!input.value.trim()) { status('Bitte den Gemini-Schlüssel eingeben.'); return; }
      save.disabled = true;
      try {
        if (!csrf) csrf = (await request('api/code-editor.php?action=session')).csrf;
        await request('api/ai-draft.php', {method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf}, body:JSON.stringify({action:'save-key',key:input.value.trim()})});
        status('Schlüssel gespeichert. Eine KI-Antwort ist noch nicht geprüft.');
      } catch (error) { status(error.message); }
      finally { input.value = ''; save.disabled = false; }
    });
    panel.querySelector('[data-ai-close]').addEventListener('click', () => {stopSpeech(); panel.hidden = true;});
    panel.querySelector('[data-ai-mic]').addEventListener('click', () => {
      if (listening) {stopSpeech(); return;}
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {status('Spracherkennung ist in diesem Browser nicht verfügbar. Bitte Text eingeben.'); return;}
      recognition = new SpeechRecognition(); recognition.lang = 'de-DE'; recognition.continuous = false; recognition.interimResults = false;
      recognition.onresult = (event) => { panel.querySelector('[data-ai-prompt]').value = event.results[0][0].transcript; status('Gesprochenen Wunsch prüfen und Entwurf erstellen.'); };
      recognition.onerror = (event) => status('Mikrofon: ' + event.error);
      recognition.onend = () => {listening = false; panel.querySelector('[data-ai-mic]').textContent = '🎙 Sprechen';};
      try {recognition.start(); listening = true; panel.querySelector('[data-ai-mic]').textContent = '■ Stoppen'; status('Ich höre zu …');}
      catch (error) {status(error.message);}
    });
    panel.querySelector('[data-ai-send]').addEventListener('click', async () => {
      if (busy) return;
      const prompt = panel.querySelector('[data-ai-prompt]').value.trim();
      const file = panel.querySelector('[data-ai-file]').value;
      if (!prompt) {status('Bitte eine Änderung beschreiben.'); return;}
      busy = true; panel.querySelector('[data-ai-send]').disabled = true; status('Entwurf wird erstellt …');
      try {
        if (!csrf) csrf = (await request('api/code-editor.php?action=session')).csrf;
        const result = await request('api/ai-draft.php', {method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
          body:JSON.stringify({prompt,file})});
        window.dispatchEvent(new CustomEvent('kp-ai-code-draft', {detail:result}));
        status('Entwurf im Code-Fenster geladen. Dort prüfen und bei Bedarf veröffentlichen.');
        panel.hidden = true;
      } catch (error) {status(error.message);}
      finally {busy = false; panel.querySelector('[data-ai-send]').disabled = false;}
    });
    new MutationObserver(() => {
      const editing = document.body.classList.contains('editing');
      button.hidden = !editing;
      if (!editing) {panel.hidden = true; stopSpeech();}
    }).observe(document.body, {attributes:true, attributeFilter:['class']});
    button.hidden = !document.body.classList.contains('editing');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',create); else create();
})();
