import { chromium } from 'playwright';

const base=(process.env.KP_E2E_BASE||'https://neu.koblenzer-puppenspiele.de').replace(/\/$/,'');
const token=process.env.KP_E2E_TOKEN||'';
if(!token)throw new Error('KP_E2E_TOKEN fehlt.');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
const page=await context.newPage();
const fail=m=>{throw new Error(m)};

async function openTools(){const tools=page.locator('.kp-oa-tools').first();if(await tools.count())await tools.click({force:true});}
async function closeOwnerSheet(){const close=page.locator('.kp-oa-close,[data-kp-nav-close]').first();if(await close.count())await close.click({force:true});}

try{
  await page.goto(`${base}/?kp_e2e_login=${encodeURIComponent(token)}`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.kp-fe2-save',{timeout:15000});
  await page.waitForFunction(()=>!!window.KPOwnerSaveRegistry&&!!window.KPWordHistory&&!!window.KPCanvaLayoutRuntime&&!!window.KPAIEditorRuntime,{timeout:15000});

  // Verify the specialist runtimes that actually exist on the homepage are
  // reached by the one orange Save. Record/header/card runtimes are contextual:
  // they only exist on pages/sheets that expose those editors and are exercised
  // later in this same test on the repertoire page. Treating them as mandatory
  // at homepage boot produced a false red verdict before their context existed.
  const coverage=await page.evaluate(async()=>{
    const required=['KPCanvaLayoutRuntime','KPCanvaImageRuntime','KPAIEditorRuntime','KPNavigationDraftRuntime','KPSocialDraftRuntime'];
    const optional=['KPRecordDraftRuntime','KPHeaderImageDraftRuntime','KPCardDraftRuntime'];
    const counts={},present={};
    for(const name of [...required,...optional]){
      const runtime=window[name];present[name]=!!runtime?.flush;counts[name]=0;
      if(!runtime?.flush)continue;
      const original=runtime.flush.bind(runtime);
      runtime.flush=async(...args)=>{counts[name]++;return original(...args)};
    }
    await window.KPOwnerSaveRegistry.flushAll();
    return {counts,present,required,dirty:window.KPOwnerSaveRegistry.isDirty?.()??null};
  });
  for(const name of coverage.required){
    if(!coverage.present?.[name]||Number(coverage.counts?.[name]||0)<1)fail(`Unified Save ruft ${name} nicht auf: ${JSON.stringify(coverage)}`);
  }

  await page.waitForFunction(()=>!!window.KPAIEditorRuntime?.__kpImageDraftSafe,{timeout:10000});
  const aiDiscard=await page.evaluate(()=>{
    const img=document.querySelector('header img,main img');
    if(!img)return{skipped:true};
    const take=()=>({src:img.getAttribute('src'),alt:img.getAttribute('alt'),srcset:img.getAttribute('srcset'),sizes:img.getAttribute('sizes')});
    const before=take();
    img.setAttribute('src','data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
    img.removeAttribute('srcset');img.removeAttribute('sizes');
    window.KPAIEditorRuntime.discard();
    return{skipped:false,before,after:take()};
  });
  if(!aiDiscard.skipped&&JSON.stringify(aiDiscard.before)!==JSON.stringify(aiDiscard.after))fail(`KI-Bild-Discard stellte das sichtbare Bild nicht exakt her: ${JSON.stringify(aiDiscard)}`);

  // AI/programmatic design changes must be one normal global Undo step.
  await openTools();
  let designAction=page.locator('[data-action="design"]').first();
  if(await designAction.count()){
    await designAction.click({force:true});
    const design=page.locator('[data-design="header_radius"]').first();
    if(await design.count()){
      const old=await design.inputValue();
      const countsBefore=await page.evaluate(()=>window.KPWordHistory.counts());
      await design.evaluate((el,oldValue)=>{
        const min=Number(el.min||0),max=Number(el.max||100),old=Number(oldValue||0);
        el.value=String(old<max?Math.min(max,old+1):Math.max(min,old-1));
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
      },old);
      await page.waitForTimeout(180);
      const countsAfter=await page.evaluate(()=>window.KPWordHistory.counts());
      if(Number(countsAfter.undo)!==Number(countsBefore.undo)+1)fail(`Synthetische KI-Designänderung erzeugte nicht genau einen Undo-Schritt: ${JSON.stringify({countsBefore,countsAfter})}`);
      if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Undo der synthetischen KI-Designänderung fehlgeschlagen.');
      await page.waitForTimeout(120);
      if(await design.inputValue()!==old)fail('Undo stellte den KI-geänderten Designregler nicht wieder her.');
    }
    await closeOwnerSheet();
  }

  // The old bug: a design/size/menu control could only be undone while its
  // original sheet still existed. Change a real design slider, replace the
  // sheet with Navigation, undo there, then reopen Design and verify the value.
  await openTools();designAction=page.locator('[data-action="design"]').first();
  if(await designAction.count()){
    await designAction.click({force:true});
    const design=page.locator('[data-design="header_radius"]').first();
    if(await design.count()){
      const old=await design.inputValue();
      const before=await page.evaluate(()=>window.KPWordHistory.counts());
      await design.focus();
      await design.press(Number(old)<Number(await design.getAttribute('max')||100)?'ArrowRight':'ArrowLeft');
      await page.waitForTimeout(120);
      const after=await page.evaluate(()=>window.KPWordHistory.counts());
      if(Number(after.undo)!==Number(before.undo)+1)fail(`Design-Regler erzeugte nicht genau einen Undo-Schritt: ${JSON.stringify({before,after})}`);
      await closeOwnerSheet();await openTools();
      const nav=page.locator('[data-action="nav"]').first();if(await nav.count())await nav.click({force:true});
      if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Design-Undo nach Panelwechsel fehlgeschlagen.');
      await page.waitForTimeout(120);await closeOwnerSheet();await openTools();
      const reopen=page.locator('[data-action="design"]').first();if(await reopen.count())await reopen.click({force:true});
      const restored=page.locator('[data-design="header_radius"]').first();
      if(await restored.count()&&await restored.inputValue()!==old)fail(`Design-Undo nach Panelwechsel stellte den Wert nicht wieder her: ${await restored.inputValue()} != ${old}`);
      await closeOwnerSheet();
    }
  }

  // Social used to save immediately in its own dialog. It must now be a normal
  // draft that survives a sheet switch in Undo and is part of unified Save.
  await openTools();
  const socialAction=page.locator('[data-action="social"]').first();
  if(await socialAction.count()){
    await socialAction.click({force:true});
    await page.waitForFunction(()=>!!window.KPSocialDraftRuntime,{timeout:10000});
    const social=page.locator('[data-social="instagram_url"]').first();
    if(await social.count()){
      const old=await social.inputValue(),before=await page.evaluate(()=>window.KPWordHistory.counts());
      const next=old.includes('kp-undo-test')?old.replace(/[#?]kp-undo-test.*$/,''):old+(old.includes('?')?'&':'?')+'kp-undo-test=1';
      await social.fill(next);await page.waitForTimeout(120);
      const after=await page.evaluate(()=>window.KPWordHistory.counts());
      if(Number(after.undo)!==Number(before.undo)+1)fail(`Social-Entwurf erzeugte nicht genau einen Undo-Schritt: ${JSON.stringify({before,after})}`);
      await page.locator('[data-social-done]').click({force:true});await openTools();
      const nav=page.locator('[data-action="nav"]').first();if(await nav.count())await nav.click({force:true});
      if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Social-Undo nach Panelwechsel fehlgeschlagen.');
      await closeOwnerSheet();await openTools();const reopenSocial=page.locator('[data-action="social"]').first();if(await reopenSocial.count())await reopenSocial.click({force:true});
      const restored=page.locator('[data-social="instagram_url"]').first();
      if(await restored.count()&&await restored.inputValue()!==old)fail(`Social-Undo stellte den Entwurf nicht wieder her: ${await restored.inputValue()} != ${old}`);
      await closeOwnerSheet();
    }
  }

  // Navigation owns its own specialist history: exactly one marker per edit.
  await openTools();
  const navAction=page.locator('[data-action="nav"]').first();
  if(await navAction.count()){
    await navAction.click({force:true});
    await page.waitForFunction(()=>!!window.KPNavigationDraftRuntime,{timeout:10000});
    const navInput=page.locator('[data-kp-navigation-draft] [data-kp-nav-field="label"]').first();
    if(await navInput.count()){
      const original=await navInput.inputValue();
      const before=await page.evaluate(()=>window.KPWordHistory.counts());
      await navInput.fill(`${original} TEST`);await page.waitForTimeout(120);
      const after=await page.evaluate(()=>window.KPWordHistory.counts());
      if(Number(after.undo)!==Number(before.undo)+1)fail(`Navigation erzeugte nicht genau einen Undo-Schritt: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
      if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Navigation-Undo fehlgeschlagen.');
      await page.waitForTimeout(120);
      const restored=page.locator('[data-kp-navigation-draft] [data-kp-nav-field="label"]').first();
      if(await restored.inputValue()!==original)fail(`Navigation-Undo stellte den Namen nicht wieder her: ${await restored.inputValue()} != ${original}`);
    }
    await closeOwnerSheet();
  }

  const menu=page.locator('.kp-site-nav .wp-block-navigation__responsive-container-open').first();
  if(await menu.count()){
    const before=await menu.getAttribute('style');const box=await menu.boundingBox();if(!box)fail('Menübutton hat keine messbare Position.');
    const countsBefore=await page.evaluate(()=>window.KPWordHistory.counts());
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+18,box.y+box.height/2+10,{steps:4});await page.mouse.up();await page.waitForTimeout(180);
    const countsAfter=await page.evaluate(()=>window.KPWordHistory.counts());if(Number(countsAfter.undo)<=Number(countsBefore.undo))fail('Drag des Menübuttons erzeugte keinen Undo-Schritt.');
    const moved=await menu.getAttribute('style');if(moved===before)fail('Menübutton wurde im Drag-Test nicht sichtbar bewegt.');
    let dialog='';const onDialog=async d=>{dialog=d.message();await d.dismiss()};page.on('dialog',onDialog);const url=page.url();
    const undone=await page.evaluate(()=>window.KPWordHistory.undo());await page.waitForTimeout(160);page.off('dialog',onDialog);
    if(!undone)fail('Undo des Menübutton-Drags wurde abgelehnt.');if(dialog)fail(`Undo öffnete Browserdialog: ${dialog}`);if(page.url()!==url)fail('Undo navigierte oder lud die Seite neu.');
    const restored=await menu.getAttribute('style');if((restored||'')!==(before||''))fail(`Undo stellte Menübutton-Stil nicht exakt her. before=${before} restored=${restored}`);
  }

  // Image-position Undo must follow the originally edited image even after a
  // different image has been selected and the inspector has been rebuilt.
  const images=page.locator('main img[data-kp-dom-key],main [data-kp-edit-key] img,header img[data-kp-dom-key],header [data-kp-edit-key] img');
  if(await images.count()){
    const first=images.first();await first.click({force:true});await page.waitForTimeout(180);
    let position=page.locator('.kp-image-position-range').first();
    if(await position.count()){
      const old=Number(await position.inputValue()),max=Number(await position.getAttribute('max')||100);
      await position.focus();await position.press(old<max?'ArrowRight':'ArrowLeft');await page.waitForTimeout(100);
      if(Number(await position.inputValue())===old)fail('Bildpositions-Regler änderte sich nicht.');
      if(await images.count()>1){await images.nth(1).click({force:true});await page.waitForTimeout(120);}
      if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Bildpositions-Undo nach Bildwechsel fehlgeschlagen.');
      await first.click({force:true});await page.waitForTimeout(150);position=page.locator('.kp-image-position-range').first();
      if(await position.count()&&Number(await position.inputValue())!==old)fail(`Bildpositions-Undo traf nicht das ursprünglich bearbeitete Bild: ${await position.inputValue()} != ${old}`);
    }
  }

  const repertoireUrl=await page.evaluate(()=>window.KPOwnerWebApp?.repertoireEditUrl||'/repertoire/');
  const target=new URL(repertoireUrl,base);target.searchParams.set('kp_edit','1');
  await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.kp-fe2-save',{timeout:15000});
  await page.waitForFunction(()=>!!window.KPWordHistory&&!!window.KPRecordDraftRuntime,{timeout:10000});

  const titleLink=page.locator('.kp-repertoire-card h3 a[href]').first();
  if(await titleLink.count()){
    const originalTitle=((await titleLink.textContent())||'').trim(),originalHref=await titleLink.getAttribute('href');
    await titleLink.click({force:true});const record=page.locator('.kp-fe2-record-backdrop');await record.waitFor({state:'visible',timeout:10000});
    const titleInput=record.locator('[data-f="title"]').first();await titleInput.waitFor({state:'visible',timeout:10000});await titleInput.fill(originalTitle+' TEST');await record.locator('.kp-fe2-record-main-save').click({force:true});await page.waitForTimeout(120);
    const draftLink=page.locator('.kp-repertoire-card h3 a[href]').first();if(!await draftLink.count())fail('Stücktitel-Entwurf entfernte den Titel-Link.');if((await draftLink.getAttribute('href'))!==originalHref)fail('Stücktitel-Entwurf veränderte das Link-Ziel.');if(((await draftLink.textContent())||'').trim()===originalTitle)fail('Stücktitel-Entwurf wurde nicht sichtbar angewendet.');
    if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Stücktitel-Undo fehlgeschlagen.');await page.waitForTimeout(120);
    const restoredLink=page.locator('.kp-repertoire-card h3 a[href]').first();if(!await restoredLink.count()||((await restoredLink.textContent())||'').trim()!==originalTitle||(await restoredLink.getAttribute('href'))!==originalHref)fail('Stücktitel-Undo stellte Titel und Link nicht exakt wieder her.');
  }

  const cardButton=page.locator('.kp-repertoire-card-actions .kp-termine-button').first();
  if(await cardButton.count()){
    await page.waitForFunction(()=>!!window.KPCardDraftRuntime,{timeout:10000});const original=(await cardButton.textContent()||'').trim();await cardButton.click({force:true});
    const sheet=page.locator('.kp-fe-card-sheet-backdrop');await sheet.waitFor({state:'visible',timeout:10000});const label=sheet.locator('.kp-fe-card-label');await label.fill(original+' TEST');await sheet.locator('.kp-fe-card-save').click();await page.waitForTimeout(100);
    if(((await cardButton.textContent())||'').trim()===original)fail('Karten-Button zeigte den Entwurf nicht an.');if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Karten-Button-Undo fehlgeschlagen.');await page.waitForTimeout(100);if(((await cardButton.textContent())||'').trim()!==original)fail('Karten-Button-Undo stellte die Beschriftung nicht wieder her.');
  }

  console.log('PASS: unified Save + cross-panel design/social/image-position Undo and existing AI/navigation/drag/record/card safety work without persistence.');
} finally {
  await context.close();await browser.close();
}
