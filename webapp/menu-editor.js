(()=>{
 const menu=document.querySelector('#menu'), tools=document.querySelector('#menuTools'), context=document.querySelector('#editorContext');
 if(!menu)return;
 const KEY='kp-menu-layout-v1'; let pressTimer=null,dragging=false,moved=false,suppressClick=false,startX=0,startY=0,startLeft=0,startTop=0,activePointer=null;
 function layout(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}}
 function normalize(v){if(!v||typeof v!=='object')return{};const out={};if(v.size!=null&&v.size!==''&&Number.isFinite(+v.size))out.size=Math.max(44,Math.min(88,+v.size));if(v.left!=null&&v.left!==''&&Number.isFinite(+v.left))out.left=Math.max(8,+v.left);if(v.top!=null&&v.top!==''&&Number.isFinite(+v.top))out.top=Math.max(8,+v.top);return out}
 function apply(v=layout()){v=normalize(v);menu.removeAttribute('style');if(v.size)menu.style.setProperty('--menu-size',v.size+'px');if(Number.isFinite(v.left)){const size=v.size||menu.getBoundingClientRect().width||56;menu.style.left=Math.max(8,Math.min(innerWidth-size-8,v.left))+'px';menu.style.right='auto'}if(Number.isFinite(v.top)){const size=v.size||menu.getBoundingClientRect().height||56;menu.style.top=Math.max(8,Math.min(innerHeight-size-8,v.top))+'px'}localStorage.setItem(KEY,JSON.stringify(v))}
 function current(){const r=menu.getBoundingClientRect();return normalize({left:r.left,top:r.top,size:r.width})}
 function save(){localStorage.setItem(KEY,JSON.stringify(current()))}
 function select(){if(!document.body.classList.contains('editing'))return;menu.classList.add('menu-selected');if(tools)tools.hidden=false;if(context)context.textContent='Menü-Button';if(typeof setStatus==='function')setStatus('Gedrückt halten und frei verschieben · Größe unten ändern')}
 function deselect(){menu.classList.remove('menu-selected');if(tools)tools.hidden=true}
 function beginDrag(e){if(!document.body.classList.contains('editing'))return;select();dragging=true;suppressClick=true;activePointer=e.pointerId;const r=menu.getBoundingClientRect();startX=e.clientX;startY=e.clientY;startLeft=r.left;startTop=r.top;menu.classList.add('menu-dragging');try{menu.setPointerCapture(e.pointerId)}catch{} }
 menu.addEventListener('pointerdown',e=>{if(!document.body.classList.contains('editing'))return;moved=false;activePointer=e.pointerId;clearTimeout(pressTimer);pressTimer=setTimeout(()=>beginDrag(e),300)});
 menu.addEventListener('pointermove',e=>{if(!dragging||e.pointerId!==activePointer)return;e.preventDefault();moved=true;const size=menu.getBoundingClientRect().width;const left=Math.max(8,Math.min(innerWidth-size-8,startLeft+e.clientX-startX));const top=Math.max(8,Math.min(innerHeight-size-8,startTop+e.clientY-startY));menu.style.left=left+'px';menu.style.right='auto';menu.style.top=top+'px'});
 function end(e){clearTimeout(pressTimer);if(dragging&&(e==null||e.pointerId===activePointer)){dragging=false;menu.classList.remove('menu-dragging');save();if(typeof markDirty==='function')markDirty('Menü-Button angepasst – noch online speichern');setTimeout(()=>{suppressClick=false},120)}activePointer=null}
 menu.addEventListener('pointerup',end);menu.addEventListener('pointercancel',e=>{if(dragging){/* Android may emit pointercancel while a touch drag is active; keep the last valid position. */}end(e)});
 menu.addEventListener('contextmenu',e=>{if(document.body.classList.contains('editing'))e.preventDefault()});
 menu.addEventListener('dragstart',e=>e.preventDefault());
 menu.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();return}if(!document.body.classList.contains('editing')){e.preventDefault();e.stopImmediatePropagation();document.querySelector('#nav')?.classList.toggle('open')}} ,true);
 function resize(delta){select();const r=menu.getBoundingClientRect(),size=Math.max(44,Math.min(88,r.width+delta));menu.style.setProperty('--menu-size',size+'px');save();if(typeof markDirty==='function')markDirty('Menügröße geändert – noch online speichern')}
 document.querySelector('#menuSmaller')?.addEventListener('click',()=>resize(-6));document.querySelector('#menuLarger')?.addEventListener('click',()=>resize(6));document.querySelector('#menuReset')?.addEventListener('click',()=>{localStorage.removeItem(KEY);menu.removeAttribute('style');select();if(typeof markDirty==='function')markDirty('Menüposition zurückgesetzt – noch online speichern')});
 const originalSetEditable=window.setEditable;window.setEditable=on=>{if(!on)deselect();originalSetEditable(on)};
 window.kpMenuLayout={get:current,apply(v){apply(v||{})},reset(){localStorage.removeItem(KEY);menu.removeAttribute('style')}};
 apply();
})();