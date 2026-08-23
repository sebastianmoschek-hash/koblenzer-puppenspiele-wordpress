(() => {
  'use strict';
  const cfg = window.KPOwnerWebAppExtensions;
  const owner = window.KPOwnerWebApp;
  if (!cfg || !owner || !owner.canEdit || !owner.canDesign) return;

  const q = (s,r=document) => r.querySelector(s);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const clone = v => JSON.parse(JSON.stringify(v || {}));
  const MAX=50;
  let draft = {...(cfg.settings || {})};
  let saved = clone(draft);
  let saving = false;
  let dirty = false;
  let gesture = null;
  const history=[],redo=[];

  function toast(text,type=''){
    let el=q('.kp-oa-toast');if(!el){el=document.createElement('div');el.className='kp-oa-toast';document.body.appendChild(el);}
    el.textContent=text;el.className='kp-oa-toast is-visible'+(type?' is-'+type:'');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('is-visible'),2600);
  }
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
  function markDirty(){dirty=!same(draft,saved);q('.kp-fe2-save')?.classList.toggle('is-dirty',dirty||!!window.KPOwnerSaveRegistry?.isDirty?.())}
  function applyControls(){qa('[data-social]').forEach(input=>{const key=input.dataset.social;if(!key)return;const value=draft[key];if(input.type==='checkbox')input.checked=!!Number(value);else input.value=String(value??'')})}
  function applyState(state){draft=clone(state);applyControls();markDirty();return true}
  function push(before,after,genericBaseline){if(same(before,after))return null;if(Number(window.KPWordHistory?.counts?.().undo||0)>Number(genericBaseline||0))window.KPWordHistory?.discardLastControlsMarker?.();const entry={before:clone(before),after:clone(after)};history.push(entry);if(history.length>MAX)history.shift();redo.length=0;window.KPWordHistory?.push?.('social');return entry}
  function undo(){const e=history.pop();if(!e)return false;applyState(e.before);redo.push(e);if(redo.length>MAX)redo.shift();return true}
  function redoStep(){const e=redo.pop();if(!e)return false;applyState(e.after);history.push(e);if(history.length>MAX)history.shift();return true}
  function clearRedo(){redo.length=0}

  async function flush(){
    if(saving)return null;if(!dirty&&!same(draft,saved))dirty=true;if(!dirty)return{draft:false};
    saving=true;
    try{
      const fd=new FormData();fd.append('action','kp_owner_social_menu_save');fd.append('nonce',cfg.nonce);fd.append('settings',JSON.stringify(draft));
      const response=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd});const json=await response.json().catch(()=>null);
      if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Social-Einstellungen konnten nicht gespeichert werden.');
      draft={...(json.data.settings||draft)};saved=clone(draft);cfg.settings={...draft};dirty=false;history.length=0;redo.length=0;return json.data||{};
    }finally{saving=false;}
  }

  function closeSheet(){q('.kp-oa-backdrop')?.classList.remove('is-open');document.body.classList.remove('kp-oa-open');gesture=null;}

  function bindSocial(box){
    q('.kp-oa-close',box)?.addEventListener('click',closeSheet);
    qa('[data-social]',box).forEach(input=>{
      const begin=()=>{if(!gesture||gesture.input!==input)gesture={input,before:clone(draft),entry:null,genericBaseline:Number(window.KPWordHistory?.counts?.().undo||0)}};
      input.addEventListener('pointerdown',begin);input.addEventListener('focusin',begin);
      const update=()=>{
        begin();draft[input.dataset.social]=input.type==='checkbox'?(input.checked?1:0):input.value;markDirty();
        if(!gesture.entry)gesture.entry=push(gesture.before,draft,gesture.genericBaseline);else gesture.entry.after=clone(draft);
      };
      input.addEventListener(input.type==='checkbox'?'change':'input',update);
      const end=()=>setTimeout(()=>{gesture=null},0);input.addEventListener('pointerup',end);input.addEventListener('pointercancel',end);input.addEventListener('focusout',end);input.addEventListener('change',end);
    });
    q('[data-social-done]',box)?.addEventListener('click',closeSheet);
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
      <p class="kp-oa-help">Änderungen bleiben Entwurf. Dauerhaft werden sie erst mit dem orangefarbenen Speichern-Button.</p>
      <div class="kp-oa-actions"><button type="button" class="kp-oa-primary" data-social-done>Fertig</button></div>`;
    backdrop.classList.add('is-open');document.body.classList.add('kp-oa-open');bindSocial(box);
  }

  const runtime={flush,isDirty:()=>dirty,undo,redo:redoStep,clearRedo,counts:()=>({undo:history.length,redo:redo.length})};window.KPSocialDraftRuntime=runtime;
  function register(){
    if(window.KPWordHistory?.register)window.KPWordHistory.register('social',()=>runtime);
    if(window.KPOwnerSaveRegistry?.register)window.KPOwnerSaveRegistry.register('social',runtime);
  }
  register();setInterval(register,500);

  function installHub(){
    const grid=q('.kp-oa-sheet .kp-oa-action-grid');if(!grid||q('[data-action="social"]',grid))return;
    const button=document.createElement('button');button.type='button';button.dataset.action='social';button.innerHTML='<span>◎</span><strong>Social & Instagram</strong><small>Instagram, Facebook, YouTube, TikTok</small>';
    const install=q('[data-action="install"]',grid);if(install)grid.insertBefore(button,install);else grid.appendChild(button);
    button.addEventListener('click',openSocial);
  }

  function removeLegacyMenuControl(){qa('.kp-oa-menu-x-extension').forEach(el=>el.remove());}
  function installStyles(){if(q('#kp-owner-social-extension-css'))return;const s=document.createElement('style');s.id='kp-owner-social-extension-css';s.textContent='.kp-oa-social-platforms{display:grid;gap:10px}';document.head.appendChild(s);}
  function install(){installStyles();removeLegacyMenuControl();installHub();}
  new MutationObserver(()=>install()).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(install,0),true);
  install();
})();
