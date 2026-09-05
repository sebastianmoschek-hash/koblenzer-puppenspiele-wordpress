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
      <section id="one" data-kp-edit-key="b-one" data-kp-block-name="core/group"><h2>Erster Bereich</h2></section>
      <section id="two" data-kp-edit-key="b-two" data-kp-block-name="core/group"><h2>Zweiter Bereich</h2></section>
    </main>
  </body></html>`);
  await page.evaluate(() => {
    window.__savedPayload = null;
    window.KPFrontendEditorV2 = {
      editMode: true, canEdit: true, ajaxUrl: '/ajax', nonce: 'test', pageKey: 'post-17',
      global: {}, page: {}, exitUrl: '/', editUrl: '/?kp_edit=1', pageEditorUrl: '/wp-admin/post.php?post=17&action=edit'
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
  if (await page.locator('main.wp-block-group > [data-kp-section-copy]').count() !== 1) {
    fail('Duplikat erscheint nicht als ungespeicherte Vorschau direkt unter dem Original.');
  }

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
  if (!Array.isArray(saved.order) || !saved.order.includes('b-one') || !saved.order.includes('b-two')) {
    fail('Drag-Reihenfolge fehlt im Save-Payload.');
  }
  console.log('PASS frontend section actions: hide preview, queued WordPress duplicate and semantic drag order are saved together.');
} finally {
  await browser.close();
}
