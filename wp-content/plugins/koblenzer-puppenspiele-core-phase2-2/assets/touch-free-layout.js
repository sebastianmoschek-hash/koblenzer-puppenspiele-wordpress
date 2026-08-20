(() => {
  'use strict';
  const cfg = window.KPFreeLayout;
  if (!cfg) return;

  const clone = v => JSON.parse(JSON.stringify(v || {}));
  const globalData = clone(cfg.global);
  const pageData = clone(cfg.page);
  const holdMs = Math.max(320, Math.min(800, Number(cfg.holdMs) || 460));
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  let state = null;
  let suppressUntil = 0;
  let saveChain = Promise.resolve();

  const uiSelector = '.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-fe-card-sheet-backdrop,.kp-oa-backdrop,#wpadminbar';

  function device() {
    const w=window.innerWidth;
    if(w<=640)return 'mobile';
    if(w<=900)return 'tablet';
    if(w<=1400)return 'laptop';
    return 'desktop';
  }

  function hashString(str){let h=5381;for(let i=0;i<str.length;i++)h=((h<<5)+h)^str.charCodeAt(i);return (h>>>0).toString(36);}
  function pathFor(el,root){const p=[];let cur=el;while(cur&&cur!==root&&cur.nodeType===1){let i=1,s=cur.previousElementSibling;while(s){if(s.tagName===cur.tagName)i++;s=s.previousElementSibling;}p.unshift(cur.tagName.toLowerCase()+'-'+i);cur=cur.parentElement;}return p.join('-');}

  function hud(text,delay=0){
    let el=document.querySelector('.kp-gesture-hud');
    if(!el){el=document.createElement('div');el.className='kp-gesture-hud';document.body.appendChild(el);}
    el.textContent=text;el.classList.add('is-visible');clearTimeout(hud.t);
    if(delay)hud.t=setTimeout(()=>el.classList.remove('is-visible'),delay);
  }
  function hideHud(){const el=document.querySelector('.kp-gesture-hud');if(el)el.classList.remove('is-visible');}

  function scopeData(scope){return scope==='global'?globalData:pageData;}
  function record(key,scope,create=true){const data=scopeData(scope),d=device();if(create){data[key]=data[key]||{};data[key][d]=data[key][d]||{x:0,y:0,scale:1};}return {data,d,value:data[key]?.[d]||{x:0,y:0,scale:1}};}

  function save(){
    saveChain=saveChain.catch(()=>null).then(async()=>{
      const fd=new FormData();fd.append('action','kp_touch_free_layout_save');fd.append('nonce',cfg.nonce);fd.append('page_key',cfg.pageKey);fd.append('global',JSON.stringify(globalData));fd.append('page',JSON.stringify(pageData));
      const r=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd});const j=await r.json();if(!j.success)throw new Error(j.data?.message||'Position konnte nicht gespeichert werden.');return j.data;
    }).catch(err=>hud(err.message||'Speichern fehlgeschlagen',1800));
    return saveChain;
  }

  function kindFor(el){
    if(el.matches?.('.kp-site-nav .wp-block-navigation__responsive-container-open'))return 'menu-button';
    if(el.matches?.('.kp-site-nav .wp-block-navigation__responsive-close'))return 'menu-panel';
    return 'normal';
  }

  function scopeFor(el,kind){return kind==='menu-button'||kind==='menu-panel'||el.closest('header,footer')?'global':'page';}
  function keyFor(el,kind){
    if(kind==='menu-button')return 'menu-button';
    if(kind==='menu-panel')return 'menu-panel';
    if(el.dataset.kpFreeLayoutKey)return el.dataset.kpFreeLayoutKey;
    const root=el.closest('article,section,main,header,footer')||document.body;
    const key='free-'+hashString(location.pathname+'|'+pathFor(el,root)+'|'+(el.className||''));
    el.dataset.kpFreeLayoutKey=key;return key;
  }

  function apply(el,value,kind=kindFor(el)){
    if(!el||!value)return;
    const x=Number(value.x)||0,y=Number(value.y)||0,s=clamp(Number(value.scale)||1,.45,2.5);
    if(kind==='menu-panel'){
      el.style.setProperty('transform',`translate3d(${x}px,calc(-50% + ${y}px),0) scale(${s})`,'important');
      el.style.setProperty('transform-origin','center center','important');
    }else{
      el.style.setProperty('transform',`translate3d(${x}px,${y}px,0) scale(${s})`,'important');
      el.style.setProperty('transform-origin','center center','important');
    }
  }

  const extraSelector = [
    '.kp-repertoire-single .kp-repertoire-facts > *',
    '.kp-repertoire-single .kp-repertoire-description',
    '.kp-repertoire-single .kp-repertoire-details > section',
    '.kp-repertoire-single .kp-repertoire-cta > a',
    '.kp-repertoire-card .kp-repertoire-card-body > *',
    '.kp-termine-card',
    '.kp-termine-button',
    '.wp-block-button__link'
  ].join(',');

  function eligibleExtra(node){
    const el=node.closest?.(extraSelector);
    if(!el||el.closest(uiSelector)||el.closest('.kp-site-nav'))return null;
    if(el.matches('[data-kp-gesture-key],[data-kp-edit-key],[data-kp-dom-key]'))return null;
    keyFor(el,'normal');return el;
  }

  function targetFor(node){
    if(!(node instanceof Element)||node.closest(uiSelector))return null;
    const button=node.closest('.kp-site-nav .wp-block-navigation__responsive-container-open');
    if(button)return {el:button,kind:'menu-button'};
    const panel=node.closest('.kp-site-nav .wp-block-navigation__responsive-close');
    if(panel)return {el:panel,kind:'menu-panel'};
    const extra=eligibleExtra(node);if(extra)return {el:extra,kind:'normal'};
    return null;
  }

  function applySaved(){
    const button=document.querySelector('.kp-site-nav .wp-block-navigation__responsive-container-open');
    const panel=document.querySelector('.kp-site-nav .wp-block-navigation__responsive-close');
    [[button,'menu-button'],[panel,'menu-panel']].forEach(([el,kind])=>{if(!el)return;el.dataset.kpFreeLayoutKey=kind;const r=record(kind,'global',false);apply(el,r.value,kind);});
    document.querySelectorAll(extraSelector).forEach(el=>{if(el.closest('.kp-site-nav')||el.matches('[data-kp-gesture-key],[data-kp-edit-key],[data-kp-dom-key]'))return;const key=keyFor(el,'normal'),scope=scopeFor(el,'normal'),r=record(key,scope,false);apply(el,r.value,'normal');});
  }

  applySaved();
  const observer=new MutationObserver(()=>requestAnimationFrame(applySaved));
  observer.observe(document.documentElement,{childList:true,subtree:true});

  if(!cfg.editMode||!cfg.canEdit)return;

  /* Chrome/Android otherwise opens the image save/share menu before our long-
     press drag has a chance to start. In edit mode, long press belongs to the
     editor. A short tap still goes to the existing edit/replace action. */
  document.addEventListener('contextmenu',event=>{
    const t=event.target;
    if(!(t instanceof Element)||t.closest(uiSelector))return;
    if(t.closest('img,[data-kp-gesture-key],[data-kp-free-layout-key],.kp-site-nav .wp-block-navigation__responsive-container-open,.kp-site-nav .wp-block-navigation__responsive-close')){
      event.preventDefault();event.stopPropagation();
    }
  },true);
  document.addEventListener('dragstart',event=>{if(event.target instanceof Element&&event.target.closest('img'))event.preventDefault();},true);

  function distance(a,b){return Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);}
  function midpoint(a,b){return{x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2};}
  function mark(el,pinch=false){el.classList.add('kp-free-layout-active');el.classList.toggle('kp-free-layout-pinching',pinch);try{navigator.vibrate?.(14);}catch(_){} }
  function unmark(el){el?.classList.remove('kp-free-layout-active','kp-free-layout-pinching');}

  function setValue(el,kind,scope,key,next){
    const r=record(key,scope,true);
    r.data[key][r.d]={x:Math.round(clamp(Number(next.x)||0,-1600,1600)*100)/100,y:Math.round(clamp(Number(next.y)||0,-1600,1600)*100)/100,scale:Math.round(clamp(Number(next.scale)||1,.45,2.5)*1000)/1000};
    apply(el,r.data[key][r.d],kind);
  }

  document.addEventListener('touchstart',event=>{
    if(event.target.closest?.(uiSelector))return;
    const target=state?.target||targetFor(event.target);if(!target)return;
    const {el,kind}=target,scope=scopeFor(el,kind),key=keyFor(el,kind),base={...record(key,scope,true).value};

    if(event.touches.length>=2){
      clearTimeout(state?.timer);const a=event.touches[0],b=event.touches[1];
      state={target:{el,kind},scope,key,mode:'pinch',base,startDistance:Math.max(20,distance(a,b)),startMid:midpoint(a,b)};
      mark(el,true);hud(`Zoomen ${Math.round((base.scale||1)*100)} %`);event.preventDefault();return;
    }
    if(event.touches.length!==1)return;
    const t=event.touches[0];const s={target:{el,kind},scope,key,mode:'pending',base,startX:t.clientX,startY:t.clientY,timer:null};
    s.timer=setTimeout(()=>{if(state!==s||s.mode!=='pending')return;s.mode='drag';mark(el,false);hud(kind==='menu-button'?'Menübutton verschieben':kind==='menu-panel'?'Menüfeld verschieben':'Verschieben');},holdMs);
    state=s;
  },{capture:true,passive:false});

  document.addEventListener('touchmove',event=>{
    if(!state)return;
    const {el,kind}=state.target;
    if(state.mode==='pending'&&event.touches.length===1){const t=event.touches[0];if(Math.hypot(t.clientX-state.startX,t.clientY-state.startY)>10){clearTimeout(state.timer);state=null;}return;}
    if(state.mode==='drag'&&event.touches.length===1){const t=event.touches[0];setValue(el,kind,state.scope,state.key,{x:(state.base.x||0)+(t.clientX-state.startX),y:(state.base.y||0)+(t.clientY-state.startY),scale:state.base.scale||1});event.preventDefault();return;}
    if(state.mode==='pinch'&&event.touches.length>=2){const a=event.touches[0],b=event.touches[1],ratio=distance(a,b)/state.startDistance,mid=midpoint(a,b),scale=clamp((state.base.scale||1)*ratio,.45,2.5);setValue(el,kind,state.scope,state.key,{x:(state.base.x||0)+(mid.x-state.startMid.x),y:(state.base.y||0)+(mid.y-state.startMid.y),scale});hud(`Zoomen ${Math.round(scale*100)} %`);event.preventDefault();}
  },{capture:true,passive:false});

  function finish(event){
    if(!state)return;
    if(state.mode==='pending'){clearTimeout(state.timer);state=null;return;}
    if(state.mode==='pinch'&&event.touches?.length>0)return;
    const {el,kind}=state.target;unmark(el);suppressUntil=Date.now()+750;event.preventDefault?.();hud(kind==='menu-button'?'Menübutton gespeichert ✓':kind==='menu-panel'?'Menüposition gespeichert ✓':state.mode==='pinch'?'Größe gespeichert ✓':'Position gespeichert ✓',700);save();state=null;
  }
  document.addEventListener('touchend',finish,{capture:true,passive:false});
  document.addEventListener('touchcancel',finish,{capture:true,passive:false});

  window.addEventListener('click',event=>{if(Date.now()>=suppressUntil)return;event.preventDefault();event.stopImmediatePropagation();},true);

  window.KPFreeLayoutRuntime={
    resetMenu:()=>{
      const d=device();['menu-button','menu-panel'].forEach(key=>{if(globalData[key]){delete globalData[key][d];if(!Object.keys(globalData[key]).length)delete globalData[key];}});applySaved();save();
    }
  };
})();
