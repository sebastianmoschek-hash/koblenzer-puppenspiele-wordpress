import { chromium } from 'playwright';

const base=(process.env.KP_E2E_BASE||'https://neu.koblenzer-puppenspiele.de').replace(/\/$/,'');
const token=process.env.KP_E2E_TOKEN||'';
if(!token)throw new Error('KP_E2E_TOKEN fehlt.');

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
const page=await context.newPage();
let originalState=null;
let restored=false;
const fail=message=>{throw new Error(message)};

async function e2eAjax(action,extra={}){
  return page.evaluate(async({action,extra,token})=>{
    const fd=new FormData();fd.append('action',action);fd.append('token',token);
    for(const [key,value] of Object.entries(extra||{}))fd.append(key,typeof value==='string'?value:JSON.stringify(value));
    const response=await fetch('/wp-admin/admin-ajax.php',{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
    const json=await response.json().catch(()=>null);
    return{ok:response.ok,status:response.status,json};
  },{action,extra,token});
}

async function readState(){
  const result=await e2eAjax('kp_e2e_text_state');
  if(!result.ok||!result.json?.success)fail(`Text-Testzustand konnte nicht gelesen werden: ${JSON.stringify(result)}`);
  return result.json.data;
}

async function restoreState(snapshot){
  if(!snapshot)return;
  const result=await e2eAjax('kp_e2e_text_restore',{snapshot});
  if(!result.ok||!result.json?.success)throw new Error(`Text-Testzustand konnte nicht wiederhergestellt werden: ${JSON.stringify(result)}`);
}

async function restoreTwice(){
  if(!originalState||restored)return;
  await restoreState(originalState);
  await page.waitForTimeout(900);
  // A client abort cannot kill PHP that already reached the server. A second
  // restore makes the staging cleanup deterministic even after a late response.
  await restoreState(originalState);
  restored=true;
}

function keySelector(info){
  const escaped=String(info.key).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  return `[${info.attr}="${escaped}"]`;
}

try{
  await page.goto(`${base}/?kp_e2e_login=${encodeURIComponent(token)}`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.kp-fe2-save',{timeout:15000});
  await page.waitForFunction(()=>typeof window.KPFrontendEditorNativeSave==='function',{timeout:10000});
  originalState=await readState();

  const target=await page.evaluate(()=>{
    const candidates=[...document.querySelectorAll('main p[data-kp-dom-key],main p[data-kp-edit-key],main h2[data-kp-dom-key],main h2[data-kp-edit-key],main h3[data-kp-dom-key],main h3[data-kp-edit-key]')];
    for(const el of candidates){
      if(el.closest('.kp-termin-card,.kp-repertoire-card,form,.kp-fe2-toolbar,.kp-fe2-inspector,.kp-oa-backdrop'))continue;
      const rect=el.getBoundingClientRect();
      const text=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(rect.width<20||rect.height<8||!text||text.length>500)continue;
      if(el.dataset.kpDomKey)return{attr:'data-kp-dom-key',key:el.dataset.kpDomKey,text};
      if(el.dataset.kpEditKey)return{attr:'data-kp-edit-key',key:el.dataset.kpEditKey,text};
    }
    return null;
  });
  if(!target)fail('Kein sicherer sichtbarer Homepage-Text für den echten Save-Test gefunden.');

  const selector=keySelector(target);
  await page.locator(selector).first().click({force:true});
  await page.waitForSelector(`${selector}[contenteditable="true"],${selector} [contenteditable="true"]`,{timeout:8000}).catch(()=>null);
  const editable=page.locator('.kp-fe2-inline-text[contenteditable="true"]').first();
  if(!await editable.count())fail(`Text wurde nach Antippen nicht editierbar: ${selector}`);

  const originalText=((await editable.textContent())||'').replace(/\s+/g,' ').trim();
  const marker=` [KP-SAVE-${Date.now().toString(36)}]`;
  await editable.fill(originalText+marker);
  await page.waitForTimeout(180);

  const dirty=await page.evaluate(()=>({
    button:document.querySelector('.kp-fe2-save')?.classList.contains('is-dirty')||false,
    native:typeof window.KPFrontendEditorNativeSave==='function'
  }));
  if(!dirty.button)fail(`Textänderung markierte Speichern nicht als geändert: ${JSON.stringify(dirty)}`);

  const started=Date.now();
  const navigation=page.waitForNavigation({waitUntil:'domcontentloaded',timeout:16000}).then(()=>true).catch(()=>false);
  await page.locator('.kp-fe2-save').click({force:true});
  const reloaded=await navigation;
  const elapsed=Date.now()-started;
  if(!reloaded){
    const diag=await page.evaluate(()=>({
      button:document.querySelector('.kp-fe2-save')?.textContent?.replace(/\s+/g,' ').trim()||'',
      disabled:!!document.querySelector('.kp-fe2-save')?.disabled,
      saving:document.querySelector('.kp-fe2-save')?.classList.contains('is-saving')||false,
      toast:document.querySelector('.kp-fe2-toast')?.textContent||document.querySelector('.kp-oa-toast')?.textContent||'',
      nativeSave:typeof window.KPFrontendEditorNativeSave==='function',
      registry:!!window.KPOwnerSaveRegistry
    }));
    fail(`Text speichern löste keinen Reload aus (${elapsed} ms). Diagnose=${JSON.stringify(diag)}`);
  }
  if(elapsed>14500)fail(`Text speichern war trotz erfolgreichem Reload zu langsam: ${elapsed} ms.`);

  await page.waitForSelector('.kp-fe2-save',{timeout:15000});
  const persisted=((await page.locator(selector).first().textContent().catch(()=>''))||'').replace(/\s+/g,' ').trim();
  if(!persisted.includes(marker.trim()))fail(`Geänderter Text fehlt nach Reload. selector=${selector} text=${persisted}`);

  const savedState=await readState();
  if(JSON.stringify(savedState.frontend_global)===JSON.stringify(originalState.frontend_global)
     &&JSON.stringify(savedState.frontend_pages)===JSON.stringify(originalState.frontend_pages)){
    fail('Text war sichtbar, aber FE2-Datenbankzustand änderte sich nicht.');
  }

  await restoreTwice();
  await page.reload({waitUntil:'domcontentloaded',timeout:30000});
  const cleaned=((await page.locator(selector).first().textContent().catch(()=>''))||'').replace(/\s+/g,' ').trim();
  if(cleaned.includes(marker.trim()))fail('Staging-Ausgangstext wurde nach dem Test nicht wiederhergestellt.');

  console.log(`PASS: echter Text-Save → Reload → Persistenz in ${elapsed} ms; Staging-Zustand wiederhergestellt.`);
} finally {
  try{await restoreTwice()}catch(error){console.error('WARN: finaler Text-Test-Restore fehlgeschlagen:',error?.message||error)}
  await browser.close();
}
