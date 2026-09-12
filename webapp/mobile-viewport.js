(()=>{
'use strict';
if(!matchMedia('(max-width:760px)').matches)return;
const root=document.documentElement;
function syncViewport(){
  const vv=window.visualViewport;
  if(!vv){root.style.setProperty('--kp-editor-bottom','max(16px, env(safe-area-inset-bottom))');return}
  const hiddenBelow=Math.max(0,window.innerHeight-vv.height-vv.offsetTop);
  root.style.setProperty('--kp-editor-bottom',`calc(${Math.round(hiddenBelow)}px + max(16px, env(safe-area-inset-bottom)))`);
}
syncViewport();
window.addEventListener('resize',syncViewport,{passive:true});
window.addEventListener('orientationchange',syncViewport,{passive:true});
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',syncViewport,{passive:true});
  window.visualViewport.addEventListener('scroll',syncViewport,{passive:true});
}
})();
