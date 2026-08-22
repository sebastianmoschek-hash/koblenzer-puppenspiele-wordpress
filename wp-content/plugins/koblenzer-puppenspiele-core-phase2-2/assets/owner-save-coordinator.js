(() => {
  'use strict';
  const cfg = window.KPOwnerWebApp;
  if (!cfg?.canEdit) return;

  const q = (s,r=document) => r.querySelector(s);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  let designDraft = {...(cfg.design || {})};
  let designDirty = false;
  let flushing = null;
  let replayDesignSave = false;
  let activeHistoryGroup = '';

  // All specialist runtimes use fetch/FormData. While one unified orange Save
  // is flushing, transparently attach one transaction id to every persistence
  // request so PHP can group them into exactly one undo checkpoint.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init={}) => {
    try {
      const body = init?.body;
      if (activeHistoryGroup && body instanceof FormData && !body.has('kp_history_group')) {
        const action = String(body.get('action') || '');
        if (/^kp_(owner_(design|sizes|menu_x|nav)_save|fe_v2_save|touch_(free_layout|gesture)_save|image_position_save|frontend_card_(image|button)_save|fe_v2_record_save)$/.test(action)) {
          body.append('kp_history_group', activeHistoryGroup);
        }
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };

  function toast(text,type='ok') {
    let el=q('.kp-oa-toast') || q('.kp-fe2-toast');
    if(!el){el=document.createElement('div');el.className='kp-oa-toast';document.body.appendChild(el);}
    el.textContent=text;
    el.className=(el.classList.contains('kp-fe2-toast')?'kp-fe2-toast':'kp-oa-toast')+' is-visible is-'+type;
    clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('is-visible'),2800);
  }

  function markDirty() {
    designDirty = true;
    q('.kp-fe2-save')?.classList.add('is-dirty');
  }

  function readDesignInput(input, shouldMarkDirty=true) {
    if (!input?.dataset?.design) return;
    const key=input.dataset.design;
    designDraft[key]=input.type==='checkbox'?(input.checked?1:0):(input.type==='range'?Number(input.value):input.value);
    if(shouldMarkDirty)markDirty();
  }

  function syncLiveDesignInputs() {
    qa('[data-design]').forEach(input=>readDesignInput(input,false));
  }

  function hasDesignChanges() {
    return designDirty || JSON.stringify(designDraft)!==JSON.stringify(cfg.design||{});
  }

  document.addEventListener('input',event=>{
    const input=event.target instanceof Element?event.target.closest('[data-design]'):null;
    if(input)readDesignInput(input);
  },true);
  document.addEventListener('change',event=>{
    const input=event.target instanceof Element?event.target.closest('[data-design]'):null;
    if(input)readDesignInput(input);
  },true);

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest('.kp-oa-design-reset')){
      designDraft={...(cfg.designDefaults||{})};
      markDirty();
    }
  },true);

  function wrapMedia() {
    if(!window.wp?.media || window.wp.media.__kpUnifiedWrapped) return;
    const original=window.wp.media;
    const wrapped=function(...args){
      const frame=original.apply(this,args);
      const options=args[0]||{};
      if(frame?.on && /Headerbild/i.test(String(options.title||''))){
        frame.on('select',()=>{
          try{
            const attachment=frame.state().get('selection').first().toJSON();
            designDraft.header_image_id=Number(attachment.id)||0;
            markDirty();
          }catch(_){ }
        });
      }
      return frame;
    };
    Object.assign(wrapped,original);
    wrapped.__kpUnifiedWrapped=true;
    window.wp.media=wrapped;
  }
  wrapMedia();
  new MutationObserver(wrapMedia).observe(document.documentElement,{childList:true,subtree:true});

  async function api(action,fields={}) {
    const fd=new FormData();
    fd.append('action',action);fd.append('nonce',cfg.nonce||'');
    Object.entries(fields).forEach(([k,v])=>fd.append(k,typeof v==='string'?v:JSON.stringify(v)));
    const response=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd});
    const json=await response.json().catch(()=>null);
    if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Speichern fehlgeschlagen.');
    return json.data||{};
  }

  async function flushDesign() {
    syncLiveDesignInputs();
    if(!hasDesignChanges())return {draft:false};
    const data=await api('kp_owner_design_save',{settings:designDraft});
    designDraft={...(data.settings||designDraft)};
    cfg.design={...designDraft};
    designDirty=false;
    return data;
  }

  function makeHistoryGroup(){
    const random = (globalThis.crypto?.getRandomValues)
      ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(2))).map(v=>v.toString(36)).join('')
      : Math.random().toString(36).slice(2);
    return `save-${Date.now().toString(36)}-${random}`.toLowerCase();
  }

  async function flushAll() {
    if(flushing)return flushing;
    flushing=(async()=>{
      activeHistoryGroup=makeHistoryGroup();
      try{
        await flushDesign();
        if(window.KPOwnerResponsiveRuntime?.flush)await window.KPOwnerResponsiveRuntime.flush();
        if(window.KPOwnerMenuXRuntime?.flush)await window.KPOwnerMenuXRuntime.flush();
        if(window.KPImagePositionRuntime?.flush)await window.KPImagePositionRuntime.flush();
        return {success:true};
      } finally {
        activeHistoryGroup='';
      }
    })().finally(()=>{flushing=null;});
    return flushing;
  }

  window.KPOwnerSaveRegistry={
    flushAll,
    isDirty:()=>hasDesignChanges()||!!window.KPOwnerResponsiveRuntime?.isDirty?.()||!!window.KPOwnerMenuXRuntime?.isDirty?.()||!!window.KPImagePositionRuntime?.isDirty?.()
  };

  document.addEventListener('click',async event=>{
    const button=event.target instanceof Element?event.target.closest('.kp-oa-design-save'):null;
    if(!button||replayDesignSave)return;
    event.preventDefault();event.stopImmediatePropagation();
    button.disabled=true;button.textContent='Speichert alles…';
    try{
      await flushAll();
      toast('Alle Designänderungen dauerhaft gespeichert ✓','ok');
      setTimeout(()=>location.reload(),450);
    }catch(error){
      button.disabled=false;button.textContent='Design speichern';
      toast(error?.message||'Design konnte nicht gespeichert werden.','error');
    }
  },true);

  function injectHistoryButtons() {
    const grid=q('.kp-oa-action-grid');
    if(!grid||grid.dataset.kpHistory==='1')return;
    grid.dataset.kpHistory='1';
    const undo=document.createElement('button');
    undo.type='button';undo.dataset.kpHistoryUndo='1';
    undo.innerHTML='<span>↶</span><strong>Speichern rückgängig</strong><small>Bis zu 10 Speicherungen zurück</small>';
    const versions=document.createElement('button');
    versions.type='button';versions.dataset.kpHistoryVersions='1';
    versions.innerHTML='<span>🕘</span><strong>Versionen</strong><small>Stände der letzten 48 Stunden</small>';
    grid.append(undo,versions);
  }

  async function undoSaved() {
    if(!confirm('Die letzte gespeicherte Änderung wirklich rückgängig machen?'))return;
    try{
      const data=await api('kp_owner_history_undo');
      toast(data.message||'Letzte Speicherung rückgängig ✓','ok');
      setTimeout(()=>location.reload(),450);
    }catch(error){toast(error.message,'error');}
  }

  function closeHistory() {
    q('.kp-oa-backdrop')?.classList.remove('is-open');
    document.body.classList.remove('kp-oa-open');
  }

  async function showVersions() {
    try{
      const data=await api('kp_owner_history_list');
      const items=Array.isArray(data.items)?data.items:[];
      const box=q('.kp-oa-sheet');
      const backdrop=q('.kp-oa-backdrop');
      if(!box||!backdrop)return;
      box.className='kp-oa-sheet kp-history-sheet';
      box.innerHTML=`<div class="kp-oa-head"><div><span class="kp-oa-kicker">Sicherheitsnetz</span><h2>Versionen – 48 Stunden</h2><p>Jede Speicherung wird kurzzeitig aufgehoben. Die neuesten ${Math.min(10,items.length)} Stände kannst du außerdem Schritt für Schritt rückgängig machen.</p></div><button class="kp-oa-close" data-kp-history-close>×</button></div>
        <div class="kp-history-list">${items.length?items.map((item,index)=>`<div class="kp-history-row"><div><strong>${esc(item.label||'Gespeicherter Stand')}</strong><small>${esc(new Date(Number(item.ts)*1000).toLocaleString('de-DE'))}${index<10?' · Rückgängig-Schritt':''}</small></div><button type="button" class="kp-oa-secondary" data-kp-restore="${esc(item.id)}">Wiederherstellen</button></div>`).join(''):'<p>Noch keine älteren gespeicherten Stände vorhanden.</p>'}</div>`;
      backdrop.classList.add('is-open');document.body.classList.add('kp-oa-open');
    }catch(error){toast(error.message,'error');}
  }

  async function restoreVersion(id) {
    if(!id||!confirm('Diesen älteren Stand wiederherstellen? Der aktuelle Stand wird vorher ebenfalls als Version gesichert.'))return;
    try{
      const data=await api('kp_owner_history_restore',{version_id:id});
      toast(data.message||'Version wiederhergestellt ✓','ok');
      setTimeout(()=>location.reload(),450);
    }catch(error){toast(error.message,'error');}
  }

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest('[data-kp-history-undo]'))undoSaved();
    if(target?.closest('[data-kp-history-versions]'))showVersions();
    if(target?.closest('[data-kp-history-close]'))closeHistory();
    const restore=target?.closest('[data-kp-restore]');if(restore)restoreVersion(restore.dataset.kpRestore);
    setTimeout(injectHistoryButtons,0);
  });

  const observer=new MutationObserver(injectHistoryButtons);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  injectHistoryButtons();
})();