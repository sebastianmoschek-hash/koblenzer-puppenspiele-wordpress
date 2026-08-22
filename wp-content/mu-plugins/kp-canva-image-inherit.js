(() => {
  'use strict';
  const cfg = window.KPCanvaEditor;
  if (!cfg) return;

  const original = new Map();
  for (const map of [cfg.imageGlobal || {}, cfg.imagePage || {}]) {
    for (const [key, edit] of Object.entries(map)) original.set(key, edit || {});
  }
  const touched = new Map();
  const q = (s,r=document) => r.querySelector(s);

  function keyForPanel(panel) { return panel?.dataset?.imageKey || ''; }
  function touchedSet(key) {
    if (!touched.has(key)) touched.set(key, new Set());
    return touched.get(key);
  }
  function inherited(key, prop) {
    const edit = original.get(key);
    if (!edit) return true; // A newly edited image inherits all untouched geometry.
    if (prop === 'fit') return edit.fit === 'auto';
    if (prop === 'position') return Number(edit.pos_x) < 0 || Number(edit.pos_y) < 0;
    if (prop === 'radius') return Number(edit.radius) < 0;
    return false;
  }

  function relaxUntouchedImage(key) {
    if (!key) return;
    const img = q(`[data-kp-canva-image-key="${CSS.escape(key)}"]`);
    if (!img) return;
    const set = touchedSet(key);
    if (inherited(key,'fit') && !set.has('fit')) img.style.removeProperty('object-fit');
    if (inherited(key,'position') && !set.has('pos_x') && !set.has('pos_y')) img.style.removeProperty('object-position');
    if (inherited(key,'radius') && !set.has('radius')) img.style.removeProperty('border-radius');
  }

  function noteControl(control) {
    if (!control) return;
    const panel = control.closest('.kp-canva-image-panel');
    const key = keyForPanel(panel);
    if (!key) return;
    touchedSet(key).add(control.dataset.imageEdit || '');
    queueMicrotask(() => relaxUntouchedImage(key));
  }
  document.addEventListener('input', event => {
    noteControl(event.target instanceof Element ? event.target.closest('.kp-canva-image-panel [data-image-edit]') : null);
  }, false);
  document.addEventListener('change', event => {
    noteControl(event.target instanceof Element ? event.target.closest('.kp-canva-image-panel [data-image-edit]') : null);
  }, false);

  // Presets change colour/light only. Existing crop/rounding stay untouched.
  document.addEventListener('click', event => {
    const preset = event.target instanceof Element ? event.target.closest('.kp-canva-image-panel [data-image-preset]') : null;
    if (!preset) return;
    const key = keyForPanel(preset.closest('.kp-canva-image-panel'));
    if (key) queueMicrotask(() => relaxUntouchedImage(key));
  }, false);

  // Store explicit inherit sentinels whenever geometry still belongs to the
  // underlying theme/content rather than to the image tool.
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
            if (!edit || typeof edit !== 'object') continue;
            const set = touchedSet(key);
            if (inherited(key,'fit') && !set.has('fit')) edit.fit = 'auto';
            if (inherited(key,'position') && !set.has('pos_x') && !set.has('pos_y')) { edit.pos_x = -1; edit.pos_y = -1; }
            if (inherited(key,'radius') && !set.has('radius')) edit.radius = -1;
          }
          body.set(field, JSON.stringify(map));
        }
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };

  function applyStoredInheritance(root=document) {
    for (const [key, edit] of original.entries()) {
      const selector = `[data-kp-canva-image-key="${CSS.escape(key)}"]`;
      const img = root.querySelector?.(selector) || (root.matches?.(selector) ? root : null);
      if (!img || !edit) continue;
      if (edit.fit === 'auto') img.style.removeProperty('object-fit');
      if (Number(edit.pos_x) < 0 || Number(edit.pos_y) < 0) img.style.removeProperty('object-position');
      if (Number(edit.radius) < 0) img.style.removeProperty('border-radius');
    }
  }

  requestAnimationFrame(() => applyStoredInheritance());
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) requestAnimationFrame(() => applyStoredInheritance(node));
    }));
  }).observe(document.documentElement, {childList:true,subtree:true});
})();
