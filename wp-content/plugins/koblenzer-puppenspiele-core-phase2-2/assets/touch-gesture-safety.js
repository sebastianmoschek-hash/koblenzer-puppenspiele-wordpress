(() => {
  'use strict';

  const cfg = window.KPTouchGestures;
  if (!cfg) return;

  const holdMs = Math.max(320, Math.min(800, Number(cfg.holdMs) || 460));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const touchCapable = navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer:coarse)').matches;

  /*
   * Safety rule: the floating WordPress navigation must never live inside a
   * transformed containing block. The gesture layer used individual CSS
   * translate/scale properties even for the neutral 0/0/1 state; that changes
   * how position:fixed descendants are anchored on mobile browsers.
   */
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

    /* Also protect every ancestor of the floating trigger. A transform on any
       one of those ancestors changes the containing block for position:fixed. */
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

  const menuObserver = new MutationObserver(scheduleMenuHeal);
  menuObserver.observe(document.documentElement, {
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:['style','class']
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
    clearTimeout(hud.t);
    if (delay) hud.t = setTimeout(() => el.classList.remove('is-visible'), delay);
  }

  function positionGuard(input, guard) {
    const parent = input.parentElement;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    const height = Math.max(38, ir.height + 22);
    guard.style.left = `${ir.left - pr.left}px`;
    guard.style.top = `${ir.top - pr.top - (height - ir.height) / 2}px`;
    guard.style.width = `${Math.max(24, ir.width)}px`;
    guard.style.height = `${height}px`;
  }

  function hardLockRange(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'range') return;
    if (input.dataset.kpTouchHardlocked === '1') return;
    const parent = input.parentElement;
    if (!parent) return;

    input.dataset.kpTouchHardlocked = '1';
    /* Mark as guarded before replacing an older guard so the original gesture
       observer cannot immediately add its weaker guard again. */
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

    let state = null;

    function cancel() {
      if (!state) return;
      clearTimeout(state.timer);
      guard.classList.remove('is-armed');
      state = null;
    }

    function onPointerMove(event) {
      if (!state || event.pointerId !== state.id) return;

      if (!state.armed) {
        const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
        if (distance > 11) cancel();
        return;
      }

      event.preventDefault();
      const rect = input.getBoundingClientRect();
      const min = Number(input.min || 0);
      const max = Number(input.max || 100);
      const step = Number(input.step || 1) || 1;
      const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      let next = min + ratio * (max - min);
      next = Math.round((next - min) / step) * step + min;
      next = clamp(next, min, max);
      input.value = String(next);
      input.dispatchEvent(new Event('input', {bubbles:true}));
    }

    function finish(event) {
      if (!state || event.pointerId !== state.id) return;
      const wasArmed = state.armed;
      clearTimeout(state.timer);
      guard.classList.remove('is-armed');
      state = null;
      if (wasArmed) {
        input.dispatchEvent(new Event('change', {bubbles:true}));
        hud('Regler geändert ✓', 650);
      }
    }

    guard.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') return;
      positionGuard(input, guard);
      cancel();
      state = {
        id:event.pointerId,
        startX:event.clientX,
        startY:event.clientY,
        armed:false,
        timer:null
      };
      state.timer = setTimeout(() => {
        if (!state || state.id !== event.pointerId) return;
        state.armed = true;
        guard.classList.add('is-armed');
        try { guard.setPointerCapture(event.pointerId); } catch (_) {}
        try { navigator.vibrate?.(12); } catch (_) {}
        hud('Regler entsperrt – jetzt ziehen');
      }, holdMs);
    }, {passive:true});

    guard.addEventListener('pointermove', onPointerMove, {passive:false});
    guard.addEventListener('pointerup', finish, {passive:false});
    guard.addEventListener('pointercancel', finish, {passive:false});
  }

  function lockAllRanges(root = document) {
    if (root instanceof HTMLInputElement && root.type === 'range') hardLockRange(root);
    root.querySelectorAll?.('input[type="range"]').forEach(hardLockRange);
  }

  lockAllRanges();
  const rangeObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) lockAllRanges(node);
    }));
  });
  rangeObserver.observe(document.documentElement, {childList:true, subtree:true});

  window.addEventListener('resize', () => {
    document.querySelectorAll('.kp-touch-range-hardlock').forEach(guard => {
      const input = guard.parentElement?.querySelector('input[type="range"][data-kp-touch-hardlocked="1"]');
      if (input) positionGuard(input, guard);
    });
  }, {passive:true});
})();
