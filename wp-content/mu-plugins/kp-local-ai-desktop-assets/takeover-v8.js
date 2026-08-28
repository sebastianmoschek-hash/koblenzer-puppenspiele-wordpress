(() => {
  'use strict';

  const cfg = window.KPLocalDesktopAIConfig || {};
  if (matchMedia('(max-width:900px)').matches || !cfg.agentUrl) return;
  document.documentElement.classList.add('kp-local-ai-takeover');

  const q = selector => document.querySelector(selector);
  const ui = {
    launch: q('.kp-lat-launch'), panel: q('.kp-lat-panel'), close: q('.kp-lat-close'),
    connect: q('.kp-lat-connect'), reconnect: q('.kp-lat-reconnect'), share: q('.kp-lat-share'),
    observe: q('.kp-lat-observe'), mic: q('.kp-lat-mic'), speak: q('.kp-lat-speak'),
    testVoice: q('.kp-lat-test-voice'), log: q('.kp-lat-log'), input: q('.kp-lat-input'),
    send: q('.kp-lat-send'), stop: q('.kp-lat-stop'), publish: q('.kp-lat-publish'),
    revert: q('.kp-lat-revert'), video: q('.kp-lat-video'), preview: q('.kp-lat-preview'),
    agentBadge: q('.kp-lat-agent-badge'), screenBadge: q('.kp-lat-screen-badge'),
    voiceBadge: q('.kp-lat-voice-badge'),
  };
  if (!ui.launch || !ui.panel) return;

  const STORE_SPEAK = 'kp-local-ai-speak-v2';
  const STORE_TOKEN = 'kp-local-ai-agent-token-v1';
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let ready = false;
  let busy = false;
  let stream = null;
  let recognition = null;
  let conversation = false;
  let recognitionStarting = false;
  let speaking = false;
  let speakReplies = localStorage.getItem(STORE_SPEAK) !== '0';
  let selectedVoice = null;
  let history = [];
  let pending = null;
  let observing = false;
  let observationTimer = null;
  let lastFingerprint = null;
  let lastObservationAt = 0;

  function append(who, text) {
    ui.log.textContent += `\n\n${who}: ${String(text || '').trim()}`;
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function setBusy(value) {
    busy = !!value;
    [ui.connect, ui.reconnect, ui.share, ui.observe, ui.send].forEach(button => {
      if (button) button.disabled = busy;
    });
    ui.input.disabled = busy || !ready;
    ui.send.disabled = busy || !ready;
    ui.publish.disabled = busy || !pending;
    ui.revert.disabled = busy || !pending;
  }

  function parseJson(text) {
    const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Gemma hat keinen gültigen JSON-Plan geliefert.');
    return JSON.parse(clean.slice(start, end + 1));
  }

  function agentToken() {
    return localStorage.getItem(STORE_TOKEN) || '';
  }

  async function rawAgent(path, options = {}, allowPair = false) {
    const headers = { 'Content-Type': 'application/json', 'X-KP-Desktop-Agent': '1' };
    const token = agentToken();
    if (token && !allowPair) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(cfg.agentUrl + path, {
      method: options.method || 'GET', mode: 'cors', cache: 'no-store', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      const error = new Error(data?.error || `Laptop-Agent HTTP ${response.status}`);
      error.code = data?.code || '';
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function pairAgent() {
    const code = prompt('Der Laptop-Agent zeigt im schwarzen Fenster einen sechsstelligen Kopplungscode. Bitte hier eingeben:');
    if (!code) throw new Error('Kopplung wurde abgebrochen.');
    const result = await rawAgent('/v1/pair', { method: 'POST', body: { code: String(code).trim() } }, true);
    localStorage.setItem(STORE_TOKEN, String(result.token || ''));
  }

  async function agent(path, options = {}) {
    try {
      return await rawAgent(path, options);
    } catch (error) {
      if (error.status !== 401 || options.noPair) throw error;
      await pairAgent();
      return rawAgent(path, { ...options, noPair: true });
    }
  }

  async function gemma(system, promptText, image = '') {
    const message = { role: 'user', content: promptText };
    if (image) message.images = [image];
    const out = await agent('/v1/chat', {
      method: 'POST', body: { messages: [{ role: 'system', content: system }, message] },
    });
    return parseJson(out.content);
  }

  function refreshVoices() {
    if (!('speechSynthesis' in window)) {
      selectedVoice = null;
      ui.voiceBadge.textContent = 'Stimme fehlt';
      ui.voiceBadge.classList.add('is-warn');
      return null;
    }
    const voices = speechSynthesis.getVoices();
    const german = voice => /^de(?:-|_)/i.test(voice.lang || '');
    selectedVoice = voices.find(voice => german(voice) && voice.localService === true)
      || voices.find(voice => german(voice) && voice.localService !== false)
      || voices.find(voice => voice.localService === true)
      || null;
    if (selectedVoice) {
      ui.voiceBadge.textContent = `Stimme: ${selectedVoice.name}`;
      ui.voiceBadge.classList.toggle('is-warn', !german(selectedVoice));
      ui.voiceBadge.classList.add('is-on');
    } else {
      ui.voiceBadge.textContent = voices.length ? 'Keine lokale Stimme' : 'Stimmen laden …';
      ui.voiceBadge.classList.add('is-warn');
      ui.voiceBadge.classList.remove('is-on');
    }
    return selectedVoice;
  }

  async function ensureVoice() {
    refreshVoices();
    if (selectedVoice) return selectedVoice;
    for (let i = 0; i < 12 && !selectedVoice; i++) {
      await wait(150);
      refreshVoices();
    }
    return selectedVoice;
  }

  function speechChunks(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
    if (!normalized) return [];
    const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
    const chunks = [];
    for (const sentence of sentences) {
      const clean = sentence.trim();
      if (!clean) continue;
      if (clean.length <= 240) chunks.push(clean);
      else for (let i = 0; i < clean.length; i += 220) chunks.push(clean.slice(i, i + 220));
    }
    return chunks;
  }

  function stopRecognition() {
    if (!recognition) return;
    try { recognition.abort(); } catch (_) {}
    recognition = null;
    recognitionStarting = false;
  }

  async function say(text, force = false) {
    if ((!speakReplies && !force) || !('speechSynthesis' in window)) return false;
    const voice = await ensureVoice();
    if (!voice) {
      append('System', 'Windows/Chromium stellt keine lokale Stimme bereit. Bitte unter Windows eine deutsche Sprachausgabestimme installieren.');
      return false;
    }
    stopRecognition();
    speechSynthesis.cancel();
    speaking = true;
    try {
      for (const chunk of speechChunks(text)) {
        await new Promise((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = /^de/i.test(voice.lang || '') ? voice.lang : 'de-DE';
          utterance.voice = voice;
          utterance.rate = 1;
          utterance.pitch = 1;
          utterance.volume = 1;
          const timeout = setTimeout(() => reject(new Error('Die Windows-Stimme hat nicht geantwortet.')), 30000);
          utterance.onend = () => { clearTimeout(timeout); resolve(); };
          utterance.onerror = event => { clearTimeout(timeout); reject(new Error(`Sprachausgabe: ${event.error || 'Fehler'}`)); };
          speechSynthesis.speak(utterance);
        });
      }
      return true;
    } catch (error) {
      append('System', error.message || String(error));
      return false;
    } finally {
      speaking = false;
      if (conversation) setTimeout(startRecognition, 350);
    }
  }

  async function testVoice() {
    speakReplies = true;
    localStorage.setItem(STORE_SPEAK, '1');
    updateSpeechUi();
    await say('Hallo Marc. Die lokale Sprachausgabe funktioniert jetzt.', true);
  }

  function updateSpeechUi() {
    ui.speak.textContent = speakReplies ? '🔊 Stimme an' : '🔇 Stimme aus';
    ui.speak.classList.toggle('is-on', speakReplies);
    ui.mic.textContent = conversation ? '🎙 Gespräch an' : '🎙 Gespräch';
    ui.mic.classList.toggle('is-on', conversation);
  }

  async function ensureLocalSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) throw new Error('Chromium stellt keine Spracherkennung bereit. Tippen funktioniert weiterhin.');
    const probe = new Recognition();
    if (!('processLocally' in probe)) {
      try { probe.abort(); } catch (_) {}
      throw new Error('Dieser Chromium-Build unterstützt keine garantiert lokale Spracherkennung. Es wird nicht auf Cloud-Sprache zurückgefallen.');
    }
    try { probe.abort(); } catch (_) {}
    const options = { langs: ['de-DE'], processLocally: true };
    if (typeof Recognition.available === 'function') {
      let availability = await Recognition.available(options);
      if (availability === 'downloadable' || availability === 'downloading') {
        append('System', 'Das deutsche Offline-Sprachpaket wird einmalig von Chromium installiert.');
        if (typeof Recognition.install !== 'function' || !await Recognition.install(options)) {
          throw new Error('Das deutsche Offline-Sprachpaket konnte nicht installiert werden.');
        }
        availability = await Recognition.available(options);
      }
      if (availability !== 'available') throw new Error(`Deutsche lokale Sprache ist nicht verfügbar (${availability}).`);
    }
    return Recognition;
  }

  async function startRecognition() {
    if (!conversation || busy || speaking || recognition || recognitionStarting) return;
    recognitionStarting = true;
    try {
      const Recognition = await ensureLocalSpeechRecognition();
      if (!conversation || busy || speaking) return;
      const current = new Recognition();
      recognition = current;
      current.lang = 'de-DE';
      current.processLocally = true;
      current.interimResults = true;
      current.continuous = false;
      current.maxAlternatives = 1;
      let finalText = '';
      current.onstart = () => { ui.mic.textContent = '🎙 Ich höre lokal …'; };
      current.onresult = event => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const value = String(event.results[i][0]?.transcript || '').trim();
          if (event.results[i].isFinal) finalText += `${finalText ? ' ' : ''}${value}`;
          else interim += `${interim ? ' ' : ''}${value}`;
        }
        ui.input.value = (finalText || interim).trim();
      };
      current.onerror = event => {
        const code = String(event.error || 'Fehler');
        if (!['aborted', 'no-speech'].includes(code)) append('System', `Lokale Sprache: ${code}`);
      };
      current.onend = () => {
        if (recognition === current) recognition = null;
        recognitionStarting = false;
        updateSpeechUi();
        const text = finalText.trim();
        if (text && conversation && !busy) {
          ui.input.value = text;
          sendRequest();
        } else if (conversation && !busy && !speaking) setTimeout(startRecognition, 350);
      };
      current.start();
    } catch (error) {
      recognition = null;
      conversation = false;
      append('System', error.message || String(error));
      updateSpeechUi();
    } finally {
      recognitionStarting = false;
    }
  }

  async function toggleConversation() {
    if (speaking) {
      speechSynthesis.cancel();
      speaking = false;
    }
    conversation = !conversation;
    if (!conversation) stopRecognition();
    updateSpeechUi();
    if (conversation) {
      speakReplies = true;
      localStorage.setItem(STORE_SPEAK, '1');
      updateSpeechUi();
      await startRecognition();
    }
  }

  async function connectAgent() {
    setBusy(true);
    try {
      const health = await agent('/v1/health');
      if (!health.repoOk) throw new Error('Der Laptop-Agent findet das lokale Git-Repository nicht.');
      if (!health.ollama) throw new Error(`Ollama ist nicht erreichbar. Modell: ${health.model || cfg.model}`);
      ready = true;
      ui.agentBadge.textContent = `Agent an · ${health.model || cfg.model}`;
      ui.agentBadge.classList.add('is-on');
      ui.connect.textContent = 'Agent verbunden';
      append('System', `Laptop-Agent verbunden. Branch: ${health.branch || 'unbekannt'}. Android-Schreibzugriff: AUS.`);
      await refreshPending();
      ui.input.focus();
    } catch (error) {
      ready = false;
      ui.agentBadge.textContent = 'Agent aus';
      ui.agentBadge.classList.remove('is-on');
      append('System', `${error.message || error}\nAgent neu starten: desktop\\homepage-agent\\start-windows.ps1`);
    } finally { setBusy(false); }
  }

  async function startShare() {
    if (stream) { stopShare(); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Bildschirmfreigabe wird nicht unterstützt.');
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 4, max: 8 } }, audio: false,
      preferCurrentTab: false, surfaceSwitching: 'include',
    });
    ui.video.srcObject = stream;
    await ui.video.play().catch(() => {});
    ui.preview.classList.add('is-on');
    ui.share.classList.add('is-on');
    ui.share.textContent = 'Freigabe läuft';
    ui.screenBadge.textContent = 'Bild live';
    ui.screenBadge.classList.add('is-on');
    stream.getVideoTracks()[0]?.addEventListener('ended', stopShare, { once: true });
  }

  function stopObserving() {
    observing = false;
    if (observationTimer) clearInterval(observationTimer);
    observationTimer = null;
    lastFingerprint = null;
    ui.observe.classList.remove('is-on');
    ui.observe.textContent = '👁 Beobachten';
  }

  function stopShare() {
    stopObserving();
    if (stream) for (const track of stream.getTracks()) track.stop();
    stream = null;
    ui.video.srcObject = null;
    ui.preview.classList.remove('is-on');
    ui.share.classList.remove('is-on');
    ui.share.textContent = 'Bildschirm/Tab/Fenster';
    ui.screenBadge.textContent = 'Bild aus';
    ui.screenBadge.classList.remove('is-on');
  }

  function frameCanvas(maxSide = 1280) {
    if (!stream || !ui.video.videoWidth || !ui.video.videoHeight) return null;
    const scale = Math.min(1, maxSide / Math.max(ui.video.videoWidth, ui.video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(ui.video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(ui.video.videoHeight * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(ui.video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function currentFrame() {
    const canvas = frameCanvas();
    return canvas ? canvas.toDataURL('image/jpeg', 0.72).split(',')[1] || '' : '';
  }

  function fingerprint() {
    const source = frameCanvas(96);
    if (!source) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 18;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.drawImage(source, 0, 0, 32, 18);
    const bytes = ctx.getImageData(0, 0, 32, 18).data;
    const result = [];
    for (let i = 0; i < bytes.length; i += 16) result.push(Math.round((bytes[i] + bytes[i + 1] + bytes[i + 2]) / 3));
    return result;
  }

  function fingerprintChange(a, b) {
    if (!a || !b || a.length !== b.length) return 1;
    let total = 0;
    for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
    return total / (a.length * 255);
  }

  async function observationTick() {
    if (!observing || busy || speaking) return;
    const next = fingerprint();
    const change = fingerprintChange(lastFingerprint, next);
    lastFingerprint = next;
    if (change < 0.12 || Date.now() - lastObservationAt < 18000) return;
    lastObservationAt = Date.now();
    try {
      const result = await gemma(
        'Du beobachtest lokal den freigegebenen Bildschirm. Antworte nur als JSON: {"important":true|false,"message":"kurzer deutscher Hinweis"}. Wichtig sind neue sichtbare Fehler, Warnungen, fehlgeschlagene Builds oder überraschende Layoutschäden. Normale Bewegung und Texteingabe sind nicht wichtig.',
        'Prüfe den aktuellen Bildschirm ausschließlich auf eine neue wichtige sichtbare Änderung.',
        currentFrame()
      );
      if (result.important && result.message) {
        append('KI', result.message);
        await say(result.message);
      }
    } catch (error) { append('System', `Beobachtung: ${error.message || error}`); }
  }

  async function toggleObserve() {
    if (observing) { stopObserving(); return; }
    if (!stream) await startShare();
    observing = true;
    lastFingerprint = fingerprint();
    ui.observe.classList.add('is-on');
    ui.observe.textContent = '👁 Beobachten an';
    observationTimer = setInterval(observationTick, 4000);
  }

  const bridge = () => window.KPRepairMobile?.ready ? window.KPRepairMobile : null;
  async function getBridge() {
    for (let i = 0; i < 30; i++) { if (bridge()) return bridge(); await wait(100); }
    return null;
  }

  const plannerSystem = `Du bist die vollständig lokale Homepage-KI der Koblenzer Puppenspiele. Antworte nur als JSON ohne Markdown: {"reply":"kurze deutsche Antwort","save":false,"actions":[{"type":"edit_element","live_id":"live-1","property":"text","value":"Neuer Text"},{"type":"set_global_design","key":"accent_color","value":"#D97706"},{"type":"undo"},{"type":"redo"},{"type":"save"},{"type":"request_code_change","description":"präzise technische Änderung"}]}. Direkte Editoraktionen nur für angebotene live_id-Werte. Für PHP, JavaScript, CSS, neue Funktionen oder fehlende Editoraktionen request_code_change. Nie Android oder mobile KI auswählen. Nie Erfolg erfinden. Speichern nur auf ausdrücklichen Wunsch.`;
  const selectSystem = `Du bist lokaler Code-Diagnostiker. Antworte nur als JSON: {"reply":"kurz","diagnosis":"präzise","confidence":"low|medium|high","files":["pfad"]}. Wähle höchstens 5 vorhandene Dateien. Android, mobile KI und Workflows sind verboten. Tests unter qa/ dürfen gelesen, aber niemals verändert werden.`;
  const patchSystem = `Du erzeugst einen minimalen lokalen Website-Patch. Antworte nur als JSON: {"summary":"kurz","risk":"low|medium|high","changes":[{"path":"exakter Pfad","operations":[{"search":"exakter eindeutiger vorhandener Text","replace":"vollständiger Ersatz"}]}]}. Höchstens 5 Website-Dateien und 10 Operationen. Keine Android-, qa/-, Workflow-, Secret- oder mobile KI-Dateien. Keine Shell-Befehle. Entferne keine Auth-, Nonce- oder Sicherheitsprüfung. Bei Unsicherheit changes leer.`;
  const explicitSave = text => /\b(speicher(?:n|e|t)?|übernehm(?:en|e|t)?|dauerhaft|veröffentlich(?:en|e|t)?)\b/i.test(String(text || ''));

  async function refreshPending() {
    if (!ready) return;
    try {
      const state = await agent('/v1/pending', { noPair: true });
      pending = state.pending || null;
    } catch (_) { pending = null; }
    setBusy(busy);
  }

  async function publishPending() {
    if (!pending || busy) return;
    if (!confirm(`Die geprüften lokalen Änderungen jetzt committen und auf den Desktop-Staging-Branch pushen?\n\n${(pending.changed || []).join('\n')}`)) return;
    setBusy(true);
    try {
      const result = await agent('/v1/publish', { method: 'POST', body: { summary: pending.summary || 'Lokaler Homepage-Fix' } });
      append('System', result.pushed
        ? `Commit ${String(result.commit || '').slice(0, 10)} wurde gepusht. CircleCI veröffentlicht die Änderung jetzt ausschließlich auf Staging.`
        : `Die Änderung wurde lokal committed, aber Push schlug fehl: ${result.pushError || 'unbekannt'}`);
      pending = null;
    } catch (error) { append('System', `Staging-Veröffentlichung: ${error.message || error}`); }
    finally { setBusy(false); await refreshPending(); }
  }

  async function revertPending() {
    if (!pending || busy || !confirm('Die noch nicht veröffentlichten lokalen Codeänderungen wirklich verwerfen?')) return;
    setBusy(true);
    try { await agent('/v1/revert', { method: 'POST', body: {} }); append('System', 'Lokale Codeänderungen wurden sicher zurückgenommen.'); pending = null; }
    catch (error) { append('System', `Zurücknehmen: ${error.message || error}`); }
    finally { setBusy(false); await refreshPending(); }
  }

  async function codeChange(description) {
    const catalog = await agent('/v1/catalog');
    const selection = await gemma(selectSystem, `AUFGABE:\n${description}\n\nDATEIKATALOG:\n${(catalog.files || []).join('\n')}`);
    const paths = (Array.isArray(selection.files) ? selection.files : []).filter(Boolean).slice(0, 5);
    if (!paths.length) return selection.reply || 'Gemma konnte keine passende Website-Datei bestimmen.';
    const files = (await agent('/v1/files', { method: 'POST', body: { paths } })).files || [];
    const plan = await gemma(patchSystem, `AUFGABE:\n${description}\n\nDIAGNOSE:\n${selection.diagnosis || ''}\n\nDATEIEN:\n${JSON.stringify(files)}`);
    const changes = Array.isArray(plan.changes) ? plan.changes : [];
    if (!changes.length) return plan.summary || 'Kein ausreichend sicherer Code-Patch gefunden.';
    const names = changes.map(change => change.path).join('\n');
    if (!confirm(`${plan.summary || 'Lokale Codeänderung'}\n\nDateien:\n${names}\n\nRisiko: ${plan.risk || 'medium'}\n\nJetzt lokal ändern und vollständig prüfen?`)) return 'Code-Patch verworfen; lokale Dateien blieben unverändert.';
    const result = (await agent('/v1/apply', { method: 'POST', body: { plan } })).result || {};
    pending = result.pending || { changed: result.changed || [], summary: plan.summary || '' };
    const tests = (result.tests || []).map(test => `${test.ok ? '✓' : '✗'} ${test.name}`).join('\n');
    await refreshPending();
    if (confirm(`Lokaler Website-Code wurde geändert und geprüft.\n\n${(result.changed || []).join('\n')}\n\n${tests}\n\nJetzt committen und auf Staging veröffentlichen?`)) await publishPending();
    return 'Der geprüfte Code-Patch wurde lokal vorbereitet. Production bleibt unverändert.';
  }

  async function runRequest(text) {
    const editor = await getBridge();
    let page = {}, elements = { content: [], editorUi: [] };
    if (editor) { try { page = editor.context(); elements = editor.editableElements(); } catch (_) {} }
    const prior = history.slice(-4).map(item => `NUTZER: ${item.user}\nKI: ${item.assistant}`).join('\n');
    const promptText = `WUNSCH:\n${text}\n\nLETZTE UNTERHALTUNG:\n${prior || 'Noch keine.'}\n\nSEITENKONTEXT:\n${JSON.stringify(page)}\n\nEDITIERBARE ELEMENTE:\n${JSON.stringify(elements)}\n\nDIREKTER EDITOR: ${!!editor}. BILDSCHIRM GETEILT: ${!!stream}. Liefere nur den JSON-Plan.`;
    const plan = await gemma(plannerSystem, promptText, currentFrame());
    const results = [];
    let codeRequest = '';
    for (const action of (Array.isArray(plan.actions) ? plan.actions : []).slice(0, 10)) {
      if (!action || typeof action !== 'object') continue;
      try {
        if (action.type === 'edit_element' && editor) results.push(await editor.editElement(String(action.live_id || ''), String(action.property || ''), String(action.value ?? '')));
        else if (action.type === 'set_global_design' && editor) results.push(await editor.setDesign(String(action.key || ''), String(action.value ?? '')));
        else if (action.type === 'undo' && editor) results.push(await editor.undo());
        else if (action.type === 'redo' && editor) results.push(await editor.redo());
        else if (action.type === 'save' && editor && explicitSave(text)) results.push(await editor.saveChanges());
        else if (action.type === 'request_code_change') codeRequest ||= String(action.description || text);
        else if (!editor && ['edit_element', 'set_global_design', 'save'].includes(action.type)) codeRequest ||= text;
      } catch (error) { codeRequest ||= `${text}. Direkte Editoraktion scheiterte: ${error.message || error}`; }
    }
    if (plan.save && editor && explicitSave(text)) results.push(await editor.saveChanges());
    let repair = '';
    if (codeRequest) repair = await codeChange(codeRequest);
    const reply = String(plan.reply || '').trim() || (results.length ? 'Die Änderung wurde im Entwurf vorbereitet.' : 'Beschreibe bitte genauer, was ich ändern soll.');
    const final = [reply, repair].filter(Boolean).join('\n\n');
    history.push({ user: text.slice(0, 1200), assistant: final.slice(0, 2600) });
    if (history.length > 6) history.shift();
    return final;
  }

  async function sendRequest() {
    if (busy) return;
    const text = ui.input.value.trim();
    if (!text) return;
    if (!ready) { append('System', 'Bitte zuerst den Laptop-Agenten verbinden.'); return; }
    stopRecognition();
    ui.input.value = '';
    append('Du', text);
    setBusy(true);
    try {
      const answer = await runRequest(text);
      append('KI', answer);
      await say(answer);
    } catch (error) { append('KI', `Fehler: ${error.message || error}`); }
    finally { setBusy(false); if (conversation && !speaking) setTimeout(startRecognition, 350); }
  }

  function openPanel() {
    const open = !ui.panel.classList.contains('is-open');
    ui.panel.classList.toggle('is-open', open);
    ui.launch.setAttribute('aria-expanded', String(open));
    ui.launch.textContent = open ? '✕ KI' : '✦ Lokale KI';
    if (open && !ready) connectAgent(); else if (open) ui.input.focus();
  }

  ui.launch.addEventListener('click', openPanel);
  ui.close.addEventListener('click', () => { ui.panel.classList.remove('is-open'); ui.launch.setAttribute('aria-expanded', 'false'); ui.launch.textContent = '✦ Lokale KI'; });
  ui.connect.addEventListener('click', connectAgent);
  ui.reconnect.addEventListener('click', connectAgent);
  ui.share.addEventListener('click', () => startShare().catch(error => append('System', error.message || String(error))));
  ui.stop.addEventListener('click', stopShare);
  ui.observe.addEventListener('click', () => toggleObserve().catch(error => append('System', error.message || String(error))));
  ui.mic.addEventListener('click', toggleConversation);
  ui.speak.addEventListener('click', () => { speakReplies = !speakReplies; localStorage.setItem(STORE_SPEAK, speakReplies ? '1' : '0'); if (!speakReplies) window.speechSynthesis?.cancel?.(); updateSpeechUi(); });
  ui.testVoice.addEventListener('click', testVoice);
  ui.publish.addEventListener('click', publishPending);
  ui.revert.addEventListener('click', revertPending);
  ui.send.addEventListener('click', sendRequest);
  ui.input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendRequest(); } });
  addEventListener('pagehide', () => { stopShare(); stopRecognition(); window.speechSynthesis?.cancel?.(); });
  if ('speechSynthesis' in window) window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
  refreshVoices();
  updateSpeechUi();
  setBusy(false);
})();
