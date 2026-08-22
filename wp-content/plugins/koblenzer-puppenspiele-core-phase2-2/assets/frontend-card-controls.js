(() => {
  'use strict';
  const cfg = window.KPFrontendCardControls;
  if (!cfg) return;

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const clone = v => JSON.parse(JSON.stringify(v ?? null));
  const pathKey = (url) => { try { const path = new URL(url, window.location.href).pathname.replace(/^\/+|\/+$/g, ''); return '/' + path + '/'; } catch (e) { return ''; } };
  function cardPermalink(card) { return card?.querySelector('h3 a')?.getAttribute('href') || card?.querySelector('.kp-repertoire-image')?.getAttribute('href') || ''; }
  function cardByPath(path){ return [...document.querySelectorAll('.kp-repertoire-card')].find(card=>pathKey(cardPermalink(card))===path)||null; }
  function roleAnchor(card,role){ const actions=[...card.querySelectorAll('.kp-repertoire-card-actions .kp-termine-button')]; return role==='more'?actions.find(a=>a.classList.contains('kp-termine-button-outline')):actions.find(a=>!a.classList.contains('kp-termine-button-outline')); }

  function applyButtonOverrides() {
    document.querySelectorAll('.kp-repertoire-card').forEach(card => {
      const ov = cfg.overrides?.[pathKey(cardPermalink(card))]; if (!ov) return;
      const more = roleAnchor(card,'more'), book=roleAnchor(card,'book');
      if (more) { if (ov.more_label) more.textContent=ov.more_label; if (ov.more_url) more.setAttribute('href',ov.more_url); }
      if (book) { if (ov.book_label) book.textContent=ov.book_label; if (ov.book_url) book.setAttribute('href',ov.book_url); }
    });
  }
  applyButtonOverrides();
  if (!cfg.editMode) return;

  const base=window.KPFrontendEditorV2||{};
  let sheet=null,dirty=false,saving=null;
  const pendingButtons=new Map(),pendingImages=new Map(),history=[],redo=[];
  const MAX=50;

  function notice(text,type=''){let el=document.querySelector('.kp-fe-card-notice');if(!el){el=document.createElement('div');el.className='kp-fe-card-notice';document.body.appendChild(el);}el.textContent=text;el.className='kp-fe-card-notice is-visible'+(type?' is-'+type:'');clearTimeout(notice.t);notice.t=setTimeout(()=>el.classList.remove('is-visible'),2400);}
  function markDirty(){dirty=true;document.querySelector('.kp-fe2-save')?.classList.add('is-dirty');}
  async function post(action,fields={}){const fd=new FormData();fd.append('action',action);fd.append('nonce',cfg.nonce||base.nonce||'');Object.entries(fields).forEach(([key,value])=>fd.append(key,typeof value==='string'?value:JSON.stringify(value)));const res=await fetch(cfg.ajaxUrl||base.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd});const json=await res.json().catch(()=>null);if(!res.ok||!json?.success)throw new Error(json?.data?.message||'Aktion fehlgeschlagen');return json.data||{};}
  function recordSignature(card){return{title:card.querySelector('h3')?.textContent.trim()||'',href:cardPermalink(card)}}
  async function resolveRecord(card){return post('kp_fe_v2_record',{type:'repertoire',signature:recordSignature(card)});}
  function closeSheet(){if(sheet)sheet.remove();sheet=null;}

  function buttonState(card,record,role){const path=pathKey(cardPermalink(card)),anchor=roleAnchor(card,role),key=path+'|'+role;return{type:'button',key,path,id:Number(record.id)||0,role,label:anchor?.textContent?.trim()||'',url:anchor?.getAttribute('href')||'',pending:clone(pendingButtons.get(key)||null)};}
  function imageState(card,record){const path=pathKey(cardPermalink(card)),img=card.querySelector('.kp-repertoire-image img');return{type:'image',key:path,path,id:Number(record.id)||0,src:img?.getAttribute('src')||'',alt:img?.getAttribute('alt')||'',attachment_id:Number(pendingImages.get(path)?.attachment_id)||0,pending:clone(pendingImages.get(path)||null)};}
  function applyState(state){
    if(!state)return false;const card=cardByPath(state.path);if(!card)return false;
    if(state.type==='button'){
      const anchor=roleAnchor(card,state.role);if(!anchor)return false;anchor.textContent=state.label||'';anchor.setAttribute('href',state.url||'#');
      cfg.overrides[state.path]=cfg.overrides[state.path]||{};cfg.overrides[state.path][state.role+'_label']=state.label||'';cfg.overrides[state.path][state.role+'_url']=state.url||'';
      if(state.pending)pendingButtons.set(state.key,clone(state.pending));else pendingButtons.delete(state.key);
    }else{
      const img=card.querySelector('.kp-repertoire-image img');if(!img)return false;img.src=state.src||'';img.alt=state.alt||'';img.removeAttribute('srcset');img.removeAttribute('sizes');
      if(state.pending)pendingImages.set(state.key,clone(state.pending));else pendingImages.delete(state.key);
    }
    markDirty();return true;
  }
  function pushHistory(before,after){history.push({before:clone(before),after:clone(after)});if(history.length>MAX)history.shift();redo.length=0;window.KPWordHistory?.push?.('card');window.dispatchEvent(new CustomEvent('kp:card-history-change'));}
  function undo(){const e=history.pop();if(!e)return false;if(!applyState(e.before)){history.push(e);return false;}redo.push(e);return true;}
  function redoStep(){const e=redo.pop();if(!e)return false;if(!applyState(e.after)){redo.push(e);return false;}history.push(e);return true;}
  function clearRedo(){redo.length=0;}

  async function editButton(card,anchor,role){
    notice('Button wird geöffnet …');
    try {
      const record=await resolveRecord(card);closeSheet();sheet=document.createElement('div');sheet.className='kp-fe-card-sheet-backdrop';
      sheet.innerHTML=`<div class="kp-fe-card-sheet" role="dialog" aria-modal="true" aria-label="Button bearbeiten"><div class="kp-fe-card-sheet-head"><div><strong>Button bearbeiten</strong><small>${role==='more'?'„Mehr erfahren“-Button':'„Buchen“-Button'} von ${esc(record.title)}</small></div><button type="button" class="kp-fe-card-sheet-close" aria-label="Schließen">×</button></div><label>Beschriftung<input type="text" class="kp-fe-card-label" value="${esc(anchor.textContent.trim())}"></label><label>Link-Ziel<input type="text" inputmode="url" class="kp-fe-card-url" value="${esc(anchor.getAttribute('href')||'')}"></label><p class="kp-fe-card-help">Die Änderung wird sofort als Vorschau gezeigt. Dauerhaft wird sie erst mit dem orangefarbenen Speichern-Button.</p><div class="kp-fe-card-sheet-actions"><button type="button" class="kp-fe-card-cancel">Abbrechen</button><button type="button" class="kp-fe-card-save">Übernehmen</button></div></div>`;
      document.body.appendChild(sheet);const close=()=>closeSheet();sheet.querySelector('.kp-fe-card-sheet-close').onclick=close;sheet.querySelector('.kp-fe-card-cancel').onclick=close;sheet.addEventListener('click',e=>{if(e.target===sheet)close()});
      sheet.querySelector('.kp-fe-card-save').onclick=()=>{const label=sheet.querySelector('.kp-fe-card-label').value.trim(),url=sheet.querySelector('.kp-fe-card-url').value.trim(),before=buttonState(card,record,role),path=before.path,key=before.key;anchor.textContent=label;anchor.setAttribute('href',url||'#');cfg.overrides[path]=cfg.overrides[path]||{};cfg.overrides[path][role+'_label']=label;cfg.overrides[path][role+'_url']=url;pendingButtons.set(key,{id:String(record.id),role,label,url});const after=buttonState(card,record,role);markDirty();pushHistory(before,after);closeSheet();notice('Button geändert – noch speichern ✓','ok');};
      setTimeout(()=>sheet.querySelector('.kp-fe-card-label')?.focus(),60);
    }catch(err){notice(err.message||'Stück konnte nicht gefunden werden.','error');}
  }

  async function replaceImage(card){
    if(!window.wp?.media){notice('Mediathek konnte nicht geöffnet werden.','error');return;}notice('Bildauswahl wird geöffnet …');
    try{const record=await resolveRecord(card),frame=wp.media({title:'Titelbild auswählen',button:{text:'Dieses Bild verwenden'},multiple:false,library:{type:'image'}});frame.on('select',()=>{const attachment=frame.state().get('selection').first().toJSON(),before=imageState(card,record),path=before.path,img=card.querySelector('.kp-repertoire-image img');if(img){img.src=attachment.url;img.alt=attachment.alt||attachment.title||record.title||'';img.removeAttribute('srcset');img.removeAttribute('sizes');}pendingImages.set(path,{id:String(record.id),attachment_id:String(attachment.id),src:attachment.url,alt:attachment.alt||attachment.title||record.title||''});const after=imageState(card,record);markDirty();pushHistory(before,after);notice('Bild geändert – noch speichern ✓','ok');});frame.open();}catch(err){notice(err.message||'Stück konnte nicht gefunden werden.','error');}
  }

  async function flush(){
    if(!dirty)return{draft:false};if(saving)return saving;
    saving=(async()=>{for(const item of pendingButtons.values()){const data=await post('kp_frontend_card_button_save',{id:item.id,role:item.role,label:item.label,url:item.url});item.label=data.label||item.label;item.url=data.url||item.url;}for(const item of pendingImages.values())await post('kp_frontend_card_image_save',{id:item.id,attachment_id:item.attachment_id});pendingButtons.clear();pendingImages.clear();dirty=false;history.length=0;redo.length=0;return{success:true};})().finally(()=>{saving=null});return saving;
  }
  const runtime={flush,isDirty:()=>dirty,undo,redo:redoStep,clearRedo,counts:()=>({undo:history.length,redo:redo.length})};window.KPCardDraftRuntime=runtime;
  function register(){if(window.KPWordHistory?.register){window.KPWordHistory.register('card',()=>runtime);return true}return false}register();setInterval(register,500);

  window.addEventListener('click',e=>{
    if(window.KPTouchGestureRuntime?.suppressClick?.()){e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.target.closest('.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-fe-card-sheet-backdrop,#wpadminbar'))return;
    const card=e.target.closest('.kp-repertoire-card');if(!card)return;
    const image=e.target.closest('.kp-repertoire-image');if(image){e.preventDefault();e.stopPropagation();replaceImage(card);return;}
    const action=e.target.closest('.kp-repertoire-card-actions .kp-termine-button');if(action){e.preventDefault();e.stopPropagation();editButton(card,action,action.classList.contains('kp-termine-button-outline')?'more':'book');return;}
    const link=e.target.closest('a[href]');if(link)e.preventDefault();
  },true);
  function setHint(){const hint=document.querySelector('.kp-fe2-hint');if(hint)hint.textContent='Text antippen = bearbeiten · Bild antippen = ändern · Button antippen = ändern · orange Speichern = alles sichern';}
  setHint();document.addEventListener('DOMContentLoaded',setHint);window.addEventListener('load',()=>setTimeout(setHint,0));
})();