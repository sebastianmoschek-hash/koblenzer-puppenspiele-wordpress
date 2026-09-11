(()=>{
'use strict';
const editor=document.getElementById('editor');
if(!editor)return;
const ids=new Set(['cloudSave','undo','redo','addSection','close']);
function activate(e){
 const button=e.target.closest('button');
 if(!button||!ids.has(button.id)||button.disabled)return;
 if(e.type==='pointerup'&&e.pointerType==='mouse')return;
 e.preventDefault();
 e.stopPropagation();
 button.click();
}
editor.addEventListener('touchend',activate,{capture:true,passive:false});
})();
