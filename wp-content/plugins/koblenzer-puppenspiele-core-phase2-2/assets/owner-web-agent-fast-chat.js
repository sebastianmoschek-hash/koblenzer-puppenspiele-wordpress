(() => {
  'use strict';
  const cfg = window.KPOwnerWebAgent;
  if (!cfg?.canEdit) return;

  const STORE_KEY = 'kp-owner-web-agent-chat-v1';
  const MAX_MESSAGES = 24;
  let fastBusy = false;
  let speechBusy = false;
  let selfHealBusy = false;
  const runtime = window.KPOwnerWebDiagnostics = window.KPOwnerWebDiagnostics || {};

  const q = (s, r = document) => r.querySelector(s);

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
      || !!runtime.speech
      || !!runtime.lastClientError;
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
      .map(m => `${m.role === 'user' ? 'NUTZER' : 'GEMINI'}: ${String(m.text || '').slice(0, 1000)}`)
      .join('\n\n')
      .slice(-4500);
  }

  function runtimeContext() {
    return {
      speech: runtime.speech || null,
      lastClientError: runtime.lastClientError || null,
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
      visibleText: String(document.body?.innerText || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000)
    };
  }

  function appendMessage(role, text) {
    const list = q('.kp-wa-messages');
    if (!list) return;
    const article = document.createElement('article');
    article.className = `kp-wa-msg is-${role}`;
    const who = document.createElement('b');
    who.textContent = role === 'user' ? 'Du' : 'KI';
    const body = document.createElement('div');
    body.textContent = String(text || '');
    article.append(who, body);
    list.appendChild(article);
    list.scrollTop = list.scrollHeight;
  }

  function setStatus(text, busy = false) {
    const status = q('.kp-wa-status');
    if (status) {
      status.textContent = text;
      status.classList.toggle('is-busy', !!busy);
    }
  }

  async function apiRequest(action, text, history) {
    if (!cfg.repairNonce) throw new Error('Die geschützte Web-App-Sitzung ist nicht bereit. Bitte Seite neu laden.');
    const fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', cfg.repairNonce);
    fd.append('request', text);
    fd.append('history', history);
    fd.append('browser', JSON.stringify(pageContext()));
    const response = await fetch(cfg.ajaxUrl, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', body: fd
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      throw new Error(json?.data?.message || `KI-Aufruf fehlgeschlagen (${response.status || 'Netzwerk'}).`);
    }
    return json.data || {};
  }

  async function apiChat(text, history) {
    return apiRequest('kp_owner_web_agent_chat', text, history);
  }

  async function handleFastChat(text, input) {
    if (fastBusy) return;
    fastBusy = true;
    const priorHistory = historyText();
    if (input) input.value = '';
    appendMessage('user', text);
    saveMessage('user', text);
    setStatus('Gemini antwortet über den schnellen Web-Chat …', true);
    try {
      const data = await apiChat(text, priorHistory);
      const reply = String(data.reply || 'Ich bin verbunden.').trim();
      appendMessage('assistant', reply);
      saveMessage('assistant', reply);
      const elapsed = Number(data.elapsed_ms || 0);
      setStatus(elapsed > 0 ? `Bereit · ${Math.max(1, Math.round(elapsed / 100) / 10)} s` : 'Bereit');
    } catch (error) {
      const message = error?.message || String(error);
      runtime.lastClientError = { feature: 'fast-chat', message, at: Date.now() };
      appendMessage('assistant', `Der schnelle Web-Chat ist fehlgeschlagen.\n\n${message}`);
      saveMessage('assistant', `Der schnelle Web-Chat ist fehlgeschlagen. ${message}`);
      setStatus('Gemini-Verbindung fehlgeschlagen');
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
    appendMessage('user', text);
    saveMessage('user', text);
    setStatus('KI untersucht den Fehler und repariert die Staging-Web-App …', true);
    try {
      const repairRequest = `reparieren: ${text}`;
      const data = await apiRequest('kp_owner_web_self_heal', repairRequest, priorHistory);
      const summary = String(data.summary || 'Staging-Selbstheilung').trim();
      const diagnosis = String(data.diagnosis || '').trim();
      if (data.applied) {
        const reply = `${summary}\n\n${diagnosis ? `${diagnosis}\n\n` : ''}Ich habe den risikoarmen Fix direkt auf dem Staging-Arbeitsbranch angewendet. Production wurde nicht verändert. Die Seite lädt jetzt neu, damit der reparierte Code aktiv wird.`;
        appendMessage('assistant', reply);
        saveMessage('assistant', reply);
        setStatus('Fix angewendet · Web-App lädt neu …', true);
        setTimeout(() => location.reload(), 1400);
        return;
      }
      const reply = `${summary}${diagnosis ? `\n\n${diagnosis}` : ''}\n\nIch habe nichts geändert, weil kein ausreichend sicherer Direktfix belegt war.`;
      appendMessage('assistant', reply);
      saveMessage('assistant', reply);
      setStatus('Kein sicherer Direktfix angewendet');
    } catch (error) {
      const message = error?.message || String(error);
      runtime.lastClientError = { feature: 'self-heal', message, at: Date.now() };
      appendMessage('assistant', `Die Selbstheilung konnte diesen Versuch nicht abschließen.\n\n${message}\n\nEs wurde nichts geändert.`);
      saveMessage('assistant', `Selbstheilung fehlgeschlagen: ${message}`);
      setStatus('Selbstheilung fehlgeschlagen · nichts geändert');
    } finally {
      selfHealBusy = false;
      q('.kp-wa-input')?.focus();
    }
  }

  function interceptCurrent(event) {
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
    } catch (_) {
      return 'unknown';
    }
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
    if (speechBusy) return;

    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      runtime.speech = {
        code: 'unsupported',
        permission: await microphonePermissionState(),
        speechRecognition: false,
        mediaDevices: !!navigator.mediaDevices?.getUserMedia,
        at: Date.now()
      };
      setStatus('Spracherkennung ist in diesem Browser nicht verfügbar. Du kannst die Mikrofontaste der Bildschirmtastatur verwenden.');
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
        rec.onspeechstart = () => {
          speechStarted = true;
          setStatus('Sprache erkannt …', true);
        };
        rec.onresult = resultEvent => {
          transcript = Array.from(resultEvent.results || [])
            .map(result => result?.[0]?.transcript || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (input && transcript) input.value = transcript;
        };
        rec.onerror = errorEvent => {
          errorCode = String(errorEvent?.error || 'unknown');
        };
        rec.onend = () => resolve({ transcript, errorCode, speechStarted });

        try {
          rec.start();
        } catch (error) {
          resolve({ transcript: '', errorCode: error?.name || 'start-failed', speechStarted: false });
        }
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
      } else {
        setStatus(speechErrorText(result.errorCode));
      }
    } catch (error) {
      const code = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
        ? 'not-allowed'
        : error?.name === 'NotFoundError'
          ? 'audio-capture'
          : (error?.name || 'microphone-start-failed');
      runtime.speech = {
        code,
        message: String(error?.message || ''),
        permission: await microphonePermissionState(),
        speechRecognition: !!Speech,
        mediaDevices: !!navigator.mediaDevices?.getUserMedia,
        at: Date.now()
      };
      setStatus(speechErrorText(code));
    } finally {
      speechBusy = false;
      if (mic) mic.disabled = false;
    }
  }

  window.addEventListener('error', event => {
    runtime.lastClientError = {
      feature: 'window-error',
      message: String(event?.message || 'Unbekannter JavaScript-Fehler').slice(0, 800),
      at: Date.now()
    };
  });

  window.addEventListener('unhandledrejection', event => {
    runtime.lastClientError = {
      feature: 'unhandled-rejection',
      message: String(event?.reason?.message || event?.reason || 'Unbehandelte Promise-Ablehnung').slice(0, 800),
      at: Date.now()
    };
  });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('.kp-wa-mic')) {
      startSpeechReliable(event);
      return;
    }
    if (event.target?.closest?.('.kp-wa-send')) interceptCurrent(event);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || !event.target?.matches?.('.kp-wa-input')) return;
    interceptCurrent(event);
  }, true);
})();
