import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, '../wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.js');
const style = path.resolve(here, '../wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.css');
const fail = (message) => { throw new Error(message); };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.setContent(`<!doctype html><html><body>
    <main class="wp-block-group">
      <section id="one" aria-labelledby="title-one" data-kp-edit-key="b-one" data-kp-block-name="core/group"><h2 id="title-one" data-kp-edit-key="b-child" data-kp-block-name="core/heading">Erster Bereich</h2><a href="#title-one">Sprung</a></section>
      <section id="two" data-kp-edit-key="b-two" data-kp-block-name="core/group"><h2>Zweiter Bereich</h2></section>
      <section id="kp-copy-old" aria-labelledby="kp-copy-old-title-one" data-kp-edit-key="a-kp-copy-old" data-kp-block-name="core/group" data-kp-section-copy="kp-copy-old"><h2 id="kp-copy-old-title-one" data-kp-edit-key="dup-kp-copy-old-b-child" data-kp-block-name="core/heading">Gespeicherte Kopie</h2><a href="#kp-copy-old-title-one">Sprung</a></section>
    </main>
  </body></html>`);
  await page.evaluate(() => {
    window.__savedPayload = null;
    window.KPFrontendEditorV2 = {
      editMode: true, canEdit: true, ajaxUrl: '/ajax', nonce: 'test', pageKey: 'post-17',
      global: {}, page: { blocks: { 'b-child': { content: { type: 'html', value: 'Bearbeitet' } } } }, exitUrl: '/', editUrl: '/?kp_edit=1', pageEditorUrl: '/wp-admin/post.php?post=17&action=edit'
    };
    window.fetch = async (_url, options) => {
      const fields = Object.fromEntries(options.body.entries());
      window.__savedPayload = JSON.parse(fields.payload);
      return { json: async () => ({ success: true, data: { message: 'Gespeichert.' } }) };
    };
  });
  await page.addStyleTag({ path: style });
  await page.addScriptTag({ path: script });

  await page.locator('#one').evaluate(el => el.click());
  const hide = page.locator('.kp-fe2-hidden-toggle');
  if (await hide.count() !== 1) fail('Aktiver V2-Inspector bietet keine Ausblenden-Steuerung.');
  await hide.check();
  if (!await page.locator('#one').evaluate(el => el.classList.contains('kp-fe2-hidden-preview'))) {
    fail('Ausgeblendeter Bereich bleibt im Editor nicht sicher als Vorschau sichtbar.');
  }
  if (!await page.locator('#one').isVisible() || Number(await page.locator('#one').evaluate(el => getComputedStyle(el).opacity)) >= 1) {
    fail('Ausgeblendeter Bereich muss im Editor sichtbar und eindeutig gedimmt bleiben.');
  }

  const duplicate = page.locator('.kp-fe2-duplicate');
  if (await duplicate.count() !== 1) fail('Aktiver V2-Inspector bietet keine Abschnittsduplizierung.');
  await duplicate.click();
  if (await page.locator('main.wp-block-group > [data-kp-section-preview-copy]').count() !== 1) {
    fail('Duplikat erscheint nicht als ungespeicherte Vorschau direkt unter dem Original.');
  }
  const copyToken = await page.locator('[data-kp-section-preview-copy]').getAttribute('data-kp-section-copy');
  if (!copyToken?.startsWith('kp-copy-')) fail('Vorschaukopie besitzt keinen stabilen WordPress-Anchor-Token.');
  const copyRootKey = `a-${copyToken}`;
  const copyChildKey = `dup-${copyToken}-b-child`;
  if (await page.locator(`[data-kp-edit-key="${copyRootKey}"]`).count() !== 1) fail('Kopienwurzel hat keinen eindeutigen Bearbeitungsschlüssel.');
  const copyRoot = page.locator(`[data-kp-edit-key="${copyRootKey}"]`);
  if (await copyRoot.getAttribute('id') !== copyToken) fail('Vorschaukopie besitzt keine stabile Anchor-Root-ID.');
  if (await copyRoot.getAttribute('aria-labelledby') !== `${copyToken}-title-one`) fail('ARIA-ID-Referenz der Vorschaukopie ist nicht umgeschrieben.');
  if (await copyRoot.locator('a').getAttribute('href') !== `#${copyToken}-title-one`) fail('Ankerreferenz der Vorschaukopie ist nicht umgeschrieben.');
  const copyChild = page.locator(`[data-kp-edit-key="${copyChildKey}"]`);
  if (await copyChild.innerText() !== 'Bearbeitet') fail('Kopie entspricht nicht dem bearbeiteten Vorschauinhalt.');
  await copyChild.evaluate(el => el.click());
  await copyChild.evaluate(el => { el.textContent = 'Kopie verändert'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  if (await copyChild.innerText() !== 'Kopie verändert') fail('Kopiespezifische Änderung erscheint nicht in der Vorschau.');
  await page.evaluate(() => window.KPFrontendEditorHistory.undo());
  if (await page.locator(`[data-kp-edit-key="${copyChildKey}"]`).innerText() !== 'Bearbeitet') fail('Undo stellt den ursprünglichen Kopieninhalt nicht wieder her.');
  await page.evaluate(() => window.KPFrontendEditorHistory.redo());
  if (await page.locator(`[data-kp-edit-key="${copyChildKey}"]`).innerText() !== 'Kopie verändert') fail('Redo-Vorschau weicht vom wiederhergestellten Save-Payload ab.');

  await page.locator('#kp-copy-old').evaluate(el => el.click());
  await duplicate.click();
  const secondPreview = page.locator('[data-kp-section-preview-copy]').last();
  const secondToken = await secondPreview.getAttribute('data-kp-section-copy');
  if (!secondToken || secondToken === copyToken) fail('Gespeicherte Kopie wurde nicht erneut als eigene Vorschau dupliziert.');
  if (await secondPreview.getAttribute('id') !== secondToken) fail('Kopie einer Kopie stapelt den alten Root-Anchor.');
  if (await secondPreview.locator(`[data-kp-edit-key="dup-${secondToken}-b-child"]`).count() !== 1) fail('Kopie einer Kopie stapelt alte Kindschlüssel.');
  if (await secondPreview.locator('h2').getAttribute('id') !== `${secondToken}-title-one`) fail('Kopie einer Kopie stapelt alte ID-Präfixe.');
  if (await secondPreview.locator('a').getAttribute('href') !== `#${secondToken}-title-one`) fail('Kopie einer Kopie verweist auf eine alte ID.');

  const first = page.locator('#one');
  if (await first.getAttribute('draggable') !== 'true') fail('Top-Level-Bereich ist nicht semantisch ziehbar.');
  await first.dragTo(page.locator('#two'));

  await page.locator('.kp-fe2-save').click();
  await page.waitForFunction(() => window.__savedPayload !== null);
  const saved = await page.evaluate(() => window.__savedPayload.page);
  if (saved.blocks?.['b-one']?.styles?.mobile?.hidden !== 1) fail('Ausblenden fehlt im Save-Payload.');
  if (!Array.isArray(saved.section_actions) || saved.section_actions[0]?.type !== 'duplicate' || saved.section_actions[0]?.key !== 'b-one') {
    fail('Duplizierung fehlt im WordPress-Save-Payload.');
  }
  if (saved.blocks?.[copyChildKey]?.content?.value !== 'Kopie verändert') fail('Bearbeiteter Inhalt der Kopie fehlt im Save-Payload.');
  if (!Array.isArray(saved.order) || !saved.order.includes('b-one') || !saved.order.includes('b-two')) {
    fail('Drag-Reihenfolge fehlt im Save-Payload.');
  }
  console.log('PASS frontend section actions: hide preview, queued WordPress duplicate and semantic drag order are saved together.');
} finally {
  await browser.close();
}
