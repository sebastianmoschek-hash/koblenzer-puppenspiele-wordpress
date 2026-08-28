(() => {
  'use strict';
  const cfg = window.KPOwnerWebAgent;
  const owner = window.KPOwnerWebApp;
  if (!cfg?.canEdit || !owner?.canEdit) return;

  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const MAX_MESSAGES = 24;
  const STORE_KEY = 'kp-owner-web-agent-chat-v1';
  let requestBusy = false;
  let panelOpen = false;
  let messages = loadMessages();

  function loadMessages() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(raw) ? raw.slice(-MAX_MESSAGES) : [];
    } catch (_) {
      return [];
    }
  }

  function saveMessages() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES))); } catch (_) {}
  }

  function editUrl(openAi = false) {
    const u = new URL(window.location.href);
    u.searchParams.set('kp_edit', '1');
    if (openAi) u.searchParams.set('kp_ai', '1'); else u.searchParams.delete('kp_ai');
    return u.toString();
  }

  function pageContext() {
    const selected = q('.kp-fe2-selected');
    const target = selected?.matches?.('a,img,h1,h2,h3,h4,h5,h6,p,li,figcaption')
      ? selected
      : selected?.querySelector?.('a,img,h1,h2,h3,h4,h5,h6,p,li,figcaption');
    const rect = selected?.getBoundingClientRect?.();
    return {
      url: location.href,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      selected: selected ? {
        tag: target?.tagName || selected.tagName || '',
        text: String(target?.textContent || selected.textContent || '').trim().slice(0, 1200),
        href: target?.tagName === 'A' ? target.getAttribute('href') || '' : '',
        rect: rect ? {
          x: Math.round(rect.x), y: Math.round(rect.y),
          width: Math.round(rect.width), height: Math.round(rect.height)
        } : null
      } : null,
      visibleText: String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 4200)
    };
  }

  function historyText() {
    return messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map(m => `${m.role === 'user' ? 'NUTZER' : 'GEMINI'}: ${String(m.text || '').slice(0, 1200)}`)
      .join('\n\n')
      .slice(-7000);
  }

  async function api(action, nonce, fields = {}) {
    if (!nonce) throw new Error('Die geschützte Web-App-Sitzung ist noch nicht bereit. Bitte Seite neu laden.');
    const fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', nonce);
    Object.entries(fields).forEach(([key, value]) => fd.append(key, typeof value === 'string' ? value : JSON.stringify(value)));
    const response = await fetch(cfg.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      body: fd
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      throw new Error(json?.data?.message || `Homepage-Aufruf fehlgeschlagen (${response.status || 'Netzwerk'}).`);
    }
    return json.data || {};
  }

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

  function ensureUi() {
    if (q('.kp-wa-bar')) return;
    document.body.classList.add('kp-web-agent-active');

    const bar = document.createElement('nav');
    bar.className = 'kp-wa-bar';
    bar.setAttribute('aria-label', 'Homepage-Hilfe');
    bar.innerHTML = `
      <button type="button" class="kp-wa-main" data-kp-wa-edit>✎ Bearbeiten</button>
      <button type="button" class="kp-wa-main" data-kp-wa-ai>✦ KI</button>`;
    document.body.appendChild(bar);

    const panel = document.createElement('section');
    panel.className = 'kp-wa-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <header class="kp-wa-head">
        <div>
          <strong>✦ KI</strong>
          <small>Web-App · Gemini serverseitig · Code nur über Prüfbranch + CI</small>
        </div>
        <button type="button" class="kp-wa-close" aria-label="KI schließen">×</button>
      </header>
      <div class="kp-wa-status" aria-live="polite">Bereit</div>
      <div class="kp-wa-messages" role="log" aria-live="polite"></div>
      <div class="kp-wa-compose">
        <textarea class="kp-wa-input" rows="2" placeholder="Was soll ich erklären, ändern oder reparieren?"></textarea>
        <div class="kp-wa-compose-actions">
          <button type="button" class="kp-wa-mic" aria-label="Spracheingabe">🎤</button>
          <button type="button" class="kp-wa-send">Senden</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    q('[data-kp-wa-edit]', bar).addEventListener('click', openEdit);
    q('[data-kp-wa-ai]', bar).addEventListener('click', openAi);
    q('.kp-wa-close', panel).addEventListener('click', closeAi);
    q('.kp-wa-send', panel).addEventListener('click', sendCurrent);
    q('.kp-wa-input', panel).addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendCurrent();
      }
    });
    q('.kp-wa-mic', panel).addEventListener('click', startSpeech);
    renderMessages();

    if (!messages.length) {
      addMessage('assistant', 'Hallo. In der Web-App kann ich mit dir sprechen, die sichtbare Homepage als Entwurf ändern oder bei technischen Problemen einen geprüften Code-Fix über GitHub und CI vorbereiten.');
    }
    if (cfg.openAi) {
      setTimeout(openAi, 100);
      try {
        const u = new URL(location.href);
        u.searchParams.delete('kp_ai');
        history.replaceState(null, '', u);
      } catch (_) {}
    }
  }

  function setStatus(text, busy = false) {
    const el = q('.kp-wa-status');
    if (el) {
      el.textContent = text;
      el.classList.toggle('is-busy', !!busy);
    }
    q('.kp-wa-send')?.classList.toggle('is-busy', !!busy);
  }

  function messageElement(message) {
    const article = document.createElement('article');
    article.className = `kp-wa-msg is-${message.role}`;
    const who = document.createElement('b');
    who.textContent = message.role === 'user' ? 'Du' : message.role === 'system' ? 'System' : 'KI';
    const body = document.createElement('div');
    body.textContent = message.text;
    article.append(who, body);
    return article;
  }

  function addMessage(role, text, extra = null) {
    const message = { role, text: String(text || ''), at: Date.now() };
    messages.push(message);
    messages = messages.slice(-MAX_MESSAGES);
    saveMessages();
    const list = q('.kp-wa-messages');
    if (!list) return;
    const article = messageElement(message);
    list.appendChild(article);
    list.scrollTop = list.scrollHeight;
    if (extra) extra(article);
  }

  function renderMessages() {
    const list = q('.kp-wa-messages');
    if (!list) return;
    list.replaceChildren(...messages.map(messageElement));
    list.scrollTop = list.scrollHeight;
  }

  function appendCard(title, text, buttons = []) {
    const list = q('.kp-wa-messages');
    if (!list) return null;
    const card = document.createElement('article');
    card.className = 'kp-wa-card';
    const h = document.createElement('strong');
    h.textContent = title;
    const p = document.createElement('div');
    p.className = 'kp-wa-card-text';
    p.textContent = text;
    const actions = document.createElement('div');
    actions.className = 'kp-wa-card-actions';
    buttons.forEach(({ label, primary, onClick }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      if (primary) button.classList.add('is-primary');
      button.addEventListener('click', () => onClick(button, card));
      actions.appendChild(button);
    });
    card.append(h, p, actions);
    list.appendChild(card);
    list.scrollTop = list.scrollHeight;
    return card;
  }

  function openEdit() {
    if (!cfg.editMode) {
      location.href = editUrl(false);
      return;
    }
    closeAi();
    const tools = q('.kp-oa-tools');
    if (tools) tools.click();
    else setStatus('Bearbeiten aktiv · tippe ein Element auf der Seite an');
  }

  function openAi() {
    if (!cfg.editMode) {
      location.href = editUrl(true);
      return;
    }
    panelOpen = true;
    q('.kp-wa-panel').hidden = false;
    document.body.classList.add('kp-wa-open');
    setTimeout(() => q('.kp-wa-input')?.focus(), 30);
  }

  function closeAi() {
    panelOpen = false;
    const panel = q('.kp-wa-panel');
    if (panel) panel.hidden = true;
    document.body.classList.remove('kp-wa-open');
  }

  async function sendCurrent() {
    const input = q('.kp-wa-input');
    const text = String(input?.value || '').trim();
    if (!text || requestBusy) return;
    input.value = '';
    addMessage('user', text);
    requestBusy = true;
    setStatus('KI arbeitet … du kannst schon die nächste Nachricht tippen', true);
    try {
      if (looksLikeVisibleEdit(text)) {
        await runVisibleEdit(text);
      } else {
        await runAgentRequest(text);
      }
    } catch (error) {
      addMessage('assistant', `Der Aufruf ist fehlgeschlagen.\n\n${error?.message || String(error)}`);
      setStatus('Fehler · Nachricht kann erneut gesendet werden');
    } finally {
      requestBusy = false;
      setStatus('Bereit');
      q('.kp-wa-input')?.focus();
    }
  }

  async function runVisibleEdit(text) {
    const trigger = await waitForElement('.kp-ai-trigger', 2500);
    if (!trigger) throw new Error('Die direkte KI-Bearbeitung ist auf dieser Seite noch nicht bereit.');
    trigger.click();
    await wait(30);
    const oldSheet = q('.kp-ai-sheet');
    const oldInput = q('.kp-ai-request', oldSheet);
    const oldRun = q('.kp-ai-run', oldSheet);
    const oldStatus = q('.kp-ai-status', oldSheet);
    if (!oldInput || !oldRun || !oldStatus) throw new Error('Die direkte Bearbeitungsengine konnte nicht geöffnet werden.');
    oldInput.value = text;
    oldInput.dispatchEvent(new Event('input', { bubbles: true }));
    oldRun.click();
    setStatus('Gemini ändert den sichtbaren Entwurf …', true);

    const started = Date.now();
    let result = '';
    while (Date.now() - started < 65000) {
      await wait(250);
      result = String(oldStatus.textContent || '').trim();
      if (!oldRun.disabled && result && !/versteht deinen Wunsch/i.test(result)) break;
    }
    oldSheet.hidden = true;
    if (!result) throw new Error('Die direkte Bearbeitung hat innerhalb einer Minute keine Antwort geliefert.');
    if (/fehl|nicht verfügbar|nicht verbunden|abgelehnt|bitte zuerst/i.test(result) && !/noch nicht gespeichert/i.test(result)) {
      throw new Error(result);
    }
    addMessage('assistant', result);
    appendCard(
      'Entwurf geändert',
      'Die Änderung ist auf der sichtbaren Seite vorbereitet, aber noch nicht dauerhaft gespeichert. Du kannst sie prüfen, rückgängig machen oder mit dem orangefarbenen Speichern-Button übernehmen.',
      []
    );
  }

  async function runAgentRequest(text) {
    if (!cfg.repairReady) throw new Error('Der geschützte Web-Agent ist auf diesem Server noch nicht vollständig geladen.');
    setStatus(looksLikeCodeTask(text) ? 'Gemini analysiert den technischen Auftrag …' : 'Gemini antwortet …', true);
    const data = await api('kp_mobile_emergency_gemini', cfg.repairNonce, {
      request: text,
      history: historyText(),
      browser: JSON.stringify(pageContext())
    });
    const reply = String(data.reply || 'Ich bin verbunden.').trim();
    addMessage('assistant', reply);

    if (!data.proposal_id) return;

    const summary = String(data.summary || 'Technischer Reparaturvorschlag');
    const diagnosis = String(data.diagnosis || '').slice(0, 1800);
    const risk = String(data.risk || 'medium');
    appendCard(
      'Code-Fix vorbereitet',
      `${summary}\n\n${diagnosis}\n\nRisiko: ${risk}\n\nNoch wurde kein Code übernommen.`,
      [
        { label: 'Nur erklären', onClick: button => { button.closest('.kp-wa-card-actions')?.remove(); } },
        { label: 'Prüfbranch erstellen', primary: true, onClick: (button, card) => createRepair(data.proposal_id, button, card) }
      ]
    );
  }

  async function createRepair(proposalId, button, card) {
    button.disabled = true;
    const text = q('.kp-wa-card-text', card);
    if (text) text.textContent += '\n\nGitHub-Prüfbranch wird erstellt …';
    try {
      const pr = await api('kp_mobile_emergency_gemini_create_pr', cfg.repairNonce, { proposal_id: proposalId });
      const number = String(pr.pr || '').trim();
      if (!number) throw new Error('GitHub hat keine PR-Nummer zurückgegeben.');
      if (text) text.textContent = `PR #${number} wurde angelegt. CI prüft den Code jetzt im Hintergrund. Du kannst währenddessen weiter mit mir schreiben.`;
      q('.kp-wa-card-actions', card)?.replaceChildren();
      watchCi(number, card);
    } catch (error) {
      if (text) text.textContent += `\n\nFehler: ${error?.message || error}`;
      button.disabled = false;
    }
  }

  async function watchCi(pr, card) {
    const text = q('.kp-wa-card-text', card);
    for (let i = 0; i < Number(cfg.maxCiPolls || 24); i++) {
      try {
        const status = await api('kp_ai_repair_status', cfg.repairNonce, { pr });
        const health = String(status.health || 'pending');
        if (health === 'success') {
          if (text) text.textContent = `PR #${pr}: CI ist grün. Nichts wird automatisch übernommen.`;
          showMergeButton(pr, card);
          return;
        }
        if (health === 'failure') {
          const diag = await api('kp_local_ai_repair_ci_diagnostics', cfg.repairNonce, { pr }).catch(() => ({}));
          const detail = String(diag.diagnostics || '').trim().slice(0, 4000);
          if (text) text.textContent = `PR #${pr}: CI ist rot. Nichts wurde übernommen.${detail ? `\n\n${detail}` : ''}`;
          return;
        }
        if (text) text.textContent = `PR #${pr}: CI läuft … ${i + 1}/${cfg.maxCiPolls || 24}. Du kannst weiter chatten.`;
      } catch (error) {
        if (text) text.textContent = `PR #${pr}: CI-Status konnte gerade nicht gelesen werden.\n\n${error?.message || error}`;
        return;
      }
      await wait(Number(cfg.ciPollMs || 5000));
    }
    if (text) text.textContent = `PR #${pr}: CI läuft länger als erwartet. Der Prüfbranch bleibt offen; nichts wurde übernommen.`;
  }

  function showMergeButton(pr, card) {
    const actions = q('.kp-wa-card-actions', card) || document.createElement('div');
    actions.className = 'kp-wa-card-actions';
    actions.replaceChildren();
    if (!cfg.canMerge) {
      const note = document.createElement('span');
      note.textContent = 'Dein Konto darf diesen Fix nicht mergen.';
      actions.appendChild(note);
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'is-primary';
      button.textContent = 'Grünen Fix übernehmen';
      button.addEventListener('click', async () => {
        if (!confirm(`PR #${pr} ist grün. Soll dieser geprüfte Fix jetzt wirklich übernommen werden?`)) return;
        button.disabled = true;
        try {
          const result = await api('kp_ai_repair_merge', cfg.repairNonce, { pr });
          const text = q('.kp-wa-card-text', card);
          if (text) text.textContent = String(result.message || `PR #${pr} wurde übernommen.`);
          actions.remove();
          addMessage('system', `Der grüne Fix aus PR #${pr} wurde nach deiner Bestätigung übernommen.`);
        } catch (error) {
          button.disabled = false;
          alert(error?.message || String(error));
        }
      });
      actions.appendChild(button);
    }
    if (!actions.isConnected) card.appendChild(actions);
  }

  async function waitForElement(selector, timeout) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const el = q(selector);
      if (el) return el;
      await wait(50);
    }
    return null;
  }

  function startSpeech() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      setStatus('Spracherkennung ist in diesem Browser nicht verfügbar.');
      return;
    }
    const rec = new Speech();
    rec.lang = 'de-DE';
    rec.interimResults = false;
    rec.onresult = event => {
      const text = event.results?.[0]?.[0]?.transcript || '';
      const input = q('.kp-wa-input');
      if (input) input.value = text;
      setStatus('Sprache erkannt · du kannst noch ergänzen oder senden');
    };
    rec.onerror = () => setStatus('Sprache konnte nicht erkannt werden.');
    rec.start();
    setStatus('Ich höre zu …');
  }

  function install() {
    ensureUi();
    // The legacy buttons still power the existing runtimes but are no longer primary UI.
    qa('.kp-oa-tools, .kp-ai-trigger').forEach(el => el.setAttribute('aria-hidden', 'true'));
  }

  new MutationObserver(() => {
    if (!q('.kp-wa-bar')) ensureUi();
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
