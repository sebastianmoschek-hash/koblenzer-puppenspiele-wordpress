import { chromium } from 'playwright';

const base=(process.env.KP_E2E_BASE||'https://neu.koblenzer-puppenspiele.de').replace(/\/$/,'');
const token=process.env.KP_E2E_TOKEN||'';
if(!token)throw new Error('KP_E2E_TOKEN fehlt.');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
const page=await context.newPage();
const fail=m=>{throw new Error(m)};

try{
  await page.goto(`${base}/?kp_e2e_login=${encodeURIComponent(token)}`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.kp-fe2-save',{timeout:15000});
  await page.waitForFunction(()=>!!window.KPOwnerSaveRegistry&&!!window.KPWordHistory&&!!window.KPCanvaLayoutRuntime&&!!window.KPAIEditorRuntime,{timeout:15000});

  // Verify the central registry actually calls every specialist that is loaded
  // on the homepage. Wrappers only count calls; a freshly loaded clean editor
  // makes every flush a no-op and therefore writes no site data.
  const coverage=await page.evaluate(async()=>{
    const required=['KPCanvaLayoutRuntime','KPCanvaImageRuntime','KPAIEditorRuntime','KPRecordDraftRuntime','KPHeaderImageDraftRuntime','KPNavigationDraftRuntime'];
    const optional=['KPCardDraftRuntime'];
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

  // AI image Discard must restore the exact saved visual image even when the
  // underlying AI runtime has no replacement record to re-apply. No Gemini
  // request is made here; the DOM is mutated locally and then discarded.
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

  // Synthetic/programmatic design input is how AI set_design operates. It must
  // create exactly a normal global Undo step even though Event.isTrusted=false.
  const tools=page.locator('.kp-oa-tools').first();
  if(await tools.count()){
    await tools.click({force:true});
    const designAction=page.locator('[data-action="design"]').first();
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
        await page.waitForTimeout(100);
        const countsAfter=await page.evaluate(()=>window.KPWordHistory.counts());
        if(Number(countsAfter.undo)<=Number(countsBefore.undo))fail('Synthetische KI-Designänderung erzeugte keinen Undo-Schritt.');
        if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Undo der synthetischen KI-Designänderung fehlgeschlagen.');
        await page.waitForTimeout(100);
        if(await design.inputValue()!==old)fail('Undo stellte den KI-geänderten Designregler nicht wieder her.');
      }
      const close=page.locator('.kp-oa-close').first();if(await close.count())await close.click({force:true});
    }
  }

  // Navigation owns its own specialist history. One real text edit must create
  // exactly one global marker; Undo restores the field and visible menu without
  // a save request or page reload.
  const toolsNav=page.locator('.kp-oa-tools').first();
  if(await toolsNav.count()){
    await toolsNav.click({force:true});
    const navAction=page.locator('[data-action="nav"]').first();
    if(await navAction.count()){
      await navAction.click({force:true});
      await page.waitForFunction(()=>!!window.KPNavigationDraftRuntime,{timeout:10000});
      const navInput=page.locator('[data-kp-navigation-draft] [data-kp-nav-field="label"]').first();
      if(await navInput.count()){
        const original=await navInput.inputValue();
        const before=await page.evaluate(()=>window.KPWordHistory.counts());
        await navInput.fill(`${original} TEST`);
        await page.waitForTimeout(120);
        const after=await page.evaluate(()=>window.KPWordHistory.counts());
        if(Number(after.undo)!==Number(before.undo)+1)fail(`Navigation erzeugte nicht genau einen Undo-Schritt: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
        if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Navigation-Undo fehlgeschlagen.');
        await page.waitForTimeout(120);
        const restored=page.locator('[data-kp-navigation-draft] [data-kp-nav-field="label"]').first();
        if(await restored.inputValue()!==original)fail(`Navigation-Undo stellte den Namen nicht wieder her: ${await restored.inputValue()} != ${original}`);
      }
      const closeNav=page.locator('[data-kp-nav-close]').first();if(await closeNav.count())await closeNav.click({force:true});
    }
  }

  // Real menu-button drag -> one Word-history marker -> undo restores the exact
  // inline transform, without navigation or a browser dialog.
  const menu=page.locator('.kp-site-nav .wp-block-navigation__responsive-container-open').first();
  if(await menu.count()){
    const before=await menu.getAttribute('style');
    const box=await menu.boundingBox();
    if(!box)fail('Menübutton hat keine messbare Position.');
    const countsBefore=await page.evaluate(()=>window.KPWordHistory.counts());
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+18,box.y+box.height/2+10,{steps:4});
    await page.mouse.up();
    await page.waitForTimeout(180);
    const countsAfter=await page.evaluate(()=>window.KPWordHistory.counts());
    if(Number(countsAfter.undo)<=Number(countsBefore.undo))fail('Drag des Menübuttons erzeugte keinen Undo-Schritt.');
    const moved=await menu.getAttribute('style');
    if(moved===before)fail('Menübutton wurde im Drag-Test nicht sichtbar bewegt.');
    let dialog='';const onDialog=async d=>{dialog=d.message();await d.dismiss()};page.on('dialog',onDialog);
    const url=page.url();
    const undone=await page.evaluate(()=>window.KPWordHistory.undo());
    await page.waitForTimeout(160);page.off('dialog',onDialog);
    if(!undone)fail('Undo des Menübutton-Drags wurde abgelehnt.');
    if(dialog)fail(`Undo öffnete Browserdialog: ${dialog}`);
    if(page.url()!==url)fail('Undo navigierte oder lud die Seite neu.');
    const restored=await menu.getAttribute('style');
    if((restored||'')!==(before||''))fail(`Undo stellte Menübutton-Stil nicht exakt her. before=${before} restored=${restored}`);
  }

  // Image-position inspector participates in global Undo when the current page
  // exposes such a control.
  const image=page.locator('main img[data-kp-dom-key],main [data-kp-edit-key] img,header img[data-kp-dom-key],header [data-kp-edit-key] img').first();
  if(await image.count()){
    await image.click({force:true});
    await page.waitForTimeout(180);
    const position=page.locator('.kp-image-position-range').first();
    if(await position.count()){
      const old=Number(await position.inputValue()),max=Number(await position.getAttribute('max')||100);
      await position.focus();await position.press(old<max?'ArrowRight':'ArrowLeft');await page.waitForTimeout(100);
      const changed=Number(await position.inputValue());
      if(changed===old)fail('Bildpositions-Regler änderte sich nicht.');
      if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Bildpositions-Undo fehlgeschlagen.');
      await page.waitForTimeout(100);
      if(Number(await position.inputValue())!==old)fail('Bildpositions-Undo stellte den Regler nicht wieder her.');
    }
  }

  // Repertoire-only record/card controls are tested on their real page.
  const repertoireUrl=await page.evaluate(()=>window.KPOwnerWebApp?.repertoireEditUrl||'/repertoire/');
  const target=new URL(repertoireUrl,base);target.searchParams.set('kp_edit','1');
  await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.kp-fe2-save',{timeout:15000});
  await page.waitForFunction(()=>!!window.KPWordHistory&&!!window.KPRecordDraftRuntime,{timeout:10000});

  // Record title draft must preserve the actual <a> and Undo must restore both
  // its label and href without a save request.
  const titleLink=page.locator('.kp-repertoire-card h3 a[href]').first();
  if(await titleLink.count()){
    const originalTitle=((await titleLink.textContent())||'').trim(),originalHref=await titleLink.getAttribute('href');
    await titleLink.click({force:true});
    const record=page.locator('.kp-fe2-record-backdrop');
    await record.waitFor({state:'visible',timeout:10000});
    const titleInput=record.locator('[data-f="title"]').first();
    await titleInput.waitFor({state:'visible',timeout:10000});
    await titleInput.fill(originalTitle+' TEST');
    await record.locator('.kp-fe2-record-main-save').click({force:true});
    await page.waitForTimeout(120);
    const draftLink=page.locator('.kp-repertoire-card h3 a[href]').first();
    if(!await draftLink.count())fail('Stücktitel-Entwurf entfernte den Titel-Link.');
    if((await draftLink.getAttribute('href'))!==originalHref)fail('Stücktitel-Entwurf veränderte das Link-Ziel.');
    if(((await draftLink.textContent())||'').trim()===originalTitle)fail('Stücktitel-Entwurf wurde nicht sichtbar angewendet.');
    if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Stücktitel-Undo fehlgeschlagen.');
    await page.waitForTimeout(120);
    const restoredLink=page.locator('.kp-repertoire-card h3 a[href]').first();
    if(!await restoredLink.count()||((await restoredLink.textContent())||'').trim()!==originalTitle||(await restoredLink.getAttribute('href'))!==originalHref)fail('Stücktitel-Undo stellte Titel und Link nicht exakt wieder her.');
  }

  const cardButton=page.locator('.kp-repertoire-card-actions .kp-termine-button').first();
  if(await cardButton.count()){
    await page.waitForFunction(()=>!!window.KPCardDraftRuntime,{timeout:10000});
    const original=(await cardButton.textContent()||'').trim();
    await cardButton.click({force:true});
    const sheet=page.locator('.kp-fe-card-sheet-backdrop');
    await sheet.waitFor({state:'visible',timeout:10000});
    const label=sheet.locator('.kp-fe-card-label');
    await label.fill(original+' TEST');
    await sheet.locator('.kp-fe-card-save').click();
    await page.waitForTimeout(100);
    if(((await cardButton.textContent())||'').trim()===original)fail('Karten-Button zeigte den Entwurf nicht an.');
    if(!await page.evaluate(()=>window.KPWordHistory.undo()))fail('Karten-Button-Undo fehlgeschlagen.');
    await page.waitForTimeout(100);
    if(((await cardButton.textContent())||'').trim()!==original)fail('Karten-Button-Undo stellte die Beschriftung nicht wieder her.');
  }

  console.log('PASS: unified Save + AI/design/navigation/drag/image-position/record/card Undo and Discard work without reload or persistent QA mutation.');
} finally {
  await context.close();await browser.close();
}
