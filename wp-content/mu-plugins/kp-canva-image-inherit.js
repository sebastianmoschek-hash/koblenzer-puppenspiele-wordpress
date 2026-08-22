(() => {
  'use strict';
  const cfg = window.KPCanvaEditor;
  if (!cfg) return;

  const originalKeys = new Set([
    ...Object.keys(cfg.imageGlobal || {}),
    ...Object.keys(cfg.imagePage || {})
  ]);
  const touched = new Map();
  const q = (s,r=document) => r.querySelector(s);

  function keyForPanel(panel) { return panel?.dataset?.imageKey || ''; }
  function touchedSet(key) {
    if (!touched.has(key)) touched.set(key, new Set());
    return touched.get(key);
  }
  function isNew(key) { return !!key && !originalKeys.has(key); }

  function relaxUntouchedImage(key) {
    if (!isNew(key)) return;
    const img = q(`[data-kp-canva-image-key="${CSS.escape(key)}"]`);
    if (!img) return;
    const set = touchedSet(key);
    if (!set.has('fit')) img.style.removeProperty('object-fit');
    if (!set.has('pos_x') && !set.has('pos_y')) img.style.removeProperty('object-position');
    if (!set.has('radius')) img.style.removeProperty('border-radius');
  }

  document.addEventListener('input', event => {
    const control = event.target instanceof Element ? event.target.closest('.kp-canva-image-panel [data-image-edit]') : null;
    if (!control) return;
    const panel = control.closest('.kp-canva-image-panel');
    const key = keyForPanel(panel);
    if (!key) return;
    touchedSet(key).add(control.dataset.imageEdit || '');
    queueMicrotask(() => relaxUntouchedImage(key));
  }, false);
  document.addEventListener('change', event => {
    const control = event.target instanceof Element ? event.target.closest('.kp-canva-image-panel [data-image-edit]') : null;
    if (!control) return;
    const panel = control.closest('.kp-canva-image-panel');
    const key = keyForPanel(panel);
    if (!key) return;
    touchedSet(key).add(control.dataset.imageEdit || '');
    queueMicrotask(() => relaxUntouchedImage(key));
  }, false);

  // Presets change colour/light only. Existing crop/rounding stay untouched.
  document.addEventListener('click', event => {
    const preset = event.target instanceof Element ? event.target.closest('.kp-canva-image-panel [data-image-preset]') : null;
    if (!preset) return;
    const key = keyForPanel(preset.closest('.kp-canva-image-panel'));
    if (key) queueMicrotask(() => relaxUntouchedImage(key));
  }, false);

  // Store explicit inherit sentinels for properties the user never touched on a
  // newly edited image. The PHP sanitizer preserves these sentinels.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init={}) => {
    try {
      const body = init?.body;
      if (body instanceof FormData && String(body.get('action') || '') === 'kp_canva_image_save') {
        for (const field of ['global','page']) {
          const raw = body.get(field);
          if (typeof raw !== 'string') continue;
          const map = JSON.parse(raw || '{}');
          for (const [key, edit] of Object.entries(map || {})) {
            if (!isNew(key) || !edit || typeof edit !== 'object') continue;
            const set = touchedSet(key);
            if (!set.has('fit')) edit.fit = 'auto';
            if (!set.has('pos_x') && !set.has('pos_y')) { edit.pos_x = -1; edit.pos_y = -1; }
            if (!set.has('radius')) edit.radius = -1;
          }
          body.set(field, JSON.stringify(map));
        }
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };

  function applyStoredInheritance(root=document) {
    const maps = [cfg.imageGlobal || {}, cfg.imagePage || {}];
    for (const map of maps) {
      for (const [key, edit] of Object.entries(map)) {
        const img = root.querySelector?.(`[data-kp-canva-image-key="${CSS.escape(key)}"]`) || (root.matches?.(`[data-kp-canva-image-key="${CSS.escape(key)}"]`) ? root : null);
        if (!img || !edit) continue;
        if (edit.fit === 'auto') img.style.removeProperty('object-fit');
        if (Number(edit.pos_x) < 0 || Number(edit.pos_y) < 0) img.style.removeProperty('object-position');
        if (Number(edit.radius) < 0) img.style.removeProperty('border-radius');
      }
    }
  }

  requestAnimationFrame(() => applyStoredInheritance());
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) requestAnimationFrame(() => applyStoredInheritance(node));
    }));
  }).observe(document.documentElement, {childList:true,subtree:true});
})();
