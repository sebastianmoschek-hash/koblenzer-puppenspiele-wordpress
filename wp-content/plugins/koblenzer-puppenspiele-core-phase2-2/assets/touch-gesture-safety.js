(() => {
  'use strict';

  const cfg = window.KPTouchGestures;
  if (!cfg) return;

  const holdMs = Math.max(320, Math.min(800, Number(cfg.holdMs) || 460));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const touchCapable = navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer:coarse)').matches;

  /* Fixed navigation must never inherit transforms from the generic gesture
     editor. This runs even outside edit mode because old persisted styles can
     otherwise leave the floating menu displaced. */
  let healFrame = 0;
  function clearGestureTransform(el) {
    if (!el) return;
    const marked = el.dataset?.kpGestureKey || el.classList?.contains('kp-has-gesture-transform');
    const styled = el.style?.getPropertyValue('translate') || el.style?.getPropertyValue('scale');
    if (!marked && !styled) return;
    el.style.removeProperty('translate');
    el.style.removeProperty('scale');
    el.style.removeProperty('transform-origin');
    el.classList.remove('kp-has-gesture-transform', 'kp-gesture-active', 'is-dragging', 'is-pinching');
  }
  function healMenuGeometry() {
    healFrame = 0;
    const button = document.querySelector('.kp-site-nav .wp-block-navigation__responsive-container-open');
    if (!button) return;
    const nodes = new Set([
      document.querySelector('.kp-navigation-bar'),
      document.querySelector('.kp-site-nav'),
      button,
      document.querySelector('.kp-site-nav .wp-block-navigation'),
      document.querySelector('.kp-site-nav .wp-block-navigation__responsive-container'),
      document.querySelector('.kp-site-nav .wp-block-navigation__responsive-close'),
      document.querySelector('.kp-site-nav .wp-block-navigation__responsive-dialog'),
      document.querySelector('.kp-site-nav .wp-block-navigation__responsive-container-content')
    ].filter(Boolean));
    let cur = button.parentElement;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      nodes.add(cur); cur = cur.parentElement;
    }
    nodes.forEach(clearGestureTransform);
  }
  function scheduleMenuHeal() {
    if (healFrame) return;
    healFrame = requestAnimationFrame(healMenuGeometry);
  }
  healMenuGeometry();
  window.addEventListener('load', healMenuGeometry, {once:true});
  window.addEventListener('resize', scheduleMenuHeal, {passive:true});
  window.addEventListener('orientationchange', scheduleMenuHeal, {passive:true});
  window.addEventListener('scroll', scheduleMenuHeal, {passive:true});
  new MutationObserver(scheduleMenuHeal).observe(document.documentElement, {
    subtree:true, childList:true, attributes:true, attributeFilter:['style','class']
  });

  if (!cfg.editMode || !cfg.canEdit || !touchCapable) return;

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

  function positionGuard(input, guard) {
    const parent = input.parentElement;
    if (!parent || !input.isConnected || !guard.isConnected) return false;
    const pr = parent.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    if (ir.width < 2 || ir.height < 1) return false;
    const height = Math.max(40, ir.height + 24);
    guard.style.position = 'absolute';
    guard.style.left = `${ir.left - pr.left}px`;
    guard.style.top = `${ir.top - pr.top - (height - ir.height) / 2}px`;
    guard.style.width = `${Math.max(28, ir.width)}px`;
    guard.style.height = `${height}px`;
    guard.style.touchAction = 'none';
    return true;
  }

  let rangeFrame = 0;
  function repositionAllRangeGuards() {
    rangeFrame = 0;
    document.querySelectorAll('.kp-touch-range-hardlock').forEach(guard => {
      const input = guard.parentElement?.querySelector('input[type="range"][data-kp-touch-hardlocked="4"]');
      if (input) positionGuard(input, guard);
    });
  }
  function scheduleRangePositions() {
    if (rangeFrame) return;
    rangeFrame = requestAnimationFrame(() => requestAnimationFrame(repositionAllRangeGuards));
  }

  function updateRangeFromX(input, clientX) {
    const rect = input.getBoundingClientRect();
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const step = Number(input.step || 1) || 1;
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    let next = min + ratio * (max - min);
    next = Math.round((next - min) / step) * step + min;
    next = clamp(next, min, max);
    input.value = String(next);
    input.dispatchEvent(new Event('input', {bubbles:true}));
  }

  function nearestScroller(input) {
    let node = input.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function hardLockRange(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'range') return;
    if (input.dataset.kpTouchHardlocked === '4') return;
    const parent = input.parentElement;
    if (!parent) return;

    input.dataset.kpTouchHardlocked = '4';
    input.dataset.kpTouchGuarded = '1';
    parent.classList.add('kp-range-guarded', 'kp-range-hardlocked');
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.querySelectorAll(':scope > .kp-touch-range-guard').forEach(node => node.remove());

    const guard = document.createElement('span');
    guard.className = 'kp-touch-range-guard kp-touch-range-hardlock';
    guard.setAttribute('aria-hidden', 'true');
    guard.title = 'Gedrückt halten, dann ziehen';
    parent.appendChild(guard);
    requestAnimationFrame(() => positionGuard(input, guard));

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => positionGuard(input, guard));
      observer.observe(input);
      guard._kpRangeResizeObserver = observer;
    }

    let state = null;
    let scrollTarget = null;

    function resetState() {
      if (!state) return;
      clearTimeout(state.timer);
      guard.classList.remove('is-armed', 'is-scrolling');
      if (state.pointerId !== undefined) {
        try {
          if (guard.hasPointerCapture?.(state.pointerId)) guard.releasePointerCapture(state.pointerId);
        } catch (_) {}
      }
      state = null;
      scrollTarget = null;
    }

    function armState() {
      if (!state || state.scrolling) return;
      state.armed = true;
      guard.classList.add('is-armed');
      try { navigator.vibrate?.(12); } catch (_) {}
      hud('Regler entsperrt – jetzt ziehen');
    }

    function beginManualScroll() {
      if (!state || state.armed || state.scrolling) return;
      state.scrolling = true;
      clearTimeout(state.timer);
      scrollTarget = nearestScroller(input);
      guard.classList.add('is-scrolling');
    }

    function manualScroll(clientY) {
      if (!state) return;
      const deltaY = state.lastY - clientY;
      state.lastY = clientY;
      if (Math.abs(deltaY) <= 0.01) return;
      if (scrollTarget && scrollTarget !== document.scrollingElement && scrollTarget !== document.documentElement && scrollTarget !== document.body) {
        scrollTarget.scrollTop += deltaY;
      } else {
        window.scrollBy(0, deltaY);
      }
    }

    function begin(idKey, id, clientX, clientY) {
      positionGuard(input, guard);
      resetState();
      state = {
        [idKey]:id,
        startX:clientX,
        startY:clientY,
        lastY:clientY,
        armed:false,
        scrolling:false,
        changed:false,
        timer:setTimeout(armState, holdMs)
      };
    }

    function move(clientX, clientY) {
      if (!state) return;
      if (state.armed) {
        state.changed = true;
        updateRangeFromX(input, clientX);
        return;
      }
      if (!state.scrolling && Math.hypot(clientX - state.startX, clientY - state.startY) > 11) beginManualScroll();
      if (state.scrolling) manualScroll(clientY);
    }

    function finish() {
      if (!state) return;
      const wasArmed = state.armed;
      const changed = state.changed;
      clearTimeout(state.timer);
      guard.classList.remove('is-armed', 'is-scrolling');
      state = null;
      scrollTarget = null;
      if (wasArmed) {
        if (changed) input.dispatchEvent(new Event('change', {bubbles:true}));
        hud(changed ? 'Regler geändert ✓' : 'Regler entsperrt – beim Halten direkt ziehen', 900);
      }
    }

    guard.addEventListener('contextmenu', event => event.preventDefault());

    /* Pointer streams are preferred when they actually arrive. */
    if ('PointerEvent' in window) {
      guard.addEventListener('pointerdown', event => {
        if (!['touch','pen'].includes(event.pointerType) || event.isPrimary === false) return;
        begin('pointerId', event.pointerId, event.clientX, event.clientY);
        try { guard.setPointerCapture?.(event.pointerId); } catch (_) {}
      });
      guard.addEventListener('pointermove', event => {
        if (!state || state.pointerId === undefined || event.pointerId !== state.pointerId) return;
        event.preventDefault();
        move(event.clientX, event.clientY);
      }, {passive:false});
      guard.addEventListener('pointerup', event => {
        if (!state || state.pointerId === undefined || event.pointerId !== state.pointerId) return;
        try {
          if (guard.hasPointerCapture?.(event.pointerId)) guard.releasePointerCapture(event.pointerId);
        } catch (_) {}
        finish();
      });
      guard.addEventListener('pointercancel', event => {
        if (state?.pointerId === event.pointerId) resetState();
      });
    }

    /* Always keep a TouchEvent path as well. Chromium CDP, Android WebViews and
       some embedded browsers expose PointerEvent but can deliver a native touch
       stream without dispatching pointer events to an overlay. Previously that
       made quick swipes and hold-drag completely inert. If pointerdown already
       created a state, these listeners deliberately stand down to avoid double
       updates. */
    guard.addEventListener('touchstart', event => {
      if (state?.pointerId !== undefined) return;
      if (event.touches.length !== 1) { resetState(); return; }
      const t = event.touches[0];
      begin('touchId', t.identifier, t.clientX, t.clientY);
    }, {passive:true});

    guard.addEventListener('touchmove', event => {
      if (!state || state.pointerId !== undefined || state.touchId === undefined) return;
      const t = [...event.touches].find(item => item.identifier === state.touchId);
      if (!t) return;
      event.preventDefault();
      move(t.clientX, t.clientY);
    }, {passive:false});

    guard.addEventListener('touchend', event => {
      if (!state || state.pointerId !== undefined || state.touchId === undefined) return;
      if (![...event.changedTouches].some(item => item.identifier === state.touchId)) return;
      finish();
    }, {passive:true});

    guard.addEventListener('touchcancel', event => {
      if (!state || state.pointerId !== undefined || state.touchId === undefined) return;
      if (![...event.changedTouches].some(item => item.identifier === state.touchId)) return;
      resetState();
    }, {passive:true});
  }

  function lockAllRanges(root = document) {
    if (root instanceof HTMLInputElement && root.type === 'range') hardLockRange(root);
    root.querySelectorAll?.('input[type="range"]').forEach(hardLockRange);
  }

  lockAllRanges();
  const rangeObserver = new MutationObserver(records => {
    if (records.length && records.every(record => window.KPOwnerUI?.isOwnerElement?.(record.target))) return;
    let reposition = false;
    records.forEach(record => {
      if (record.type === 'childList') {
        record.addedNodes.forEach(node => { if (node instanceof Element) lockAllRanges(node); });
        reposition = true;
      } else if (record.type === 'attributes') {
        const target = record.target;
        if (target instanceof Element && (target.matches('.kp-oa-tab,.kp-oa-sheet,.kp-oa-backdrop') || target.closest('.kp-oa-tabs'))) reposition = true;
      }
    });
    if (reposition) scheduleRangePositions();
  });
  rangeObserver.observe(document.documentElement, {
    childList:true, subtree:true, attributes:true, attributeFilter:['class','style','hidden','aria-hidden']
  });

  /* Reset is preview-only until an explicit save. Capture before the historical
     owner handler can reopen the sheet and replace the preview with old data. */
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (window.KPOwnerUI?.isOwnerElement?.(target)) return;
    const button = target?.closest('.kp-oa-design-reset');
    if (!button) return;
    const owner = window.KPOwnerWebApp;
    const defaults = owner?.designDefaults;
    const box = button.closest('.kp-oa-sheet.is-design');
    if (!defaults || typeof defaults !== 'object' || !box) return;

    event.preventDefault();
    event.stopPropagation();
    box.querySelectorAll('[data-design]').forEach(input => {
      const key = input.dataset.design;
      if (!key || !Object.prototype.hasOwnProperty.call(defaults, key)) return;
      const value = defaults[key];
      if (input.type === 'checkbox') {
        input.checked = Number(value) !== 0 && value !== false;
        input.dispatchEvent(new Event('change', {bubbles:true}));
      } else {
        input.value = String(value ?? '');
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.dispatchEvent(new Event('change', {bubbles:true}));
      }
    });
    hud('Standardwerte geladen – zum Übernehmen „Design speichern“ antippen', 1800);
    scheduleRangePositions();
  }, true);

  document.addEventListener('click', event => {
    if (window.KPOwnerUI?.isOwnerElement?.(event.target)) return;
    if (event.target instanceof Element && event.target.closest('.kp-oa-tabs [data-tab]')) scheduleRangePositions();
  }, true);
  window.addEventListener('resize', scheduleRangePositions, {passive:true});
  window.addEventListener('orientationchange', scheduleRangePositions, {passive:true});
})();
