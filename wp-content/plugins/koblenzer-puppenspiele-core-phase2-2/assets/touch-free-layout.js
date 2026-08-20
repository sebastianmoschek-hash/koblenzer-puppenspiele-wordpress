(() => {
  'use strict';

  const cfg = window.KPFreeLayout;
  if (!cfg) return;

  const clone = value => JSON.parse(JSON.stringify(value || {}));
  const globalData = clone(cfg.global);
  const pageData = clone(cfg.page);
  const holdMs = Math.max(320, Math.min(800, Number(cfg.holdMs) || 460));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const uiSelector = '.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-fe-card-sheet-backdrop,.kp-oa-backdrop,#wpadminbar';
  const headerSelector = '.kp-header-stage img,.kp-header-photo img';
  const menuButtonSelector = '.kp-site-nav .wp-block-navigation__responsive-container-open';
  const menuPanelSelector = '.kp-site-nav .wp-block-navigation__responsive-close';

  let state = null;
  let suppressUntil = 0;
  let saveChain = Promise.resolve();
  let lastFreeActionAt = 0;
  let lastOtherActionAt = 0;
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
      path.unshift(current.tagName.toLowerCase() + '-' + index);
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

  function scopeData(scope) {
    return scope === 'global' ? globalData : pageData;
  }

  function record(key, scope, create = true) {
    const data = scopeData(scope);
    const currentDevice = device();
    if (create) {
      data[key] = data[key] || {};
      data[key][currentDevice] = data[key][currentDevice] || {x:0, y:0, scale:1};
    }
    return {
      data,
      device: currentDevice,
      value: data[key]?.[currentDevice] || {x:0, y:0, scale:1}
    };
  }

  function save() {
    const task = saveChain.catch(() => null).then(async () => {
      const fd = new FormData();
      fd.append('action', 'kp_touch_free_layout_save');
      fd.append('nonce', cfg.nonce);
      fd.append('page_key', cfg.pageKey);
      fd.append('global', JSON.stringify(globalData));
      fd.append('page', JSON.stringify(pageData));
      const response = await fetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd});
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.data?.message || 'Position oder Größe konnte nicht gespeichert werden.');
      }
      return json.data;
    });

    saveChain = task;
    task.catch(error => hud(error?.message || 'Speichern fehlgeschlagen', 1800));
    return task;
  }

  async function flush() {
    await saveChain;
    return save();
  }

  function isHeaderImage(el) {
    return Boolean(el?.matches?.(headerSelector));
  }

  function kindFor(el) {
    if (el?.matches?.(menuButtonSelector)) return 'menu-button';
    if (el?.matches?.(menuPanelSelector)) return 'menu-panel';
    if (isHeaderImage(el)) return 'header-image';
    return 'normal';
  }

  function scopeFor(el, kind) {
    return kind === 'menu-button' || kind === 'menu-panel' || kind === 'header-image' || el.closest('header,footer') ? 'global' : 'page';
  }

  function headerKey(el) {
    const images = [...document.querySelectorAll(headerSelector)];
    const index = Math.max(0, images.indexOf(el));
    return `header-image-${index + 1}`;
  }

  function keyFor(el, kind) {
    if (kind === 'menu-button') return 'menu-button';
    if (kind === 'menu-panel') return 'menu-panel';
    if (kind === 'header-image') return headerKey(el);
    if (el.dataset.kpFreeLayoutKey) return el.dataset.kpFreeLayoutKey;
    const root = el.closest('article,section,main,header,footer') || document.body;
    const key = 'free-' + hashString(location.pathname + '|' + pathFor(el, root) + '|' + (el.className || ''));
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
    if (!el.style.getPropertyValue('transform')) el.style.removeProperty('transform-origin');
    el.classList.remove('kp-has-gesture-transform', 'kp-gesture-active', 'is-dragging', 'is-pinching');
  }

  function clearDedicatedGenericTransforms() {
    document.querySelectorAll(`${headerSelector},.kp-site-nav [data-kp-gesture-key],.kp-site-nav [data-kp-dom-key],.kp-site-nav [data-kp-edit-key]`).forEach(clearGenericTransform);
  }

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

  function eligibleExtra(node) {
    const el = node.closest?.(extraSelector);
    if (!el || el.closest(uiSelector) || el.closest('.kp-site-nav')) return null;
    if (el.matches('[data-kp-gesture-key],[data-kp-edit-key],[data-kp-dom-key]')) return null;
    keyFor(el, 'normal');
    return el;
  }

  function targetFor(node) {
    if (!(node instanceof Element) || node.closest(uiSelector)) return null;

    const button = node.closest(menuButtonSelector);
    if (button) return {el:button, kind:'menu-button'};

    const panel = node.closest(menuPanelSelector);
    if (panel) return {el:panel, kind:'menu-panel'};

    const headerImage = node.closest(headerSelector);
    if (headerImage) return {el:headerImage, kind:'header-image'};

    const extra = eligibleExtra(node);
    if (extra) return {el:extra, kind:'normal'};
    return null;
  }

  function applySaved() {
    clearDedicatedGenericTransforms();

    const button = document.querySelector(menuButtonSelector);
    const panel = document.querySelector(menuPanelSelector);
    const fixed = [[button, 'menu-button'], [panel, 'menu-panel']];

    document.querySelectorAll(headerSelector).forEach(image => fixed.push([image, 'header-image']));

    fixed.forEach(([el, kind]) => {
      if (!el) return;
      const key = keyFor(el, kind);
      el.dataset.kpFreeLayoutKey = key;
      const ref = record(key, 'global', false);
      apply(el, ref.value, kind);
    });

    document.querySelectorAll(extraSelector).forEach(el => {
      if (el.closest('.kp-site-nav') || el.matches('[data-kp-gesture-key],[data-kp-edit-key],[data-kp-dom-key]')) return;
      const key = keyFor(el, 'normal');
      const scope = scopeFor(el, 'normal');
      const ref = record(key, scope, false);
      apply(el, ref.value, 'normal');
    });
  }

  applySaved();
  const observer = new MutationObserver(() => requestAnimationFrame(applySaved));
  observer.observe(document.documentElement, {childList:true, subtree:true});

  if (!cfg.editMode || !cfg.canEdit) {
    window.KPFreeLayoutRuntime = {flush: () => Promise.resolve()};
    return;
  }

  document.addEventListener('contextmenu', event => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(uiSelector)) return;
    if (target.closest(`img,[data-kp-gesture-key],[data-kp-free-layout-key],${menuButtonSelector},${menuPanelSelector}`)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  document.addEventListener('dragstart', event => {
    if (event.target instanceof Element && event.target.closest('img')) event.preventDefault();
  }, true);

  function distance(a, b) {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  function midpoint(a, b) {
    return {x:(a.clientX + b.clientX) / 2, y:(a.clientY + b.clientY) / 2};
  }

  function mark(el, pinch = false) {
    el.classList.add('kp-free-layout-active');
    el.classList.toggle('kp-free-layout-pinching', pinch);
    try { navigator.vibrate?.(14); } catch (_) {}
  }

  function unmark(el) {
    el?.classList.remove('kp-free-layout-active', 'kp-free-layout-pinching');
  }

  function setValue(el, kind, scope, key, next) {
    const ref = record(key, scope, true);
    ref.data[key][ref.device] = {
      x: Math.round(clamp(Number(next.x) || 0, -1600, 1600) * 100) / 100,
      y: Math.round(clamp(Number(next.y) || 0, -1600, 1600) * 100) / 100,
      scale: Math.round(clamp(Number(next.scale) || 1, .45, 2.5) * 1000) / 1000
    };
    apply(el, ref.data[key][ref.device], kind);
    return ref.data[key][ref.device];
  }

  function valuesDiffer(a, b) {
    return Math.abs((Number(a?.x) || 0) - (Number(b?.x) || 0)) > .01 ||
      Math.abs((Number(a?.y) || 0) - (Number(b?.y) || 0)) > .01 ||
      Math.abs((Number(a?.scale) || 1) - (Number(b?.scale) || 1)) > .001;
  }

  function remember(stateToRemember) {
    const current = record(stateToRemember.key, stateToRemember.scope, true).value;
    if (!valuesDiffer(stateToRemember.base, current)) return;
    const entry = {
      el: stateToRemember.target.el,
      kind: stateToRemember.target.kind,
      key: stateToRemember.key,
      scope: stateToRemember.scope,
      device: device(),
      before: {...stateToRemember.base},
      after: {...current},
      at: Date.now()
    };
    history.push(entry);
    if (history.length > 24) history.shift();
    lastFreeActionAt = entry.at;
  }

  function labelFor(kind, pinch = false) {
    if (pinch) return kind === 'menu-panel' ? 'Menügröße' : kind === 'menu-button' ? 'Menübutton-Größe' : 'Größe';
    if (kind === 'menu-button') return 'Menübutton verschieben';
    if (kind === 'menu-panel') return 'Menü als Ganzes verschieben';
    if (kind === 'header-image') return 'Headerbild verschieben';
    return 'Verschieben';
  }

  /* Window capture deliberately owns Free-Layout touch targets before the generic
     gesture runtime reaches document capture. This prevents menu links and header
     images from being transformed by two independent gesture systems at once. */
  window.addEventListener('touchstart', event => {
    if (event.target.closest?.(uiSelector)) return;
    const target = state?.target || targetFor(event.target);
    if (!target) return;

    event.stopPropagation();
    const {el, kind} = target;
    const scope = scopeFor(el, kind);
    const key = keyFor(el, kind);
    const base = {...record(key, scope, true).value};

    if (event.touches.length >= 2) {
      clearTimeout(state?.timer);
      const a = event.touches[0];
      const b = event.touches[1];
      state = {
        target:{el, kind}, scope, key, mode:'pinch', base,
        startDistance:Math.max(20, distance(a, b)),
        startMid:midpoint(a, b)
      };
      mark(el, true);
      hud(`${labelFor(kind, true)} ${Math.round((base.scale || 1) * 100)} %`);
      event.preventDefault();
      return;
    }

    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const pending = {
      target:{el, kind}, scope, key, mode:'pending', base,
      startX:touch.clientX, startY:touch.clientY, timer:null
    };
    pending.timer = setTimeout(() => {
      if (state !== pending || pending.mode !== 'pending') return;
      pending.mode = 'drag';
      mark(el, false);
      hud(labelFor(kind, false));
    }, holdMs);
    state = pending;
  }, {capture:true, passive:false});

  window.addEventListener('touchmove', event => {
    if (!state) return;
    event.stopPropagation();
    const {el, kind} = state.target;

    if (state.mode === 'pending' && event.touches.length === 1) {
      const touch = event.touches[0];
      if (Math.hypot(touch.clientX - state.startX, touch.clientY - state.startY) > 10) {
        clearTimeout(state.timer);
        state = null;
      }
      return;
    }

    if (state.mode === 'drag' && event.touches.length === 1) {
      const touch = event.touches[0];
      setValue(el, kind, state.scope, state.key, {
        x:(state.base.x || 0) + (touch.clientX - state.startX),
        y:(state.base.y || 0) + (touch.clientY - state.startY),
        scale:state.base.scale || 1
      });
      event.preventDefault();
      return;
    }

    if (state.mode === 'pinch' && event.touches.length >= 2) {
      const a = event.touches[0];
      const b = event.touches[1];
      const ratio = distance(a, b) / state.startDistance;
      const mid = midpoint(a, b);
      const scale = clamp((state.base.scale || 1) * ratio, .45, 2.5);
      setValue(el, kind, state.scope, state.key, {
        x:(state.base.x || 0) + (mid.x - state.startMid.x),
        y:(state.base.y || 0) + (mid.y - state.startMid.y),
        scale
      });
      hud(`${labelFor(kind, true)} ${Math.round(scale * 100)} %`);
      event.preventDefault();
    }
  }, {capture:true, passive:false});

  function finish(event) {
    if (!state) return;
    event.stopPropagation();

    if (state.mode === 'pending') {
      clearTimeout(state.timer);
      state = null;
      return;
    }

    if (state.mode === 'pinch' && event.touches?.length > 0) return;

    const finished = state;
    const {el, kind} = finished.target;
    unmark(el);
    remember(finished);
    suppressUntil = Date.now() + 750;
    event.preventDefault?.();

    if (finished.mode === 'pinch') hud('Größe dauerhaft sichern…', 550);
    else if (kind === 'menu-panel') hud('Menüposition dauerhaft sichern…', 550);
    else hud('Position dauerhaft sichern…', 550);

    save().then(() => {
      hud(finished.mode === 'pinch' ? 'Größe gespeichert ✓' : kind === 'menu-panel' ? 'Menüposition gespeichert ✓' : 'Position gespeichert ✓', 800);
    }).catch(() => null);
    state = null;
  }

  window.addEventListener('touchend', finish, {capture:true, passive:false});
  window.addEventListener('touchcancel', finish, {capture:true, passive:false});

  /* If a generic drag/zoom happened after a Free-Layout action, let the generic
     runtime own the next Undo click. */
  window.addEventListener('touchend', event => {
    if (state) return;
    const target = event.target instanceof Element ? targetFor(event.target) : null;
    if (!target && event.defaultPrevented) lastOtherActionAt = Date.now();
  }, false);
  window.addEventListener('input', () => { lastOtherActionAt = Date.now(); }, true);
  window.addEventListener('change', () => { lastOtherActionAt = Date.now(); }, true);

  window.addEventListener('click', event => {
    if (Date.now() < suppressUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const undoButton = event.target.closest?.('.kp-fe2-undo');
    if (!undoButton || !history.length || lastFreeActionAt < lastOtherActionAt) return;

    const entry = history.pop();
    event.preventDefault();
    event.stopImmediatePropagation();

    const data = scopeData(entry.scope);
    data[entry.key] = data[entry.key] || {};
    data[entry.key][entry.device] = {...entry.before};
    if (entry.el?.isConnected) apply(entry.el, entry.before, entry.kind);
    lastFreeActionAt = Number(history.at(-1)?.at || 0);
    hud('Verschieben / Zoomen rückgängig ✓', 800);
    save().catch(() => null);
  }, true);

  window.KPFreeLayoutRuntime = {
    flush,
    resetMenu: () => {
      const currentDevice = device();
      ['menu-button', 'menu-panel'].forEach(key => {
        if (!globalData[key]) return;
        delete globalData[key][currentDevice];
        if (!Object.keys(globalData[key]).length) delete globalData[key];
      });
      applySaved();
      return save();
    }
  };
})();
