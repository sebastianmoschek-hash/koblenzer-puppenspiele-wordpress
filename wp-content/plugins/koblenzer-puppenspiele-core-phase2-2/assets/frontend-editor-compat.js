(() => {
  'use strict';
  const cfg = window.KPFrontendEditor || window.KPFrontendEditorV2;
  if (!cfg) return;

  // Stable leaf keys provide a second persistence path for visible content.
  // Native block keys stay primary, but text/link/image changes can still be
  // restored when a rendered block's generated key changes later.
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
        if (el.closest('.kp-fe-toolbar,.kp-fe-panel,.kp-fe-modal-backdrop,.kp-fe-quick,.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,#wpadminbar')) return;
        if (el.closest('.kp-termin-card,.kp-repertoire-card')) return;
        if (el.matches('.wp-block-navigation__responsive-container-open,.wp-block-navigation__responsive-container-close')) return;
        el.dataset.kpDomKey = 'd-' + hashString(ri + '|' + root.tagName + '|' + pathFor(el, root));
      });
    });
  }

  assignStableLeafKeys();

  // For normal visitors the base runtime that loads immediately after this file
  // can now apply any saved DOM fallback values using exactly the same keys.
  if (!cfg.editMode) return;

  let currentTerminStatus = '';
  const dirtyTextKeys = new Set();
  const originalFetch = window.fetch.bind(window);
  let ownerFlushInFlight = null;

  function scopeFor(el) {
    return el && el.closest && el.closest('header,footer') ? 'global' : 'page';
  }

  function findByDomKey(key) {
    return [...document.querySelectorAll('[data-kp-dom-key]')].find((el) => el.dataset.kpDomKey === key) || null;
  }

  function findByBlockKey(key) {
    return [...document.querySelectorAll('[data-kp-edit-key]')].find((el) => el.dataset.kpEditKey === key) || null;
  }

  function contentLeafForBlock(el) {
    if (!el) return null;
    const name = el.dataset.kpBlockName || '';
    if (name === 'core/button' || name === 'core/navigation-link') return el.matches('a') ? el : el.querySelector('a');
    if (name === 'core/image') return el.matches('img') ? el : el.querySelector('img');
    if (['core/paragraph','core/heading','core/list-item'].includes(name)) return el;
    if (el.matches('h1,h2,h3,h4,p,a,img,li,button')) return el;
    return null;
  }

  function contentFromLeaf(el) {
    if (!el) return null;
    if (el.tagName === 'IMG') {
      return { type: 'image', src: el.currentSrc || el.src || '', alt: el.alt || '' };
    }
    if (el.tagName === 'A' || el.tagName === 'BUTTON') {
      return { type: 'link', label: el.textContent || '', href: el.tagName === 'A' ? (el.getAttribute('href') || '') : '' };
    }
    return { type: 'html', value: el.innerHTML };
  }

  function ensurePayloadScope(payload, scope) {
    if (!payload[scope] || typeof payload[scope] !== 'object') payload[scope] = {};
    if (!payload[scope].dom || typeof payload[scope].dom !== 'object') payload[scope].dom = {};
    return payload[scope];
  }

  function writeDomFallback(payload, el, content) {
    if (!el || !el.dataset.kpDomKey || !content) return;
    const scope = scopeFor(el);
    const target = ensurePayloadScope(payload, scope);
    const key = el.dataset.kpDomKey;
    if (!target.dom[key] || typeof target.dom[key] !== 'object') target.dom[key] = {};
    target.dom[key].content = content;
  }

  function mirrorVisibleContentIntoPayload(body) {
    if (!(body instanceof FormData) || body.get('action') !== 'kp_frontend_editor_save') return;
    const raw = body.get('payload');
    if (typeof raw !== 'string' || !raw) return;

    let payload;
    try { payload = JSON.parse(raw); } catch (e) { return; }
    if (!payload || typeof payload !== 'object') return;
    ensurePayloadScope(payload, 'global');
    ensurePayloadScope(payload, 'page');

    // Exact text snapshot for all elements that actually received keyboard input.
    // This explicitly includes Backspace/Delete and an entirely empty text value.
    dirtyTextKeys.forEach((key) => {
      const el = findByDomKey(key);
      if (el) writeDomFallback(payload, el, { type: 'html', value: el.innerHTML });
    });

    // Any block that already has a content override is mirrored to its stable
    // visible leaf as well. This covers edited buttons/links/images in addition
    // to text, without freezing untouched page content.
    ['global','page'].forEach((scope) => {
      const blocks = payload[scope] && payload[scope].blocks;
      if (!blocks || typeof blocks !== 'object') return;
      Object.entries(blocks).forEach(([key, item]) => {
        if (!item || typeof item !== 'object' || !item.content) return;
        const block = findByBlockKey(key);
        const leaf = contentLeafForBlock(block);
        if (!leaf || !leaf.dataset.kpDomKey) return;
        writeDomFallback(payload, leaf, contentFromLeaf(leaf));
      });
    });

    body.set('payload', JSON.stringify(payload));
  }

  function collectOwnerDesignDraft() {
    const owner = window.KPOwnerWebApp;
    const sheet = document.querySelector('.kp-oa-sheet.is-design');
    if (!owner || !owner.canEdit || !sheet) return null;
    const settings = {...(owner.design || {})};
    sheet.querySelectorAll('[data-design]').forEach((input) => {
      const key = input.dataset.design;
      if (!key) return;
      settings[key] = input.type === 'checkbox' ? (input.checked ? 1 : 0) : (input.type === 'range' ? Number(input.value) : input.value);
    });
    const menuX = sheet.querySelector('[data-kp-menu-x] input[type="range"]');
    if (menuX) settings.menu_offset_x = Number(menuX.value);
    return settings;
  }

  async function flushOwnerDesignBeforeMainSave() {
    const owner = window.KPOwnerWebApp;
    const settings = collectOwnerDesignDraft();
    if (!owner || !settings || !owner.nonce || !owner.ajaxUrl) return;
    const fd = new FormData();
    fd.append('action', 'kp_owner_design_save');
    fd.append('nonce', owner.nonce);
    fd.append('settings', JSON.stringify(settings));
    const response = await originalFetch(owner.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd});
    let json = null;
    try { json = await response.json(); } catch (e) {}
    if (!response.ok || !json?.success) throw new Error(json?.data?.message || 'Design konnte vor dem Hauptspeichern nicht gespeichert werden.');
    owner.design = {...(json.data?.settings || settings)};
  }

  async function flushAllOwnerDraftsBeforeMainSave() {
    if (ownerFlushInFlight) return ownerFlushInFlight;
    ownerFlushInFlight = (async () => {
      // The FE2 AJAX request is the one path every orange Save ultimately uses.
      // Flush all specialist owner drafts here so persistence never depends on
      // which click/capture bridge happened to win on a particular device.
      const registry = window.KPOwnerSaveRegistry;
      if (registry?.flushAll) await registry.flushAll();
      else await flushOwnerDesignBeforeMainSave();

      // Also call the specialist runtimes directly. If the registry ran them
      // already, their dirty flags make this a no-op. If the registry was not
      // loaded on a page, these calls are the persistence safety net.
      if (window.KPOwnerResponsiveRuntime?.flush) await window.KPOwnerResponsiveRuntime.flush();
      if (window.KPOwnerMenuXRuntime?.flush) await window.KPOwnerMenuXRuntime.flush();
      if (window.KPImagePositionRuntime?.flush) await window.KPImagePositionRuntime.flush();
      if (window.KPTouchGestureRuntime?.flush) await window.KPTouchGestureRuntime.flush();
      if (window.KPFreeLayoutRuntime?.flush) await window.KPFreeLayoutRuntime.flush();
    })().finally(() => { ownerFlushInFlight = null; });
    return ownerFlushInFlight;
  }

  // Track every actual text input, including mobile keyboard composition.
  document.addEventListener('input', (event) => {
    const el = event.target instanceof Element ? event.target.closest('[contenteditable="true"][data-kp-dom-key]') : null;
    if (el && !el.closest('.kp-fe-modal,.kp-fe-panel,.kp-fe-toolbar,.kp-fe2-inspector,.kp-fe2-toolbar')) dirtyTextKeys.add(el.dataset.kpDomKey);
  }, true);

  window.fetch = async (...args) => {
    try {
      const options = args[1] || {};
      const body = options.body;
      if (body instanceof FormData && body.get('action') === 'kp_frontend_editor_save') {
        mirrorVisibleContentIntoPayload(body);
        if (!body.has('page_key')) body.append('page_key', cfg.pageKey || '');
        if (!body.has('page_path')) body.append('page_path', window.location.pathname || '/');
      }
      if (body instanceof FormData && body.get('action') === 'kp_fe_v2_save') {
        await flushAllOwnerDraftsBeforeMainSave();
      }
    } catch (e) {
      if (args[1]?.body instanceof FormData && args[1].body.get('action') === 'kp_fe_v2_save') throw e;
    }

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