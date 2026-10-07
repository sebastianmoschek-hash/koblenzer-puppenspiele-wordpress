(() => {
  'use strict';
  if (location.hostname !== 'neu.koblenzer-puppenspiele.de') return;
  let orb, mute, hint, active=false, speaking=false, restartTimer, hintTimer;
  let panel, csrf = '', recognition, listening = false, busy = false;
  const request = async (url, options = {}) => {
    const response = await fetch(url, {credentials:'same-origin', cache:'no-store', ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen (' + response.status + ')');
    return data;
  };

  function paint() {
    if (!orb) return;
    orb.dataset.phase=!active?'idle':directBusy?'thinking':speaking?'speaking':'listening';
    orb.setAttribute('aria-pressed',String(active));
    orb.setAttribute('aria-label',active?'Sprachmodus pausieren':'Sprachmodus starten');
    orb.textContent=active?'✦':'✦ KI'; mute.hidden=!active;
  }
  function resume() {
    clearTimeout(restartTimer);
    if (active && !listening && !directBusy && !speaking && !document.hidden) restartTimer=setTimeout(startListening,350);
  }
  const status = message => {
    if (panel) panel.querySelector('[data-ai-status]').textContent=message;
    if (hint) {hint.textContent=message;hint.hidden=false;clearTimeout(hintTimer);hintTimer=setTimeout(()=>{hint.hidden=true;},5000);}
    if (active && !/^(Ich höre|Ich prüfe|Sag deinen)/.test(message)) {
      if ('speechSynthesis' in window) {
        speaking=true;paint();
        const reply=new SpeechSynthesisUtterance(/^Überschrift geändert|^Änderung übernommen/.test(message)?'Erledigt.':/^Änderung rückgängig/.test(message)?'Rückgängig gemacht.':message);
        reply.lang='de-DE';
        const voice=window.speechSynthesis.getVoices().find(v=>v.lang==='de-DE' && /Google|Microsoft/.test(v.name));
        if(voice)reply.voice=voice;
        reply.onend=reply.onerror=()=>{speaking=false;paint();resume();};
        window.speechSynthesis.speak(reply);
      } else resume();
    }
  };
  function stopSpeech() {
    active=false;clearTimeout(restartTimer);if(recognition)recognition.abort();
    listening=false;speaking=false;window.speechSynthesis?.cancel();paint();
  }
  function startListening() {
    if(!active || listening || directBusy || speaking || document.hidden)return;
    const API=window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!API){stopSpeech();status('Spracherkennung nicht verfügbar. KI-Knopf gedrückt halten für Texteingabe.');return;}
    recognition=new API();recognition.lang='de-DE';recognition.continuous=false;recognition.interimResults=false;
    recognition.onresult=event=>{
      const spoken=event.results[0][0].transcript;recognition.abort();listening=false;
      panel.querySelector('[data-ai-prompt]').value=spoken;directCommand(spoken);
    };
    recognition.onerror=event=>{
      if(event.error==='aborted' || event.error==='no-speech')return;
      stopSpeech();status('Mikrofon: '+event.error+'. Zum Fortsetzen erneut KI antippen.');
    };
    recognition.onend=()=>{listening=false;paint();resume();};
    try{recognition.start();listening=true;paint();status('Ich höre zu …');}
    catch(error){stopSpeech();status(error.message);}
  }

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
    directBusy=true; paint();
    try {
      const normalized=prompt.toLowerCase().replace(/[.,!?;:]/g,' ').replace(/\s+/g,' ').trim();
      const undoCommand= /rückgängig|rueckgaengig|rückgängigbutton|undo/.test(normalized) && !/\b(nicht|kein|keine)\b/.test(normalized);
      if (undoCommand || /^(bitte )?(zurück|zurueck)$/.test(normalized)) {
        if (!window.KPHistoryState?.canUndo?.()) throw new Error('Keine Änderung zum Rückgängigmachen.');
        const undoButton=document.querySelector('[data-history="undo"]');
        if (!undoButton || undoButton.disabled) throw new Error('Keine Änderung zum Rückgängigmachen.');
        undoButton.click(); status('Änderung rückgängig gemacht.'); return;
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
    finally {directBusy=false;paint();resume();}
  }

  function create() {
    const button = orb = document.createElement('button');
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

    mute=document.createElement('button');mute.type='button';mute.className='kp-ai-mute';mute.textContent='◼';mute.hidden=true;
    mute.dataset.transient='';mute.setAttribute('aria-label','Mikrofon ausschalten');
    hint=document.createElement('div');hint.className='kp-ai-hint';hint.dataset.transient='';hint.hidden=true;hint.setAttribute('role','status');
    document.body.append(button,hint,panel);
    mute.addEventListener('click',()=>{stopSpeech();status('Mikrofon aus.');});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSpeech();});
    let holdTimer, held=false;
    const settings=()=>{stopSpeech();panel.hidden=false;panel.querySelector('details').open=true;};
    button.addEventListener('pointerdown',()=>{held=false;holdTimer=setTimeout(()=>{held=true;settings();},600);});
    ['pointerup','pointercancel','pointerleave'].forEach(type=>button.addEventListener(type,()=>clearTimeout(holdTimer)));
    button.addEventListener('contextmenu',event=>{event.preventDefault();held=true;settings();});
    button.title='Antippen: Sprachmodus. Gedrückt halten: KI-Einstellungen.';

    button.addEventListener('click',event=>{
      if(held){held=false;return;}
      if(event.shiftKey){settings();return;}
      if(active){stopSpeech();status('Sprachmodus pausiert.');return;}
      panel.hidden=true;active=true;startListening();
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
    panel.querySelector('[data-ai-mic]').addEventListener('click',()=>{panel.hidden=true;active=true;startListening();});
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
    button.hidden = !document.body.classList.contains('editing'); paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',create); else create();
})();
