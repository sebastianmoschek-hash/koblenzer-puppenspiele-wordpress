(() => {
  'use strict';

  const cfg = window.KPTouchGestures;
  if (!cfg) return;

  const holdMs = Math.max(320, Math.min(800, Number(cfg.holdMs) || 460));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const touchCapable = navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer:coarse)').matches;

  /* Keep fixed navigation ancestors free of the individual translate/scale
     properties used by the generic content gesture layer. The dedicated free
     layout layer may still use the normal transform property on the fixed
     button/panel themselves. */
  let healFrame = 0;
  function clearGestureTransform(el) {
    if (!el) return;
    const gestureMarked = el.dataset?.kpGestureKey || el.classList?.contains('kp-has-gesture-transform');
    const hasGestureStyle = el.style?.getPropertyValue('translate') || el.style?.getPropertyValue('scale');
    if (!gestureMarked && !hasGestureStyle) return;
    el.style.removeProperty('translate');
    el.style.removeProperty('scale');
    el.style.removeProperty('transform-origin');
    el.classList.remove('kp-has-gesture-transform', 'kp-gesture-active', 'is-dragging', 'is-pinching');
  }

  function healMenuGeometry() {
    healFrame = 0;
    const button = document.querySelector('.kp-site-nav .wp-block-navigation__responsive-container-open');
    if (!button) return;
    const protectedNodes = new Set([
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
      protectedNodes.add(cur);
      cur = cur.parentElement;
    }
    protectedNodes.forEach(clearGestureTransform);
  }

  function scheduleMenuHeal() {
    if (healFrame) return;
    healFrame = window.requestAnimationFrame(healMenuGeometry);
  }

  healMenuGeometry();
  window.addEventListener('load', healMenuGeometry, {once:true});
  window.addEventListener('resize', scheduleMenuHeal, {passive:true});
  window.addEventListener('orientationchange', scheduleMenuHeal, {passive:true});
  window.addEventListener('scroll', scheduleMenuHeal, {passive:true});
  new MutationObserver(scheduleMenuHeal).observe(document.documentElement, {subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});

  if (!cfg.editMode || !cfg.canEdit || !touchCapable) return;

  function hud(text, delay = 0) {
    let el = document.querySelector('.kp-gesture-hud');
    if (!el) { el = document.createElement('div'); el.className = 'kp-gesture-hud'; document.body.appendChild(el); }
    el.textContent = text; el.classList.add('is-visible'); clearTimeout(hud.t);
    if (delay) hud.t = setTimeout(() => el.classList.remove('is-visible'), delay);
  }

  function positionGuard(input, guard) {
    const parent = input.parentElement;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    const height = Math.max(40, ir.height + 24);
    guard.style.left = `${ir.left - pr.left}px`;
    guard.style.top = `${ir.top - pr.top - (height - ir.height) / 2}px`;
    guard.style.width = `${Math.max(28, ir.width)}px`;
    guard.style.height = `${height}px`;
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

  function hardLockRange(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'range') return;
    if (input.dataset.kpTouchHardlocked === '2') return;
    const parent = input.parentElement;
    if (!parent) return;

    input.dataset.kpTouchHardlocked = '2';
    input.dataset.kpTouchGuarded = '1';
    parent.classList.add('kp-range-guarded', 'kp-range-hardlocked');
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.querySelectorAll(':scope > .kp-touch-range-guard').forEach(node => node.remove());

    const guard = document.createElement('span');
    guard.className = 'kp-touch-range-guard kp-touch-range-hardlock';
    guard.setAttribute('aria-hidden','true');
    guard.title = 'Gedrückt halten, dann ziehen';
    parent.appendChild(guard);
    requestAnimationFrame(() => positionGuard(input, guard));

    let state = null;

    const resetState = () => {
      if (!state) return;
      clearTimeout(state.timer);
      guard.classList.remove('is-armed');
      if (state.pointerId !== undefined) {
        try {
          if (guard.hasPointerCapture?.(state.pointerId)) guard.releasePointerCapture(state.pointerId);
        } catch (_) {}
      }
      state = null;
    };

    const armState = () => {
      if (!state) return;
      state.armed = true;
      guard.classList.add('is-armed');
      try {
        if (state.pointerId !== undefined) guard.setPointerCapture?.(state.pointerId);
      } catch (_) {}
      try { navigator.vibrate?.(12); } catch (_) {}
      hud('Regler entsperrt – jetzt ziehen');
    };

    guard.addEventListener('contextmenu', e => e.preventDefault());

    if ('PointerEvent' in window) {
      guard.addEventListener('pointerdown', event => {
        if (!['touch','pen'].includes(event.pointerType) || event.isPrimary === false) return;
        positionGuard(input, guard);
        resetState();
        state = {
          pointerId:event.pointerId,
          startX:event.clientX,
          startY:event.clientY,
          armed:false,
          changed:false,
          timer:setTimeout(armState, holdMs)
        };
      });

      guard.addEventListener('pointermove', event => {
        if (!state || event.pointerId !== state.pointerId) return;
        if (!state.armed) {
          if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 11) resetState();
          return;
        }
        event.preventDefault();
        state.changed = true;
        updateRangeFromX(input, event.clientX);
      }, {passive:false});

      const finishPointer = event => {
        if (!state || event.pointerId !== state.pointerId) return;
        const wasArmed = state.armed;
        const changed = state.changed;
        clearTimeout(state.timer);
        guard.classList.remove('is-armed');
        try {
          if (guard.hasPointerCapture?.(state.pointerId)) guard.releasePointerCapture(state.pointerId);
        } catch (_) {}
        state = null;
        if (wasArmed) {
          if (changed) input.dispatchEvent(new Event('change', {bubbles:true}));
          hud(changed ? 'Regler geändert ✓' : 'Regler entsperrt – beim Halten direkt ziehen', 900);
        }
      };

      guard.addEventListener('pointerup', finishPointer);
      guard.addEventListener('pointercancel', event => {
        if (state && event.pointerId === state.pointerId) resetState();
      });
    } else {
      /* Legacy iOS/WebView fallback where Pointer Events are unavailable. */
      guard.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) { resetState(); return; }
        positionGuard(input, guard);
        resetState();
        const t = event.touches[0];
        state = {id:t.identifier,startX:t.clientX,startY:t.clientY,armed:false,changed:false,timer:setTimeout(armState,holdMs)};
      }, {passive:true});

      guard.addEventListener('touchmove', event => {
        if (!state) return;
        const t = [...event.touches].find(x => x.identifier === state.id);
        if (!t) return;
        if (!state.armed) {
          if (Math.hypot(t.clientX-state.startX,t.clientY-state.startY)>11) resetState();
          return;
        }
        event.preventDefault();
        state.changed=true;
        updateRangeFromX(input,t.clientX);
      }, {passive:false});

      guard.addEventListener('touchend', event => {
        if (!state || ![...event.changedTouches].some(x=>x.identifier===state.id)) return;
        const wasArmed=state.armed, changed=state.changed;
        clearTimeout(state.timer); guard.classList.remove('is-armed'); state=null;
        if (wasArmed) {
          if (changed) input.dispatchEvent(new Event('change',{bubbles:true}));
          hud(changed?'Regler geändert ✓':'Regler entsperrt – beim Halten direkt ziehen',900);
        }
      }, {passive:true});
      guard.addEventListener('touchcancel', resetState, {passive:true});
    }
  }

  function lockAllRanges(root = document) {
    if (root instanceof HTMLInputElement && root.type === 'range') hardLockRange(root);
    root.querySelectorAll?.('input[type="range"]').forEach(hardLockRange);
  }

  lockAllRanges();
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => { if (node instanceof Element) lockAllRanges(node); }));
  }).observe(document.documentElement, {childList:true,subtree:true});

  window.addEventListener('resize', () => {
    document.querySelectorAll('.kp-touch-range-hardlock').forEach(guard => {
      const input = guard.parentElement?.querySelector('input[type="range"][data-kp-touch-hardlocked="2"]');
      if (input) positionGuard(input, guard);
    });
  }, {passive:true});
})();
