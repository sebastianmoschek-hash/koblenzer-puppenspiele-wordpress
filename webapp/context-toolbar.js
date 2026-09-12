(()=>{
 'use strict';
 let selected=null;
 const bar=document.createElement('div');
 bar.id='kpContextToolbar';
 bar.hidden=true;
 bar.innerHTML='<button type="button" data-context-design>🎨 Design</button>';
 document.body.appendChild(bar);
 function position(){if(!selected||!document.body.contains(selected)){bar.hidden=true;return}const r=selected.getBoundingClientRect();bar.style.left=Math.max(8,Math.min(innerWidth-150,r.left+r.width/2-75))+'px';bar.style.top=Math.max(8,r.top-58)+'px'}
 window.addEventListener('kp-element-selected',e=>{selected=e.detail?.element||null;bar.hidden=!selected;position()});
 window.addEventListener('kp-editor-restored',()=>{selected=null;bar.hidden=true});
 window.addEventListener('scroll',position,{passive:true});window.addEventListener('resize',position,{passive:true});
 bar.querySelector('[data-context-design]').onclick=e=>{e.preventDefault();e.stopPropagation();window.dispatchEvent(new CustomEvent('kp-element-activate',{detail:{element:selected}}))};
})();
