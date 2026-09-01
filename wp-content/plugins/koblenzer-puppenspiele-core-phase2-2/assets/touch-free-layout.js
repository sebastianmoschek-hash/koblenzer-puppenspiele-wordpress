(() => {
  'use strict';

  const cfg = window.KPFreeLayout;
  if (!cfg) return;

  const clone = value => JSON.parse(JSON.stringify(value || {}));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  let globalData = clone(cfg.global);
  let pageData = clone(cfg.page);
  const holdMs = Math.max(320, Math.min(800, Number(cfg.holdMs) || 460));
  const uiSelector = '.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-fe-card-sheet-backdrop,.kp-oa-backdrop,#wpadminbar';
  const headerSelector = '.kp-header-stage img,.kp-header-photo img';
  const menuButtonSelector = '.kp-site-nav .wp-block-navigation__responsive-container-open';
  const menuPanelSelector = '.kp-site-nav .wp-block-navigation__responsive-close';
  const extraSelector = [
    '.kp-repertoire-single .kp-repertoire-facts > *',
    '.kp-repertoire-single .kp-repertoire-description',
    '.kp-repertoire-single .kp-repertoire-details > section',
    '.kp-repertoire-single .kp-repertoire-cta > a',
    '.kp-repertoire-card .kp-repertoire-card-body > *',
    '.kp-termine-card',
    '.kp-termine-button',
    '.wp-block-button__link'
  ].join(',');

  let touchState = null;
  let mouseState = null;
  let suppressUntil = 0;
  let dirty = false;
  let saving = null;
  let lastActionAt = 0;
  const history = [];

  function device() {
    const width = window.innerWidth;
    if (width <= 640) return 'mobile';
    if (width <= 900) return 'tablet';
    if (width <= 1400) return 'laptop';
    return 'desktop';
  }

  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    return (hash >>> 0).toString(36);
  }

  function pathFor(el, root) {
    const path = [];
    let current = el;
    while (current && current !== root && current.nodeType === 1) {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      path.unshift(`${current.tagName.toLowerCase()}-${index}`);
      current = current.parentElement;
    }
    return path.join('-');
  }

  function hud(text, delay = 0) {
    let el = document.querySelector('.kp-gesture-hud');
    if (!el) {
      el = document.createElement('div');
      el.className = 'kp-gesture-hud';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(hud.timer);
    if (delay) hud.timer = setTimeout(() => el.classList.remove('is-visible'), delay);
  }

  function markDirty(message = 'Geändert – zum Übernehmen „Speichern“ antippen') {
    dirty = true;
    document.body.classList.add('kp-touch-layout-dirty');
    document.querySelector('.kp-fe2-save')?.classList.add('is-dirty');
    hud(message, 1100);
  }

  function scopeData(scope) {
    return scope === 'global' ? globalData : pageData;
  }

  function record(key, scope, create = true, targetDevice = device()) {
    const data = scopeData(scope);
    if (create) {
      data[key] = data[key] || {};
      data[key][targetDevice] = data[key][targetDevice] || {x:0, y:0, scale:1};
    }
    return {data, device:targetDevice, value:data[key]?.[targetDevice] || {x:0, y:0, scale:1}};
  }

  function kindFor(el) {
    if (el?.matches?.(menuButtonSelector)) return 'menu-button';
    if (el?.matches?.(menuPanelSelector)) return 'menu-panel';
    if (el?.matches?.(headerSelector)) return 'header-image';
    return 'normal';
  }

  function scopeFor(el, kind) {
    return kind === 'menu-button' || kind === 'menu-panel' || kind === 'header-image' || el.closest('header,footer') ? 'global' : 'page';
  }

  function keyFor(el, kind) {
    if (kind === 'menu-button') return 'menu-button';
    if (kind === 'menu-panel') return 'menu-panel';
    if (kind === 'header-image') {
      const images = [...document.querySelectorAll(headerSelector)];
      return `header-image-${Math.max(0, images.indexOf(el)) + 1}`;
    }
    if (el.dataset.kpFreeLayoutKey) return el.dataset.kpFreeLayoutKey;
    const root = el.closest('article,section,main,header,footer') || document.body;
    const key = 'free-' + hashString(`${location.pathname}|${pathFor(el, root)}|${el.className || ''}`);
    el.dataset.kpFreeLayoutKey = key;
    return key;
  }

  function apply(el, value, kind = kindFor(el)) {
    if (!el || !value) return;
    const x = Number(value.x) || 0;
    const y = Number(value.y) || 0;
    const scale = clamp(Number(value.scale) || 1, .45, 2.5);
    const transform = kind === 'menu-panel'
      ? `translate3d(${x}px,calc(-50% + ${y}px),0) scale(${scale})`
      : `translate3d(${x}px,${y}px,0) scale(${scale})`;
    el.style.setProperty('transform', transform, 'important');
    el.style.setProperty('transform-origin', 'center center', 'important');
  }

  function clearGenericTransform(el) {
    if (!el) return;
    el.style.removeProperty('translate');
    el.style.removeProperty('scale');
    const transient = ['kp-has-gesture-transform', 'kp-gesture-active', 'is-dragging', 'is-pinching'];
    if (transient.some(name => el.classList.contains(name))) el.classList.remove(...transient);
  }

  function applySaved(root = document) {
    root.querySelectorAll?.(`${headerSelector},.kp-site-nav [data-kp-gesture-key],.kp-site-nav [data-kp-dom-key],.kp-site-nav [data-kp-edit-key]`).forEach(clearGenericTransform);

    const fixed = [
      [document.querySelector(menuButtonSelector), 'menu-button'],
      [document.querySelector(menuPanelSelector), 'menu-panel']
    ];
    document.querySelectorAll(headerSelector).forEach(image => fixed.push([image, 'header-image']));

    fixed.forEach(([el, kind]) => {
      if (!el) return;
      const key = keyFor(el, kind);
      el.dataset.kpFreeLayoutKey = key;
      apply(el, record(key, 'global', false).value, kind);
    });

    root.querySelectorAll?.(extraSelector).forEach(el => {
      if (el.closest('.kp-site-nav') || el.matches('[data-kp-gesture-key],[data-kp-edit-key],[data-kp-dom-key]')) return;
      const key = keyFor(el, 'normal');
      apply(el, record(key, scopeFor(el, 'normal'), false).value, 'normal');
    });
  }

  function hydrate(payload) {
    if (!payload || dirty || touchState || mouseState || saving) return false;
    globalData = clone(payload.global);
    pageData = clone(payload.page);
    cfg.global = clone(globalData);
    cfg.page = clone(pageData);
    history.length = 0;
    lastActionAt = 0;
    applySaved();
    return true;
  }

  function targetFor(node) {
    if (!(node instanceof Element) || node.closest(uiSelector)) return null;
    const button = node.closest(menuButtonSelector);
    if (button) return {el:button, kind:'menu-button'};
    const panel = node.closest(menuPanelSelector);
    if (panel) return {el:panel, kind:'menu-panel'};
    const headerImage = node.closest(headerSelector);
    if (headerImage) return {el:headerImage, kind:'header-image'};
    const extra = node.closest(extraSelector);
    if (extra && !extra.closest('.kp-site-nav') && !extra.matches('[data-kp-gesture-key],[data-kp-edit-key],[data-kp-dom-key]')) {
      return {el:extra, kind:'normal'};
    }
    return null;
  }

  function setValue(target, next) {
    const {el, kind, scope, key} = target;
    const ref = record(key, scope, true);
    ref.data[key][ref.device] = {
      x:Math.round(clamp(Number(next.x) || 0, -1600, 1600) * 100) / 100,
      y:Math.round(clamp(Number(next.y) || 0, -1600, 1600) * 100) / 100,
      scale:Math.round(clamp(Number(next.scale) || 1, .45, 2.5) * 1000) / 1000
    };
    apply(el, ref.data[key][ref.device], kind);
  }

  function remember(target, before) {
    const ref = record(target.key, target.scope, true);
    const after = {...ref.value};
    const changed = Math.abs((after.x || 0) - (before.x || 0)) > .01 ||
      Math.abs((after.y || 0) - (before.y || 0)) > .01 ||
      Math.abs((after.scale || 1) - (before.scale || 1)) > .001;
    if (!changed) return false;
    history.push({...target, before:{...before}, after, device:ref.device, at:Date.now()});
    if (history.length > 24) history.shift();
    lastActionAt = Date.now();
    return true;
  }

  function distance(a, b) {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  function midpoint(a, b) {
    return {x:(a.clientX + b.clientX) / 2, y:(a.clientY + b.clientY) / 2};
  }

  function buildTarget(el, kind) {
    const scope = scopeFor(el, kind);
    const key = keyFor(el, kind);
    return {el, kind, scope, key};
  }

  function beginTouch(event) {
    if (!cfg.editMode || !cfg.canEdit || event.target.closest?.(uiSelector)) return;
    const existingTarget = touchState?.target;
    const found = existingTarget || targetFor(event.target);
    if (!found) return;

    event.stopPropagation();
    const target = existingTarget || buildTarget(found.el, found.kind);
    const base = {...record(target.key, target.scope, true).value};

    if (event.touches.length >= 2) {
      clearTimeout(touchState?.timer);
      const a = event.touches[0], b = event.touches[1];
      touchState = {
        target, mode:'pinch', base,
        startDistance:Math.max(20, distance(a, b)),
        startMid:midpoint(a, b)
      };
      target.el.classList.add('kp-free-layout-active', 'kp-free-layout-pinching');
      event.preventDefault();
      return;
    }

    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const pending = {target, mode:'pending', base, startX:touch.clientX, startY:touch.clientY, timer:null};
    pending.timer = setTimeout(() => {
      if (touchState !== pending) return;
      pending.mode = 'drag';
      target.el.classList.add('kp-free-layout-active');
      hud(target.kind === 'menu-panel' ? 'Menü als Ganzes verschieben' : 'Verschieben');
    }, holdMs);
    touchState = pending;
  }

  function moveTouch(event) {
    const state = touchState;
    if (!state) return;
    event.stopPropagation();

    if (state.mode === 'pending' && event.touches.length === 1) {
      const t = event.touches[0];
      if (Math.hypot(t.clientX - state.startX, t.clientY - state.startY) > 10) {
        clearTimeout(state.timer);
        touchState = null;
      }
      return;
    }

    if (state.mode === 'drag' && event.touches.length === 1) {
      const t = event.touches[0];
      setValue(state.target, {
        x:(state.base.x || 0) + (t.clientX - state.startX),
        y:(state.base.y || 0) + (t.clientY - state.startY),
        scale:state.base.scale || 1
      });
      event.preventDefault();
      return;
    }

    if (state.mode === 'pinch' && event.touches.length >= 2) {
      const a = event.touches[0], b = event.touches[1];
      const ratio = distance(a, b) / state.startDistance;
      const mid = midpoint(a, b);
      setValue(state.target, {
        x:(state.base.x || 0) + (mid.x - state.startMid.x),
        y:(state.base.y || 0) + (mid.y - state.startMid.y),
        scale:(state.base.scale || 1) * ratio
      });
      event.preventDefault();
    }
  }

  function finishTouch(event) {
    const state = touchState;
    if (!state) return;
    event.stopPropagation();
    if (state.mode === 'pending') {
      clearTimeout(state.timer);
      touchState = null;
      return;
    }
    if (state.mode === 'pinch' && event.touches?.length > 0) return;

    state.target.el.classList.remove('kp-free-layout-active', 'kp-free-layout-pinching');
    if (remember(state.target, state.base)) markDirty();
    suppressUntil = Date.now() + 750;
    event.preventDefault?.();
    touchState = null;
  }

  function beginMouse(event) {
    if (!cfg.editMode || !cfg.canEdit || event.button !== 0 || event.target.closest?.(uiSelector)) return;
    const found = targetFor(event.target);
    if (!found) return;
    const target = buildTarget(found.el, found.kind);
    const base = {...record(target.key, target.scope, true).value};
    const pending = {target, mode:'pending', base, startX:event.clientX, startY:event.clientY, timer:null};
    pending.timer = setTimeout(() => {
      if (mouseState !== pending) return;
      pending.mode = 'drag';
      target.el.classList.add('kp-free-layout-active');
      hud(target.kind === 'menu-panel' ? 'Menü als Ganzes verschieben' : 'Verschieben');
    }, 320);
    mouseState = pending;
  }

  function moveMouse(event) {
    const state = mouseState;
    if (!state) return;
    if (state.mode === 'pending') {
      if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 7) {
        clearTimeout(state.timer);
        mouseState = null;
      }
      return;
    }
    if (state.mode === 'drag') {
      event.preventDefault();
      setValue(state.target, {
        x:(state.base.x || 0) + (event.clientX - state.startX),
        y:(state.base.y || 0) + (event.clientY - state.startY),
        scale:state.base.scale || 1
      });
    }
  }

  function finishMouse(event) {
    const state = mouseState;
    if (!state) return;
    clearTimeout(state.timer);
    if (state.mode === 'drag') {
      state.target.el.classList.remove('kp-free-layout-active');
      if (remember(state.target, state.base)) markDirty();
      suppressUntil = Date.now() + 500;
      event.preventDefault();
    }
    mouseState = null;
  }

  async function flush() {
    if (!dirty) return {draft:false};
    if (saving) return saving;
    const fd = new FormData();
    fd.append('action', 'kp_touch_free_layout_save');
    fd.append('nonce', cfg.nonce || '');
    fd.append('page_key', cfg.pageKey || '');
    fd.append('global', JSON.stringify(globalData));
    fd.append('page', JSON.stringify(pageData));
    saving = fetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd})
      .then(async response => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(json?.data?.message || 'Position oder Größe konnte nicht gespeichert werden.');
        if (json.data?.global) globalData = clone(json.data.global);
        if (json.data?.page) pageData = clone(json.data.page);
        cfg.global = clone(globalData);
        cfg.page = clone(pageData);
        dirty = false;
        document.body.classList.remove('kp-touch-layout-dirty');
        return json.data || {};
      })
      .finally(() => { saving = null; });
    return saving;
  }

  function undo() {
    const entry = history.pop();
    if (!entry) return false;
    const data = scopeData(entry.scope);
    data[entry.key] = data[entry.key] || {};
    data[entry.key][entry.device] = {...entry.before};
    if (entry.el?.isConnected) apply(entry.el, entry.before, entry.kind);
    lastActionAt = Number(history.at(-1)?.at || 0);
    markDirty('Verschieben / Zoomen rückgängig ✓');
    return true;
  }

  function resetMenu() {
    const currentDevice = device();
    let changed = false;
    ['menu-button', 'menu-panel'].forEach(key => {
      if (!globalData[key]?.[currentDevice]) return;
      delete globalData[key][currentDevice];
      if (!Object.keys(globalData[key]).length) delete globalData[key];
      changed = true;
    });
    if (changed) {
      applySaved();
      markDirty('Menüposition zurückgesetzt – „Speichern“ antippen');
    }
    return Promise.resolve({draft:changed});
  }

  applySaved();
  new MutationObserver(records => {
    const hasLayoutAddition = records.some(record => [...record.addedNodes].some(node =>
      node instanceof Element && !node.matches(uiSelector) && !node.closest(uiSelector)
    ));
    if (hasLayoutAddition) requestAnimationFrame(() => applySaved());
  }).observe(document.documentElement, {childList:true, subtree:true});

  window.KPFreeLayoutRuntime = {
    flush,
    hydrate,
    resetMenu,
    undo,
    hasHistory: () => history.length > 0,
    lastActionAt: () => lastActionAt,
    isDirty: () => dirty
  };

  if (!cfg.editMode || !cfg.canEdit) return;

  document.addEventListener('contextmenu', event => {
    const target = event.target;
    if (target instanceof Element && !target.closest(uiSelector) && targetFor(target)) event.preventDefault();
  }, true);
  document.addEventListener('dragstart', event => {
    if (event.target instanceof Element && event.target.closest('img')) event.preventDefault();
  }, true);

  window.addEventListener('touchstart', beginTouch, {capture:true, passive:false});
  window.addEventListener('touchmove', moveTouch, {capture:true, passive:false});
  window.addEventListener('touchend', finishTouch, {capture:true, passive:false});
  window.addEventListener('touchcancel', finishTouch, {capture:true, passive:false});
  document.addEventListener('mousedown', beginMouse, true);
  window.addEventListener('mousemove', moveMouse, true);
  window.addEventListener('mouseup', finishMouse, true);

  window.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.kp-fe2-undo') && history.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      undo();
      return;
    }
    if (Date.now() < suppressUntil && !target?.closest(uiSelector)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
