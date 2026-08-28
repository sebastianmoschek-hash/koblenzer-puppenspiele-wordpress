(() => {
  const host = window.location.origin || 'http://127.0.0.1:8765';
  const chatWrap = document.getElementById('chatWrap');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const micBtn = document.getElementById('micBtn');
  const ttsBtn = document.getElementById('ttsBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const modelBadge = document.getElementById('modelBadge');
  const voiceBadge = document.getElementById('voiceBadge');

  let token = localStorage.getItem('kp_agent_token') || '';
  let speechEnabled = localStorage.getItem('kp_tts_enabled') !== '0';
  let isRecording = false;
  let isSpeaking = false;
  let recognition = null;
  const history = [];

  function updateTtsBtn() {
    ttsBtn.textContent = speechEnabled ? '🔊' : '🔇';
    ttsBtn.style.opacity = speechEnabled ? '1' : '0.45';
    voiceBadge.classList.toggle('on', speechEnabled);
  }
  updateTtsBtn();
  ttsBtn.addEventListener('click', () => {
    speechEnabled = !speechEnabled;
    localStorage.setItem('kp_tts_enabled', speechEnabled ? '1' : '0');
    updateTtsBtn();
    if (!speechEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
  });

  function setStatus(text, ok = true) {
    statusText.textContent = text;
    statusDot.className = ok === null ? '' : (ok ? 'on' : 'err');
  }

  function appendMsg(text, type = 'bot', isErr = false) {
    const div = document.createElement('div');
    div.className = `msg ${type}${isErr ? ' err' : ''}`;
    div.textContent = text;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.appendChild(time);
    chatWrap.appendChild(div);
    chatWrap.scrollTop = chatWrap.scrollHeight;
    return div;
  }

  function speak(text) {
    if (!speechEnabled || !text || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[\*\_`#]/g, '').slice(0, 450));
      u.lang = 'de-DE';
      u.rate = 1.05;
      const voices = window.speechSynthesis.getVoices();
      const deVoice = voices.find(v => (v.name.includes('Thorsten') || v.name.includes('German') || v.name.includes('Deutsch') || v.lang.startsWith('de')) && !v.name.includes('Google') && !v.name.includes('Android'));
      if (deVoice) u.voice = deVoice;
      isSpeaking = true;
      u.onend = () => { isSpeaking = false; };
      u.onerror = () => { isSpeaking = false; };
      window.speechSynthesis.speak(u);
    } catch (_) { isSpeaking = false; }
  }

  async function api(path, body = null, method = 'POST') {
    const headers = {
      'Content-Type': 'application/json',
      'X-KP-Desktop-Agent': '1',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method: body ? 'POST' : method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${host}${path}`, opts);
    const data = await res.json().catch(() => ({ ok: false, error: 'Keine JSON-Antwort' }));
    if (!res.ok) {
      if (data.code === 'PAIRING_REQUIRED' || res.status === 401) {
        token = '';
        localStorage.removeItem('kp_agent_token');
        promptPairing();
      }
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function promptPairing() {
    const code = window.prompt('Bitte Kopplungscode vom Laptop-Terminal eingeben (6 Ziffern):');
    if (!code) { setStatus('Nicht gekoppelt', false); return; }
    setStatus('Kopple…', null);
    fetch(`${host}/v1/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KP-Desktop-Agent': '1' },
      body: JSON.stringify({ code: code.trim() }),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.ok || !data.token) throw new Error(data.error || 'Kopplung fehlgeschlagen');
        token = data.token;
        localStorage.setItem('kp_agent_token', token);
        setStatus('Gekoppelt', true);
        checkHealth();
      })
      .catch(err => {
        setStatus(`Kopplung: ${err.message}`, false);
        appendMsg(`Kopplungsfehler: ${err.message}`, 'bot', true);
      });
  }

  async function checkHealth() {
    try {
      const h = await api('/v1/health', null, 'GET');
      setStatus(`Online • Branch ${h.branch || h.targetBranch || 'ok'}`, true);
      if (h.model) modelBadge.textContent = h.model;
      if (!history.length) {
        appendMsg('Hallo! Ich bin Sebastian, dein KI-Homepage-Techniker. Sag mir einfach, was du an der Seite ändern möchtest oder was ich prüfen soll.', 'bot');
      }
    } catch (e) {
      if (!token) promptPairing();
      else setStatus(`Agent offline: ${e.message}`, false);
    }
  }

  async function sendMessage(text) {
    text = (text || input.value || '').trim();
    if (!text) return;
    input.value = '';
    appendMsg(text, 'user');
    history.push({ role: 'user', content: text });

    const typing = appendMsg('Sebastian denkt nach…', 'bot typing');
    setStatus('KI antwortet…', true);

    try {
      const res = await api('/v1/chat', {
        messages: history.slice(-10),
        prompt: text,
      });
      typing.remove();
      const reply = res.reply || res.text || res.content || 'Keine Antwort erhalten.';
      appendMsg(reply, 'bot');
      history.push({ role: 'assistant', content: reply });
      setStatus('Bereit', true);
      speak(reply);
    } catch (err) {
      typing.remove();
      appendMsg(`Fehler: ${err.message}`, 'bot', true);
      setStatus(`Fehler: ${err.message}`, false);
    }
  }

  function setupSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.style.display = 'none';
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('rec');
      setStatus('Höre zu… (jetzt sprechen)', true);
    };
    recognition.onend = () => {
      isRecording = false;
      micBtn.classList.remove('rec');
      if (statusText.textContent.includes('Höre zu')) setStatus('Bereit', true);
    };
    recognition.onerror = (e) => {
      isRecording = false;
      micBtn.classList.remove('rec');
      if (e.error !== 'no-speech') setStatus(`Mikrofon: ${e.error}`, false);
    };
    recognition.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
      if (text) {
        input.value = text;
        sendMessage(text);
      }
    };
  }

  micBtn.addEventListener('click', () => {
    if (!recognition) return;
    if (isSpeaking && window.speechSynthesis) window.speechSynthesis.cancel();
    if (isRecording) {
      recognition.stop();
    } else {
      try { recognition.start(); } catch (_) {}
    }
  });

  sendBtn.addEventListener('click', () => sendMessage());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  setupSpeech();
  checkHealth();
})();