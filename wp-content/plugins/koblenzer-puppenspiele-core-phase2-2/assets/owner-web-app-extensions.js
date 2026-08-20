(() => {
  'use strict';
  const cfg = window.KPOwnerWebAppExtensions;
  const owner = window.KPOwnerWebApp;
  if (!cfg || !owner || !owner.canEdit || !owner.canDesign) return;

  const q = (s,r=document) => r.querySelector(s);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let draft = {...(cfg.settings || {})};
  let saving = false;

  function toast(text,type=''){
    let el=q('.kp-oa-toast');if(!el){el=document.createElement('div');el.className='kp-oa-toast';document.body.appendChild(el);}
    el.textContent=text;el.className='kp-oa-toast is-visible'+(type?' is-'+type:'');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('is-visible'),2600);
  }

  async function save(showToast=false){
    if(saving)return null;
    saving=true;
    try{
      const fd=new FormData();fd.append('action','kp_owner_social_menu_save');fd.append('nonce',cfg.nonce);fd.append('settings',JSON.stringify(draft));
      const response=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd});const json=await response.json();
      if(!json.success)throw new Error(json.data?.message||'Speichern fehlgeschlagen.');
      draft={...(json.data.settings||draft)};cfg.settings={...draft};if(showToast)toast(json.data.message||'Gespeichert ✓','ok');return json.data;
    }finally{saving=false;}
  }

  function closeSheet(){q('.kp-oa-backdrop')?.classList.remove('is-open');document.body.classList.remove('kp-oa-open');}

  function bindSocial(box){
    q('.kp-oa-close',box)?.addEventListener('click',closeSheet);
    qa('[data-social]',box).forEach(input=>{
      const update=()=>{draft[input.dataset.social]=input.type==='checkbox'?(input.checked?1:0):input.value;};
      input.addEventListener(input.type==='checkbox'?'change':'input',update);
    });
    q('[data-social-save]',box)?.addEventListener('click',async e=>{
      const btn=e.currentTarget;btn.disabled=true;btn.textContent='Speichert…';
      try{await save(true);setTimeout(()=>window.location.reload(),450);}
      catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent='Social speichern';}
    });
  }

  function openSocial(){
    const backdrop=q('.kp-oa-backdrop');const box=q('.kp-oa-sheet',backdrop);if(!backdrop||!box)return;
    box.className='kp-oa-sheet is-social';
    box.innerHTML=`
      <div class="kp-oa-head"><div><span class="kp-oa-kicker">Kanäle & Links</span><h2>Social & Instagram</h2><p>Social-Profile zentral verwalten und festlegen, wo sie auf der Website erscheinen.</p></div><button class="kp-oa-close">×</button></div>
      <div class="kp-oa-help"><strong>Meta-/Instagram-Kontoverbindung:</strong> vorbereitet, aber derzeit nicht verbunden. Aktuell werden ausschließlich öffentliche Profil-Links gespeichert; es wird keine Meta-Verbindung vorgetäuscht.</div>
      <div class="kp-oa-social-platforms">
        <label class="kp-oa-field"><span>Instagram</span><input type="url" data-social="instagram_url" value="${esc(draft.instagram_url||'')}" placeholder="https://www.instagram.com/…"></label>
        <label class="kp-oa-field"><span>Facebook</span><input type="url" data-social="facebook_url" value="${esc(draft.facebook_url||'')}" placeholder="https://www.facebook.com/…"></label>
        <label class="kp-oa-field"><span>YouTube</span><input type="url" data-social="youtube_url" value="${esc(draft.youtube_url||'')}" placeholder="https://www.youtube.com/…"></label>
        <label class="kp-oa-field"><span>TikTok</span><input type="url" data-social="tiktok_url" value="${esc(draft.tiktok_url||'')}" placeholder="https://www.tiktok.com/@…"></label>
      </div>
      <h3>Wo sollen Social-Links erscheinen?</h3>
      <div class="kp-oa-social-grid">
        <label class="kp-oa-toggle"><input type="checkbox" data-social="instagram_show_footer" ${+draft.instagram_show_footer?'checked':''}><span>Im Footer</span></label>
        <label class="kp-oa-toggle"><input type="checkbox" data-social="instagram_show_menu" ${+draft.instagram_show_menu?'checked':''}><span>Im Handy-Menü</span></label>
        <label class="kp-oa-toggle"><input type="checkbox" data-social="instagram_show_topbar" ${+draft.instagram_show_topbar?'checked':''}><span>In der oberen Infobar</span></label>
        <label class="kp-oa-toggle"><input type="checkbox" data-social="instagram_show_home" ${+draft.instagram_show_home?'checked':''}><span>Auf der Startseite</span></label>
      </div>
      <div class="kp-oa-actions"><button type="button" class="kp-oa-primary" data-social-save>Social speichern</button></div>`;
    backdrop.classList.add('is-open');document.body.classList.add('kp-oa-open');bindSocial(box);
  }

  function installHub(){
    const grid=q('.kp-oa-sheet .kp-oa-action-grid');if(!grid||q('[data-action="social"]',grid))return;
    const button=document.createElement('button');button.type='button';button.dataset.action='social';button.innerHTML='<span>◎</span><strong>Social & Instagram</strong><small>Instagram, Facebook, YouTube, TikTok</small>';
    const install=q('[data-action="install"]',grid);if(install)grid.insertBefore(button,install);else grid.appendChild(button);
    button.addEventListener('click',openSocial);
  }

  function installDesignMenuControl(){
    const box=q('.kp-oa-sheet.is-design');if(!box)return;
    const menuPane=q('[data-pane="menu"]',box);if(!menuPane||q('.kp-oa-menu-x-extension',menuPane))return;
    const wrap=document.createElement('div');wrap.className='kp-oa-menu-x-extension';
    const value=Number(draft.menu_offset_x||0);
    wrap.innerHTML=`<h3>Position des Menü-Buttons</h3>
      <label class="kp-oa-control"><span><strong>Feinposition links / rechts</strong><output>${esc(value)}px</output></span><input type="range" min="-140" max="140" step="2" value="${esc(value)}" data-menu-x><small>0 = bisherige Position · Minus = weiter rechts · Plus = weiter links. Menübutton und geöffnetes Kompaktmenü werden gemeinsam verschoben.</small></label>
      <button type="button" class="kp-oa-secondary" data-menu-reset>Menüposition zurücksetzen</button>`;
    menuPane.appendChild(wrap);

    const range=q('[data-menu-x]',wrap),out=q('output',wrap);
    range.addEventListener('input',()=>{draft.menu_offset_x=Number(range.value);if(out)out.textContent=range.value+'px';document.documentElement.style.setProperty('--kp-owner-menu-offset-x',range.value+'px');});
    range.addEventListener('change',()=>save(true).catch(err=>toast(err.message,'error')));
    q('[data-menu-reset]',wrap)?.addEventListener('click',async()=>{
      draft.menu_offset_x=0;range.value='0';if(out)out.textContent='0px';document.documentElement.style.setProperty('--kp-owner-menu-offset-x','0px');
      try{window.KPFreeLayoutRuntime?.resetMenu?.();await save(true);}catch(err){toast(err.message,'error');}
    });
  }

  function installStyles(){
    if(q('#kp-owner-social-extension-css'))return;const s=document.createElement('style');s.id='kp-owner-social-extension-css';s.textContent='.kp-oa-social-platforms{display:grid;gap:10px}.kp-oa-menu-x-extension{margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.10)}';document.head.appendChild(s);
  }

  function install(){installStyles();installHub();installDesignMenuControl();}
  new MutationObserver(()=>install()).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(install,0),true);
  install();
})();
