(()=>{
'use strict';
let multi=false;
const editing=()=>document.body.classList.contains('editing');
function two(e){return editing()&&e.touches&&e.touches.length>=2&&!!e.target.closest('img,[data-kp-background-image]')}
document.addEventListener('touchstart',e=>{if(two(e)){multi=true;document.body.classList.add('kp-two-finger-edit');window.dispatchEvent(new CustomEvent('kp-two-finger-start'))}},{capture:true,passive:true});
document.addEventListener('touchend',e=>{if(multi&&(!e.touches||e.touches.length<2)){multi=false;document.body.classList.remove('kp-two-finger-edit');window.dispatchEvent(new CustomEvent('kp-two-finger-end'))}},{capture:true,passive:true});
document.addEventListener('touchcancel',()=>{multi=false;document.body.classList.remove('kp-two-finger-edit')},{capture:true,passive:true});
document.addEventListener('pointerdown',e=>{if(!editing()||e.pointerType!=='touch')return;const el=e.target.closest('main img,main a.btn,main a.ghost,main button,main h1,main h2,main h3,main h4,main h5,main h6,main p,main li,main article,main figure,.top .brand,.top img');if(el&&!el.classList.contains('kp-transform-moving'))el.style.setProperty('touch-action','pan-y','important')},true);
window.addEventListener('kp-two-finger-start',()=>{document.querySelectorAll('img,[data-kp-background-image]').forEach(el=>el.style.setProperty('touch-action','none','important'))});
window.addEventListener('kp-two-finger-end',()=>{document.querySelectorAll('main img,main a.btn,main a.ghost,main button,main h1,main h2,main h3,main h4,main h5,main h6,main p,main li,main article,main figure,.top .brand,.top img').forEach(el=>{if(!el.classList.contains('kp-transform-moving'))el.style.setProperty('touch-action','pan-y','important')})});
window.addEventListener('kp-editor-restored',()=>{if(editing())document.querySelectorAll('main img,main a.btn,main a.ghost,main button,main h1,main h2,main h3,main h4,main h5,main h6,main p,main li,main article,main figure,.top .brand,.top img').forEach(el=>el.style.setProperty('touch-action','pan-y','important'))});
})();