(()=>{
'use strict';
if(!matchMedia('(max-width:760px)').matches)return;
const editor=document.getElementById('editor');
if(!editor)return;
const bar=document.createElement('div');
bar.id='androidEditorBar';
bar.innerHTML='<button type="button" data-action="save">☁ Speichern</button><button type="button" data-action="undo">↶</button><button type="button" data-action="redo">↷</button><button type="button" data-action="add">＋</button><button type="button" data-action="done">✓ Fertig</button>';
document.body.appendChild(bar);
const map={save:'cloudSave',undo:'undo',redo:'redo',add:'addSection',done:'close'};
function sync(){bar.hidden=editor.hidden;for(const b of bar.querySelectorAll('button')){const original=document.getElementById(map[b.dataset.action]);b.disabled=!!original?.disabled}}
function fire(e){const b=e.target.closest('button[data-action]');if(!b||b.disabled)return;e.preventDefault();e.stopPropagation();const original=document.getElementById(map[b.dataset.action]);if(original)original.click();setTimeout(sync,0)}
bar.addEventListener('click',fire,true);
bar.addEventListener('touchend',fire,{capture:true,passive:false});
new MutationObserver(sync).observe(editor,{attributes:true,attributeFilter:['hidden']});
new MutationObserver(sync).observe(editor,{subtree:true,attributes:true,attributeFilter:['disabled']});
sync();
})();
