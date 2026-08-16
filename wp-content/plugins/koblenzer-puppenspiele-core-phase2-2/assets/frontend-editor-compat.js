(() => {
  'use strict';
  const cfg = window.KPFrontendEditor;
  if (!cfg) return;

  // Give every visible text leaf a stable DOM key as an additional persistence
  // path. Native block keys remain the primary mechanism; this fallback makes
  // text edits resilient even when a rendered block changes its generated key.
  function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  function pathFor(el, root) {
    const parts = [];
    let cur = el;
    while (cur && cur !== root && cur.nodeType === 1) {
      let n = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName === cur.tagName) n++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(cur.tagName.toLowerCase() + ':' + n);
      cur = cur.parentElement;
    }
    return parts.join('/');
  }

  function assignStableLeafKeys() {
    const roots = [...document.querySelectorAll('header,main,footer')];
    roots.forEach((root, ri) => {
      root.querySelectorAll('h1,h2,h3,h4,p,a,img,li,button').forEach((el) => {
        if (el.dataset.kpDomKey) return;
        if (el.closest('.kp-fe-toolbar,.kp-fe-panel,.kp-fe-modal-backdrop,.kp-fe-quick,#wpadminbar')) return;
        if (el.closest('.kp-termin-card,.kp-repertoire-card')) return;
        if (el.matches('.wp-block-navigation__responsive-container-open,.wp-block-navigation__responsive-container-close')) return;
        el.dataset.kpDomKey = 'd-' + hashString(ri + '|' + root.tagName + '|' + pathFor(el, root));
      });
    });
  }

  assignStableLeafKeys();

  // For normal visitors the base runtime that loads immediately after this file
  // now has the same DOM keys available and can apply persisted fallback values.
  if (!cfg.editMode) return;

  let currentTerminStatus = '';
  const dirtyTextKeys = new Set();
  const originalFetch = window.fetch.bind(window);

  function scopeFor(el) {
    return el && el.closest && el.closest('header,footer') ? 'global' : 'page';
  }

  function findByDomKey(key) {
    return [...document.querySelectorAll('[data-kp-dom-key]')].find((el) => el.dataset.kpDomKey === key) || null;
  }

  function mirrorDirtyTextIntoPayload(body) {
    if (!(body instanceof FormData) || body.get('action') !== 'kp_frontend_editor_save') return;
    const raw = body.get('payload');
    if (typeof raw !== 'string' || !raw) return;

    let payload;
    try { payload = JSON.parse(raw); } catch (e) { return; }
    if (!payload || typeof payload !== 'object') return;
    if (!payload.global || typeof payload.global !== 'object') payload.global = {};
    if (!payload.page || typeof payload.page !== 'object') payload.page = {};
    if (!payload.global.dom || typeof payload.global.dom !== 'object') payload.global.dom = {};
    if (!payload.page.dom || typeof payload.page.dom !== 'object') payload.page.dom = {};

    dirtyTextKeys.forEach((key) => {
      const el = findByDomKey(key);
      if (!el) return;
      const scope = scopeFor(el);
      const target = scope === 'global' ? payload.global : payload.page;
      if (!target.dom[key] || typeof target.dom[key] !== 'object') target.dom[key] = {};
      target.dom[key].content = { type: 'html', value: el.innerHTML };
    });

    body.set('payload', JSON.stringify(payload));
  }

  // Track every actual text input, including Backspace/Delete and mobile IME
  // composition. Empty text is intentionally valid and must remain persistable.
  document.addEventListener('input', (event) => {
    const el = event.target instanceof Element ? event.target.closest('[contenteditable="true"][data-kp-dom-key]') : null;
    if (el && !el.closest('.kp-fe-modal,.kp-fe-panel,.kp-fe-toolbar')) dirtyTextKeys.add(el.dataset.kpDomKey);
  }, true);

  window.fetch = async (...args) => {
    try {
      const options = args[1] || {};
      const body = options.body;
      if (body instanceof FormData && body.get('action') === 'kp_frontend_editor_save') {
        mirrorDirtyTextIntoPayload(body);
        if (!body.has('page_key')) body.append('page_key', cfg.pageKey || '');
        if (!body.has('page_path')) body.append('page_path', window.location.pathname || '/');
      }
    } catch (e) {}

    const response = await originalFetch(...args);
    try {
      const options = args[1] || {};
      const body = options.body;
      if (body instanceof FormData && body.get('action') === 'kp_frontend_editor_record' && body.get('type') === 'termin') {
        const copy = response.clone();
        const json = await copy.json();
        if (json && json.success && json.data && json.data.status) currentTerminStatus = String(json.data.status);
      }
    } catch (e) {}
    return response;
  };

  const completeStatusSelect = (select) => {
    if (!select || select.dataset.kpStatusComplete === '1') return;
    const additions = [
      ['planned', 'In Planung'],
      ['box_office', 'Eintritt Tageskasse'],
    ];
    additions.forEach(([value, label]) => {
      if (![...select.options].some(o => o.value === value)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        const sold = [...select.options].find(o => o.value === 'sold_out');
        if (sold) select.insertBefore(option, sold); else select.appendChild(option);
      }
    });
    if (currentTerminStatus && [...select.options].some(o => o.value === currentTerminStatus)) select.value = currentTerminStatus;
    select.dataset.kpStatusComplete = '1';
  };

  const scan = () => document.querySelectorAll('.kp-fe-modal [data-f="status"]').forEach(completeStatusSelect);
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
