(() => {
  'use strict';
  const cfg = window.KPOwnerWebAppExtensions;
  const owner = window.KPOwnerWebApp;
  if (!cfg || !owner || !owner.canEdit || !owner.canDesign) return;

  const q = (s, r=document) => r.querySelector(s);
  const qa = (s, r=document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let draft = {...(cfg.settings || {})};

  function toast(text, type='') {
    let el=q('.kp-oa-toast');
    if(!el){el=document.createElement('div');el.className='kp-oa-toast';document.body.appendChild(el);}
    el.textContent=text;el.className='kp-oa-toast is-visible'+(type?' is-'+type:'');
    clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('is-visible'),2800);
  }

  async function save() {
    const fd=new FormData();
    fd.append('action','kp_owner_social_menu_save');
    fd.append('nonce',cfg.nonce);
    fd.append('settings',JSON.stringify(draft));
    const response=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd});
    const json=await response.json();
    if(!json.success) throw new Error(json.data?.message||'Speichern fehlgeschlagen.');
    draft={...(json.data.settings||draft)};
    cfg.settings={...draft};
    return json.data;
  }

  function install() {
    const box=q('.kp-oa-sheet.is-design');
    if(!box || q('.kp-oa-social-menu-extension',box)) return;
    const tabs=q('.kp-oa-tabs',box);
    if(!tabs) return;

    const menuPane=q('[data-pane="menu"]',box);
    if(menuPane){
      const wrap=document.createElement('div');
      wrap.className='kp-oa-social-menu-extension';
      wrap.innerHTML=`<h3>Position des Menü-Buttons</h3><label class="kp-oa-control"><span><strong>Links / rechts</strong><output>${esc(draft.menu_offset_x||0)}px</output></span><input type="range" min="-8" max="140" step="2" value="${esc(draft.menu_offset_x||0)}" data-ext="menu_offset_x"><small>0 = bisherige Position · negative Werte weiter nach rechts · positive Werte weiter nach links</small></label>`;
      menuPane.appendChild(wrap);
    }

    const tab=document.createElement('button');
    tab.type='button';tab.dataset.tab='social';tab.textContent='Social';tabs.appendChild(tab);

    const pane=document.createElement('div');
    pane.className='kp-oa-tab kp-oa-social-menu-extension';pane.dataset.pane='social';
    pane.innerHTML=`
      <h3>Instagram</h3>
      <label class="kp-oa-field"><span>Instagram-Profil</span><input type="url" data-ext="instagram_url" value="${esc(draft.instagram_url||'')}" placeholder="https://www.instagram.com/…"></label>
      <label class="kp-oa-field"><span>Beschriftung</span><input type="text" maxlength="40" data-ext="instagram_label" value="${esc(draft.instagram_label||'Instagram')}"></label>
      <div class="kp-oa-social-grid">
        <label class="kp-oa-toggle"><input type="checkbox" data-ext="instagram_show_footer" ${+draft.instagram_show_footer?'checked':''}><span>Im Footer zeigen</span></label>
        <label class="kp-oa-toggle"><input type="checkbox" data-ext="instagram_show_menu" ${+draft.instagram_show_menu?'checked':''}><span>Im Handy-Menü zeigen</span></label>
        <label class="kp-oa-toggle"><input type="checkbox" data-ext="instagram_show_topbar" ${+draft.instagram_show_topbar?'checked':''}><span>In der oberen Infobar zeigen</span></label>
        <label class="kp-oa-toggle"><input type="checkbox" data-ext="instagram_show_home" ${+draft.instagram_show_home?'checked':''}><span>Auf der Startseite zeigen</span></label>
      </div>
      <div class="kp-oa-actions"><button type="button" class="kp-oa-primary" data-ext-save>Social & Menü speichern</button></div>`;
    const layout=q('[data-pane="layout"]',box);
    if(layout?.parentNode) layout.parentNode.appendChild(pane); else box.appendChild(pane);

    tab.addEventListener('click',()=>{
      qa('[data-tab]',box).forEach(x=>x.classList.toggle('is-active',x===tab));
      qa('[data-pane]',box).forEach(x=>x.classList.toggle('is-active',x===pane));
    });

    qa('[data-ext]',box).forEach(input=>{
      const update=()=>{
        draft[input.dataset.ext]=input.type==='checkbox'?(input.checked?1:0):(input.type==='range'?Number(input.value):input.value);
        if(input.type==='range'){
          const out=input.closest('label')?.querySelector('output');
          if(out) out.textContent=input.value+'px';
          document.documentElement.style.setProperty('--kp-owner-menu-offset-x',input.value+'px');
        }
      };
      input.addEventListener(input.type==='checkbox'?'change':'input',update);
    });

    q('[data-ext-save]',pane)?.addEventListener('click',async e=>{
      const btn=e.currentTarget;btn.disabled=true;btn.textContent='Speichert…';
      try{const data=await save();toast(data.message||'Gespeichert ✓','ok');setTimeout(()=>window.location.reload(),450);}
      catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent='Social & Menü speichern';}
    });
  }

  const observer=new MutationObserver(()=>install());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  install();
})();
