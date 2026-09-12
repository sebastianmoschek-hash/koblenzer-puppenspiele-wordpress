(()=>{
const nav=document.querySelector('#nav'),brand=document.querySelector('.brand'),menu=document.querySelector('#menu');
if(!nav||!brand)return;
const editing=()=>document.body.classList.contains('editing');
const checkpoint=()=>window.__kpUndoCheckpoint?.();
const dirty=m=>window.markDirty?.(m)||window.dispatchEvent(new CustomEvent('kp-site-changed'));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>(s||'seite').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'seite';
const styles=['klassisch','modern','minimalistisch','rund','farbig','dunkel','transparent','gross','karten','theater'];let styleIndex=0;
function commit(msg,done){done?.();dirty(msg);}
function setInline(el){if(!editing())return;el.contentEditable='true';el.spellcheck=true;el.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)}
function finishInline(el,before,msg){el.contentEditable='false';const text=el.textContent.trim();if(!text)el.textContent=before||'Menüpunkt';if(el.textContent!==before)commit(msg,before?window.__kpUndoCheckpoint?.():null)}
function wireLink(a){if(a.dataset.kpDirectMenu)return;a.dataset.kpDirectMenu='1';let startX=0,startY=0,moved=false;
 a.addEventListener('click',e=>{if(!editing())return;e.preventDefault();e.stopPropagation();if(moved){moved=false;return}const before=a.textContent;const done=checkpoint();setInline(a);const end=()=>{a.removeEventListener('blur',end);a.contentEditable='false';if(!a.textContent.trim())a.textContent=before;done?.();dirty('Menütext geändert – noch speichern')};a.addEventListener('blur',end);});
 a.addEventListener('pointerdown',e=>{if(!editing()||a.isContentEditable)return;startX=e.clientX;startY=e.clientY;moved=false});
 a.addEventListener('pointerup',e=>{if(!editing()||a.isContentEditable)return;const dx=e.clientX-startX,dy=e.clientY-startY;if(Math.abs(dy)>42&&Math.abs(dy)>Math.abs(dx)){moved=true;const done=checkpoint(),sib=dy<0?a.previousElementSibling:a.nextElementSibling;if(sib?.matches('a')){dy<0?nav.insertBefore(a,sib):nav.insertBefore(sib,a);done?.();dirty('Menü sortiert – noch speichern')}}});
}
function wire(){nav.querySelectorAll(':scope>a').forEach(wireLink)}
function addControls(){if(document.querySelector('#kpNavDirectTools'))return;const box=document.createElement('div');box.id='kpNavDirectTools';box.innerHTML='<button type="button" data-add>＋ Seite</button><button type="button" data-design>✦ Design</button><button type="button" data-delete>⌫</button><span data-style>Klassisch</span>';nav.append(box);
 box.querySelector('[data-add]').onclick=e=>{e.stopPropagation();const title='Neue Seite',id=slug(title)+'-'+Date.now().toString().slice(-5),done=checkpoint(),a=document.createElement('a');a.href='#'+id;a.textContent=title;nav.insertBefore(a,box);const sec=document.createElement('section');sec.id=id;sec.innerHTML='<div class="wrap"><p class="eyebrow">Neue Seite</p><h2>'+esc(title)+'</h2><p>Hier den Inhalt direkt bearbeiten.</p></div>';document.querySelector('main')?.append(sec);wireLink(a);window.wireEditable?.();window.wireSections?.();done?.();dirty('Neue Seite mit Seitenabschnitt erstellt – noch speichern');setInline(a)};
 box.querySelector('[data-design]').onclick=e=>{e.stopPropagation();applyStyle((styleIndex+1)%styles.length)};
 box.querySelector('[data-delete]').onclick=e=>{e.stopPropagation();const a=[...nav.querySelectorAll(':scope>a')].find(x=>x.isContentEditable)||nav.querySelector(':scope>a:last-of-type');if(!a)return;const done=checkpoint(),id=(a.getAttribute('href')||'').replace(/^#/,'');if(confirm('Menüpunkt und verknüpften Seitenabschnitt löschen?\n\nOK = beides löschen\nAbbrechen = nichts löschen')){a.remove();document.getElementById(id)?.remove();done?.();dirty('Menüpunkt und Seitenabschnitt gelöscht – noch speichern')}};
}
function applyStyle(i){styleIndex=(i+styles.length)%styles.length;styles.forEach(s=>nav.classList.remove('kp-menu-'+s));nav.classList.add('kp-menu-'+styles[styleIndex]);document.querySelector('#kpNavDirectTools [data-style]')?.replaceChildren(document.createTextNode(styles[styleIndex][0].toUpperCase()+styles[styleIndex].slice(1)));dirty('Menüdesign geändert – noch speichern')}
let sx=0,sy=0;nav.addEventListener('pointerdown',e=>{if(editing()&&!e.target.closest('a,button')){sx=e.clientX;sy=e.clientY}});nav.addEventListener('pointerup',e=>{if(!editing()||e.target.closest('a,button'))return;const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy))applyStyle(styleIndex+(dx<0?1:-1))});
brand.addEventListener('click',e=>{if(!editing())return;e.preventDefault();e.stopPropagation();const before=brand.textContent,done=checkpoint();setInline(brand);brand.onblur=()=>{brand.contentEditable='false';if(!brand.textContent.trim())brand.textContent=before;done?.();dirty('Headertext geändert – noch speichern')}});
menu?.addEventListener('click',e=>{if(editing()){e.preventDefault();e.stopPropagation();nav.classList.toggle('open');addControls();wire()}},true);
const obs=new MutationObserver(()=>{if(editing()&&nav.classList.contains('open')){addControls();wire()}});obs.observe(document.body,{attributes:true,attributeFilter:['class'],subtree:false});
wire();
})();