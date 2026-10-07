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
  const status = (message) => {
    if (panel) panel.querySelector('[data-ai-status]').textContent = message;
    if (/^(Überschrift geändert|Änderung übernommen|Änderung rückgängig)/.test(message) && 'speechSynthesis' in window) {
      const reply=new SpeechSynthesisUtterance('Erledigt. Die Änderung ist sichtbar.'); reply.lang='de-DE'; window.speechSynthesis.speak(reply);
    }
  };
  function stopSpeech() { if (recognition && listening) recognition.stop(); listening = false; }

  let targets = new Map(), directBusy = false;
  const colors = {blau:'#2563eb',rot:'#dc2626',grün:'#16a34a',gruen:'#16a34a',orange:'#f07a22',weiß:'#ffffff',weiss:'#ffffff',schwarz:'#000000',gelb:'#facc15',lila:'#9333ea'};
  function context() {
    targets = new Map();
    return [...document.querySelectorAll('main h1,main h2,main h3,main p,[data-editable-text],.masthead h1')]
      .filter(n => !n.closest('[data-transient],.kp-ai-panel') && n.getClientRects().length && n.textContent.trim())
      .slice(0,40).map((n,i) => {const id='e'+i; targets.set(id,n); return {id,tag:n.tagName,text:n.textContent.trim().slice(0,100)};});
  }
  function applyOperations(ops) {
    if (!document.body.classList.contains('editing')) throw new Error('Bearbeitungsmodus erforderlich.');
    const validated = ops.map(op => {
      const n=targets.get(op.id);
      if (!n?.isConnected) throw new Error('Ziele haben sich geändert. Bitte erneut sprechen.');
      if (op.type==='color' && !/^#[0-9a-f]{6}$/i.test(op.value)) throw new Error('Ungültige Farbe.');
      if (op.type==='fontSize' && !(Number(op.value)>=8 && Number(op.value)<=120)) throw new Error('Ungültige Schriftgröße.');
      if (op.type==='text' && (typeof op.value!=='string' || op.value.length>2000 || n.children.length)) throw new Error('Dieser Text benötigt eine gezieltere Auswahl.');
      if (!['color','fontSize','text'].includes(op.type)) throw new Error('Befehl nicht unterstützt.');
      return {n,op};
    });
    if (typeof saveDraft!=='function' || typeof recordHistory!=='function') throw new Error('Editor-Speicher noch nicht bereit.');
    recordHistory();
    validated.forEach(({n,op}) => {
      if (op.type==='color') n.style.setProperty('color',op.value,'important');
      if (op.type==='fontSize') n.style.setProperty('font-size',Number(op.value)+'px','important');
      if (op.type==='text') n.textContent=op.value;
    });
    window.KPStudio?.captureDetail?.(); saveDraft(); recordHistory();
    document.dispatchEvent(new CustomEvent('kp-dirty',{detail:true}));
    document.dispatchEvent(new CustomEvent('editor-layout-change'));
  }
  async function directCommand(prompt) {
    if (directBusy) return;
    directBusy=true;
    try {
      if (/^(bitte )?(rückgängig|zurück|undo)[.!]?$/i.test(prompt.trim())) {
        if (!window.KPHistoryState?.canUndo?.()) throw new Error('Keine Änderung zum Rückgängigmachen.');
        document.querySelector('[data-history="undo"]')?.click(); status('Änderung rückgängig gemacht.'); return;
      }
      const elements=context();
      const heading=[...targets].filter(([,n])=>n.tagName==='H1' && /Koblenzer Puppenspiele/i.test(n.textContent));
      const words=prompt.toLowerCase();
      const matches=Object.keys(colors).filter(k=>new RegExp('\\b'+k+'\\b','i').test(words));
      if (heading.length===1 && /überschrift|koblenzer puppenspiele/.test(words) && matches.length===1 && !/nicht|außer|ausser|hintergrund|alle|unten|zweite|andere/.test(words)) {
        applyOperations([{id:heading[0][0],type:'color',value:colors[matches[0]]}]); status('Überschrift geändert. Als Entwurf; rückgängig möglich.'); return;
      }
      status('Ich prüfe deinen Wunsch …');
      if (!csrf) csrf=(await request('api/code-editor.php?action=session')).csrf;
      const result=await request('api/ai-draft.php',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action:'editor-command',prompt,elements})});
      if (!result.operations.length) {status(result.message || 'Welches Element möchtest du ändern?');return;}
      applyOperations(result.operations); status('Änderung übernommen. Als Entwurf; rückgängig möglich.');
    } catch(error) {status(error.message);}
    finally {directBusy=false;}
  }

  function create() {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'kp-ai-float'; button.textContent = '✦ KI';
    button.dataset.transient=''; button.setAttribute('aria-label', 'Sprachassistent starten'); button.hidden = true;
    panel = document.createElement('section');
    panel.className = 'kp-ai-panel'; panel.dataset.transient=''; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'KI-Assistent');
    panel.innerHTML = '<header><strong>KI-Assistent</strong><button type="button" data-ai-close aria-label="Schließen">×</button></header>' +
      '<p>Sag, was sich ändern soll. Einfache Änderungen siehst du direkt. Es wird nichts veröffentlicht.</p>' +
      '<details><summary>Gemini-Schlüssel verwalten</summary><p>Nur auf dem Testserver gespeichert. Bei Bereinigung des privaten Serverspeichers erneut eingeben.</p><label>API-Schlüssel <input type="password" data-ai-key autocomplete="off"></label><button type="button" data-ai-save-key>Schlüssel speichern</button></details>' +
      '<label>Dein Wunsch <textarea data-ai-prompt rows="3" placeholder="Mach die Überschrift oben kleiner"></textarea></label>' +
      '<div class="kp-ai-actions"><button type="button" data-ai-mic>🎙 Sprechen</button><button type="button" data-ai-send>Ändern</button></div>' +
      '<p data-ai-status role="status" aria-live="polite"></p>';
    document.body.append(button, panel);
    button.addEventListener('click', async () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        try { csrf = (await request('api/code-editor.php?action=session')).csrf; status('Sag deinen Änderungswunsch.'); }
        catch (error) { status(error.message); }
        panel.querySelector('[data-ai-mic]').click();
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
      recognition.onresult = (event) => { const spoken=event.results[0][0].transcript; panel.querySelector('[data-ai-prompt]').value=spoken; directCommand(spoken); };
      recognition.onerror = (event) => status('Mikrofon: ' + event.error);
      recognition.onend = () => {listening = false; button.classList.remove('is-listening'); button.textContent='✦ KI'; panel.querySelector('[data-ai-mic]').textContent = '🎙 Sprechen';};
      try {recognition.start(); listening = true; button.classList.add('is-listening'); button.textContent='🎙'; panel.querySelector('[data-ai-mic]').textContent = '■ Stoppen'; status('Ich höre zu …');}
      catch (error) {status(error.message);}
    });
    panel.querySelector('[data-ai-send]').addEventListener('click', async () => {
      if (busy) return;
      const prompt = panel.querySelector('[data-ai-prompt]').value.trim();
      if (!prompt) {status('Bitte eine Änderung beschreiben.'); return;}
      await directCommand(prompt);
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
