(()=>{
'use strict';
/* Selection and activation are owned by direct-manipulation.js and universal-editor.js.
   Keep this legacy module inert so a second floating Design button cannot overlap
   transform handles or compete for touch/click events. */
const old=document.getElementById('kpContextToolbar');
if(old)old.remove();
})();
