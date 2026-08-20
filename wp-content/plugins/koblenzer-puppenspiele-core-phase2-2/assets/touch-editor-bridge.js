(() => {
  'use strict';

  const editor = window.KPFrontendEditorV2;
  if (!editor?.editMode) return;

  const clone = value => JSON.parse(JSON.stringify(value || {}));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const device = () => {
    const w = window.innerWidth;
    if (w <= 640) return 'mobile';
    if (w <= 900) return 'tablet';
    if (w <= 1400) return 'laptop';
    return 'desktop';
  };

  const definitions = {
    kp_touch_gesture_save: {
      cfg: window.KPTouchGestures,
      type: 'generic'
    },
    kp_touch_free_layout_save: {
      cfg: window.KPFreeLayout,
      type: 'free'
    }
  };

  const states = {};
  Object.entries(definitions).forEach(([action, def]) => {
    if (!def.cfg) return;
    states[action] = {
      global: clone(def.cfg.global),
      page: clone(def.cfg.page),
      pageKey: String(def.cfg.pageKey || ''),
      touched: false
    };
  });

  const pending = new Set();
  const nativeFetch = window.fetch.bind(window);
  let replayingMainSave = false;
  let waitingForMainSave = false;
  let undoing = false;
  let lastEditorEditAt = 0;
  let lastGestureAt = 0;

  const storageKey = `kpTouchUndoV2:${location.pathname}`;
  let undoStack = [];
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (stored && Date.now() - Number(stored.savedAt || 0) < 30 * 60 * 1000 && Array.isArray(stored.entries)) {
      undoStack = stored.entries.slice(-12);
      lastGestureAt = Number(undoStack.at(-1)?.at || 0);
    }
  } catch (_) {}

  function persistUndoStack() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({savedAt: Date.now(), entries: undoStack.slice(-12)}));
    } catch (_) {}
  }

  function sameSnapshot(a, b) {
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
  }

  function snapshotFromBody(body, fallback) {
    const parse = (name, value) => {
      try { return JSON.parse(String(body.get(name) || '{}')); }
      catch (_) { return clone(value); }
    };
    return {
      global: parse('global', fallback.global),
      page: parse('page', fallback.page),
      pageKey: String(body.get('page_key') || fallback.pageKey || '')
    };
  }

  function editorToast(message, type = 'ok') {
    const toast = document.querySelector('.kp-fe2-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `kp-fe2-toast is-visible is-${type}`;
    clearTimeout(editorToast.timer);
    editorToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  window.fetch = function(input, init = {}) {
    const body = init?.body;
    const action = body instanceof FormData ? String(body.get('action') || '') : '';
    const state = states[action];

    if (!state) return nativeFetch(input, init);

    const next = snapshotFromBody(body, state);
    const before = {global: clone(state.global), page: clone(state.page), pageKey: state.pageKey};
    const changed = !sameSnapshot(before.global, next.global) || !sameSnapshot(before.page, next.page);

    if (changed) {
      const at = Date.now();
      undoStack.push({action, before, after: clone(next), at});
      if (undoStack.length > 12) undoStack.shift();
      lastGestureAt = at;
      persistUndoStack();
    }

    state.global = clone(next.global);
    state.page = clone(next.page);
    state.pageKey = next.pageKey;
    state.touched = true;

    const responsePromise = nativeFetch(input, init);
    const tracked = responsePromise.then(async response => {
      if (!response.ok) throw new Error('Position oder Größe konnte nicht gespeichert werden.');
      const json = await response.clone().json().catch(() => null);
      if (json?.success === false) throw new Error(json?.data?.message || 'Position oder Größe konnte nicht gespeichert werden.');
    }).catch(() => null).finally(() => pending.delete(tracked));
    pending.add(tracked);
    return responsePromise;
  };

  async function waitForPending() {
    await wait(80);
    const deadline = Date.now() + 6500;
    while (pending.size && Date.now() < deadline) {
      await Promise.allSettled([...pending]);
      await wait(35);
    }
    if (pending.size) throw new Error('Die Positionsänderung ist noch nicht fertig. Bitte noch einmal Speichern antippen.');
  }

  async function writeSnapshot(action, snapshot) {
    const def = definitions[action];
    if (!def?.cfg) return;
    const fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', def.cfg.nonce || '');
    fd.append('page_key', snapshot.pageKey || def.cfg.pageKey || '');
    fd.append('global', JSON.stringify(snapshot.global || {}));
    fd.append('page', JSON.stringify(snapshot.page || {}));
    const response = await nativeFetch(def.cfg.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd});
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.success === false) {
      throw new Error(json?.data?.message || 'Position oder Größe konnte nicht dauerhaft gespeichert werden.');
    }
  }

  async function flushLatestGestureState() {
    await waitForPending();
    for (const [action, state] of Object.entries(states)) {
      if (!state.touched) continue;
      await writeSnapshot(action, state);
      state.touched = false;
    }
  }

  function setMenuOpen(nav, shouldOpen) {
    const container = nav?.querySelector('.wp-block-navigation__responsive-container');
    if (!container) return;
    const openButton = nav.querySelector('.wp-block-navigation__responsive-container-open');
    container.classList.toggle('is-menu-open', shouldOpen);
    container.classList.toggle('has-modal-open', shouldOpen);
    container.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    openButton?.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    document.documentElement.classList.toggle('has-modal-open', shouldOpen);
    document.body.classList.toggle('kp-menu-open', shouldOpen);
    if (shouldOpen) {
      requestAnimationFrame(() => {
        const panel = nav.querySelector('.wp-block-navigation__responsive-close');
        if (panel) panel.setAttribute('tabindex', '-1');
      });
    }
  }

  function interceptMenuTap(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return false;
    const control = target.closest('.kp-site-nav .wp-block-navigation__responsive-container-open,.kp-site-nav .wp-block-navigation__responsive-container-close');
    if (!control) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    const nav = control.closest('.kp-site-nav');
    if (!nav) return true;
    const opening = control.matches('.wp-block-navigation__responsive-container-open');
    setMenuOpen(nav, opening);
    return true;
  }

  function applyGenericSnapshot(snapshot) {
    const d = device();
    document.querySelectorAll('[data-kp-gesture-key]').forEach(el => {
      const scope = el.closest('header,footer') ? 'global' : 'page';
      const key = el.dataset.kpGestureKey;
      const value = snapshot?.[scope]?.[key]?.[d] || {x:0,y:0,scale:1};
      const x = Number(value.x) || 0;
      const y = Number(value.y) || 0;
      const scale = Math.max(.45, Math.min(2.5, Number(value.scale) || 1));
      el.style.setProperty('translate', `${x}px ${y}px`, 'important');
      el.style.setProperty('scale', String(scale), 'important');
      el.style.setProperty('transform-origin', 'center center', 'important');
    });
  }

  function applyFreeSnapshot(snapshot) {
    const d = device();
    const elements = new Set(document.querySelectorAll('[data-kp-free-layout-key]'));
    const button = document.querySelector('.kp-site-nav .wp-block-navigation__responsive-container-open');
    const panel = document.querySelector('.kp-site-nav .wp-block-navigation__responsive-close');
    if (button) { button.dataset.kpFreeLayoutKey = 'menu-button'; elements.add(button); }
    if (panel) { panel.dataset.kpFreeLayoutKey = 'menu-panel'; elements.add(panel); }

    elements.forEach(el => {
      const key = el.dataset.kpFreeLayoutKey;
      if (!key) return;
      const scope = key === 'menu-button' || key === 'menu-panel' || el.closest('header,footer') ? 'global' : 'page';
      const value = snapshot?.[scope]?.[key]?.[d] || {x:0,y:0,scale:1};
      const x = Number(value.x) || 0;
      const y = Number(value.y) || 0;
      const scale = Math.max(.45, Math.min(2.5, Number(value.scale) || 1));
      const transform = key === 'menu-panel'
        ? `translate3d(${x}px,calc(-50% + ${y}px),0) scale(${scale})`
        : `translate3d(${x}px,${y}px,0) scale(${scale})`;
      el.style.setProperty('transform', transform, 'important');
      el.style.setProperty('transform-origin', 'center center', 'important');
    });
  }

  function applySnapshot(action, snapshot) {
    if (definitions[action]?.type === 'generic') applyGenericSnapshot(snapshot);
    if (definitions[action]?.type === 'free') applyFreeSnapshot(snapshot);
  }

  async function undoLastGesture(event) {
    if (!undoStack.length || lastGestureAt < lastEditorEditAt || undoing) return false;
    const entry = undoStack.pop();
    if (!entry) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    undoing = true;
    persistUndoStack();

    const state = states[entry.action];
    const previousCurrent = state ? {global:clone(state.global),page:clone(state.page),pageKey:state.pageKey} : clone(entry.after);
    if (state) {
      state.global = clone(entry.before.global);
      state.page = clone(entry.before.page);
      state.pageKey = entry.before.pageKey;
      state.touched = true;
    }
    applySnapshot(entry.action, entry.before);

    try {
      await waitForPending();
      await writeSnapshot(entry.action, entry.before);
      if (state) state.touched = false;
      lastGestureAt = Number(undoStack.at(-1)?.at || 0);
      editorToast('Verschieben / Zoomen rückgängig ✓', 'ok');

      const normalEditorDirty = document.querySelector('.kp-fe2-save')?.classList.contains('is-dirty');
      if (!normalEditorDirty) setTimeout(() => location.reload(), 180);
    } catch (error) {
      undoStack.push(entry);
      persistUndoStack();
      if (state) {
        state.global = clone(previousCurrent.global);
        state.page = clone(previousCurrent.page);
        state.pageKey = previousCurrent.pageKey;
      }
      applySnapshot(entry.action, previousCurrent);
      editorToast(error?.message || 'Rückgängig konnte nicht gespeichert werden.', 'error');
    } finally {
      undoing = false;
    }
    return true;
  }

  function markEditorEdit(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.kp-fe2-inspector,.kp-fe2-record-backdrop') || target.isContentEditable) {
      lastEditorEditAt = Date.now();
    }
  }
  window.addEventListener('input', markEditorEdit, true);
  window.addEventListener('change', markEditorEdit, true);

  /* Window capture runs before the direct editor's document-capture handler.
     This is essential: a short menu tap must open/close navigation and may never
     become an editor selection. Long-press drags are already suppressed earlier
     by the gesture runtime and therefore do not reach this handler. */
  window.addEventListener('click', async event => {
    if (interceptMenuTap(event)) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const undo = target.closest('.kp-fe2-undo');
    if (undo && await undoLastGesture(event)) return;

    const saveButton = target.closest('.kp-fe2-save');
    if (!saveButton || replayingMainSave || waitingForMainSave) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    waitingForMainSave = true;
    saveButton.disabled = true;
    const originalHtml = saveButton.innerHTML;
    saveButton.innerHTML = '<span class="dashicons dashicons-update"></span><span>Positionen sichern…</span>';

    try {
      await flushLatestGestureState();
      replayingMainSave = true;
      saveButton.disabled = false;
      saveButton.click();
    } catch (error) {
      saveButton.disabled = false;
      saveButton.innerHTML = originalHtml;
      editorToast(error?.message || 'Position oder Größe konnte nicht gespeichert werden.', 'error');
    } finally {
      replayingMainSave = false;
      waitingForMainSave = false;
    }
  }, true);
})();
