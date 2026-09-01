(() => {
  'use strict';

  const cfg = window.KPCanvaEditor;
  if (!cfg) return;
  const keys = window.KPCanvaKeys;
  const clone = value => JSON.parse(JSON.stringify(value || {}));
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const q = (s,r=document) => r.querySelector(s);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];
  const MAX = 50;
  const uiSelector = '.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-fe-card-sheet-backdrop,.kp-oa-backdrop,.kp-canva-image-panel,.kp-canva-preview-return,.kp-canva-discard,#wpadminbar';
  const menuButtonSelector = '.kp-site-nav .wp-block-navigation__responsive-container-open';
  const menuPanelSelector = '.kp-site-nav .wp-block-navigation__responsive-close';
  const headerImageSelector = '.kp-header-stage img,.kp-header-photo img';

  let gestureGlobal = clone(cfg.gestureGlobal);
  let gesturePage = clone(cfg.gesturePage);
  let freeGlobal = clone(cfg.freeGlobal);
  let freePage = clone(cfg.freePage);
  let imageGlobal = clone(cfg.imageGlobal);
  let imagePage = clone(cfg.imagePage);
  let savedGestureGlobal = clone(gestureGlobal);
  let savedGesturePage = clone(gesturePage);
  let savedFreeGlobal = clone(freeGlobal);
  let savedFreePage = clone(freePage);
  let savedImageGlobal = clone(imageGlobal);
  let savedImagePage = clone(imagePage);

  let layoutDirty = false;
  let imageDirty = false;
  let layoutSaving = null;
  let imageSaving = null;
  let touchState = null;
  let mouseState = null;
  let suppressUntil = 0;
  let discarding = false;
  let previewState = null;

  const layoutHistory = [];
  const layoutRedo = [];
  const imageHistory = [];
  const imageRedo = [];
  let lastLayoutAt = 0;
  let lastImageAt = 0;
  let imageGesture = null;

  window.KPTouchGestures = Object.assign({}, window.KPTouchGestures || {}, {
    ajaxUrl: cfg.ajaxUrl,
    holdMs: Number(cfg.holdMs) || 460,
    canEdit: !!cfg.canEdit,
    editMode: !!cfg.editMode
  });

  function device() {
    const w = window.innerWidth;
    if (w <= 640) return 'mobile';
    if (w <= 900) return 'tablet';
    if (w <= 1400) return 'laptop';
    return 'desktop';
  }

  function scopeFor(el) { return el?.closest?.('header,footer') ? 'global' : 'page'; }
  function hud(text, delay=0) {
    let el=q('.kp-gesture-hud');
    if(!el){el=document.createElement('div');el.className='kp-gesture-hud';document.body.appendChild(el);}
    el.textContent=text;el.classList.add('is-visible');clearTimeout(hud.t);
    if(delay)hud.t=setTimeout(()=>el.classList.remove('is-visible'),delay);
  }
  function markDirty(message='Geändert – erst Speichern macht es dauerhaft') {
    layoutDirty = true;
    document.body.classList.add('kp-touch-layout-dirty');
    q('.kp-fe2-save')?.classList.add('is-dirty');
    hud(message,1000);
    updateDiscard();
  }
  function markImageDirty(message='Bild geändert – erst Speichern macht es dauerhaft') {
    imageDirty = true;
    q('.kp-fe2-save')?.classList.add('is-dirty');
    hud(message,1000);
    updateDiscard();
  }

  /* ---------- image styling: public + editor ---------- */
  const imageDefaults = Object.freeze({brightness:100,contrast:100,saturation:100,grayscale:0,sepia:0,blur:0,opacity:100,rotation:0,pos_x:50,pos_y:50,fit:'cover',radius:0});
  function cleanImageEdit(raw={}) {
    return {
      brightness:clamp(Number(raw.brightness ?? 100),50,160),
      contrast:clamp(Number(raw.contrast ?? 100),50,180),
      saturation:clamp(Number(raw.saturation ?? 100),0,220),
      grayscale:clamp(Number(raw.grayscale ?? 0),0,100),
      sepia:clamp(Number(raw.sepia ?? 0),0,100),
      blur:clamp(Number(raw.blur ?? 0),0,12),
      opacity:clamp(Number(raw.opacity ?? 100),20,100),
      rotation:clamp(Number(raw.rotation ?? 0),-180,180),
      pos_x:clamp(Number(raw.pos_x ?? 50),0,100),
      pos_y:clamp(Number(raw.pos_y ?? 50),0,100),
      fit:['cover','contain','fill'].includes(raw.fit) ? raw.fit : 'cover',
      radius:clamp(Number(raw.radius ?? 0),0,80)
    };
  }
  function imageStore(scope){return scope==='global'?imageGlobal:imagePage;}
  function imageRef(img,create=false){
    const key=keys?.imageKey?.(img) || img?.dataset?.kpCanvaImageKey || '';
    if(!key)return null;
    const scope=scopeFor(img),store=imageStore(scope);
    if(create&&!store[key])store[key]=cleanImageEdit(imageDefaults);
    return {key,scope,store,value:cleanImageEdit(store[key]||imageDefaults)};
  }
  function applyImageEdit(img,raw){
    if(!(img instanceof HTMLImageElement))return;
    const e=cleanImageEdit(raw);
    img.style.setProperty('filter',`brightness(${e.brightness}%) contrast(${e.contrast}%) saturate(${e.saturation}%) grayscale(${e.grayscale}%) sepia(${e.sepia}%) blur(${e.blur}px)`,'important');
    img.style.setProperty('opacity',String(e.opacity/100),'important');
    img.style.setProperty('rotate',`${e.rotation}deg`,'important');
    img.style.setProperty('object-fit',e.fit,'important');
    img.style.setProperty('object-position',`${e.pos_x}% ${e.pos_y}%`,'important');
    img.style.setProperty('border-radius',`${e.radius}px`,'important');
  }
  function applyAllImages(root=document){
    keys?.assign?.(root);
    const imgs=[];
    if(root instanceof HTMLImageElement)imgs.push(root);
    root.querySelectorAll?.('img').forEach(img=>imgs.push(img));
    imgs.forEach(img=>{const ref=imageRef(img,false);if(ref&&ref.store[ref.key])applyImageEdit(img,ref.value);});
  }
  applyAllImages();
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node instanceof Element)applyAllImages(node);}))).observe(document.documentElement,{childList:true,subtree:true});

  if (!cfg.editMode || !cfg.canEdit) return;
  document.body.classList.add('kp-canva-edit-mode');
  const hint=q('.kp-fe2-hint');
  if(hint)hint.textContent='Tippen = bearbeiten · halten + ziehen = verschieben · 2 Finger = Größe · Vorschau = ohne Werkzeugleisten';

  /* ---------- unified drag / pinch layout ---------- */
  function layoutStore(kind,scope){
    if(kind==='generic')return scope==='global'?gestureGlobal:gesturePage;
    return scope==='global'?freeGlobal:freePage;
  }
  function freeKey(el,kind){
    if(kind==='menu-button')return 'menu-button';
    if(kind==='menu-panel')return 'menu-panel';
    if(kind==='header-image'){
      const list=[...document.querySelectorAll(headerImageSelector)];
      return `header-image-${Math.max(0,list.indexOf(el))+1}`;
    }
    return '';
  }
  function targetFor(node){
    if(!(node instanceof Element)||node.closest(uiSelector))return null;
    const menuButton=node.closest(menuButtonSelector);if(menuButton)return {el:menuButton,kind:'menu-button',storeKind:'free',scope:'global',key:'menu-button'};
    const menuPanel=node.closest(menuPanelSelector);if(menuPanel)return {el:menuPanel,kind:'menu-panel',storeKind:'free',scope:'global',key:'menu-panel'};
    const headerImage=node.closest(headerImageSelector);if(headerImage)return {el:headerImage,kind:'header-image',storeKind:'free',scope:'global',key:freeKey(headerImage,'header-image')};
    if(node.closest('.kp-site-nav'))return null;
    const el=node.closest('[data-kp-gesture-key],[data-kp-edit-key],[data-kp-dom-key]');
    if(!el)return null;
    const key=el.dataset.kpGestureKey || keys?.ensureGestureKey?.(el);
    if(!key)return null;
    return {el,kind:'generic',storeKind:'generic',scope:scopeFor(el),key};
  }
  function layoutRef(target,create=true){
    const store=layoutStore(target.storeKind,target.scope),d=device();
    if(create){store[target.key]=store[target.key]||{};store[target.key][d]=store[target.key][d]||{x:0,y:0,scale:1};}
    return {store,device:d,value:store[target.key]?.[d]||{x:0,y:0,scale:1}};
  }
  function cleanLayoutValue(raw){return {x:Math.round(clamp(Number(raw?.x)||0,-1600,1600)*100)/100,y:Math.round(clamp(Number(raw?.y)||0,-1600,1600)*100)/100,scale:Math.round(clamp(Number(raw?.scale)||1,.45,2.5)*1000)/1000};}
  function applyLayout(target,raw){
    const el=target?.el;if(!el)return;const v=cleanLayoutValue(raw);
    if(target.storeKind==='generic'){
      el.style.setProperty('translate',`${v.x}px ${v.y}px`,'important');
      el.style.setProperty('scale',String(v.scale),'important');
      el.style.setProperty('transform-origin','center center','important');
      el.classList.toggle('kp-has-gesture-transform',Math.abs(v.x)>.01||Math.abs(v.y)>.01||Math.abs(v.scale-1)>.001);
    }else{
      el.style.removeProperty('translate');el.style.removeProperty('scale');
      const transform=target.kind==='menu-panel'?`translate3d(${v.x}px,calc(-50% + ${v.y}px),0) scale(${v.scale})`:`translate3d(${v.x}px,${v.y}px,0) scale(${v.scale})`;
      el.style.setProperty('transform',transform,'important');
      el.style.setProperty('transform-origin','center center','important');
    }
  }
  function setLayout(target,next){const ref=layoutRef(target,true);ref.store[target.key][ref.device]=cleanLayoutValue(next);applyLayout(target,ref.store[target.key][ref.device]);}
  function targetFromElement(el){
    if(!el)return null;
    if(el.matches(menuButtonSelector))return {el,kind:'menu-button',storeKind:'free',scope:'global',key:'menu-button'};
    if(el.matches(menuPanelSelector))return {el,kind:'menu-panel',storeKind:'free',scope:'global',key:'menu-panel'};
    if(el.matches(headerImageSelector))return {el,kind:'header-image',storeKind:'free',scope:'global',key:freeKey(el,'header-image')};
    const key=el.dataset.kpGestureKey||keys?.ensureGestureKey?.(el);if(!key)return null;
    return {el,kind:'generic',storeKind:'generic',scope:scopeFor(el),key};
  }
  function applySavedLayout(){
    keys?.assign?.();
    qa('[data-kp-gesture-key]').forEach(el=>{
      if(el.closest('.kp-site-nav')||el.matches(headerImageSelector))return;
      const target=targetFromElement(el);if(!target)return;const ref=layoutRef(target,false);
      if(ref.store[target.key]?.[ref.device])applyLayout(target,ref.value);else{el.style.removeProperty('translate');el.style.removeProperty('scale');if(el.classList.contains('kp-has-gesture-transform'))el.classList.remove('kp-has-gesture-transform');}
    });
    const fixed=[q(menuButtonSelector),q(menuPanelSelector),...qa(headerImageSelector)];
    fixed.filter(Boolean).forEach(el=>{const target=targetFromElement(el);if(target)applyLayout(target,layoutRef(target,false).value);});
  }
  applySavedLayout();

  function sameLayout(a,b){const x=cleanLayoutValue(a),y=cleanLayoutValue(b);return Math.abs(x.x-y.x)<.01&&Math.abs(x.y-y.y)<.01&&Math.abs(x.scale-y.scale)<.001;}
  function pushLayout(entry){
    layoutHistory.push(entry);if(layoutHistory.length>MAX)layoutHistory.shift();layoutRedo.length=0;lastLayoutAt=Date.now();
    window.dispatchEvent(new CustomEvent('kp:canva-layout-history-push',{detail:{undo:layoutHistory.length,redo:0,at:lastLayoutAt}}));
    window.dispatchEvent(new CustomEvent('kp:canva-layout-history-change',{detail:{undo:layoutHistory.length,redo:layoutRedo.length}}));
  }
  function finishLayout(target,before){
    const ref=layoutRef(target,true),after={...ref.value};if(sameLayout(before,after))return false;
    pushLayout({target:{...target},device:ref.device,before:cleanLayoutValue(before),after:cleanLayoutValue(after),at:Date.now()});
    markDirty();return true;
  }
  function applyLayoutHistoryEntry(entry,value){
    if(!entry)return false;const target={...entry.target};
    if(!target.el?.isConnected){
      if(target.kind==='menu-button')target.el=q(menuButtonSelector);
      else if(target.kind==='menu-panel')target.el=q(menuPanelSelector);
      else if(target.kind==='header-image')target.el=qa(headerImageSelector)[Math.max(0,Number(String(target.key).split('-').pop())-1)]||null;
      else target.el=q(`[data-kp-gesture-key="${CSS.escape(target.key)}"]`);
    }
    if(!target.el)return false;
    const store=layoutStore(target.storeKind,target.scope);store[target.key]=store[target.key]||{};store[target.key][entry.device]=cleanLayoutValue(value);applyLayout(target,value);return true;
  }
  function layoutUndo(){const entry=layoutHistory.pop();if(!entry)return false;if(!applyLayoutHistoryEntry(entry,entry.before)){layoutHistory.push(entry);return false;}layoutRedo.push(entry);if(layoutRedo.length>MAX)layoutRedo.shift();lastLayoutAt=Number(layoutHistory.at(-1)?.at||0);markDirty('Verschieben / Zoomen rückgängig ✓');window.dispatchEvent(new CustomEvent('kp:canva-layout-history-change',{detail:{undo:layoutHistory.length,redo:layoutRedo.length}}));return true;}
  function layoutRedoStep(){const entry=layoutRedo.pop();if(!entry)return false;if(!applyLayoutHistoryEntry(entry,entry.after)){layoutRedo.push(entry);return false;}layoutHistory.push(entry);if(layoutHistory.length>MAX)layoutHistory.shift();lastLayoutAt=Date.now();markDirty('Verschieben / Zoomen wiederholt ✓');window.dispatchEvent(new CustomEvent('kp:canva-layout-history-change',{detail:{undo:layoutHistory.length,redo:layoutRedo.length}}));return true;}
  function clearLayoutRedo(){layoutRedo.length=0;window.dispatchEvent(new CustomEvent('kp:canva-layout-history-change',{detail:{undo:layoutHistory.length,redo:0}}));}

  function distance(a,b){return Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);}
  function midpoint(a,b){return{x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2};}
  function beginTouch(event){
    if(event.target.closest?.(uiSelector))return;
    const found=touchState?.target||targetFor(event.target);if(!found)return;
    if(event.touches.length>=2){
      clearTimeout(touchState?.timer);const a=event.touches[0],b=event.touches[1];const target=touchState?.target||found;const base={...layoutRef(target,true).value};
      touchState={target,mode:'pinch',base,startDistance:Math.max(20,distance(a,b)),startMid:midpoint(a,b)};target.el.classList.add('kp-gesture-active','is-pinching');document.body.classList.add('kp-gesture-in-progress');event.preventDefault();event.stopPropagation();return;
    }
    if(event.touches.length!==1)return;const target=found,t=event.touches[0],base={...layoutRef(target,true).value};
    const pending={target,mode:'pending',base,startX:t.clientX,startY:t.clientY,timer:null};
    pending.timer=setTimeout(()=>{if(touchState!==pending)return;pending.mode='drag';target.el.classList.add('kp-gesture-active','is-dragging');document.body.classList.add('kp-gesture-in-progress');hud(target.kind==='menu-panel'?'Menü als Ganzes verschieben':'Verschieben');},Math.max(320,Math.min(700,Number(cfg.holdMs)||420)));
    touchState=pending;
  }
  function moveTouch(event){
    const s=touchState;if(!s)return;
    if(s.mode==='pending'&&event.touches.length===1){const t=event.touches[0];if(Math.hypot(t.clientX-s.startX,t.clientY-s.startY)>10){clearTimeout(s.timer);touchState=null;}return;}
    if(s.mode==='drag'&&event.touches.length===1){const t=event.touches[0];setLayout(s.target,{x:(s.base.x||0)+(t.clientX-s.startX),y:(s.base.y||0)+(t.clientY-s.startY),scale:s.base.scale||1});event.preventDefault();event.stopPropagation();return;}
    if(s.mode==='pinch'&&event.touches.length>=2){const a=event.touches[0],b=event.touches[1],mid=midpoint(a,b),ratio=distance(a,b)/s.startDistance;setLayout(s.target,{x:(s.base.x||0)+(mid.x-s.startMid.x),y:(s.base.y||0)+(mid.y-s.startMid.y),scale:(s.base.scale||1)*ratio});event.preventDefault();event.stopPropagation();}
  }
  function finishTouch(event){const s=touchState;if(!s)return;if(s.mode==='pending'){clearTimeout(s.timer);touchState=null;return;}if(s.mode==='pinch'&&event.touches?.length>0)return;s.target.el.classList.remove('kp-gesture-active','is-dragging','is-pinching');document.body.classList.remove('kp-gesture-in-progress');finishLayout(s.target,s.base);suppressUntil=Date.now()+700;event.preventDefault?.();event.stopPropagation?.();touchState=null;}
  document.addEventListener('touchstart',beginTouch,{capture:true,passive:false});document.addEventListener('touchmove',moveTouch,{capture:true,passive:false});document.addEventListener('touchend',finishTouch,{capture:true,passive:false});document.addEventListener('touchcancel',finishTouch,{capture:true,passive:false});

  document.addEventListener('mousedown',event=>{if(event.button!==0||event.target.closest?.(uiSelector))return;const target=targetFor(event.target);if(!target)return;mouseState={target,mode:'pending',base:{...layoutRef(target,true).value},startX:event.clientX,startY:event.clientY};},true);
  window.addEventListener('mousemove',event=>{const s=mouseState;if(!s)return;const dx=event.clientX-s.startX,dy=event.clientY-s.startY;if(s.mode==='pending'){if(Math.hypot(dx,dy)<4)return;s.mode='drag';s.target.el.classList.add('kp-gesture-active','is-dragging');document.body.classList.add('kp-gesture-in-progress');hud('Verschieben');}if(s.mode==='drag'){event.preventDefault();setLayout(s.target,{x:(s.base.x||0)+dx,y:(s.base.y||0)+dy,scale:s.base.scale||1});}},true);
  window.addEventListener('mouseup',event=>{const s=mouseState;if(!s)return;if(s.mode==='drag'){s.target.el.classList.remove('kp-gesture-active','is-dragging');document.body.classList.remove('kp-gesture-in-progress');finishLayout(s.target,s.base);suppressUntil=Date.now()+450;event.preventDefault();}mouseState=null;},true);
  document.addEventListener('contextmenu',event=>{if(targetFor(event.target))event.preventDefault();},true);
  document.addEventListener('dragstart',event=>{if(event.target instanceof Element&&targetFor(event.target))event.preventDefault();},true);
  window.addEventListener('click',event=>{if(Date.now()<suppressUntil&&!event.target.closest?.(uiSelector)){event.preventDefault();event.stopImmediatePropagation();}},true);

  async function postLayout(action,nonce,global,page){const fd=new FormData();fd.append('action',action);fd.append('nonce',nonce||'');fd.append('page_key',cfg.pageKey||'');fd.append('global',JSON.stringify(global));fd.append('page',JSON.stringify(page));const response=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const json=await response.json().catch(()=>null);if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Position konnte nicht gespeichert werden.');return json.data||{};}
  async function layoutFlush(){
    if(!layoutDirty)return{draft:false};if(layoutSaving)return layoutSaving;
    layoutSaving=(async()=>{
      const generic=await postLayout('kp_touch_gesture_save',cfg.gestureNonce,gestureGlobal,gesturePage);
      const free=await postLayout('kp_touch_free_layout_save',cfg.freeNonce,freeGlobal,freePage);
      gestureGlobal=clone(generic.global||gestureGlobal);gesturePage=clone(generic.page||gesturePage);freeGlobal=clone(free.global||freeGlobal);freePage=clone(free.page||freePage);
      savedGestureGlobal=clone(gestureGlobal);savedGesturePage=clone(gesturePage);savedFreeGlobal=clone(freeGlobal);savedFreePage=clone(freePage);
      layoutDirty=false;layoutHistory.length=0;layoutRedo.length=0;document.body.classList.remove('kp-touch-layout-dirty');window.dispatchEvent(new CustomEvent('kp:canva-layout-history-change',{detail:{undo:0,redo:0}}));return{success:true};
    })().finally(()=>{layoutSaving=null;});return layoutSaving;
  }
  function layoutDiscard(){gestureGlobal=clone(savedGestureGlobal);gesturePage=clone(savedGesturePage);freeGlobal=clone(savedFreeGlobal);freePage=clone(savedFreePage);layoutHistory.length=0;layoutRedo.length=0;layoutDirty=false;document.body.classList.remove('kp-touch-layout-dirty');applySavedLayout();window.dispatchEvent(new CustomEvent('kp:canva-layout-history-change',{detail:{undo:0,redo:0}}));}
  const layoutRuntime={flush:layoutFlush,undo:layoutUndo,redo:layoutRedoStep,clearRedo:clearLayoutRedo,discard:layoutDiscard,hasHistory:()=>layoutHistory.length>0,canRedo:()=>layoutRedo.length>0,counts:()=>({undo:layoutHistory.length,redo:layoutRedo.length}),lastActionAt:()=>lastLayoutAt,isDirty:()=>layoutDirty,resetMenu:()=>{const d=device();let changed=false;['menu-button','menu-panel'].forEach(key=>{if(freeGlobal[key]?.[d]){delete freeGlobal[key][d];if(!Object.keys(freeGlobal[key]).length)delete freeGlobal[key];changed=true;}});if(changed){applySavedLayout();markDirty('Menüposition zurückgesetzt');}return Promise.resolve({draft:changed});}};
  window.KPCanvaLayoutRuntime=layoutRuntime;window.KPTouchGestureRuntime=layoutRuntime;window.KPFreeLayoutRuntime=layoutRuntime;

  /* ---------- image editor ---------- */
  function selectedImage(){const selected=q('.kp-fe2-selected');if(!selected)return null;if(selected instanceof HTMLImageElement)return selected;return selected.querySelector?.('img')||null;}
  function imageValues(img){return imageRef(img,true)?.value||cleanImageEdit(imageDefaults);}
  function setImageValues(img,next){const ref=imageRef(img,true);if(!ref)return;ref.store[ref.key]=cleanImageEdit(next);applyImageEdit(img,ref.store[ref.key]);markImageDirty();}
  function sameImage(a,b){return JSON.stringify(cleanImageEdit(a))===JSON.stringify(cleanImageEdit(b));}
  function pushImage(img,before,after){if(sameImage(before,after))return false;const ref=imageRef(img,true);imageHistory.push({img,key:ref.key,scope:ref.scope,before:cleanImageEdit(before),after:cleanImageEdit(after),at:Date.now()});if(imageHistory.length>MAX)imageHistory.shift();imageRedo.length=0;lastImageAt=Date.now();window.dispatchEvent(new CustomEvent('kp:canva-image-history-push',{detail:{undo:imageHistory.length,redo:0,at:lastImageAt}}));window.dispatchEvent(new CustomEvent('kp:canva-image-history-change',{detail:{undo:imageHistory.length,redo:0}}));return true;}
  function resolveImage(entry){if(entry.img?.isConnected)return entry.img;return q(`[data-kp-canva-image-key="${CSS.escape(entry.key)}"]`);}
  function applyImageHistory(entry,value){const img=resolveImage(entry);if(!img)return false;const store=imageStore(entry.scope);store[entry.key]=cleanImageEdit(value);applyImageEdit(img,value);return true;}
  function imageUndoStep(){const e=imageHistory.pop();if(!e)return false;if(!applyImageHistory(e,e.before)){imageHistory.push(e);return false;}imageRedo.push(e);if(imageRedo.length>MAX)imageRedo.shift();lastImageAt=Number(imageHistory.at(-1)?.at||0);markImageDirty('Bildbearbeitung rückgängig ✓');window.dispatchEvent(new CustomEvent('kp:canva-image-history-change',{detail:{undo:imageHistory.length,redo:imageRedo.length}}));refreshImagePanel();return true;}
  function imageRedoStep(){const e=imageRedo.pop();if(!e)return false;if(!applyImageHistory(e,e.after)){imageRedo.push(e);return false;}imageHistory.push(e);if(imageHistory.length>MAX)imageHistory.shift();lastImageAt=Date.now();markImageDirty('Bildbearbeitung wiederholt ✓');window.dispatchEvent(new CustomEvent('kp:canva-image-history-change',{detail:{undo:imageHistory.length,redo:imageRedo.length}}));refreshImagePanel();return true;}
  function clearImageRedo(){imageRedo.length=0;window.dispatchEvent(new CustomEvent('kp:canva-image-history-change',{detail:{undo:imageHistory.length,redo:0}}));}

  function imagePanelHtml(img){const e=imageValues(img);const range=(key,label,min,max,step,unit='%')=>`<label><span>${label}<output data-image-output="${key}">${e[key]}${unit}</output></span><input type="range" data-image-edit="${key}" min="${min}" max="${max}" step="${step}" value="${e[key]}"></label>`;return `<div class="kp-canva-image-panel-head"><strong>Bild bearbeiten</strong><button type="button" class="kp-canva-image-panel-close" aria-label="Bildwerkzeuge schließen">×</button></div><div class="kp-canva-image-presets"><button type="button" data-image-preset="reset">Original</button><button type="button" data-image-preset="vivid">Lebendig</button><button type="button" data-image-preset="warm">Warm</button><button type="button" data-image-preset="bw">Schwarzweiß</button></div><div class="kp-canva-image-grid">${range('brightness','Helligkeit',50,160,1)}${range('contrast','Kontrast',50,180,1)}${range('saturation','Sättigung',0,220,1)}${range('opacity','Deckkraft',20,100,1)}${range('grayscale','Schwarzweiß',0,100,1)}${range('sepia','Wärme',0,100,1)}${range('blur','Unschärfe',0,12,.5,'px')}${range('rotation','Drehung',-180,180,1,'°')}${range('pos_x','Ausschnitt horizontal',0,100,1)}${range('pos_y','Ausschnitt vertikal',0,100,1)}${range('radius','Rundung',0,80,1,'px')}<label class="kp-canva-image-wide"><span>Einpassung</span><select data-image-edit="fit"><option value="cover" ${e.fit==='cover'?'selected':''}>Fläche füllen</option><option value="contain" ${e.fit==='contain'?'selected':''}>Ganzes Bild zeigen</option><option value="fill" ${e.fit==='fill'?'selected':''}>Strecken</option></select></label></div>`;}
  function openImagePanel(img){if(!img)return;let panel=q('.kp-canva-image-panel');if(!panel){panel=document.createElement('div');panel.className='kp-canva-image-panel kp-oa-sheet';document.body.appendChild(panel);}panel.dataset.imageKey=keys?.imageKey?.(img)||'';panel.innerHTML=imagePanelHtml(img);panel.hidden=false;bindImagePanel(panel,img);}
  function closeImagePanel(){const panel=q('.kp-canva-image-panel');if(panel)panel.hidden=true;imageGesture=null;}
  function refreshImagePanel(){const panel=q('.kp-canva-image-panel');if(!panel||panel.hidden)return;const img=q(`[data-kp-canva-image-key="${CSS.escape(panel.dataset.imageKey||'')}"]`);if(img){panel.innerHTML=imagePanelHtml(img);bindImagePanel(panel,img);}}
  function bindImagePanel(panel,img){
    q('.kp-canva-image-panel-close',panel)?.addEventListener('click',closeImagePanel);
    const begin=()=>{if(!imageGesture)imageGesture={img,before:imageValues(img)};};
    const finish=()=>{if(!imageGesture)return;const before=imageGesture.before,after=imageValues(img);pushImage(img,before,after);imageGesture=null;};
    qa('[data-image-edit]',panel).forEach(input=>{
      input.addEventListener('pointerdown',begin);input.addEventListener('focusin',begin);
      const update=()=>{begin();const current=imageValues(img),key=input.dataset.imageEdit;current[key]=input.tagName==='SELECT'?input.value:Number(input.value);setImageValues(img,current);const output=q(`[data-image-output="${CSS.escape(key)}"]`,panel);if(output){const suffix=key==='blur'||key==='radius'?'px':key==='rotation'?'°':'%';output.textContent=`${current[key]}${suffix}`;}};
      input.addEventListener('input',update);input.addEventListener('change',()=>{update();finish();});input.addEventListener('pointerup',finish);input.addEventListener('pointercancel',finish);input.addEventListener('focusout',finish);
    });
    qa('[data-image-preset]',panel).forEach(button=>button.addEventListener('click',()=>{const before=imageValues(img);let next={...imageDefaults};if(button.dataset.imagePreset==='vivid')next={...next,brightness:104,contrast:108,saturation:122};if(button.dataset.imagePreset==='warm')next={...next,brightness:103,contrast:103,saturation:112,sepia:18};if(button.dataset.imagePreset==='bw')next={...next,contrast:108,grayscale:100};setImageValues(img,next);pushImage(img,before,next);refreshImagePanel();}));
  }
  function installImageButton(){const img=selectedImage(),inspector=q('.kp-fe2-inspector');if(!img||!inspector?.classList.contains('is-open')){return;}let actions=q('.kp-fe2-actions',inspector);if(!actions)return;if(q('.kp-canva-image-edit',actions))return;const button=document.createElement('button');button.type='button';button.className='kp-fe2-expand kp-canva-image-edit';button.innerHTML='<span aria-hidden="true">✦</span> Bild bearbeiten';button.addEventListener('click',()=>openImagePanel(img));actions.appendChild(button);}
  const imageButtonObserver=new MutationObserver(()=>requestAnimationFrame(installImageButton));imageButtonObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});setInterval(installImageButton,500);

  async function imageFlush(){if(!imageDirty)return{draft:false};if(imageSaving)return imageSaving;imageSaving=(async()=>{const fd=new FormData();fd.append('action','kp_canva_image_save');fd.append('nonce',cfg.imageNonce||'');fd.append('page_key',cfg.pageKey||'');fd.append('global',JSON.stringify(imageGlobal));fd.append('page',JSON.stringify(imagePage));const response=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const json=await response.json().catch(()=>null);if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Bildbearbeitung konnte nicht gespeichert werden.');imageGlobal=clone(json.data?.global||imageGlobal);imagePage=clone(json.data?.page||imagePage);savedImageGlobal=clone(imageGlobal);savedImagePage=clone(imagePage);imageDirty=false;imageHistory.length=0;imageRedo.length=0;window.dispatchEvent(new CustomEvent('kp:canva-image-history-change',{detail:{undo:0,redo:0}}));return json.data||{};})().finally(()=>{imageSaving=null;});return imageSaving;}
  function imageDiscard(){imageGlobal=clone(savedImageGlobal);imagePage=clone(savedImagePage);imageDirty=false;imageHistory.length=0;imageRedo.length=0;applyAllImages();closeImagePanel();window.dispatchEvent(new CustomEvent('kp:canva-image-history-change',{detail:{undo:0,redo:0}}));}
  const imageRuntime={flush:imageFlush,undo:imageUndoStep,redo:imageRedoStep,clearRedo:clearImageRedo,discard:imageDiscard,hasHistory:()=>imageHistory.length>0,canRedo:()=>imageRedo.length>0,counts:()=>({undo:imageHistory.length,redo:imageRedo.length}),lastActionAt:()=>lastImageAt,isDirty:()=>imageDirty};window.KPCanvaImageRuntime=imageRuntime;

  /* Include image edits in the unified orange Save transaction. */
  function wrapSaveRegistry(){const registry=window.KPOwnerSaveRegistry;if(!registry||registry.__kpCanvaWrapped)return;const baseFlush=registry.flushAll?.bind(registry),baseDirty=registry.isDirty?.bind(registry);registry.flushAll=async()=>{const result=baseFlush?await baseFlush():{success:true};await imageFlush();return result;};registry.isDirty=()=>!!baseDirty?.()||layoutDirty||imageDirty;registry.__kpCanvaWrapped=true;}
  wrapSaveRegistry();setInterval(wrapSaveRegistry,350);

  /* ---------- preview + discard ---------- */
  function normalizedText(el){return(el?.textContent||'').replace(/\s+/g,' ').trim();}
  function installPreviewButtons(){qa('button,a').forEach(btn=>{if(btn.dataset.kpCanvaPreviewBound==='1')return;if(!/^Vorschau$/i.test(normalizedText(btn)))return;btn.dataset.kpCanvaPreviewBound='1';btn.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();enterPreview();},true);});}
  function enterPreview(){if(document.body.classList.contains('kp-canva-preview'))return;const backdrop=q('.kp-oa-backdrop');previewState={backdrop,wasOpen:!!backdrop?.classList.contains('is-open'),bodyOpen:document.body.classList.contains('kp-oa-open')};if(backdrop)backdrop.classList.remove('is-open');document.body.classList.remove('kp-oa-open');document.body.classList.add('kp-canva-preview');let back=q('.kp-canva-preview-return');if(!back){back=document.createElement('button');back.type='button';back.className='kp-canva-preview-return';back.textContent='✎ Bearbeiten';back.addEventListener('click',exitPreview);document.body.appendChild(back);}back.hidden=false;}
  function exitPreview(){document.body.classList.remove('kp-canva-preview');const back=q('.kp-canva-preview-return');if(back)back.hidden=true;if(previewState?.wasOpen&&previewState.backdrop?.isConnected)previewState.backdrop.classList.add('is-open');if(previewState?.bodyOpen)document.body.classList.add('kp-oa-open');previewState=null;updateDiscard();}

  function anyDirty(){let registryDirty=false;try{registryDirty=!!window.KPOwnerSaveRegistry?.isDirty?.();}catch(_){}return layoutDirty||imageDirty||registryDirty||document.body.classList.contains('kp-touch-layout-dirty')||!!q('.kp-fe2-save.is-dirty');}
  function ensureDiscard(){let button=q('.kp-canva-discard');if(button)return button;button=document.createElement('button');button.type='button';button.className='kp-canva-discard';button.setAttribute('aria-label','Ungespeicherte Änderungen verwerfen');button.textContent='×';button.addEventListener('click',discardAll);document.body.appendChild(button);return button;}
  function updateDiscard(){const button=ensureDiscard();button.hidden=!anyDirty()||document.body.classList.contains('kp-canva-preview');}
  function discardAll(){discarding=true;exitPreview();layoutDiscard();imageDiscard();q('.kp-oa-backdrop')?.classList.remove('is-open');document.body.classList.remove('kp-oa-open');hud('Änderungen verworfen',500);setTimeout(()=>window.location.reload(),90);}
  // Deliberately no beforeunload confirmation

  const uiObserver=new MutationObserver(()=>requestAnimationFrame(()=>{installPreviewButtons();installImageButton();updateDiscard();}));uiObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});installPreviewButtons();updateDiscard();setInterval(updateDiscard,400);
})();
