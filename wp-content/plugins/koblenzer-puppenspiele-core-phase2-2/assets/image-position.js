(() => {
  'use strict';
  const cfg = window.KPImagePosition;
  if (!cfg) return;

  const asObject = (v) => {
    if (!v || typeof v !== 'object') return {};
    if (Array.isArray(v)) return Object.assign({}, v);
    return {...v};
  };
  const cloneObject = (v) => JSON.parse(JSON.stringify(asObject(v)));
  let draftGlobal = cloneObject(cfg.global);
  let draftPage = cloneObject(cfg.page);
  let dirty = false;

  function device() {
    const w = window.innerWidth;
    if (w <= 640) return 'mobile';
    if (w <= 900) return 'tablet';
    if (w <= 1400) return 'laptop';
    return 'desktop';
  }

  function activeEditorDevice() {
    const b = document.querySelector('.kp-fe-device.is-active,.kp-fe2-device.is-active,[data-panel-device].is-active');
    return (b && (b.dataset.device || b.dataset.panelDevice)) || device();
  }

  function selectedElement() {
    return document.querySelector('.kp-fe-selected,.kp-fe2-selected');
  }

  function imageTarget(el) {
    if (!el) return null;
    if (el.matches('img')) return el;
    return el.querySelector('img');
  }

  function keyFor(el) {
    if (!el) return '';
    if (el.dataset.kpEditKey) return el.dataset.kpEditKey;
    if (el.dataset.kpDomKey) return el.dataset.kpDomKey;
    const img = imageTarget(el);
    if (img && img.dataset.kpDomKey) return img.dataset.kpDomKey;
    return '';
  }

  function isGlobal(el) {
    return !!(el && el.closest('header,footer'));
  }

  function storeFor(el) {
    return isGlobal(el) ? draftGlobal : draftPage;
  }

  function getX(el, d) {
    const key = keyFor(el);
    const store = storeFor(el);
    return key && store[key] && store[key][d] !== undefined ? +store[key][d] : 50;
  }

  function markDirty() {
    dirty = true;
    document.querySelector('.kp-fe2-save,.kp-fe-save')?.classList.add('is-dirty');
  }

  function setX(el, d, x) {
    const key = keyFor(el);
    if (!key) return;
    const store = storeFor(el);
    store[key] = store[key] || {};
    store[key][d] = Math.max(0, Math.min(100, Math.round(+x || 0)));
    markDirty();
  }

  function applyPosition(el, x) {
    if (!el) return;
    const img = imageTarget(el);
    if (!img) return;
    const cs = getComputedStyle(el);
    let width = parseFloat(cs.width) || 0;
    const parentWidth = el.parentElement ? (parseFloat(getComputedStyle(el.parentElement).width) || 0) : 0;
    let free = parentWidth > width ? parentWidth - width : 0;
    if (el === img && el.parentElement) {
      const iw = parseFloat(getComputedStyle(img).width) || 0;
      const pw = parseFloat(getComputedStyle(el.parentElement).width) || 0;
      free = pw > iw ? pw - iw : free;
    }
    if (free > 1) {
      const left = free * (x / 100);
      el.style.setProperty('margin-left', left.toFixed(2) + 'px', 'important');
      el.style.setProperty('margin-right', Math.max(0, free - left).toFixed(2) + 'px', 'important');
    } else {
      img.style.setProperty('object-position', x + '% 50%', 'important');
    }
  }

  function applySaved() {
    const d = device();
    const all = document.querySelectorAll('[data-kp-edit-key],[data-kp-dom-key]');
    all.forEach(el => {
      if (!imageTarget(el)) return;
      const key = keyFor(el);
      if (!key) return;
      const store = isGlobal(el) ? draftGlobal : draftPage;
      if (store[key] && store[key][d] !== undefined) applyPosition(el, +store[key][d]);
    });
  }

  function injectControls() {
    if (!cfg.editMode) return;
    const panel = document.querySelector('.kp-fe-panel.is-open,.kp-fe2-inspector.is-open,.kp-fe2-inspector');
    const el = selectedElement();
    if (!panel || !el || !imageTarget(el)) return;
    if (panel.querySelector('.kp-image-position-controls')) return;
    const styleControls = panel.querySelector('.kp-fe-field,.kp-fe2-field');
    const d = activeEditorDevice();
    const x = getX(el, d);
    const wrap = document.createElement('div');
    wrap.className = 'kp-image-position-controls';
    wrap.innerHTML = `
      <div class="kp-fe-field kp-fe2-field">
        <label>Bild ausrichten</label>
        <div class="kp-image-align-buttons">
          <button type="button" data-x="0">Links</button>
          <button type="button" data-x="50">Zentriert</button>
          <button type="button" data-x="100">Rechts</button>
        </div>
      </div>
      <div class="kp-fe-field kp-fe2-field">
        <label>Horizontale Bildposition</label>
        <div class="kp-fe-range-row">
          <input type="range" min="0" max="100" value="${x}" class="kp-image-position-range">
          <span class="kp-image-position-value">${x}%</span>
        </div>
        <small style="display:block;margin-top:6px;opacity:.72">0 % = ganz links · 50 % = Mitte · 100 % = ganz rechts</small>
      </div>`;
    if (styleControls) panel.insertBefore(wrap, styleControls);
    else panel.appendChild(wrap);

    const range = wrap.querySelector('.kp-image-position-range');
    const value = wrap.querySelector('.kp-image-position-value');
    const update = (next) => {
      const current = selectedElement();
      if (!current || !imageTarget(current)) return;
      const dev = activeEditorDevice();
      setX(current, dev, next);
      applyPosition(current, +next);
      range.value = next;
      value.textContent = next + '%';
      wrap.querySelectorAll('.kp-image-align-buttons button').forEach(btn => btn.classList.toggle('is-active', +btn.dataset.x === +next));
    };
    range.addEventListener('input', () => update(+range.value));
    wrap.querySelectorAll('.kp-image-align-buttons button').forEach(btn => btn.addEventListener('click', () => update(+btn.dataset.x)));
    range.value = x;
    value.textContent = x + '%';
  }

  async function flush() {
    if (!cfg.canEdit || !cfg.nonce || !dirty) return {draft:false};
    const body = new URLSearchParams();
    body.set('action', 'kp_image_position_save');
    body.set('nonce', cfg.nonce);
    body.set('page_key', cfg.pageKey);
    body.set('global', JSON.stringify(asObject(draftGlobal)));
    body.set('page', JSON.stringify(asObject(draftPage)));
    const response = await fetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'}, body:body.toString()});
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) throw new Error(json?.data?.message || 'Bildposition konnte nicht gespeichert werden.');
    draftGlobal = cloneObject(json.data?.global ?? draftGlobal);
    draftPage = cloneObject(json.data?.page ?? draftPage);
    cfg.global = cloneObject(draftGlobal);
    cfg.page = cloneObject(draftPage);
    dirty = false;
    return json.data || {};
  }

  function addCss() {
    const s = document.createElement('style');
    s.textContent = `
      .kp-image-align-buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .kp-image-align-buttons button{min-height:44px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:rgba(255,255,255,.055);color:inherit;font-weight:700}
      .kp-image-align-buttons button.is-active{border-color:#f47a20;background:#f47a20;color:#fff}
      .kp-image-position-controls{border-top:1px solid rgba(255,255,255,.09);padding-top:14px;margin-top:12px}
    `;
    document.head.appendChild(s);
  }

  addCss();
  applySaved();
  window.addEventListener('resize', () => requestAnimationFrame(applySaved), {passive:true});
  window.KPImagePositionRuntime = {flush, isDirty:() => dirty};

  if (!cfg.editMode) return;
  const observer = new MutationObserver(() => requestAnimationFrame(injectControls));
  observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  document.addEventListener('click', (e) => {
    if (e.target.closest('.kp-fe-save')) flush().catch(error => console.warn('Bildposition konnte nicht separat gespeichert werden.', error));
    setTimeout(injectControls, 0);
  }, true);
})();