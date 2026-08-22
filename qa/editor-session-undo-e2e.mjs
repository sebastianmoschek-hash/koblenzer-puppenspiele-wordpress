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
  await page.waitForFunction(()=>!!window.KPOwnerSaveRegistry&&!!window.KPWordHistory&&!!window.KPCanvaLayoutRuntime,{timeout:15000});

  // Verify the central registry actually calls every specialist. Wrappers only
  // count calls; with a clean freshly loaded editor every flush is a no-op and
  // therefore this test writes no site data.
  const coverage=await page.evaluate(async()=>{
    const names=['KPCanvaLayoutRuntime','KPCanvaImageRuntime','KPCardDraftRuntime','KPAIEditorRuntime'];
    const counts={};
    for(const name of names){
      const runtime=window[name];counts[name]=0;
      if(!runtime?.flush)continue;
      const original=runtime.flush.bind(runtime);
      runtime.flush=async(...args)=>{counts[name]++;return original(...args)};
    }
    await window.KPOwnerSaveRegistry.flushAll();
    return {counts,dirty:window.KPOwnerSaveRegistry.isDirty?.()??null};
  });
  for(const name of ['KPCanvaLayoutRuntime','KPCanvaImageRuntime','KPCardDraftRuntime','KPAIEditorRuntime']){
    if(Number(coverage.counts?.[name]||0)<1)fail(`Unified Save ruft ${name} nicht auf: ${JSON.stringify(coverage)}`);
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

  // Image-position inspector must be represented in the global control-history
  // contract whenever a directly editable image exists.
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

  // Card button edit is draft-only now: local preview + undo, no server save.
  const cardButton=page.locator('.kp-repertoire-card-actions .kp-termine-button').first();
  if(await cardButton.count()){
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

  console.log('PASS: real editor unified Save coverage + drag/image-position/card Undo without reload or persistent QA mutation.');
} finally {
  await context.close();await browser.close();
}
