const { test, expect } = require('@playwright/test');
const path = require('path');

const EDITOR_JS = path.resolve(__dirname, '../../wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.js');

function fixtureHtml() {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Local FE2 Fallback</title>
  <style>
    body { font-family: sans-serif; }
    .kp-fe2-toolbar, .kp-fe2-inspector, .kp-fe2-record-backdrop { position: fixed; }
    .kp-fe2-toolbar { top: 0; left: 0; right: 0; }
    .kp-fe2-inspector { right: 0; top: 60px; width: 320px; display:none; }
    .kp-fe2-inspector.is-open { display:block; }
    .kp-fe2-record-backdrop { inset: 0; display:none; }
    .kp-fe2-record-backdrop.is-open { display:block; }
    .kp-fe2-selected { outline: 2px solid red; }
    main { padding-top: 80px; }
    .card { margin: 16px 0; padding: 12px; border: 1px solid #ccc; }
  </style>
</head>
<body class="kp-fe2-editing">
  <div id="wpadminbar"></div>
  <main>
    <article>
      <h1 data-kp-edit-key="title">Alte Überschrift</h1>
      <p data-kp-dom-key="p1">Originaler Text</p>
      <div class="kp-termin-card"><div class="kp-termin-main"><h3>Termin 1</h3></div></div>
    </article>
  </main>
  <script>
    window.KPFrontendEditorV2 = {
      editMode: true,
      canEdit: true,
      exitUrl: '#exit',
      pageEditorUrl: '#page-editor',
      ajaxUrl: 'https://example.invalid/admin-ajax.php',
      nonce: 'nonce',
      pageKey: 'page-1',
      global: { blocks: {}, dom: {}, order: [], section_actions: [] },
      page: { blocks: {}, dom: {}, order: [], section_actions: [] },
      mobile: {}, tablet: {}, laptop: {}, desktop: {},
    };
  </script>
</body>
</html>`;
}

function isOpen(locator) {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  });
}

test('local FE2 fallback verifies overlays and history', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.route('**/admin-ajax.php', async (route) => {
    const post = route.request().postData() || '';
    if (post.includes('kp_fe_v2_record')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { statuses: {}, repertoire: [], id: 1, title: 'Termin 1', city: 'Koblenz', time: '10:00', date_label: '01.01.2026', edit_url: '#edit', bookable: true, thumbnail_id: 0, thumbnail_url: '', excerpt: '', age: '', duration: '', complex: false, description: '', players: '', play_style: '', technical: '', rights: '', premiere: '' } })
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { message: 'ok' } }) });
  });

  await page.setContent(fixtureHtml(), { waitUntil: 'load' });
  await page.addScriptTag({ path: EDITOR_JS });
  await page.waitForTimeout(1000);

  expect(await page.locator('body').evaluate((b) => b.classList.contains('kp-fe2-editing'))).toBe(true);
  expect(await page.locator('.kp-fe2-toolbar .kp-fe2-undo').count()).toBe(1);
  expect(await page.locator('.kp-fe2-toolbar .kp-fe2-redo').count()).toBe(1);

  // open inspector and then switch to record overlay; only one should remain active
  await page.locator('[data-kp-edit-key="title"]').click();
  await page.waitForTimeout(200);
  expect(await isOpen(page.locator('.kp-fe2-inspector'))).toBe(true);
  await page.locator('.kp-termin-card').click();
  await page.waitForTimeout(300);
  expect(await isOpen(page.locator('.kp-fe2-record-backdrop'))).toBe(true);
  expect(await page.locator('.kp-fe2-inspector').evaluate((el) => el.classList.contains('is-open'))).toBe(false);
  // Reset to a clean editor state for keyboard/history verification.
  await page.setContent(fixtureHtml(), { waitUntil: 'load' });
  await page.addScriptTag({ path: EDITOR_JS });
  await page.waitForTimeout(1000);

  // text edit + history API
  const title = page.locator('[data-kp-edit-key="title"]');
  await title.click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const el = document.querySelector('[data-kp-edit-key="title"]');
    el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: 'Neu', inputType: 'insertText' }));
    el.textContent = 'Neu';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: 'Neu', inputType: 'insertText' }));
  });
  await page.waitForTimeout(200);
  expect(await title.textContent()).toContain('Neu');
  await page.evaluate(() => window.KPFrontendEditorHistory.undo());
  await page.waitForTimeout(200);
  expect(await title.textContent()).toContain('Alte Überschrift');
  await page.evaluate(() => window.KPFrontendEditorHistory.redo());
  await page.waitForTimeout(200);
  expect(await title.textContent()).toContain('Neu');

  // keyboard shortcut wiring: editor must intercept native undo/redo chords
  const shortcutResult = await page.evaluate(() => {
    const fire = (key, opts = {}) => {
      const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...opts });
      document.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    return {
      undo: fire('z', { ctrlKey: true }),
      redoY: fire('y', { ctrlKey: true }),
      redoShift: fire('z', { ctrlKey: true, shiftKey: true }),
    };
  });
  expect(shortcutResult.undo).toBe(true);
  expect(shortcutResult.redoY).toBe(true);
  expect(shortcutResult.redoShift).toBe(true);

  expect(consoleErrors).toEqual([]);
});
