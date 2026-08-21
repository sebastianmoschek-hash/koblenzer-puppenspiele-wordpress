(() => {
  'use strict';
  const cfg = window.KPOwnerResponsiveWeb;
  if (!cfg || !cfg.editMode) return;

  let draft = {...(cfg.settings || {})};
  let dirty = false;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const q = (s,r=document) => r.querySelector(s);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];

  function toast(text,type='') {
    let el=q('.kp-oa-toast');
    if(!el){el=document.createElement('div');el.className='kp-oa-toast';document.body.appendChild(el);}
    el.textContent=text;el.className='kp-oa-toast is-visible'+(type?' is-'+type:'');
    clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('is-visible'),2500);
  }

  function markDirty() {
    dirty = true;
    document.querySelector('.kp-fe2-save')?.classList.add('is-dirty');
  }

  function syncLiveControls() {
    qa('[data-kp-size]').forEach(input => {
      const key = input?.dataset?.kpSize;
      if (!key) return;
      draft[key] = Number(input.value);
    });
  }

  function hasChanges() {
    return dirty || JSON.stringify(draft) !== JSON.stringify(cfg.settings || {});
  }

  async function api(settings) {
    const fd=new FormData();fd.append('action','kp_owner_sizes_save');fd.append('nonce',cfg.nonce);fd.append('settings',JSON.stringify(settings));
    const response=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
    let json;try{json=await response.json();}catch(e){throw new Error('WordPress hat keine gültige Antwort geliefert.');}
    if(!response.ok||!json.success)throw new Error(json?.data?.message||'Speichern fehlgeschlagen.');
    return json.data;
  }

  async function flush() {
    // Unified orange Save must persist the values that are actually visible now,
    // even if a browser/touch layer swallowed an input/change event.
    syncLiveControls();
    if (!hasChanges()) return {draft:false, settings:{...draft}};
    const data = await api(draft);
    draft={...(data.settings||draft)};
    cfg.settings={...draft};
    dirty=false;
    return data;
  }

  function slider(key,label,min,max){
    const value=Number(draft[key] ?? 100);
    return `<label class="kp-oa-control"><span><strong>${esc(label)}</strong><output>${value}%</output></span><input type="range" data-kp-size="${esc(key)}" min="${min}" max="${max}" step="1" value="${value}"></label>`;
  }

  function deviceSliders(prefix,wide=false){
    const min=wide?85:90,max=wide?140:120;
    return Object.entries(cfg.devices||{}).map(([device,label])=>slider(`${prefix}_${device}`,label,min,max)).join('');
  }

  function paneHtml(){
    return `<div class="kp-oa-size-note"><strong>100 % = aktueller Grundstand.</strong><span>Jedes Gerät und jeder Bereich kann unabhängig größer oder kleiner werden.</span></div>
      <details class="kp-oa-size-area" open><summary>Gesamte Website</summary><div class="kp-oa-size-grid">${deviceSliders('all',false)}</div></details>
      ${Object.entries(cfg.areas||{}).map(([area,label])=>`<details class="kp-oa-size-area" ${area==='termine'?'open':''}><summary>${esc(label)}</summary><div class="kp-oa-size-grid">${deviceSliders(area,area==='termine')}</div></details>`).join('')}
      <div class="kp-oa-actions"><button type="button" class="kp-oa-secondary kp-oa-size-reset">Alles auf 100 %</button><button type="button" class="kp-oa-primary kp-oa-size-save">Anzeigegrößen speichern</button></div>`;
  }

  function inject(sheet){
    if(!sheet || sheet.dataset.kpResponsiveInjected==='1')return;
    const tabs=q('.kp-oa-tabs',sheet);if(!tabs)return;
    sheet.dataset.kpResponsiveInjected='1';
    const tab=document.createElement('button');tab.type='button';tab.dataset.tab='sizes';tab.textContent='Größen';tabs.appendChild(tab);
    const pane=document.createElement('div');pane.className='kp-oa-tab';pane.dataset.pane='sizes';pane.innerHTML=paneHtml();tabs.after(pane);

    tab.addEventListener('click',()=>{
      qa('[data-tab]',sheet).forEach(x=>x.classList.toggle('is-active',x===tab));
      qa('[data-pane]',sheet).forEach(x=>x.classList.toggle('is-active',x===pane));
    });
    qa('[data-kp-size]',pane).forEach(input=>input.addEventListener('input',()=>{
      draft[input.dataset.kpSize]=Number(input.value);
      const out=q('output',input.closest('label'));if(out)out.textContent=input.value+'%';
      markDirty();
    }));
    q('.kp-oa-size-reset',pane)?.addEventListener('click',()=>{
      draft={...(cfg.defaults||{})};
      qa('[data-kp-size]',pane).forEach(input=>{input.value=draft[input.dataset.kpSize]??100;const out=q('output',input.closest('label'));if(out)out.textContent=input.value+'%';});
      markDirty();
      toast('Alle Anzeigegrößen stehen wieder auf 100 %. Noch speichern.');
    });
    q('.kp-oa-size-save',pane)?.addEventListener('click',async e=>{
      const btn=e.currentTarget;btn.disabled=true;btn.textContent='Speichert…';
      try{const data=await flush();toast(data.message||'Anzeigegrößen gespeichert ✓','ok');setTimeout(()=>location.reload(),500);}
      catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent='Anzeigegrößen speichern';}
    });
  }

  window.KPOwnerResponsiveRuntime = {
    flush,
    isDirty: () => { syncLiveControls(); return hasChanges(); },
    settings: () => { syncLiveControls(); return {...draft}; }
  };

  const observer=new MutationObserver(()=>qa('.kp-oa-sheet.is-design').forEach(inject));
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('DOMContentLoaded',()=>qa('.kp-oa-sheet.is-design').forEach(inject));
})();