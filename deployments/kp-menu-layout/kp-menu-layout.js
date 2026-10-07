/* Position und Größe des geöffneten Seitenmenüs.
   Die Werte liegen im bestehenden mobileNav-Seitenstand und werden erst durch
   die normale KP-Studio-Veröffentlichung für Besucher übernommen. */
(() => {
  'use strict';
  const menu = document.querySelector('[data-mobile-menu]');
  const nav = menu?.querySelector('nav');
  if (!menu || !nav) return;
  const editing = () => document.body.classList.contains('editing') && !document.body.classList.contains('kp-preview');
  const kind = () => matchMedia('(max-width:980px)').matches ? 'm' : 'd';
  const marker = () => nav.querySelector(':scope > [data-kp-nav-layout]');
  const number = value => Number.isFinite(+value) ? +value : NaN;
  const read = type => {
    const text = marker()?.dataset[type];
    if (!text) return null;
    const values = text.split(',').map(number);
    return values.length === 4 && values.every(v => Number.isFinite(v) && v >= 0 && v <= 100) ? values : null;
  };
  const bounds = () => ({ w: innerWidth, h: innerHeight, pad: 12, minW: Math.min(240, innerWidth - 24), minH: Math.min(180, innerHeight - 24) });
  function clamp(left, top, width, height) {
    const {w,h,pad,minW,minH} = bounds();
    width = Math.max(minW, Math.min(width, Math.min(720,w-2*pad)));
    height = Math.max(minH, Math.min(height, h-2*pad));
    return { left: Math.max(pad,Math.min(left,w-width-pad)), top: Math.max(pad,Math.min(top,h-height-pad)), width, height };
  }
  function place(box) {
    nav.classList.add('kp-nav-placed');
    for (const [prop,value] of Object.entries({
      position:'fixed',left:box.left+'px',top:box.top+'px',width:box.width+'px',
      height:box.height+'px','max-height':box.height+'px',transform:'none',margin:'0'
    })) nav.style.setProperty(prop,value,'important');
  }
  function reset() {
    nav.classList.remove('kp-nav-placed');
    for (const prop of ['position','left','top','width','height','max-height','transform','margin']) nav.style.removeProperty(prop);
  }
  function apply() {
    const v = read(kind());
    if (!v) { reset(); return; }
    const box = clamp(v[0]*innerWidth/100,v[1]*innerHeight/100,v[2]*innerWidth/100,v[3]*innerHeight/100);
    place(box);
  }
  function persist(box) {
    let item = marker();
    if (!item) {
      item = document.createElement('span'); item.hidden = true; item.dataset.kpNavLayout = '';
      nav.prepend(item);
    }
    item.dataset[kind()] = [box.left/innerWidth,box.top/innerHeight,box.width/innerWidth,box.height/innerHeight]
      .map(v => Math.round(v*10000)/100).join(',');
    place(box);
    if (typeof saveDraft === 'function') saveDraft();
    if (typeof recordHistory === 'function') recordHistory();
    document.dispatchEvent(new CustomEvent('kp-dirty',{detail:true}));
    window.KPStudio?.save('draft');
  }
  const handles = {};
  function addHandles() {
    if (!editing() || !menu.classList.contains('open')) { Object.values(handles).forEach(el => el.remove()); return; }
    if (handles.move?.isConnected) return;
    for (const part of ['move','nw','ne','sw','se']) {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'kp-nav-touch kp-nav-touch-' + part;
      el.dataset.transient = ''; el.setAttribute('aria-label',part === 'move' ? 'Seitenmenü verschieben' : 'Seitenmenü an Ecke '+part+' vergrößern oder verkleinern');
      nav.append(el); handles[part] = el;
    }
  }
  function begin(e, part) {
    if (!editing() || !menu.classList.contains('open') || (e.button !== undefined && e.button !== 0)) return;
    const grip = part === 'move' ? (e.target.closest('.kp-nav-touch-move') || nav) : handles[part];
    const start = nav.getBoundingClientRect(), x = e.clientX, y = e.clientY, id = e.pointerId;
    let active = false;
    const move = ev => {
      if (ev.pointerId !== id) return;
      const dx = ev.clientX-x, dy = ev.clientY-y;
      if (!active) { if (Math.hypot(dx,dy)>10) clearTimeout(timer); return; }
      ev.preventDefault();
      let left=start.left,top=start.top,width=start.width,height=start.height;
      if (part === 'move') { left+=dx; top+=dy; }
      else {
        if (part.includes('w')) { left+=dx; width-=dx; } else width+=dx;
        if (part.includes('n')) { top+=dy; height-=dy; } else height+=dy;
        if (part.includes('w')) left=Math.min(left,start.right-bounds().minW);
        if (part.includes('n')) top=Math.min(top,start.bottom-bounds().minH);
      }
      const box=clamp(left,top,width,height);
      if (part.includes('w')) box.left=clamp(start.right-box.width,box.top,box.width,box.height).left;
      if (part.includes('n')) box.top=clamp(box.left,start.bottom-box.height,box.width,box.height).top;
      place(box);
    };
    const end = ev => {
      if (ev.pointerId !== id) return;
      clearTimeout(timer); grip.removeEventListener('pointermove',move); grip.removeEventListener('pointerup',end); grip.removeEventListener('pointercancel',end);
      if (!active) return;
      if (ev.type === 'pointercancel') { apply(); return; }
      const r=nav.getBoundingClientRect(); persist(clamp(r.left,r.top,r.width,r.height));
    };
    const timer=setTimeout(() => { active=true; grip.setPointerCapture(id); place(clamp(start.left,start.top,start.width,start.height)); },part==='move'?320:0);
    grip.addEventListener('pointermove',move);
    grip.addEventListener('pointerup',end);
    grip.addEventListener('pointercancel',end);
  }
  nav.addEventListener('pointerdown',e=>{
    const corner=e.target.closest('.kp-nav-touch');
    if (corner) begin(e,corner.className.match(/kp-nav-touch-(nw|ne|sw|se)/)?.[1]||'move');
    else if (e.target===nav) begin(e,'move');
  });
  nav.addEventListener('keydown',e=>{
    const part=e.target.className?.match?.(/kp-nav-touch-(nw|ne|sw|se|move)/)?.[1];
    if (!part || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const r=nav.getBoundingClientRect(), step=e.shiftKey?32:12;
    let left=r.left,top=r.top,width=r.width,height=r.height;
    if (part==='move') { left+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);top+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0); }
    else { width+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);height+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0); }
    persist(clamp(left,top,width,height));
  });
  new MutationObserver(()=>{apply();addHandles();}).observe(nav,{childList:true});
  new MutationObserver(addHandles).observe(menu,{attributes:true,attributeFilter:['class']});
  new MutationObserver(addHandles).observe(document.body,{attributes:true,attributeFilter:['class']});
  addEventListener('resize',apply);
  apply();addHandles();
})();
