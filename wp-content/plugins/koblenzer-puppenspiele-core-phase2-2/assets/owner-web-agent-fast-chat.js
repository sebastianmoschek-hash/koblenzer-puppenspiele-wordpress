(() => {
  'use strict';
  const cfg = window.KPOwnerWebAgent;
  if (!cfg?.canEdit) return;

  const STORE_KEY = 'kp-owner-web-agent-chat-v1';
  const MAX_MESSAGES = 24;
  const runtime = window.KPOwnerWebDiagnostics = window.KPOwnerWebDiagnostics || {};
  const q = (s, r = document) => r.querySelector(s);

  let fastBusy = false;
  let speechBusy = false;
  let selfHealBusy = false;
  let localLive = false;
  let localModelInstalled = false;
  let localRequestSeq = 0;
  let localStartAfterInstall = false;
  let pendingQuickQuestion = '';
  let screenStream = null;
  let screenVideo = null;
  const seenVoiceIds = new Set();

  function looksLikeCodeTask(text) {
    return /\b(code|kotlin|php|javascript|typescript|css|gradle|android|app|apk|plugin|wordpress[- ]?plugin|fehler|bug|crash|absturz|compile|build|circleci|github|reparier|programmier|funktion bauen|endpoint|api)\b/i.test(text);
  }

  function looksLikeVisibleEdit(text) {
    if (looksLikeCodeTask(text)) return false;
    const value = String(text || '').trim();
    if (/^(was|wie|warum|wo|wer|wann|welche|welcher|welches|kannst du|siehst du|erklär|erklaer|sag mir)\b/i.test(value)) return false;
    return /\b(mach|ändere|aendere|setz|schreib|kürz|kuerz|vergrößer|vergroesser|verkleiner|verschieb|gestalte|färb|faerb|entfern|lösche|loesche|füge|fuege|tausche|runde)\b/i.test(value)
      || /\b(größer|groesser|kleiner|weiter links|weiter rechts|höher|hoeher|tiefer|orange|rot|blau|grün|gruen)\b/i.test(value);
  }

  function shouldUseFastChat(text) {
    const value = String(text || '').trim();
    return !!value && !looksLikeCodeTask(value) && !looksLikeVisibleEdit(value);
  }

  function shouldUseSelfHeal(text) {
    const value = String(text || '').trim();
    if (!/\b(?:beheb(?:e|en)?|reparier(?:e|en)?|fix(?:e|en)?|korrigier(?:e|en)?|funktioniert.*nicht|geht.*nicht)\b/i.test(value)) return false;
    if (/\b(android|apk|kotlin|gradle|php|wordpress|plugin|server|backend|production|live-seite|circleci)\b/i.test(value)) return false;
    return /\b(web-?app|chat|button|taste|mikrofon|microphone|sprache|spracherkennung|speech|voice|audio|diktat|eingabe|textfeld|senden|fenster|dialog|layout|scroll|farbe|schrift|abstand|position|oberfläche|ui|browser)\b/i.test(value)
      || !!runtime.speech || !!runtime.lastClientError;
  }

  function loadMessages() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(raw) ? raw.slice(-MAX_MESSAGES) : [];
    } catch (_) {
      return [];
    }
  }

  function saveMessage(role, text) {
    const messages = loadMessages();
    messages.push({ role, text: String(text || ''), at: Date.now() });
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES))); } catch (_) {}
  }

  function historyText() {
    return loadMessages()
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map(m => `${m.role === 'user' ? 'NUTZER' : 'KI'}: ${String(m.text || '').slice(0, 1000)}`)
      .join('\n\n')
      .slice(-4500);
  }

  function appendMessage(role, text) {
    const list = q('.kp-wa-messages');
    if (!list) return;
    const article = document.createElement('article');
    article.className = `kp-wa-msg is-${role}`;
    const who = document.createElement('b');
    who.textContent = role === 'user' ? 'Du' : role === 'system' ? 'System' : 'KI';
    const body = document.createElement('div');
    body.textContent = String(text || '');
    article.append(who, body);
    list.appendChild(article);
    list.scrollTop = list.scrollHeight;
  }

  function appendAndSave(role, text) {
    appendMessage(role, text);
    saveMessage(role, text);
  }

  function setStatus(text, busy = false) {
    const status = q('.kp-wa-status');
    if (status) {
      status.textContent = text;
      status.classList.toggle('is-busy', !!busy);
    }
  }

  function runtimeContext() {
    return {
      speech: runtime.speech || null,
      lastClientError: runtime.lastClientError || null,
      localLive: {
        bridge: hasLocalBridge(),
        active: localLive,
        modelInstalled: localModelInstalled
      },
      capabilities: {
        speechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        mediaDevices: !!navigator.mediaDevices?.getUserMedia,
        secureContext: !!window.isSecureContext
      }
    };
  }

  function pageContext() {
    const selected = q('.kp-fe2-selected');
    const target = selected?.matches?.('a,img,h1,h2,h3,h4,h5,h6,p,li,figcaption')
      ? selected
      : selected?.querySelector?.('a,img,h1,h2,h3,h4,h5,h6,p,li,figcaption');
    return {
      url: location.href,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      runtime: runtimeContext(),
      selected: selected ? {
        tag: target?.tagName || selected.tagName || '',
        text: String(target?.textContent || selected.textContent || '').trim().slice(0, 900),
        href: target?.tagName === 'A' ? target.getAttribute('href') || '' : ''
      } : null,
      visibleText: String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 5000)
    };
  }

  async function apiRequest(action, text, history, screen = '') {
    if (!cfg.repairNonce) throw new Error('Die geschützte Web-App-Sitzung ist nicht bereit. Bitte Seite neu laden.');
    const fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', cfg.repairNonce);
    fd.append('request', text);
    fd.append('history', history);
    fd.append('browser', JSON.stringify(pageContext()));
    if (screen) fd.append('screen', screen);
    const response = await fetch(cfg.ajaxUrl, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', body: fd
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      throw new Error(json?.data?.message || `KI-Aufruf fehlgeschlagen (${response.status || 'Netzwerk'}).`);
    }
    return json.data || {};
  }

  function localBridge() {
    return window.KPLocalLive || null;
  }

  function hasLocalBridge() {
    const bridge = localBridge();
    if (!bridge || typeof bridge.isAvailable !== 'function') return false;
    try { return !!bridge.isAvailable(); } catch (_) { return false; }
  }

  function localCall(method, ...args) {
    const bridge = localBridge();
    if (!bridge || typeof bridge[method] !== 'function') throw new Error('Die lokale Android-Verbindung ist nicht verfügbar.');
    return bridge[method](...args);
  }

  function refreshLocalState() {
    if (!hasLocalBridge()) {
      localLive = false;
      localModelInstalled = false;
      updateLocalUi();
      return;
    }
    try { localLive = !!localCall('isLive'); } catch (_) {}
    try { localModelInstalled = !!localCall('isModelInstalled'); } catch (_) {}
    updateLocalUi();
  }

  function currentLocalLaunchUrl() {
    const page = new URL(location.href);
    page.searchParams.set('kp_edit', '1');
    page.searchParams.set('kp_ai', '1');
    return `koblenzerpuppenspiele://vision?url=${encodeURIComponent(page.toString())}`;
  }

  function ensureLocalUi() {
    const status = q('.kp-wa-status');
    if (!status || q('.kp-wa-local-live')) return;
    const row = document.createElement('div');
    row.className = 'kp-wa-local-live';
    row.innerHTML = `
      <button type="button" class="kp-wa-live-toggle">◎ Live lokal</button>
      <button type="button" class="kp-wa-screen-share">▣ Bildschirm teilen</button>
      <button type="button" class="kp-wa-live-see">👁 Was siehst du?</button>
      <span class="kp-wa-live-note"></span>`;
    status.insertAdjacentElement('afterend', row);
    q('.kp-wa-live-toggle', row)?.addEventListener('click', toggleLocalLive);
    q('.kp-wa-screen-share', row)?.addEventListener('click', toggleScreenShare);
    q('.kp-wa-live-see', row)?.addEventListener('click', () => askWhatYouSee());
    q('.kp-wa-close')?.addEventListener('click',()=>stopScreenShare(false));
    refreshLocalState();
  }

  function updateScreenShareUi() {
    const button = q('.kp-wa-screen-share');
    if (!button) return;
    button.classList.toggle('is-active', !!screenStream);
    button.textContent = screenStream ? '■ Bildschirmfreigabe beenden' : '▣ Bildschirm teilen';
    document.body.classList.toggle('kp-wa-screen-live', !!screenStream);
  }

  function stopScreenShare(showStatus = true) {
    const stream = screenStream;
    screenStream = null;
    screenVideo = null;
    for (const track of stream?.getTracks?.() || []) track.stop();
    updateScreenShareUi();
    if (showStatus) setStatus('Bildschirmfreigabe beendet');
  }

  async function toggleScreenShare() {
    if (screenStream) {
      stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatus('Dieser Browser unterstützt keine Bildschirmfreigabe. Bitte Chrome oder Edge verwenden.');
      return;
    }
    try {
      setStatus('Bitte den Bildschirm oder den Browser-Tab auswählen …', true);
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 1, max: 2 } }, audio: false });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      screenStream = stream;
      screenVideo = video;
      const track = stream.getVideoTracks()[0];
      track?.addEventListener('ended', () => {
        screenStream = null;
        screenVideo = null;
        updateScreenShareUi();
        setStatus('Bildschirmfreigabe wurde beendet');
      }, { once: true });
      updateScreenShareUi();
      setStatus('Bildschirm wird geteilt · ein aktuelles Bild wird nur beim Senden übertragen');
    } catch (error) {
      if (error?.name === 'NotAllowedError') setStatus('Bildschirmfreigabe wurde nicht erlaubt. Es wurde nichts übertragen.');
      else setStatus(`Bildschirmfreigabe konnte nicht gestartet werden: ${error?.message || error}`);
    }
  }

  async function captureScreenFrame() {
    const video = screenVideo;
    if (!screenStream || !video || video.readyState < 2) return '';
    const sourceWidth = Number(video.videoWidth) || 0;
    const sourceHeight = Number(video.videoHeight) || 0;
    if (!sourceWidth || !sourceHeight) return '';
    const width = Math.min(1280, sourceWidth);
    const height = Math.max(1, Math.round(sourceHeight * width / sourceWidth));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d', { alpha: false })?.drawImage(video, 0, 0, width, height);
    const encoded = canvas.toDataURL('image/jpeg', 0.7);
    return encoded.startsWith('data:image/jpeg;base64,') ? encoded.slice('data:image/jpeg;base64,'.length) : '';
  }

  function updateLocalUi() {
    const row = q('.kp-wa-local-live');
    const toggle = q('.kp-wa-live-toggle');
    const see = q('.kp-wa-live-see');
    const note = q('.kp-wa-live-note');
    const subtitle = q('.kp-wa-head small');
    if (!row || !toggle || !see) return;

    row.classList.toggle('is-live', localLive);
    if (hasLocalBridge()) {
      if (!localModelInstalled) {
        toggle.textContent = '⬇ Lokale KI installieren';
        see.disabled = true;
        if (note) note.textContent = 'einmalig ~2,6 GB';
        if (subtitle) subtitle.textContent = 'Web-App · lokale KI noch nicht installiert';
      } else if (localLive) {
        toggle.textContent = '■ Live beenden';
        see.disabled = false;
        if (note) note.textContent = 'Bildschirm + Sprache lokal';
        if (subtitle) subtitle.textContent = 'Live lokal · Bildschirm + Sprache · keine KI-API';
      } else {
        toggle.textContent = '◎ Live lokal starten';
        see.disabled = false;
        if (note) note.textContent = 'Gemma auf diesem Gerät';
        if (subtitle) subtitle.textContent = 'Web-App · lokales Gemma bereit · Cloud nur Fallback';
      }
      return;
    }

    toggle.textContent = '◎ Live lokal öffnen';
    see.disabled = false;
    if (note) note.textContent = 'benötigt Homepage-Hilfe auf Android';
    if (subtitle) subtitle.textContent = 'Web-App · Live lokal über Android · Cloud nur Fallback';
  }

  function toggleLocalLive() {
    if (!hasLocalBridge()) {
      setStatus('Live lokal wird in der Homepage-Hilfe geöffnet …', true);
      location.href = currentLocalLaunchUrl();
      return;
    }
    if (!localModelInstalled) {
      localStartAfterInstall = true;
      setStatus('Lokales Gemma wird einmalig installiert …', true);
      try { localCall('installModel'); } catch (error) { setStatus(error?.message || String(error)); }
      return;
    }
    try {
      if (localLive) localCall('stop'); else localCall('start');
    } catch (error) {
      setStatus(error?.message || String(error));
    }
  }

  function askWhatYouSee() {
    const question = 'Was siehst du gerade auf meinem Bildschirm? Beschreibe kurz die wichtigen sichtbaren Elemente und sage mir, wobei du mir hier helfen kannst.';
    if (!hasLocalBridge()) {
      pendingQuickQuestion = question;
      setStatus('Ich öffne Live lokal, damit die KI deinen Bildschirm sehen kann …', true);
      location.href = currentLocalLaunchUrl();
      return;
    }
    if (!localModelInstalled) {
      pendingQuickQuestion = question;
      localStartAfterInstall = true;
      try { localCall('installModel'); } catch (error) { setStatus(error?.message || String(error)); }
      return;
    }
    if (!localLive) {
      pendingQuickQuestion = question;
      try { localCall('start'); } catch (error) { setStatus(error?.message || String(error)); }
      return;
    }
    sendLocalRequest(question, true);
  }

  function sendLocalRequest(text, showUser = true) {
    const clean = String(text || '').trim();
    if (!clean || !localLive || !hasLocalBridge()) return false;
    const id = `web-${Date.now()}-${++localRequestSeq}`;
    if (showUser) appendAndSave('user', clean);
    setStatus('Live lokal · Gemma betrachtet den aktuellen Bildschirm …', true);
    try {
      localCall('ask', id, clean);
    } catch (error) {
      const message = error?.message || String(error);
      appendAndSave('assistant', `Der lokale Aufruf ist fehlgeschlagen.\n\n${message}`);
      setStatus('Live lokal · Fehler');
    }
    return true;
  }

  function interceptLocalSend(event) {
    refreshLocalState();
    if (!localLive || !hasLocalBridge()) return false;
    const input = q('.kp-wa-input');
    const text = String(input?.value || '').trim();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!text) return true;
    input.value = '';
    sendLocalRequest(text, true);
    return true;
  }

  window.addEventListener('kp:local-live', event => {
    const detail = event?.detail || {};
    const type = String(detail.type || '');
    if (type === 'bridge-ready') {
      localModelInstalled = !!detail.modelInstalled;
      localLive = !!detail.live;
      updateLocalUi();
      return;
    }
    if (type === 'state') {
      localLive = !!detail.live;
      updateLocalUi();
      if (detail.message) setStatus(String(detail.message));
      if (localLive && pendingQuickQuestion) {
        const question = pendingQuickQuestion;
        pendingQuickQuestion = '';
        setTimeout(() => sendLocalRequest(question, true), 350);
      }
      return;
    }
    if (type === 'status') {
      if (detail.message) setStatus(String(detail.message), /denkt|betrachtet|arbeitet|höre|hoere/i.test(String(detail.message)));
      return;
    }
    if (type === 'user') {
      const id = String(detail.id || '');
      if (id && seenVoiceIds.has(id)) return;
      if (id) seenVoiceIds.add(id);
      const text = String(detail.text || '').trim();
      if (text) appendAndSave('user', text);
      return;
    }
    if (type === 'working') {
      setStatus(String(detail.message || 'Live lokal · Gemma arbeitet …'), true);
      return;
    }
    if (type === 'reply') {
      const text = String(detail.text || '').trim();
      if (text) appendAndSave('assistant', text);
      setStatus('Live lokal · bereit · keine KI-API');
      return;
    }
    if (type === 'needs-model') {
      localModelInstalled = false;
      localStartAfterInstall = true;
      updateLocalUi();
      const message = String(detail.message || 'Das lokale Gemma-Modell muss einmalig installiert werden.');
      appendAndSave('system', message);
      setStatus('Lokale KI muss einmalig installiert werden');
      return;
    }
    if (type === 'model-progress') {
      setStatus(`Lokale KI wird installiert · ${Number(detail.percent || 0)} %`, true);
      return;
    }
    if (type === 'model') {
      localModelInstalled = !!detail.installed;
      updateLocalUi();
      if (localModelInstalled) {
        setStatus('Lokales Gemma ist installiert · Live lokal wird gestartet …', true);
        if (localStartAfterInstall) {
          localStartAfterInstall = false;
          setTimeout(() => { try { localCall('start'); } catch (_) {} }, 250);
        }
      }
      return;
    }
    if (type === 'error') {
      const message = String(detail.message || 'Unbekannter lokaler Fehler.');
      appendAndSave('assistant', `Live lokal: ${message}`);
      setStatus('Live lokal · Fehler');
    }
  });

  async function handleFastChat(text, input) {
    if (fastBusy) return;
    fastBusy = true;
    const priorHistory = historyText();
    if (input) input.value = '';
    appendAndSave('user', text);
    const screen = await captureScreenFrame();
    setStatus(screen ? 'KI betrachtet den geteilten Bildschirm …' : 'Cloud-Fallback antwortet …', true);
    try {
      const data = await apiRequest('kp_owner_web_agent_chat', text, priorHistory, screen);
      const reply = String(data.reply || 'Ich bin verbunden.').trim();
      appendAndSave('assistant', reply);
      const elapsed = Number(data.elapsed_ms || 0);
      setStatus(elapsed > 0 ? `Bereit · Cloud-Fallback · ${Math.max(1, Math.round(elapsed / 100) / 10)} s` : 'Bereit · Cloud-Fallback');
    } catch (error) {
      const message = error?.message || String(error);
      runtime.lastClientError = { feature: 'fast-chat', message, at: Date.now() };
      appendAndSave('assistant', `Der Cloud-Fallback ist fehlgeschlagen.\n\n${message}`);
      setStatus('Cloud-Fallback fehlgeschlagen');
    } finally {
      fastBusy = false;
      q('.kp-wa-input')?.focus();
    }
  }

  async function handleSelfHeal(text, input) {
    if (selfHealBusy) return;
    selfHealBusy = true;
    const priorHistory = historyText();
    if (input) input.value = '';
    appendAndSave('user', text);
    setStatus('KI bereitet die Staging-Diagnose vor …', true);
    try {
      const screen = await captureScreenFrame();
      const visual = screen ? await apiRequest('kp_owner_web_agent_chat', 'Analysiere das geteilte Bildschirmbild für den folgenden ausdrücklichen Reparaturauftrag. Nenne nur sichtbare Elemente, Positionen und Fehler; ändere nichts: ' + text, priorHistory, screen) : null;
      const visualText = String(visual?.reply || '').trim();
      const repairRequest = `reparieren: ${text}${visualText ? `\n\nSICHTANALYSE AUS GETEILTEM BILDSCHIRM:\n${visualText}` : ''}`;
      setStatus('KI untersucht den Fehler und repariert die Staging-Web-App …', true);
      const data = await apiRequest('kp_owner_web_self_heal', repairRequest, priorHistory);
      const summary = String(data.summary || 'Staging-Selbstheilung').trim();
      const diagnosis = String(data.diagnosis || '').trim();
      if (data.applied) {
        const reply = `${summary}\n\n${diagnosis ? `${diagnosis}\n\n` : ''}Ich habe den risikoarmen Fix direkt auf dem Staging-Arbeitsbranch angewendet. Production wurde nicht verändert. Die Seite lädt jetzt neu.`;
        appendAndSave('assistant', reply);
        setStatus('Fix angewendet · Web-App lädt neu …', true);
        setTimeout(() => location.reload(), 1400);
        return;
      }
      const reply = `${summary}${diagnosis ? `\n\n${diagnosis}` : ''}\n\nIch habe nichts geändert, weil kein ausreichend sicherer Direktfix belegt war.`;
      appendAndSave('assistant', reply);
      setStatus('Kein sicherer Direktfix angewendet');
    } catch (error) {
      const message = error?.message || String(error);
      runtime.lastClientError = { feature: 'self-heal', message, at: Date.now() };
      appendAndSave('assistant', `Die Selbstheilung konnte diesen Versuch nicht abschließen.\n\n${message}\n\nEs wurde nichts geändert.`);
      setStatus('Selbstheilung fehlgeschlagen · nichts geändert');
    } finally {
      selfHealBusy = false;
      q('.kp-wa-input')?.focus();
    }
  }

  function interceptCloudOrRepair(event) {
    const input = q('.kp-wa-input');
    const text = String(input?.value || '').trim();
    if (shouldUseSelfHeal(text)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handleSelfHeal(text, input);
      return true;
    }
    if (!shouldUseFastChat(text)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handleFastChat(text, input);
    return true;
  }

  function speechErrorText(code) {
    const errors = {
      'not-allowed': 'Mikrofonzugriff ist nicht erlaubt. Bitte in Chrome für diese Seite das Mikrofon erlauben und erneut tippen.',
      'service-not-allowed': 'Die Chrome-Spracherkennung ist auf diesem Gerät nicht freigegeben.',
      'audio-capture': 'Chrome findet gerade kein verfügbares Mikrofon.',
      'no-speech': 'Ich habe keine Sprache erkannt. Bitte nach dem Signal deutlich sprechen.',
      'network': 'Die Chrome-Spracherkennung konnte ihren Sprachdienst nicht erreichen.',
      'aborted': 'Die Spracheingabe wurde abgebrochen.',
      'language-not-supported': 'Deutsch wird von der Spracherkennung dieses Browsers nicht unterstützt.'
    };
    return errors[code] || `Die Spracherkennung meldet „${code || 'unbekannter Fehler'}“.`;
  }

  async function microphonePermissionState() {
    try {
      if (!navigator.permissions?.query) return 'unknown';
      const result = await navigator.permissions.query({ name: 'microphone' });
      return String(result?.state || 'unknown');
    } catch (_) { return 'unknown'; }
  }

  async function ensureMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
  }

  async function startSpeechReliable(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();

    refreshLocalState();
    if (localLive && hasLocalBridge()) {
      setStatus('Live lokal hört bereits dauerhaft zu · sprich einfach los');
      return;
    }
    if (speechBusy) return;

    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      runtime.speech = {
        code: 'unsupported', permission: await microphonePermissionState(), speechRecognition: false,
        mediaDevices: !!navigator.mediaDevices?.getUserMedia, at: Date.now()
      };
      setStatus('Spracherkennung ist in diesem Browser nicht verfügbar. In Live lokal übernimmt Android die Offline-Sprache.');
      return;
    }

    speechBusy = true;
    const mic = q('.kp-wa-mic');
    if (mic) mic.disabled = true;
    try {
      setStatus('Mikrofon wird vorbereitet …', true);
      await ensureMicrophonePermission();
      const permission = await microphonePermissionState();
      const runRecognition = retry => new Promise(resolve => {
        const rec = new Speech();
        const input = q('.kp-wa-input');
        let transcript = '';
        let errorCode = '';
        let speechStarted = false;
        rec.lang = 'de-DE';
        rec.continuous = false;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.onstart = () => setStatus(retry ? 'Ich höre nochmal zu … sprich jetzt' : 'Ich höre zu … sprich jetzt', true);
        rec.onspeechstart = () => { speechStarted = true; setStatus('Sprache erkannt …', true); };
        rec.onresult = resultEvent => {
          transcript = Array.from(resultEvent.results || []).map(result => result?.[0]?.transcript || '').join(' ').replace(/\s+/g, ' ').trim();
          if (input && transcript) input.value = transcript;
        };
        rec.onerror = errorEvent => { errorCode = String(errorEvent?.error || 'unknown'); };
        rec.onend = () => resolve({ transcript, errorCode, speechStarted });
        try { rec.start(); } catch (error) { resolve({ transcript: '', errorCode: error?.name || 'start-failed', speechStarted: false }); }
      });

      let result = await runRecognition(false);
      if (!result.transcript && (result.errorCode === 'no-speech' || result.errorCode === 'network')) {
        setStatus(`${speechErrorText(result.errorCode)} Einmaliger neuer Versuch …`, true);
        await new Promise(resolve => setTimeout(resolve, 450));
        result = await runRecognition(true);
      }
      runtime.speech = {
        code: result.transcript ? 'ok' : (result.errorCode || 'empty-result'),
        transcriptLength: result.transcript.length,
        speechStarted: !!result.speechStarted,
        permission,
        speechRecognition: true,
        mediaDevices: !!navigator.mediaDevices?.getUserMedia,
        at: Date.now()
      };
      if (result.transcript) {
        setStatus('Sprache erkannt · du kannst ergänzen oder senden');
        q('.kp-wa-input')?.focus();
      } else setStatus(speechErrorText(result.errorCode));
    } catch (error) {
      const code = error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'not-allowed'
        : error?.name === 'NotFoundError' ? 'audio-capture' : (error?.name || 'microphone-start-failed');
      runtime.speech = {
        code, message: String(error?.message || ''), permission: await microphonePermissionState(),
        speechRecognition: !!Speech, mediaDevices: !!navigator.mediaDevices?.getUserMedia, at: Date.now()
      };
      setStatus(speechErrorText(code));
    } finally {
      speechBusy = false;
      if (mic) mic.disabled = false;
    }
  }

  window.addEventListener('error', event => {
    runtime.lastClientError = {
      feature: 'window-error', message: String(event?.message || 'Unbekannter JavaScript-Fehler').slice(0, 800), at: Date.now()
    };
  });
  window.addEventListener('unhandledrejection', event => {
    runtime.lastClientError = {
      feature: 'unhandled-rejection', message: String(event?.reason?.message || event?.reason || 'Unbehandelte Promise-Ablehnung').slice(0, 800), at: Date.now()
    };
  });

  // Window capture runs before the older document-level handlers. This makes
  // local screen Live a hard primary route: while it is active no Gemini/repair
  // HTTP handler can accidentally receive the same send or microphone event.
  window.addEventListener('click', event => {
    if (event.target?.closest?.('.kp-wa-send')) {
      if (interceptLocalSend(event)) return;
      interceptCloudOrRepair(event);
      return;
    }
    if (event.target?.closest?.('.kp-wa-mic')) {
      startSpeechReliable(event);
    }
  }, true);

  window.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || !event.target?.matches?.('.kp-wa-input')) return;
    if (interceptLocalSend(event)) return;
    interceptCloudOrRepair(event);
  }, true);

  function installLocalTools() {
    ensureLocalUi();
    refreshLocalState();
  }
  new MutationObserver(() => ensureLocalUi()).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installLocalTools, { once: true });
  else installLocalTools();
})();
