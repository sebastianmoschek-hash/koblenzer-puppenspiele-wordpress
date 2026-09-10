(()=>{
 const menu=document.querySelector('#menu'), tools=document.querySelector('#menuTools'), context=document.querySelector('#editorContext');
 if(!menu)return;
 const KEY='kp-menu-layout-v1'; let pressTimer=null,dragging=false,startX=0,startY=0,startLeft=0,startTop=0;
 function layout(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}}
 function apply(v=layout()){if(v.size)menu.style.setProperty('--menu-size',v.size+'px');if(Number.isFinite(v.left)){menu.style.left=v.left+'px';menu.style.right='auto'}if(Number.isFinite(v.top))menu.style.top=v.top+'px'}
 function save(){const r=menu.getBoundingClientRect();localStorage.setItem(KEY,JSON.stringify({left:r.left,top:r.top,size:r.width}))}
 function select(){if(!document.body.classList.contains('editing'))return;menu.classList.add('menu-selected');if(tools)tools.hidden=false;if(context)context.textContent='Menü-Button';setStatus('Ziehen zum Verschieben · Größe unten ändern')}
 function deselect(){menu.classList.remove('menu-selected');if(tools)tools.hidden=true}
 menu.addEventListener('pointerdown',e=>{if(!document.body.classList.contains('editing'))return;pressTimer=setTimeout(()=>{select();dragging=true;const r=menu.getBoundingClientRect();startX=e.clientX;startY=e.clientY;startLeft=r.left;startTop=r.top;menu.setPointerCapture?.(e.pointerId)},420)});
 menu.addEventListener('pointermove',e=>{if(!dragging)return;e.preventDefault();const size=menu.getBoundingClientRect().width;const left=Math.max(8,Math.min(innerWidth-size-8,startLeft+e.clientX-startX));const top=Math.max(8,Math.min(innerHeight-size-8,startTop+e.clientY-startY));menu.style.left=left+'px';menu.style.right='auto';menu.style.top=top+'px'});
 function end(){clearTimeout(pressTimer);if(dragging){dragging=false;save();markDirty('Menü-Button angepasst – noch online speichern')}}
 menu.addEventListener('pointerup',end);menu.addEventListener('pointercancel',end);
 function resize(delta){select();const r=menu.getBoundingClientRect(),size=Math.max(44,Math.min(88,r.width+delta));menu.style.setProperty('--menu-size',size+'px');save();markDirty('Menügröße geändert – noch online speichern')}
 document.querySelector('#menuSmaller')?.addEventListener('click',()=>resize(-6));document.querySelector('#menuLarger')?.addEventListener('click',()=>resize(6));document.querySelector('#menuReset')?.addEventListener('click',()=>{localStorage.removeItem(KEY);menu.removeAttribute('style');select();markDirty('Menüposition zurückgesetzt – noch online speichern')});
 const originalSetEditable=window.setEditable;window.setEditable=on=>{if(!on)deselect();originalSetEditable(on)};
 apply();
})();