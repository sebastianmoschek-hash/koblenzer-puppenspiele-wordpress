<?php
/**
 * Draft/Undo bridge for the direct Termin/Stück editor dialogs.
 * Contextual "Übernehmen" updates the visible card only; the global orange
 * Save persists all pending records in one unified transaction.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-record-draft-runtime">
    (()=>{
      'use strict';
      const cfg=window.KPFrontendEditorV2;if(!cfg?.editMode)return;
      const pending=new Map(),history=[],redo=[];const MAX=50;
      let lastCard=null,saving=null;
      const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)],clone=v=>JSON.parse(JSON.stringify(v??null));
      function toast(text,type='ok'){let el=q('.kp-fe2-toast');if(!el)return;el.textContent=text;el.className=`kp-fe2-toast is-visible is-${type}`;clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('is-visible'),2200)}
      function markDirty(){q('.kp-fe2-save')?.classList.add('is-dirty')}
      function idFromDialog(box){const href=q('.kp-fe2-record-footer a[href*="post="]',box)?.href||'';try{return Number(new URL(href,location.href).searchParams.get('post'))||0}catch(_){return 0}}
      function typeFromDialog(box){const title=q('.kp-fe2-record-head h2',box)?.textContent||'';return /Termin/i.test(title)?'termin':/Stück/i.test(title)?'repertoire':''}
      function fieldsFromDialog(box){const fields={};qa('[data-f]',box).forEach(el=>{fields[el.dataset.f]=el.type==='checkbox'?!!el.checked:el.value});return fields}
      function keyOf(type,id){return `${type}:${id}`}
      function snapshotCard(card){return card?.isConnected?card.innerHTML:null}
      function restoreCard(card,html){if(card?.isConnected&&html!==null){card.innerHTML=html;window.KPCanvaKeys?.assign?.(card)}}
      function applyPreview(type,card,fields){if(!card?.isConnected)return;
        if(type==='termin'){
          const title=q('.kp-termin-main h3',card);if(title&&fields.title)title.textContent=fields.title;
          const city=q('.kp-termin-place strong',card);if(city&&fields.city!==undefined)city.textContent=fields.city;
          const time=q('.kp-termin-time',card);if(time&&fields.time)time.textContent=fields.time;
          if(fields.date){const d=new Date(`${fields.date}T12:00:00`);if(!Number.isNaN(d.getTime())){const weekday=q('.kp-termin-weekday',card),day=q('.kp-termin-date strong',card),month=q('.kp-termin-date > span:last-child',card);if(weekday)weekday.textContent=d.toLocaleDateString('de-DE',{weekday:'short'}).replace('.','');if(day)day.textContent=String(d.getDate()).padStart(2,'0');if(month)month.textContent=d.toLocaleDateString('de-DE',{month:'short'}).replace('.','');}}
        }else{
          qa('h3,h3 a',card).forEach(el=>{if(fields.title)el.textContent=fields.title});
          const excerpt=q('.kp-repertoire-excerpt,.kp-repertoire-card-excerpt,.kp-repertoire-card-body p',card);if(excerpt&&fields.excerpt!==undefined)excerpt.textContent=fields.excerpt;
        }
      }
      function applyEntry(entry,which){const state=entry?.[which];if(!state)return false;restoreCard(entry.card,state.html);if(state.pending)pending.set(entry.key,clone(state.pending));else pending.delete(entry.key);markDirty();return true}
      function pushEntry(entry){history.push(entry);if(history.length>MAX)history.shift();redo.length=0;window.KPWordHistory?.push?.('record')}
      function undo(){const e=history.pop();if(!e)return false;if(!applyEntry(e,'before')){history.push(e);return false}redo.push(e);if(redo.length>MAX)redo.shift();return true}
      function redoStep(){const e=redo.pop();if(!e)return false;if(!applyEntry(e,'after')){redo.push(e);return false}history.push(e);if(history.length>MAX)history.shift();return true}
      function clearRedo(){redo.length=0}
      async function post(item){const fd=new FormData();fd.append('action','kp_fe_v2_record_save');fd.append('nonce',cfg.nonce||'');fd.append('type',item.type);fd.append('id',String(item.id));fd.append('fields',JSON.stringify(item.fields));const r=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const j=await r.json().catch(()=>null);if(!r.ok||!j?.success)throw new Error(j?.data?.message||`${item.type==='termin'?'Termin':'Stück'} konnte nicht gespeichert werden.`);return j.data||{}}
      async function flush(){if(!pending.size)return{draft:false};if(saving)return saving;saving=(async()=>{for(const item of pending.values())await post(item);pending.clear();history.length=0;redo.length=0;return{success:true}})().finally(()=>{saving=null});return saving}
      const runtime={flush,isDirty:()=>pending.size>0,undo,redo:redoStep,clearRedo,counts:()=>({undo:history.length,redo:redo.length})};window.KPRecordDraftRuntime=runtime;
      function register(){if(window.KPWordHistory?.register){window.KPWordHistory.register('record',()=>runtime);return true}return false}register();setInterval(register,500);

      // Remember which visible card opened the dialog before FE2 handles the tap.
      window.addEventListener('click',e=>{const t=e.target instanceof Element?e.target:null;if(!t)return;const card=t.closest('.kp-termin-card,.kp-repertoire-card');if(card)lastCard=card},true);

      // Capture before the native target onclick. The dialog's contextual button
      // now means "apply to draft", not "write to WordPress right now".
      window.addEventListener('click',e=>{
        const t=e.target instanceof Element?e.target:null,button=t?.closest?.('.kp-fe2-record-main-save');if(!button)return;
        const box=button.closest('.kp-fe2-record');if(!box)return;const type=typeFromDialog(box),id=idFromDialog(box);if(!type||!id)return;
        e.preventDefault();e.stopImmediatePropagation();
        const fields=fieldsFromDialog(box),key=keyOf(type,id),card=lastCard?.isConnected?lastCard:null;
        const before={html:snapshotCard(card),pending:clone(pending.get(key)||null)};
        pending.set(key,{type,id,fields:clone(fields)});applyPreview(type,card,fields);
        const after={html:snapshotCard(card),pending:clone(pending.get(key))};pushEntry({key,card,before,after});markDirty();
        q('.kp-fe2-record-backdrop')?.classList.remove('is-open');box.innerHTML='';toast(`${type==='termin'?'Termin':'Stück'} geändert – noch speichern ✓`,'ok');
      },true);

      function relabel(){qa('.kp-fe2-record-main-save').forEach(btn=>{if(!/Übernehmen/i.test(btn.textContent||'')){btn.textContent='Übernehmen';btn.title='Änderung als Entwurf übernehmen – dauerhaft erst mit dem orangefarbenen Speichern-Button'}})}
      new MutationObserver(()=>requestAnimationFrame(relabel)).observe(document.documentElement,{childList:true,subtree:true});relabel();
    })();
    </script>
    <?php
}, 2150 );
