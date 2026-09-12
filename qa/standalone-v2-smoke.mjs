import { chromium } from 'playwright';

const baseURL = process.env.STANDALONE_BASE_URL || 'http://127.0.0.1:8080';
const viewports = [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    const httpErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    page.on('response', response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.KPEditorV2 && window.KPEditorActions && window.KPEditorV2AI);
    await page.locator('#edit').click();
    await page.waitForFunction(() => window.KPEditorV2.store.get().mode === 'edit');
    const editorVisible = await page.locator('#editor').isVisible();
    const result = await page.evaluate(async () => {
      const v2 = window.KPEditorV2;
      const aiContract = window.KPEditorV2AI;
      v2.store.setMode('edit');
      const unbind = v2.renderer.bindSelection(document, v2.store);
      const unbindGestures = v2.renderer.bindGestures(document, v2.store, v2.actions, { holdMs: 20 });
      const model = v2.store.get().document;
      const elements = model.pages.flatMap(page => page.sections).flatMap(section => section.elements);
      const heading = elements.find(element => element.type === 'heading');
      if (!heading) throw new Error('Keine Überschrift im importierten Dokument gefunden');
      const before = heading.content.text;
      document.querySelector(`[data-v2-id="${heading.id}"]`)?.click();
      v2.actions.setText(heading.id, 'Smoke-Test Überschrift');
      v2.renderer.render(v2.store.get().document, document.documentElement);
      const changed = v2.store.get().document.pages[0].sections.flatMap(section => section.elements).find(element => element.id === heading.id)?.content.text;
      const renderedText = document.querySelector(`[data-v2-id="${heading.id}"]`)?.textContent === 'Smoke-Test Überschrift';
      v2.store.undo();
      const restored = v2.store.get().document.pages[0].sections.flatMap(section => section.elements).find(element => element.id === heading.id)?.content.text;
      const selected = v2.store.get().selection?.elementId === heading.id;
      const node = document.querySelector(`[data-v2-id="${heading.id}"]`);
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: 10, clientY: 10 }));
      await new Promise(resolve => setTimeout(resolve, 30));
      node.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: 30, clientY: 25 }));
      node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: 30, clientY: 25 }));
      const dragged = v2.store.get().document.pages[0].sections.flatMap(section => section.elements).find(element => element.id === heading.id)?.transform;
      const gestureMoved = dragged?.x === 20 && dragged?.y === 15;
      v2.actions.moveElement(heading.id, 0, 0);
      v2.actions.setTextStyle(heading.id, { fontSize: 42, color: '#d97706' });
      const styled = v2.store.get().document.pages[0].sections.flatMap(section => section.elements).find(element => element.id === heading.id)?.styles.fontSize === 42;
      const sectionCount = v2.store.get().document.pages[0].sections.length;
      v2.actions.createSection('home', { design: { preset: 'smoke' } });
      const sectionSlice = v2.store.get().document.pages[0].sections.length === sectionCount + 1;
      const navigationCount = v2.store.get().document.navigation.items.length;
      v2.actions.createNavigationItem('Testseite', '#testseite');
      const createdNavigation = v2.store.get().document.navigation.items.find(item => item.label === 'Testseite');
      if (createdNavigation) v2.actions.renameNavigationItem(createdNavigation.id, 'Testseite neu');
      const navigationSlice = v2.store.get().document.navigation.items.some(item => item.label === 'Testseite neu');
      if (createdNavigation) v2.actions.deleteNavigationItem(createdNavigation.id);
      v2.actions.setHeaderDesign({ preset: 'original', height: 88 });
      v2.actions.applyTheme({ preset: 'original-koblenz', colors: { accent: '#d97706' } });
      const designSlice = v2.store.get().document.header.design.height === 88 && v2.store.get().document.site.design.colors.accent === '#d97706' && v2.store.get().document.navigation.items.length === navigationCount;
      const beforeDuplicate = v2.store.get().document.pages[0].sections.flatMap(section => section.elements).map(element => element.id);
      v2.actions.duplicateElement(heading.id);
      const afterDuplicate = v2.store.get().document.pages[0].sections.flatMap(section => section.elements);
      const duplicate = afterDuplicate.find(element => !beforeDuplicate.includes(element.id));
      if (duplicate) v2.actions.deleteElement(duplicate.id);
      const duplicateDelete = v2.store.get().document.pages[0].sections.flatMap(section => section.elements).length === beforeDuplicate.length;
      const image = elements.find(element => element.type === 'image');
      let imageSlice = false;
      if (image) {
        const originalSrc = image.content.src;
        v2.actions.replaceImage(image.id, `${originalSrc}?edited=1`, image.content.alt);
        v2.actions.resizeElement(image.id, 1.25);
        v2.actions.rotateElement(image.id, 12);
        v2.actions.setImageAdjustments(image.id, { brightness: 8, crop: { x: 0, y: 0, width: 1, height: 1 } });
        imageSlice = v2.store.get().document.pages[0].sections.flatMap(section => section.elements).find(element => element.id === image.id)?.content.adjustments?.brightness === 8;
        v2.store.undo();
      }
      v2.persistence.save();
      v2.actions.setText(heading.id, 'Nur vor Restore');
      const persistenceRestored = v2.persistence.restore() && v2.store.get().document.pages[0].sections.flatMap(section => section.elements).find(element => element.id === heading.id)?.content.text !== 'Nur vor Restore' && v2.store.get().dirty === false;
      v2.persistence.clear();
      const validPlan = aiContract.validatePlan({ actions: [{ name: 'setText', payload: [heading.id, 'KI-Vorschau'] }] }).ok;
      const rejectedPlan = !aiContract.validatePlan({ actions: [{ name: 'runShell', payload: [] }] }).ok;
      const liveSession = aiContract.createLiveSession();
      liveSession.setMicrophoneSharing(true);
      liveSession.setScreenSharing(true);
      const privacyState = liveSession.getState();
      liveSession.reset();
      const aiContractReady = validPlan && rejectedPlan && privacyState.microphone && privacyState.screen && liveSession.getState().status === 'disconnected';
      unbindGestures();
      unbind();
      return { before, changed, restored, renderedText, selected, gestureMoved, styled, sectionSlice, navigationSlice, designSlice, duplicateDelete, imageSlice, persistenceRestored, aiContractReady, undoRestored: restored === before, schema: v2.SCHEMA_VERSION };
    });
    await page.locator('#close').click();
    await page.waitForFunction(() => window.KPEditorV2.store.get().mode === 'view');
    const viewModeClean = await page.evaluate(() => window.KPEditorV2.store.get().selection === null && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    result.editorVisible = editorVisible;
    result.viewModeClean = viewModeClean;
    if (!result.undoRestored || !result.renderedText || result.changed !== 'Smoke-Test Überschrift') failures.push(`${viewport.name}: V2-Aktion/Renderer/Undo fehlgeschlagen`);
    if (!result.gestureMoved || !result.imageSlice || !result.sectionSlice || !result.navigationSlice || !result.designSlice || !result.duplicateDelete || !result.persistenceRestored || !result.aiContractReady) failures.push(`${viewport.name}: V2-Slice unvollständig`);
    if (!result.editorVisible || !result.viewModeClean) failures.push(`${viewport.name}: Edit/View-Modus oder horizontaler Overflow fehlerhaft`);
    if (pageErrors.length) failures.push(`${viewport.name}: ${pageErrors.join('; ')}`);
    if (httpErrors.length) failures.push(`${viewport.name}: HTTP ${httpErrors.join('; ')}`);
    await page.close();
    console.log(JSON.stringify({ viewport: viewport.name, ...result, pageErrors, httpErrors }));
  }
} finally {
  await browser.close();
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Standalone V2 Smoke erfolgreich (${viewports.length} Viewports)`);
