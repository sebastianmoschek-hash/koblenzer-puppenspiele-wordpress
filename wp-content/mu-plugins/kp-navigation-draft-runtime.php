<?php
/**
 * Canva-style draft navigation editing.
 *
 * The original owner navigation dialog persisted immediately and lived outside
 * the global Undo/Save contract. This runtime intercepts that dialog in edit
 * mode: every navigation action previews instantly and is undoable, while only
 * the central orange Save persists the draft.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-navigation-draft-runtime">
    (()=>{
      'use strict';
      const cfg=window.KPOwnerWebApp;if(!cfg?.editMode||!cfg?.canEdit)return;
      const clone=v=>JSON.parse(JSON.stringify(v||[])),q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
      const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
      const MAX=50,history=[],redo=[];
      let current=clone(Array.isArray(cfg.navigation)?cfg.navigation:[]),saved=clone(current),dirty=false,saving=null,gesture=null;

      function canonical(raw){try{const u=new URL(raw||'/',location.href);return u.origin===location.origin?u.pathname.replace(/\/+$/,'/')+u.search:u.href}catch(_){return String(raw||'/')}}
      function navRoots(){return qa('.kp-site-nav .wp-block-navigation__container').filter((root,index,all)=>!all.some((other,oi)=>oi!==index&&other.contains(root)))}
      function createItem(item){const li=document.createElement('li');li.className='wp-block-navigation-item wp-block-navigation-link';li.innerHTML=`<a class="wp-block-navigation-item__content" href="${esc(item.url||'/')}"><span class="wp-block-navigation-item__label">${esc(item.label||'Menüpunkt')}</span></a>`;return li}
      function applyNavigation(items){
        navRoots().forEach(root=>{
          const existing=[...root.children].filter(el=>el.matches('.wp-block-navigation-item')),pool=new Map();
          existing.forEach(el=>{const a=el.querySelector('a[href]');if(a)pool.set(canonical(a.getAttribute('href')),el)});
          const ordered=items.map(item=>{
            let el=pool.get(canonical(item.url));if(!el)el=createItem(item);
            const a=el.querySelector('a[href]');if(a){a.setAttribute('href',item.url||'/');const label=a.querySelector('.wp-block-navigation-item__label');if(label)label.textContent=item.label||'Menüpunkt';else a.textContent=item.label||'Menüpunkt';}
            return el;
          });
          root.replaceChildren(...ordered);
        });
      }
      function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
      function mark(){dirty=!same(current,saved);q('.kp-fe2-save')?.classList.toggle('is-dirty',dirty||!!window.KPOwnerSaveRegistry?.isDirty?.());}
      function openBox(){return q('.kp-oa-sheet')}
      function closeSheet(){q('.kp-oa-backdrop')?.classList.remove('is-open');document.body.classList.remove('kp-oa-open');gesture=null}
      function applyState(state){current=clone(state);applyNavigation(current);mark();renderIfOpen();return true}
      function push(before,after){if(same(before,after))return false;const entry={before:clone(before),after:clone(after)};history.push(entry);if(history.length>MAX)history.shift();redo.length=0;window.KPWordHistory?.push?.('navigation');return entry}
      function undo(){const e=history.pop();if(!e)return false;applyState(e.before);redo.push(e);if(redo.length>MAX)redo.shift();return true}
      function redoStep(){const e=redo.pop();if(!e)return false;applyState(e.after);history.push(e);if(history.length>MAX)history.shift();return true}
      function clearRedo(){redo.length=0}

      function renderRows(){
        const list=q('.kp-nav-draft-list',openBox());if(!list)return;
        list.innerHTML=current.map((item,i)=>`<div class="kp-oa-nav-row" data-kp-nav-index="${i}"><div class="kp-oa-nav-move"><button type="button" data-kp-nav-move="-1" ${i===0?'disabled':''}>↑</button><button type="button" data-kp-nav-move="1" ${i===current.length-1?'disabled':''}>↓</button></div><label>Name<input data-kp-nav-field="label" value="${esc(item.label||'')}"></label><label>Link<input data-kp-nav-field="url" value="${esc(item.url||'/')}"></label><button type="button" class="kp-oa-nav-delete" data-kp-nav-delete title="Entfernen">×</button></div>`).join('');
        qa('[data-kp-nav-index]',list).forEach(row=>{
          const index=()=>Number(row.dataset.kpNavIndex);
          qa('[data-kp-nav-field]',row).forEach(input=>{
            const begin=()=>{if(!gesture||gesture.input!==input)gesture={input,before:clone(current),entry:null}};
            input.addEventListener('pointerdown',begin);input.addEventListener('focusin',begin);
            input.addEventListener('input',()=>{
              begin();const i=index(),key=input.dataset.kpNavField;if(!current[i])return;current[i][key]=input.value;applyNavigation(current);mark();
              if(!gesture.entry)gesture.entry=push(gesture.before,current);else gesture.entry.after=clone(current);
            });
            const end=()=>{gesture=null};input.addEventListener('change',end);input.addEventListener('focusout',end);input.addEventListener('pointerup',end);input.addEventListener('pointercancel',end);
          });
          qa('[data-kp-nav-move]',row).forEach(btn=>btn.addEventListener('click',()=>{const i=index(),j=i+Number(btn.dataset.kpNavMove);if(j<0||j>=current.length)return;const before=clone(current);[current[i],current[j]]=[current[j],current[i]];applyNavigation(current);mark();push(before,current);renderRows()}));
          q('[data-kp-nav-delete]',row)?.addEventListener('click',()=>{const i=index(),before=clone(current);current.splice(i,1);applyNavigation(current);mark();push(before,current);renderRows()});
        });
      }
      function renderIfOpen(){if(q('[data-kp-navigation-draft]',openBox()))renderRows()}
      function openNavigation(){
        const box=openBox();if(!box)return;
        // data-kp-word-history-new tells the generic owner-control history to
        // ignore these inputs. Navigation owns its own before/after snapshots,
        // so one typing gesture creates exactly one global ↶ marker.
        box.className='kp-oa-sheet';box.innerHTML=`<div data-kp-navigation-draft="1" data-kp-word-history-new="navigation"><div class="kp-oa-head"><div><span class="kp-oa-kicker">Menü</span><h2>Navigation</h2><p>Änderungen erscheinen sofort als Vorschau. ↶/↷ funktioniert direkt; dauerhaft wird alles erst mit dem orangefarbenen Speichern-Button.</p></div><button type="button" class="kp-oa-close" data-kp-nav-close>×</button></div><div class="kp-oa-nav-list kp-nav-draft-list"></div><div class="kp-oa-actions"><button type="button" class="kp-oa-secondary" data-kp-nav-add>＋ Menüpunkt</button><button type="button" class="kp-oa-primary" data-kp-nav-done>Fertig</button></div></div>`;
        renderRows();
        q('[data-kp-nav-close]',box)?.addEventListener('click',closeSheet);q('[data-kp-nav-done]',box)?.addEventListener('click',closeSheet);
        q('[data-kp-nav-add]',box)?.addEventListener('click',()=>{const before=clone(current);current.push({label:'Neue Seite',url:'/'});applyNavigation(current);mark();push(before,current);renderRows()});
      }

      window.addEventListener('click',e=>{
        const t=e.target instanceof Element?e.target:null;if(!t)return;
        const nav=t.closest('[data-action="nav"]');if(!nav)return;
        e.preventDefault();e.stopImmediatePropagation();openNavigation();
      },true);

      async function flush(){
        if(!dirty)return{draft:false};if(saving)return saving;
        saving=(async()=>{const fd=new FormData();fd.append('action','kp_owner_nav_save');fd.append('nonce',cfg.nonce||'');fd.append('items',JSON.stringify(current));const r=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const j=await r.json().catch(()=>null);if(!r.ok||!j?.success)throw new Error(j?.data?.message||'Navigation konnte nicht gespeichert werden.');current=clone(j.data?.items||current);saved=clone(current);cfg.navigation=clone(current);dirty=false;history.length=0;redo.length=0;applyNavigation(current);return j.data||{}})().finally(()=>{saving=null});return saving;
      }
      function discard(){current=clone(saved);dirty=false;history.length=0;redo.length=0;applyNavigation(current);renderIfOpen()}
      const runtime={flush,isDirty:()=>dirty,undo,redo:redoStep,clearRedo,discard,counts:()=>({undo:history.length,redo:redo.length})};window.KPNavigationDraftRuntime=runtime;
      function register(){if(window.KPWordHistory?.register){window.KPWordHistory.register('navigation',()=>runtime);return true}return false}register();setInterval(register,500);
    })();
    </script>
    <?php
}, 2125 );
