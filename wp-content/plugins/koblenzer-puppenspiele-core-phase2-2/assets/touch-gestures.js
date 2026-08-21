(() => {
  'use strict';
  const cfg = window.KPTouchGestures;
  if (!cfg) return;

  const clone = value => JSON.parse(JSON.stringify(value || {}));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const globalData = clone(cfg.global);
  const pageData = clone(cfg.page);
  const holdMs = Math.max(320, Math.min(800, Number(cfg.holdMs) || 460));
  const uiSelector = '.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-fe-card-sheet-backdrop,.kp-oa-backdrop,#wpadminbar';
  const gestureHistory = [];
  let suppressUntil = 0;
  let touchState = null;
  let mouseState = null;
  let dirty = false;
  let saving = null;
  let lastActionAt = 0;

  function currentDevice() {
    const w = window.innerWidth;
    if (w <= 640) return 'mobile';
    if (w <= 900) return 'tablet';
    if (w <= 1400) return 'laptop';
    return 'desktop';
  }

  function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  function pathFor(el, root) {
    const parts = [];
    let cur = el;
    while (cur && cur !== root && cur.nodeType === 1) {
      let index = 1;
      let sib = cur.previousElementSibling;
      while (sib) { if (sib.tagName === cur.tagName) index++; sib = sib.previousElementSibling; }
      parts.unshift(`${cur.tagName.toLowerCase()}:${index}`);
      cur = cur.parentElement;
    }
    return parts.join('/');
  }

  function cardSignature(card) {
    const link = card?.querySelector('h3 a[href],.kp-repertoire-image[href],a[href]');
    if (link) {
      try { return new URL(link.getAttribute('href'), location.href).pathname; } catch (_) {}
    }
    return (card?.querySelector('h3')?.textContent || card?.textContent || '').trim().slice(0, 120);
  }

  function rawKey(el) {
    if (el.dataset.kpEditKey) return 'block:' + el.dataset.kpEditKey;
    if (el.dataset.kpDomKey) return 'dom:' + el.dataset.kpDomKey;
    const card = el.closest('.kp-repertoire-card,.kp-termin-card');
    if (card) {
      const roleRoot = el.closest('.kp-repertoire-image,.kp-repertoire-card-actions,.kp-repertoire-facts,.kp-repertoire-meta') || card;
      return 'card:' + cardSignature(card) + ':' + pathFor(el, roleRoot);
    }
    const root = el.closest('header,main,footer') || document.body;
    return 'site:' + root.tagName.toLowerCase() + ':' + pathFor(el, root);
  }

  function ensureGestureKey(el) {
    if (!el || !(el instanceof Element)) return '';
    if (el.dataset.kpGestureKey) return el.dataset.kpGestureKey;
    const key = 'g-' + hashString(rawKey(el));
    el.dataset.kpGestureKey = key;
    return key;
  }

  function assignGestureKeys(root = document) {
    const selectors = [
      '[data-kp-edit-key]', '[data-kp-dom-key]',
      '.kp-repertoire-card .kp-repertoire-image img',
      '.kp-repertoire-card .kp-repertoire-card-actions a',
      '.kp-repertoire-card .kp-repertoire-facts > *',
      '.kp-repertoire-card .kp-repertoire-meta > *',
      '.kp-termin-card', '.kp-header-stage img', '.kp-header-photo img'
    ].join(',');
    if (root instanceof Element && root.matches(selectors)) ensureGestureKey(root);
    root.querySelectorAll?.(selectors).forEach(ensureGestureKey);
  }

  function scopeFor(el) { return el.closest('header,footer') ? 'global' : 'page'; }
  function scopeData(scope) { return scope === 'global' ? globalData : pageData; }

  function valueFor(el, create = false) {
    const key = ensureGestureKey(el);
    if (!key) return null;
    const scope = scopeFor(el);
    const data = scopeData(scope);
    const device = currentDevice();
    if (create) {
      data[key] = data[key] || {};
      data[key][device] = data[key][device] || {x:0, y:0, scale:1};
    }
    return {key, scope, data, device, value:data[key]?.[device] || {x:0,y:0,scale:1}};
  }

  function applyValue(el, value) {
    if (!el || !value) return;
    const x = Number(value.x) || 0;
    const y = Number(value.y) || 0;
    const scale = clamp(Number(value.scale) || 1, .45, 2.5);
    el.style.setProperty('translate', `${x}px ${y}px`, 'important');
    el.style.setProperty('scale', String(scale), 'important');
    el.style.setProperty('transform-origin', 'center center', 'important');
    el.classList.toggle('kp-has-gesture-transform', Math.abs(x) > .01 || Math.abs(y) > .01 || Math.abs(scale - 1) > .001);
  }

  function applySaved(root = document) {
    assignGestureKeys(root);
    root.querySelectorAll?.('[data-kp-gesture-key]').forEach(el => {
      if (el.closest('.kp-site-nav') || el.matches('.kp-header-stage img,.kp-header-photo img')) return;
      const ref = valueFor(el, false);
      if (ref) applyValue(el, ref.value);
    });
  }

  function ensureHud() {
    let hud = document.querySelector('.kp-gesture-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.className = 'kp-gesture-hud';
      document.body.appendChild(hud);
    }
    return hud;
  }

  function showHud(text, delay = 0) {
    const hud = ensureHud();
    hud.textContent = text;
    hud.classList.add('is-visible');
    clearTimeout(showHud.timer);
    if (delay) showHud.timer = setTimeout(() => hud.classList.remove('is-visible'), delay);
  }

  function markDirty(message = 'Geändert – zum Übernehmen „Speichern“ antippen') {
    dirty = true;
    document.body.classList.add('kp-touch-layout-dirty');
    document.querySelector('.kp-fe2-save')?.classList.add('is-dirty');
    showHud(message, 1100);
  }

  function gestureTarget(node) {
    if (!(node instanceof Element) || node.closest(uiSelector) || node.closest('.kp-site-nav')) return null;
    const direct = node.closest('[data-kp-gesture-key],[data-kp-edit-key],[data-kp-dom-key]');
    if (direct && !direct.matches('.kp-header-stage img,.kp-header-photo img')) return direct;
    const special = node.closest('.kp-repertoire-card .kp-repertoire-image img,.kp-repertoire-card .kp-repertoire-card-actions a,.kp-repertoire-card .kp-repertoire-facts > *,.kp-repertoire-card .kp-repertoire-meta > *,.kp-termin-card');
    if (special) { ensureGestureKey(special); return special; }
    return null;
  }

  function snapshotGesture(el) {
    const ref = valueFor(el, true);
    if (!ref) return null;
    return {ref, before:{...ref.value}};
  }

  function remember(el, before) {
    const ref = valueFor(el, true);
    if (!ref) return false;
    const after = {...ref.value};
    const changed = Math.abs((after.x || 0) - (before.x || 0)) > .01 ||
      Math.abs((after.y || 0) - (before.y || 0)) > .01 ||
      Math.abs((after.scale || 1) - (before.scale || 1)) > .001;
    if (!changed) return false;
    gestureHistory.push({key:ref.key, scope:ref.scope, device:ref.device, before:{...before}, after, el, at:Date.now()});
    if (gestureHistory.length > 20) gestureHistory.shift();
    lastActionAt = Date.now();
    return true;
  }

  function setGesture(el, next) {
    const ref = valueFor(el, true);
    if (!ref) return;
    ref.data[ref.key][ref.device] = {
      x:Math.round(clamp(Number(next.x) || 0, -1200, 1200) * 100) / 100,
      y:Math.round(clamp(Number(next.y) || 0, -1200, 1200) * 100) / 100,
      scale:Math.round(clamp(Number(next.scale) || 1, .45, 2.5) * 1000) / 1000
    };
    applyValue(el, ref.data[ref.key][ref.device]);
  }

  function distance(a,b) { return Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY); }
  function midpoint(a,b) { return {x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2}; }

  function finishGesture(state, event) {
    if (!state || (state.mode !== 'drag' && state.mode !== 'pinch')) return;
    state.el.classList.remove('kp-gesture-active','is-dragging','is-pinching');
    document.body.classList.remove('kp-gesture-in-progress');
    if (remember(state.el, state.base)) markDirty();
    suppressUntil = Date.now() + 800;
    event.preventDefault?.();
  }

  async function flush() {
    if (!dirty) return {draft:false};
    if (saving) return saving;
    const fd = new FormData();
    fd.append('action', 'kp_touch_gesture_save');
    fd.append('nonce', cfg.nonce || '');
    fd.append('page_key', cfg.pageKey || '');
    fd.append('global', JSON.stringify(globalData));
    fd.append('page', JSON.stringify(pageData));
    saving = fetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd})
      .then(async response => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(json?.data?.message || 'Position konnte nicht gespeichert werden.');
        dirty = false;
        document.body.classList.remove('kp-touch-layout-dirty');
        return json.data || {};
      })
      .finally(() => { saving = null; });
    return saving;
  }

  function undo() {
    const last = gestureHistory.pop();
    if (!last) return false;
    const data = scopeData(last.scope);
    data[last.key] = data[last.key] || {};
    data[last.key][last.device] = {...last.before};
    if (last.el?.isConnected) applyValue(last.el, last.before);
    lastActionAt = Number(gestureHistory.at(-1)?.at || 0);
    markDirty('Verschieben / Zoomen rückgängig ✓');
    return true;
  }

  assignGestureKeys();
  applySaved();
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return;
      assignGestureKeys(node);
      applySaved(node);
    }));
    if (cfg.editMode) guardRanges();
  }).observe(document.documentElement, {childList:true, subtree:true});

  window.KPTouchGestureRuntime = {
    suppressClick: () => Date.now() < suppressUntil,
    flush,
    undo,
    hasHistory: () => gestureHistory.length > 0,
    lastActionAt: () => lastActionAt,
    isDirty: () => dirty
  };

  if (!cfg.editMode || !cfg.canEdit) return;
  document.body.classList.add('kp-touch-gestures-enabled');

  const hint = document.querySelector('.kp-fe2-hint');
  if (hint) hint.textContent = 'Tippen = bearbeiten · halten + ziehen = verschieben · 2 Finger = zoomen';

  document.addEventListener('touchstart', event => {
    if (event.target.closest?.(uiSelector)) return;
    if (event.touches.length >= 2) {
      const el = touchState?.el || gestureTarget(event.target);
      if (!el) return;
      clearTimeout(touchState?.timer);
      const a=event.touches[0], b=event.touches[1];
      const snap=snapshotGesture(el); if(!snap)return;
      touchState={el,mode:'pinch',base:{...snap.before},startDistance:Math.max(20,distance(a,b)),startMid:midpoint(a,b)};
      el.classList.add('kp-gesture-active','is-pinching');
      document.body.classList.add('kp-gesture-in-progress');
      event.preventDefault();
      return;
    }
    if (event.touches.length !== 1) return;
    const el=gestureTarget(event.target); if(!el)return;
    const t=event.touches[0];
    const base={...valueFor(el,true).value};
    const pending={el,mode:'pending',base,startX:t.clientX,startY:t.clientY,timer:null};
    pending.timer=setTimeout(()=>{
      if(touchState!==pending)return;
      pending.mode='drag';
      el.classList.add('kp-gesture-active','is-dragging');
      document.body.classList.add('kp-gesture-in-progress');
      showHud('Verschieben');
    },holdMs);
    touchState=pending;
  },{capture:true,passive:false});

  document.addEventListener('touchmove', event => {
    const state=touchState; if(!state)return;
    if(state.mode==='pending'&&event.touches.length===1){
      const t=event.touches[0];
      if(Math.hypot(t.clientX-state.startX,t.clientY-state.startY)>10){clearTimeout(state.timer);touchState=null;}
      return;
    }
    if(state.mode==='drag'&&event.touches.length===1){
      const t=event.touches[0];
      setGesture(state.el,{x:(state.base.x||0)+(t.clientX-state.startX),y:(state.base.y||0)+(t.clientY-state.startY),scale:state.base.scale||1});
      event.preventDefault(); return;
    }
    if(state.mode==='pinch'&&event.touches.length>=2){
      const a=event.touches[0],b=event.touches[1],mid=midpoint(a,b),ratio=distance(a,b)/state.startDistance;
      setGesture(state.el,{x:(state.base.x||0)+(mid.x-state.startMid.x),y:(state.base.y||0)+(mid.y-state.startMid.y),scale:(state.base.scale||1)*ratio});
      event.preventDefault();
    }
  },{capture:true,passive:false});

  function finishTouch(event){
    const state=touchState; if(!state)return;
    if(state.mode==='pending'){clearTimeout(state.timer);touchState=null;return;}
    if(state.mode==='pinch'&&event.touches?.length>0)return;
    finishGesture(state,event); touchState=null;
  }
  document.addEventListener('touchend',finishTouch,{capture:true,passive:false});
  document.addEventListener('touchcancel',finishTouch,{capture:true,passive:false});

  document.addEventListener('mousedown', event => {
    if(event.button!==0||event.target.closest?.(uiSelector))return;
    const el=gestureTarget(event.target); if(!el)return;
    const base={...valueFor(el,true).value};
    const pending={el,mode:'pending',base,startX:event.clientX,startY:event.clientY,timer:null};
    pending.timer=setTimeout(()=>{
      if(mouseState!==pending)return;
      pending.mode='drag';el.classList.add('kp-gesture-active','is-dragging');document.body.classList.add('kp-gesture-in-progress');showHud('Verschieben');
    },320);
    mouseState=pending;
  },true);

  window.addEventListener('mousemove',event=>{
    const state=mouseState;if(!state)return;
    if(state.mode==='pending'){if(Math.hypot(event.clientX-state.startX,event.clientY-state.startY)>7){clearTimeout(state.timer);mouseState=null;}return;}
    if(state.mode==='drag'){event.preventDefault();setGesture(state.el,{x:(state.base.x||0)+(event.clientX-state.startX),y:(state.base.y||0)+(event.clientY-state.startY),scale:state.base.scale||1});}
  },true);

  window.addEventListener('mouseup',event=>{
    const state=mouseState;if(!state)return;clearTimeout(state.timer);finishGesture(state,event);mouseState=null;
  },true);

  window.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest('.kp-fe2-undo')&&gestureHistory.length){
      event.preventDefault();event.stopImmediatePropagation();undo();return;
    }
    if(Date.now()<suppressUntil&&!target?.closest(uiSelector)){event.preventDefault();event.stopImmediatePropagation();}
  },true);

  document.addEventListener('click', event => {
    const reset=event.target.closest?.('.kp-fe2-reset'); if(!reset)return;
    const el=document.querySelector('.kp-fe2-selected'); if(!el)return;
    const ref=valueFor(el,false); if(!ref||!ref.data[ref.key]?.[ref.device])return;
    gestureHistory.push({key:ref.key,scope:ref.scope,device:ref.device,before:{...ref.value},el,at:Date.now()});
    delete ref.data[ref.key][ref.device]; if(!Object.keys(ref.data[ref.key]).length)delete ref.data[ref.key];
    applyValue(el,{x:0,y:0,scale:1}); lastActionAt=Date.now(); markDirty('Position zurückgesetzt – „Speichern“ antippen');
  },true);

  const touchCapable=navigator.maxTouchPoints>0||matchMedia?.('(pointer:coarse)').matches;
  function addRangeNote(container){
    if(!container||container.querySelector(':scope > .kp-touch-range-note'))return;
    const note=document.createElement('div');note.className='kp-touch-range-note';note.textContent='Schieberegler sind gegen versehentliches Berühren gesperrt: kurz gedrückt halten, dann ziehen.';container.prepend(note);
  }
  function positionGuard(input,guard){
    const parent=input.parentElement;if(!parent)return;const pr=parent.getBoundingClientRect(),ir=input.getBoundingClientRect(),height=Math.max(30,ir.height+16);
    guard.style.left=`${ir.left-pr.left}px`;guard.style.top=`${ir.top-pr.top-(height-ir.height)/2}px`;guard.style.width=`${ir.width}px`;guard.style.height=`${height}px`;
  }
  function guardRange(input){
    if(!touchCapable||input.dataset.kpTouchGuarded==='1')return;
    const parent=input.parentElement;if(!parent)return;input.dataset.kpTouchGuarded='1';parent.classList.add('kp-range-guarded');if(getComputedStyle(parent).position==='static')parent.style.position='relative';
    const guard=document.createElement('span');guard.className='kp-touch-range-guard';guard.setAttribute('aria-hidden','true');parent.appendChild(guard);requestAnimationFrame(()=>positionGuard(input,guard));
    let state=null;
    guard.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse')return;positionGuard(input,guard);state={id:event.pointerId,startX:event.clientX,startY:event.clientY,armed:false,timer:null};try{guard.setPointerCapture(event.pointerId);}catch(_){}
      state.timer=setTimeout(()=>{if(!state)return;state.armed=true;guard.classList.add('is-armed');showHud('Regler entsperrt');},holdMs);
    });
    guard.addEventListener('pointermove',event=>{
      if(!state||event.pointerId!==state.id)return;
      if(!state.armed){if(Math.hypot(event.clientX-state.startX,event.clientY-state.startY)>10){clearTimeout(state.timer);state=null;}return;}
      event.preventDefault();const rect=input.getBoundingClientRect(),min=Number(input.min||0),max=Number(input.max||100),step=Number(input.step||1)||1,ratio=clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1);
      let value=min+ratio*(max-min);value=Math.round((value-min)/step)*step+min;input.value=String(clamp(value,min,max));input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    const finish=event=>{if(!state||event.pointerId!==state.id)return;clearTimeout(state.timer);if(state.armed)input.dispatchEvent(new Event('change',{bubbles:true}));guard.classList.remove('is-armed');state=null;};
    guard.addEventListener('pointerup',finish);guard.addEventListener('pointercancel',finish);
  }
  function guardRanges(){
    if(!touchCapable)return;
    const ranges=document.querySelectorAll('.kp-fe2-inspector input[type="range"],.kp-oa-sheet input[type="range"],.kp-cal-sheet input[type="range"]');ranges.forEach(guardRange);
    document.querySelectorAll('.kp-fe2-style-grid,.kp-oa-tab.is-active,.kp-oa-sheet.is-design').forEach(container=>{if(container.querySelector('input[type="range"]'))addRangeNote(container);});
  }
  guardRanges();
  window.addEventListener('resize',()=>document.querySelectorAll('.kp-touch-range-guard').forEach(guard=>{const input=guard.parentElement?.querySelector('input[type="range"][data-kp-touch-guarded="1"]');if(input)positionGuard(input,guard);}));
})();
