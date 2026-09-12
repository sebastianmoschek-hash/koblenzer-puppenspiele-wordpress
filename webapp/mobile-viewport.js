(()=>{
'use strict';
if(!matchMedia('(max-width:760px)').matches)return;
const root=document.documentElement;let raf=0;
function syncViewport(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const vv=window.visualViewport;if(!vv){root.style.setProperty('--kp-editor-bottom','max(12px, env(safe-area-inset-bottom))');return}const layoutH=document.documentElement.clientHeight||window.innerHeight;const visualBottom=Math.max(0,layoutH-(vv.offsetTop+vv.height));root.style.setProperty('--kp-editor-bottom',`calc(${Math.round(visualBottom)}px + max(12px, env(safe-area-inset-bottom)))`);root.style.setProperty('--kp-visual-top',Math.round(vv.offsetTop)+'px');root.style.setProperty('--kp-visual-height',Math.round(vv.height)+'px')})}
syncViewport();window.addEventListener('resize',syncViewport,{passive:true});window.addEventListener('orientationchange',syncViewport,{passive:true});window.addEventListener('scroll',syncViewport,{passive:true});if(window.visualViewport){window.visualViewport.addEventListener('resize',syncViewport,{passive:true});window.visualViewport.addEventListener('scroll',syncViewport,{passive:true})}
})();
