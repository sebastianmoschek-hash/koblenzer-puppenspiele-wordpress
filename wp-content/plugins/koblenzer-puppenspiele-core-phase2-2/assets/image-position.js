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
  const MAX = 50;
  let draftGlobal = cloneObject(cfg.global);
  let draftPage = cloneObject(cfg.page);
  let savedGlobal = cloneObject(draftGlobal);
  let savedPage = cloneObject(draftPage);
  let dirty = false;
  const history = [];
  const redo = [];
  let gesture = null;

  function device() {
    const w = window.innerWidth;
    if (w <= 640) return 'mobile';
    if (w <= 900) return 'tablet';
    if (w <= 1400) return 'laptop';
    return 'desktop';
  }

  function activeEditorDevice() {
    const select = document.querySelector('.kp-fe2-device');
    if (select?.value) return select.value;
    const b = document.querySelector('.kp-fe-device.is-active,[data-panel-device].is-active');
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

  function scopeFor(el) {
    return el?.closest?.('header,footer') ? 'global' : 'page';
  }

  function storeForScope(scope) {
    return scope === 'global' ? draftGlobal : draftPage;
  }

  function storeFor(el) {
    return storeForScope(scopeFor(el));
  }

  function getX(el, d) {
    const key = keyFor(el);
    const store = storeFor(el);
    return key && store[key] && store[key][d] !== undefined ? +store[key][d] : 50;
  }

  function syncDirty() {
    dirty = JSON.stringify(draftGlobal) !== JSON.stringify(savedGlobal) || JSON.stringify(draftPage) !== JSON.stringify(savedPage);
    document.querySelector('.kp-fe2-save,.kp-fe-save')?.classList.toggle('is-dirty', dirty || !!window.KPOwnerSaveRegistry?.isDirty?.());
  }

  function markDirty() {
    dirty = true;
    document.querySelector('.kp-fe2-save,.kp-fe-save')?.classList.add('is-dirty');
  }

  function setStored(scope, key, d, x) {
    if (!key) return 50;
    const store = storeForScope(scope);
    const value = Math.max(0, Math.min(100, Math.round(+x || 0)));
    store[key] = store[key] || {};
    store[key][d] = value;
    markDirty();
    return value;
  }

  function setX(el, d, x) {
    return setStored(scopeFor(el), keyFor(el), d, x);
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
      const store = storeFor(el);
      if (store[key] && store[key][d] !== undefined) applyPosition(el, +store[key][d]);
    });
  }

  function targetForEntry(entry) {
    if (entry?.target?.isConnected && keyFor(entry.target) === entry.key && scopeFor(entry.target) === entry.scope) return entry.target;
    const selectors = [`[data-kp-edit-key="${CSS.escape(entry.key)}"]`,`[data-kp-dom-key="${CSS.escape(entry.key)}"]`];
    for (const selector of selectors) {
      const el = [...document.querySelectorAll(selector)].find(node => scopeFor(node) === entry.scope && imageTarget(node));
      if (el) return el;
    }
    const img = [...document.querySelectorAll(`img[data-kp-dom-key="${CSS.escape(entry.key)}"]`)].find(node => scopeFor(node) === entry.scope);
    return img || null;
  }

  function syncVisibleControl(entry, value) {
    const current = selectedElement();
    if (!current || keyFor(current) !== entry.key || scopeFor(current) !== entry.scope) return;
    const wrap = document.querySelector('.kp-image-position-controls');
    const range = wrap?.querySelector('.kp-image-position-range');
    const out = wrap?.querySelector('.kp-image-position-value');
    if (range) range.value = String(value);
    if (out) out.textContent = value + '%';
    wrap?.querySelectorAll('.kp-image-align-buttons button').forEach(btn => btn.classList.toggle('is-active', +btn.dataset.x === +value));
  }

  function applyHistory(entry, value) {
    if (!entry) return false;
    const target = targetForEntry(entry);
    if (!target) return false;
    const next = setStored(entry.scope, entry.key, entry.device, value);
    applyPosition(target, next);
    syncVisibleControl(entry, next);
    syncDirty();
    return true;
  }

  function pushHistory(entry, genericBaseline = null) {
    if (!entry || entry.before === entry.after) return null;
    if (genericBaseline !== null && window.KPWordHistory?.counts) {
      const now = Number(window.KPWordHistory.counts().undo || 0);
      if (now > genericBaseline) window.KPWordHistory.discardLastControlsMarker?.();
    }
    history.push(entry);
    if (history.length > MAX) history.shift();
    redo.length = 0;
    window.KPWordHistory?.push?.('image-position');
    return entry;
  }

  function undo() {
    const entry = history.pop();
    if (!entry) return false;
    if (!applyHistory(entry, entry.before)) { history.push(entry); return false; }
    redo.push(entry);
    if (redo.length > MAX) redo.shift();
    return true;
  }

  function redoStep() {
    const entry = redo.pop();
    if (!entry) return false;
    if (!applyHistory(entry, entry.after)) { redo.push(entry); return false; }
    history.push(entry);
    if (history.length > MAX) history.shift();
    return true;
  }

  function clearRedo() { redo.length = 0; }

  function beginGesture(el, d) {
    if (!el || !imageTarget(el)) return;
    gesture = {
      target: el,
      scope: scopeFor(el),
      key: keyFor(el),
      device: d,
      before: getX(el, d),
      entry: null,
      genericBaseline: Number(window.KPWordHistory?.counts?.().undo || 0)
    };
  }

  function updateGesture(el, d, next) {
    if (!gesture || gesture.target !== el || gesture.device !== d) beginGesture(el, d);
    const value = setX(el, d, next);
    applyPosition(el, value);
    if (!gesture.entry && value !== gesture.before) {
      gesture.entry = pushHistory({target:el, scope:gesture.scope, key:gesture.key, device:d, before:gesture.before, after:value}, gesture.genericBaseline);
    } else if (gesture.entry) {
      gesture.entry.after = value;
    }
    return value;
  }

  function endGesture() { gesture = null; }

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
    const currentTarget = () => selectedElement();
    const currentDevice = () => activeEditorDevice();
    const updateUi = (next) => {
      range.value = String(next);
      value.textContent = next + '%';
      wrap.querySelectorAll('.kp-image-align-buttons button').forEach(btn => btn.classList.toggle('is-active', +btn.dataset.x === +next));
    };
    const begin = () => { const current=currentTarget(); if(current) beginGesture(current,currentDevice()); };
    range.addEventListener('pointerdown', begin);
    range.addEventListener('focusin', begin);
    range.addEventListener('input', () => {
      const current=currentTarget(); if(!current)return;
      const next=updateGesture(current,currentDevice(),+range.value); updateUi(next);
    });
    range.addEventListener('pointerup', endGesture);
    range.addEventListener('pointercancel', endGesture);
    range.addEventListener('change', () => setTimeout(endGesture, 0));
    range.addEventListener('focusout', () => setTimeout(endGesture, 0));
    wrap.querySelectorAll('.kp-image-align-buttons button').forEach(btn => btn.addEventListener('click', () => {
      const current=currentTarget(); if(!current)return;
      const dev=currentDevice(), before=getX(current,dev), next=Number(btn.dataset.x), baseline=Number(window.KPWordHistory?.counts?.().undo||0);
      const valueNow=setX(current,dev,next);applyPosition(current,valueNow);updateUi(valueNow);
      pushHistory({target:current,scope:scopeFor(current),key:keyFor(current),device:dev,before,after:valueNow},baseline);
      endGesture();
    }));
    updateUi(x);
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
    savedGlobal = cloneObject(draftGlobal);
    savedPage = cloneObject(draftPage);
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
  window.KPImagePositionRuntime = {flush, isDirty:() => dirty, undo, redo:redoStep, clearRedo, counts:()=>({undo:history.length,redo:redo.length})};
  function registerHistory(){ if(window.KPWordHistory?.register){window.KPWordHistory.register('image-position',()=>window.KPImagePositionRuntime);return true}return false; }
  registerHistory();setInterval(registerHistory,500);

  if (!cfg.editMode) return;
  const observer = new MutationObserver(() => requestAnimationFrame(injectControls));
  observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  document.addEventListener('click', (e) => {
    if (e.target.closest('.kp-fe-save')) flush().catch(error => console.warn('Bildposition konnte nicht separat gespeichert werden.', error));
    setTimeout(injectControls, 0);
  }, true);
})();