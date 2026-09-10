(()=>{
 const menu=document.querySelector('#menu'), tools=document.querySelector('#menuTools'), context=document.querySelector('#editorContext');
 if(!menu)return;
 const KEY='kp-menu-layout-v1'; let pressTimer=null,dragging=false,startX=0,startY=0,startLeft=0,startTop=0;
 function layout(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}}
 function normalize(v){if(!v||typeof v!=='object')return{};const out={};if(Number.isFinite(+v.size))out.size=Math.max(44,Math.min(88,+v.size));if(Number.isFinite(+v.left))out.left=Math.max(8,+v.left);if(Number.isFinite(+v.top))out.top=Math.max(8,+v.top);return out}
 function apply(v=layout()){v=normalize(v);menu.removeAttribute('style');if(v.size)menu.style.setProperty('--menu-size',v.size+'px');if(Number.isFinite(v.left)){const size=v.size||menu.getBoundingClientRect().width||56;menu.style.left=Math.max(8,Math.min(innerWidth-size-8,v.left))+'px';menu.style.right='auto'}if(Number.isFinite(v.top)){const size=v.size||menu.getBoundingClientRect().height||56;menu.style.top=Math.max(8,Math.min(innerHeight-size-8,v.top))+'px'}localStorage.setItem(KEY,JSON.stringify(v))}
 function current(){const r=menu.getBoundingClientRect();return normalize({left:r.left,top:r.top,size:r.width})}
 function save(){localStorage.setItem(KEY,JSON.stringify(current()))}
 function select(){if(!document.body.classList.contains('editing'))return;menu.classList.add('menu-selected');if(tools)tools.hidden=false;if(context)context.textContent='Menü-Button';if(typeof setStatus==='function')setStatus('Ziehen zum Verschieben · Größe unten ändern')}
 function deselect(){menu.classList.remove('menu-selected');if(tools)tools.hidden=true}
 menu.addEventListener('pointerdown',e=>{if(!document.body.classList.contains('editing'))return;pressTimer=setTimeout(()=>{select();dragging=true;const r=menu.getBoundingClientRect();startX=e.clientX;startY=e.clientY;startLeft=r.left;startTop=r.top;menu.setPointerCapture?.(e.pointerId)},420)});
 menu.addEventListener('pointermove',e=>{if(!dragging)return;e.preventDefault();const size=menu.getBoundingClientRect().width;const left=Math.max(8,Math.min(innerWidth-size-8,startLeft+e.clientX-startX));const top=Math.max(8,Math.min(innerHeight-size-8,startTop+e.clientY-startY));menu.style.left=left+'px';menu.style.right='auto';menu.style.top=top+'px'});
 function end(){clearTimeout(pressTimer);if(dragging){dragging=false;save();if(typeof markDirty==='function')markDirty('Menü-Button angepasst – noch online speichern')}}
 menu.addEventListener('pointerup',end);menu.addEventListener('pointercancel',end);
 function resize(delta){select();const r=menu.getBoundingClientRect(),size=Math.max(44,Math.min(88,r.width+delta));menu.style.setProperty('--menu-size',size+'px');save();if(typeof markDirty==='function')markDirty('Menügröße geändert – noch online speichern')}
 document.querySelector('#menuSmaller')?.addEventListener('click',()=>resize(-6));document.querySelector('#menuLarger')?.addEventListener('click',()=>resize(6));document.querySelector('#menuReset')?.addEventListener('click',()=>{localStorage.removeItem(KEY);menu.removeAttribute('style');select();if(typeof markDirty==='function')markDirty('Menüposition zurückgesetzt – noch online speichern')});
 const originalSetEditable=window.setEditable;window.setEditable=on=>{if(!on)deselect();originalSetEditable(on)};
 window.kpMenuLayout={get:current,apply(v){apply(v||{})},reset(){localStorage.removeItem(KEY);menu.removeAttribute('style')}};
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(input,init={})=>{
   const url=typeof input==='string'?input:(input&&input.url)||'';
   const isState=url.includes('api/editor-state.php');
   let nextInit=init;
   if(isState&&String(init.method||'GET').toUpperCase()==='PUT'&&typeof init.body==='string'){
     try{const payload=JSON.parse(init.body);payload.layout={...(payload.layout||{}),menu:current()};payload.version=Math.max(3,+payload.version||0);nextInit={...init,body:JSON.stringify(payload)}}catch{}
   }
   const response=await nativeFetch(input,nextInit);
   if(isState&&response.ok&&String(nextInit.method||'GET').toUpperCase()==='GET'&&!url.includes('action=history')){
     response.clone().json().then(state=>{if(state&&state.layout&&state.layout.menu)apply(state.layout.menu)}).catch(()=>{});
   }
   return response;
 };
 apply();
})();