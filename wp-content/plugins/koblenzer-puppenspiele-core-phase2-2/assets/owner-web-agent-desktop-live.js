(() => {
  'use strict';

  const cfg = window.KPOwnerWebAgent;
  if (!cfg?.canEdit) return;

  const q = (selector, root = document) => root.querySelector(selector);
  const STORE_KEY = 'kp-owner-web-agent-chat-v1';
  const MAX_MESSAGES = 24;
  const HELPER = 'http://127.0.0.1:17381';
  const isDesktopCandidate = !window.KPLocalLive && !!navigator.mediaDevices?.getDisplayMedia;
  if (!isDesktopCandidate) return;

  let desktopLive = false;
  let helperReady = false;
  let modelReady = false;
  let repoReady = false;
  let autoPush = false;
  let stream = null;
  let video = null;
  let busy = false;
  let pendingSee = false;
  let speech = null;

  function loadMessages() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(value) ? value.slice(-MAX_MESSAGES) : [];
    } catch (_) {
      return [];
    }
  }

  function saveMessage(role, text) {
    const messages = loadMessages();
    messages.push({ role, text: String(text || ''), at: Date.now() });
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES))); } catch (_) {}
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

  function setStatus(text, busyState = false) {
    const el = q('.kp-wa-status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-busy', !!busyState);
  }

  function historyText() {
    return loadMessages()
      .filter(item => item.role === 'user' || item.role === 'assistant')
      .slice(-8)
      .map(item => `${item.role === 'user' ? 'NUTZER' : 'KI'}: ${String(item.text || '').slice(0, 1000)}`)
      .join('\n\n')
      .slice(-5000);
  }

  function pageContext() {
    const selected = q('.kp-fe2-selected');
    return JSON.stringify({
      url: location.href,
      title: document.title,
      selected: selected ? String(selected.textContent || '').trim().slice(0, 1200) : '',
      visibleText: String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 6000),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    });
  }

  function loopbackFetch(path, init = {}) {
    const url = HELPER + path;
    const options = { ...init, mode: 'cors', cache: 'no-store' };
    try {
      const request = new Request(url, { ...options, targetAddressSpace: 'loopback' });
      return fetch(request);
    } catch (_) {
      return fetch(url, options);
    }
  }

  async function health() {
    try {
      const response = await loopbackFetch('/health', { method: 'GET' });
      const data = await response.json().catch(() => null);
      helperReady = !!response.ok && !!data?.ok;
      modelReady = !!data?.modelReady;
      repoReady = !!data?.repoReady;
      autoPush = !!data?.autoPush;
      return data || {};
    } catch (_) {
      helperReady = false;
      modelReady = false;
      repoReady = false;
      autoPush = false;
      return {};
    } finally {
      updateUi();
    }
  }

  // Re-Entrancy-Schutz (Root-Cause-Befund CI-Lauf 25, CLASS-STORM): Dieser
    // Script wird von einem dokumentweiten childList-MutationObserver (s. u.)
    // bei JEDER Mutation aufgerufen. updateUi() schreibt textContent/classList
    // - und genau diese Schreibe sind selbst childList-Mutationen. Dadurch
    // erzeugt updateUi() eine sich selbst am Leben haltende Kette
    // (updateUi -> textContent -> Observer -> updateUi -> ...), die den
    // Hauptthread dauerhaft blockiert (dcl feuert nie; Renderer-Crash nach
    // Minuten). Die UI-Texte haengen NUR von den Zustandsflags ab: Ist der
    // Zustand unveraendert, werden KEINE DOM-Schreibe ausgefuehrt und die Kette
    // bricht sofort ab. Sichtbares Verhalten bleibt identisch.
    let uiStateKey = '';
    function updateUi() {
      const row = q('.kp-wa-local-live');
      const toggle = q('.kp-wa-live-toggle');
      const see = q('.kp-wa-live-see');
      const note = q('.kp-wa-live-note');
      const subtitle = q('.kp-wa-head small');
      if (!row || !toggle || !see) return;

      const stateKey = [desktopLive, helperReady, modelReady, repoReady, autoPush, busy].join('|');
      if (stateKey === uiStateKey) return;
      uiStateKey = stateKey;

    row.classList.toggle('is-live', desktopLive);
    if (desktopLive) {
      toggle.textContent = '■ Live beenden';
      see.disabled = busy;
      if (note) note.textContent = repoReady ? (autoPush ? 'Laptop · Gemma lokal · Code lokal + Push' : 'Laptop · Gemma lokal · Code lokal') : 'Laptop · Gemma lokal';
      if (subtitle) subtitle.textContent = 'Live lokal am Laptop · Bildschirm + lokale KI · keine KI-API';
      return;
    }

    if (!helperReady) {
      toggle.textContent = '◎ Live lokal am Laptop';
      see.disabled = false;
      if (note) note.textContent = 'lokalen Helfer starten';
      if (subtitle) subtitle.textContent = 'Web-App · Laptop lokal oder Android lokal · Cloud nur Fallback';
      return;
    }

    if (!modelReady) {
      toggle.textContent = '◎ Live lokal am Laptop';
      see.disabled = false;
      if (note) note.textContent = 'Gemma 3 muss lokal geladen werden';
      if (subtitle) subtitle.textContent = 'Web-App · lokaler Helfer bereit · Modell fehlt';
      return;
    }

    toggle.textContent = '◎ Live lokal am Laptop';
    see.disabled = false;
    if (note) note.textContent = repoReady ? 'Gemma 3 + lokaler Code-Agent bereit' : 'Gemma 3 lokal bereit';
    if (subtitle) subtitle.textContent = 'Web-App · Gemma lokal am Laptop · Cloud nur Fallback';
  }

  async function startDesktopLive() {
    if (desktopLive) return true;
    setStatus('Prüfe lokale KI auf dem Laptop …', true);
    await health();
    if (!helperReady) {
      appendAndSave('system', 'Der lokale Laptop-Helfer läuft noch nicht. Starte einmal desktop/local-live-helper/start-windows.ps1 (Windows) bzw. start-macos-linux.sh. Danach kann Chrome Bildschirm + Gemma vollständig lokal verwenden.');
      setStatus('Live lokal · lokaler Helfer fehlt');
      return false;
    }
    if (!modelReady) {
      appendAndSave('system', 'Der lokale Helfer läuft, aber das Vision-Modell fehlt noch. Starte den mitgelieferten Startbefehl; er lädt gemma3:4b einmalig lokal.');
      setStatus('Live lokal · Gemma-Modell fehlt');
      return false;
    }

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 1, max: 3 } },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'include',
      });
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.appendChild(video);
      await video.play();
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', stopDesktopLive, { once: true }));
      desktopLive = true;
      updateUi();
      setStatus('Live lokal · Bildschirm wird nur auf diesem Laptop ausgewertet · keine KI-API');
      if (pendingSee) {
        pendingSee = false;
        setTimeout(() => askWhatYouSee(), 250);
      }
      return true;
    } catch (error) {
      stopDesktopLive();
      const message = error?.name === 'NotAllowedError'
        ? 'Die Bildschirmfreigabe wurde nicht freigegeben.'
        : (error?.message || String(error));
      setStatus(`Live lokal · ${message}`);
      return false;
    }
  }

  function stopDesktopLive() {
    try { speech?.abort?.(); } catch (_) {}
    speech = null;
    if (stream) {
      try { stream.getTracks().forEach(track => track.stop()); } catch (_) {}
    }
    stream = null;
    if (video) {
      try { video.pause(); } catch (_) {}
      try { video.remove(); } catch (_) {}
    }
    video = null;
    desktopLive = false;
    busy = false;
    updateUi();
    setStatus('Bereit');
  }

  async function captureFrame() {
    if (!desktopLive || !video || !video.videoWidth || !video.videoHeight) {
      throw new Error('Noch kein aktueller Bildschirmframe verfügbar.');
    }
    const maxSide = 1280;
    const sourceW = video.videoWidth;
    const sourceH = video.videoHeight;
    const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH));
    const width = Math.max(1, Math.round(sourceW * scale));
    const height = Math.max(1, Math.round(sourceH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Chrome konnte keinen lokalen Bildpuffer anlegen.');
    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    return dataUrl.split(',', 2)[1] || '';
  }

  async function helperPost(path, payload) {
    const response = await loopbackFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `Lokaler Helfer antwortet mit ${response.status}.`);
    return data;
  }

  async function runLocalRepair(task) {
    if (!task || !repoReady) return;
    setStatus('Live lokal · lokaler Code-Agent untersucht den Git-Arbeitsordner …', true);
    try {
      const result = await helperPost('/repair', { task });
      const parts = [];
      if (result.summary) parts.push(String(result.summary));
      if (result.diagnosis) parts.push(String(result.diagnosis));
      if (result.message) parts.push(String(result.message));
      if (Array.isArray(result.changed) && result.changed.length) parts.push(`Geändert: ${result.changed.join(', ')}`);
      appendAndSave(result.applied ? 'system' : 'assistant', parts.filter(Boolean).join('\n\n') || 'Lokaler Code-Agent ist fertig.');
      if (result.applied && result.pushed) {
        setStatus('Lokaler Fix gepusht · Staging kann neu geladen werden');
      } else {
        setStatus('Live lokal · bereit · keine KI-API');
      }
    } catch (error) {
      appendAndSave('assistant', `Der lokale Code-Agent ist fehlgeschlagen.\n\n${error?.message || String(error)}`);
      setStatus('Live lokal · Code-Agent Fehler');
    }
  }

  async function sendDesktop(text, showUser = true) {
    const clean = String(text || '').trim();
    if (!clean || !desktopLive || busy) return;
    busy = true;
    updateUi();
    if (showUser) appendAndSave('user', clean);
    setStatus('Live lokal · Gemma betrachtet den aktuellen Bildschirm …', true);
    try {
      const image = await captureFrame();
      const result = await helperPost('/vision', {
        text: clean,
        image,
        history: historyText(),
        pageContext: pageContext(),
      });
      const reply = String(result.reply || '').trim();
      if (reply) appendAndSave('assistant', reply);
      const handoff = String(result.handoff || '').trim();
      setStatus('Live lokal · bereit · keine KI-API');
      if (handoff) await runLocalRepair(handoff);
    } catch (error) {
      appendAndSave('assistant', `Live lokal ist fehlgeschlagen.\n\n${error?.message || String(error)}`);
      setStatus('Live lokal · Fehler');
    } finally {
      busy = false;
      updateUi();
      q('.kp-wa-input')?.focus();
    }
  }

  async function askWhatYouSee() {
    const question = 'Was siehst du gerade auf meinem freigegebenen Bildschirm? Beschreibe kurz die wichtigen sichtbaren Elemente und sage mir, wobei du mir hier helfen kannst.';
    if (!desktopLive) {
      pendingSee = true;
      const started = await startDesktopLive();
      if (!started) pendingSee = false;
      return;
    }
    await sendDesktop(question, true);
  }

  async function startOnDeviceSpeech() {
    if (!desktopLive) return;
    const SR = window.SpeechRecognition;
    if (!SR) {
      appendAndSave('system', 'Chrome stellt auf diesem Laptop keine lokale Web-Spracherkennung bereit. Im Live-lokal-Modus falle ich nicht heimlich auf Cloud-Spracherkennung zurück; du kannst weiter tippen.');
      setStatus('Live lokal · lokale Sprache nicht verfügbar');
      return;
    }

    try {
      if (typeof SR.available === 'function') {
        const availability = await SR.available({ langs: ['de-DE'], processLocally: true, quality: 'dictation' });
        if (availability === 'unavailable') {
          appendAndSave('system', 'Deutsch ist für die lokale Chrome-Spracherkennung auf diesem Laptop nicht verfügbar. Es wird keine Cloud-Spracherkennung benutzt.');
          setStatus('Live lokal · deutsches Sprachpaket nicht verfügbar');
          return;
        }
        if ((availability === 'downloadable' || availability === 'downloading') && typeof SR.install === 'function') {
          setStatus('Live lokal · deutsches Sprachpaket wird lokal installiert …', true);
          const installed = await SR.install({ langs: ['de-DE'], processLocally: true, quality: 'dictation' });
          if (!installed) throw new Error('Das lokale deutsche Sprachpaket konnte nicht installiert werden.');
        }
      }

      speech = new SR();
      speech.lang = 'de-DE';
      speech.interimResults = true;
      speech.continuous = false;
      if ('processLocally' in speech) speech.processLocally = true;
      const input = q('.kp-wa-input');
      let finalText = '';
      speech.onstart = () => setStatus('Live lokal · ich höre lokal zu …', true);
      speech.onresult = event => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = String(event.results[i][0]?.transcript || '').trim();
          if (event.results[i].isFinal) finalText += `${finalText ? ' ' : ''}${text}`;
          else interim += `${interim ? ' ' : ''}${text}`;
        }
        if (input) input.value = (finalText || interim).trim();
      };
      speech.onerror = event => {
        setStatus(`Live lokal · Sprache: ${event.error || 'Fehler'}`);
      };
      speech.onend = () => {
        speech = null;
        const text = String(finalText || input?.value || '').trim();
        if (text) {
          if (input) input.value = '';
          sendDesktop(text, true);
        } else {
          setStatus('Live lokal · bereit · keine KI-API');
        }
      };
      speech.start();
    } catch (error) {
      speech = null;
      appendAndSave('system', `Lokale Sprache konnte nicht gestartet werden.\n\n${error?.message || String(error)}`);
      setStatus('Live lokal · lokale Sprache nicht verfügbar');
    }
  }

  function consume(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  window.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.kp-wa-live-toggle')) {
      consume(event);
      if (desktopLive) stopDesktopLive(); else startDesktopLive();
      return;
    }
    if (target.closest('.kp-wa-live-see')) {
      consume(event);
      askWhatYouSee();
      return;
    }
    if (desktopLive && target.closest('.kp-wa-mic')) {
      consume(event);
      startOnDeviceSpeech();
      return;
    }
    if (desktopLive && target.closest('.kp-wa-send')) {
      const input = q('.kp-wa-input');
      const text = String(input?.value || '').trim();
      consume(event);
      if (text) {
        input.value = '';
        sendDesktop(text, true);
      }
    }
  }, true);

  window.addEventListener('keydown', event => {
    if (!desktopLive || event.key !== 'Enter' || event.shiftKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.matches('.kp-wa-input')) return;
    const text = String(target.value || '').trim();
    consume(event);
    if (text) {
      target.value = '';
      sendDesktop(text, true);
    }
  }, true);

  // Re-Entrancy-Debounce (Root-Cause-Fix, CI-Lauf 25): Den dokumentweiten
    // childList-Observer entkoppeln - Mutationen, die updateUi() selbst
    // ausloest (z. B. textContent beim allerersten Zustandswechsel), duerfen
    // nicht synchron eine weitere updateUi()-Runde starten. Pro Frame hoechstens
    // eine Aktualisierung; der stateKey-Guard in updateUi() bricht die Kette.
    let uiScheduled = false;
    const observer = new MutationObserver(() => {
      if (!q('.kp-wa-local-live') || uiScheduled) return;
      uiScheduled = true;
      requestAnimationFrame(() => { uiScheduled = false; updateUi(); });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => health(), 250);
  setTimeout(() => updateUi(), 500);
})();
