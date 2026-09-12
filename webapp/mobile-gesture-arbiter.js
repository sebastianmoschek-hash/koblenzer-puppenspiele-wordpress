(()=>{
'use strict';
let multi=false;
const editing=()=>document.body.classList.contains('editing');
function two(e){return editing()&&e.touches&&e.touches.length>=2&&!!e.target.closest('img,[data-kp-background-image]')}
/*
 * Gesture ownership is intentionally passive here. Individual editors decide
 * when scrolling must be cancelled. In particular, do not write inline
 * touch-action values: those survive longer than a gesture and can make the
 * page feel locked after selection/undo/restore on Android.
 */
document.addEventListener('touchstart',e=>{if(two(e)){multi=true;document.body.classList.add('kp-two-finger-edit');window.dispatchEvent(new CustomEvent('kp-two-finger-start'))}},{capture:true,passive:true});
document.addEventListener('touchend',e=>{if(multi&&(!e.touches||e.touches.length<2)){multi=false;document.body.classList.remove('kp-two-finger-edit');window.dispatchEvent(new CustomEvent('kp-two-finger-end'))}},{capture:true,passive:true});
document.addEventListener('touchcancel',()=>{multi=false;document.body.classList.remove('kp-two-finger-edit');window.dispatchEvent(new CustomEvent('kp-two-finger-end'))},{capture:true,passive:true});
window.addEventListener('kp-editor-restored',()=>{multi=false;document.body.classList.remove('kp-two-finger-edit')});
})();