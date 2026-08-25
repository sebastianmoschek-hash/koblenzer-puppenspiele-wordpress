(() => {
  'use strict';
  const cfg = window.KPOwnerWebAgent;
  if (!cfg?.canEdit) return;

  const STORE_KEY = 'kp-owner-web-agent-chat-v1';
  const MAX_MESSAGES = 24;
  let fastBusy = false;

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

  function pageContext() {
    const selected = q('.kp-fe2-selected');
    const target = selected?.matches?.('a,img,h1,h2,h3,h4,h5,h6,p,li,figcaption')
      ? selected
      : selected?.querySelector?.('a,img,h1,h2,h3,h4,h5,h6,p,li,figcaption');
    return {
      url: location.href,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
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

  async function apiChat(text, history) {
    if (!cfg.repairNonce) throw new Error('Die geschützte Web-App-Sitzung ist nicht bereit. Bitte Seite neu laden.');
    const fd = new FormData();
    fd.append('action', 'kp_owner_web_agent_chat');
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
      appendMessage('assistant', `Der schnelle Web-Chat ist fehlgeschlagen.\n\n${message}`);
      saveMessage('assistant', `Der schnelle Web-Chat ist fehlgeschlagen. ${message}`);
      setStatus('Gemini-Verbindung fehlgeschlagen');
    } finally {
      fastBusy = false;
      q('.kp-wa-input')?.focus();
    }
  }

  function interceptCurrent(event) {
    const input = q('.kp-wa-input');
    const text = String(input?.value || '').trim();
    if (!shouldUseFastChat(text)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handleFastChat(text, input);
    return true;
  }

  document.addEventListener('click', event => {
    if (event.target?.closest?.('.kp-wa-send')) interceptCurrent(event);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || !event.target?.matches?.('.kp-wa-input')) return;
    interceptCurrent(event);
  }, true);
})();
