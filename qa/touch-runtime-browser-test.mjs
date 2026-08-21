import { chromium } from 'playwright';

const assets = {
  gestures: process.env.KP_TOUCH_GESTURES || '/tmp/touch-gestures.js',
  free: process.env.KP_TOUCH_FREE || '/tmp/touch-free-layout.js',
  bridge: process.env.KP_TOUCH_BRIDGE || '/tmp/touch-editor-bridge.js',
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });

function fail(message) {
  throw new Error(message);
}

async function bootstrap() {
  await page.setContent(`<!doctype html><html><body>
    <div class="kp-fe2-toolbar" style="position:fixed;top:0;left:0;z-index:10">
      <button class="kp-fe2-save">Speichern</button>
      <button class="kp-fe2-undo">Rückgängig</button>
      <div class="kp-fe2-hint"></div>
      <div class="kp-fe2-toast"></div>
    </div>
    <div id="generic" data-kp-edit-key="generic-test" style="position:absolute;left:30px;top:120px;width:120px;height:80px;background:#ddd">Generic</div>
    <header class="kp-header-stage"><img id="header-image" alt="" style="position:absolute;left:210px;top:110px;width:90px;height:70px" /></header>
    <nav class="kp-site-nav">
      <button class="wp-block-navigation__responsive-container-open" style="position:absolute;left:300px;top:30px;width:50px;height:50px">Menü</button>
      <div class="wp-block-navigation__responsive-container">
        <div class="wp-block-navigation__responsive-close" style="position:absolute;left:70px;top:360px;width:250px;height:240px;background:#ccc">Menükarte</div>
      </div>
    </nav>
  </body></html>`);

  await page.evaluate(() => {
    window.__writes = [];
    window.__nativeSaveClicks = 0;
    window.KPFrontendEditorV2 = { editMode: true };
    window.KPTouchGestures = {
      editMode: true, canEdit: true, holdMs: 320,
      ajaxUrl: '/ajax', nonce: 'nonce', pageKey: 'post-1', global: {}, page: {}
    };
    window.KPFreeLayout = {
      editMode: true, canEdit: true, holdMs: 320,
      ajaxUrl: '/ajax', nonce: 'nonce', pageKey: 'post-1', global: {}, page: {}
    };
    window.fetch = async (_url, init = {}) => {
      const body = init.body;
      const action = body instanceof FormData ? String(body.get('action') || '') : '';
      window.__writes.push(action);
      let global = {}, page = {};
      try { global = JSON.parse(String(body?.get?.('global') || '{}')); } catch {}
      try { page = JSON.parse(String(body?.get?.('page') || '{}')); } catch {}
      return new Response(JSON.stringify({ success: true, data: { global, page } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
    document.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('.kp-fe2-save')) {
        window.__nativeSaveClicks += 1;
      }
    });
  });

  await page.addScriptTag({ path: assets.gestures });
  await page.addScriptTag({ path: assets.free });
  await page.addScriptTag({ path: assets.bridge });
}

async function drag(selector, dx, dy, hold = 380) {
  const box = await page.locator(selector).boundingBox();
  if (!box) fail(`Kein sichtbares Element für ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(hold);
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(30);
}

try {
  await bootstrap();

  // 1) Generisches Verschieben ist nur lokal, bis explizit flush() aufgerufen wird.
  await drag('#generic', 44, 26);
  let state = await page.evaluate(() => ({
    translate: document.querySelector('#generic')?.style.translate || '',
    dirty: window.KPTouchGestureRuntime?.isDirty?.(),
    writes: [...window.__writes]
  }));
  if (!state.dirty) fail('Generic-Drag markiert keinen lokalen Entwurf.');
  if (!state.translate || state.translate === '0px 0px') fail(`Generic-Drag bewegt das Element nicht: ${state.translate}`);
  if (state.writes.length !== 0) fail(`Generic-Drag speichert automatisch: ${state.writes.join(', ')}`);

  await page.evaluate(() => window.KPTouchGestureRuntime.flush());
  state = await page.evaluate(() => ({ dirty: window.KPTouchGestureRuntime?.isDirty?.(), writes: [...window.__writes] }));
  if (state.dirty) fail('Generic-Entwurf bleibt nach flush() dirty.');
  if (state.writes.length !== 1 || state.writes[0] !== 'kp_touch_gesture_save') fail(`Generic-flush schreibt nicht exakt einmal: ${state.writes.join(', ')}`);

  // 2) Rückgängig bleibt lokal und schreibt nicht selbständig.
  const beforeSecondDrag = await page.locator('#generic').evaluate(el => el.style.translate);
  await drag('#generic', 30, 0);
  const afterSecondDrag = await page.locator('#generic').evaluate(el => el.style.translate);
  if (afterSecondDrag === beforeSecondDrag) fail('Zweiter Generic-Drag verändert die Position nicht.');
  const undone = await page.evaluate(() => window.KPTouchGestureRuntime.undo());
  if (!undone) fail('Generic-Rückgängig meldet keinen Erfolg.');
  const afterUndo = await page.locator('#generic').evaluate(el => el.style.translate);
  if (afterUndo !== beforeSecondDrag) fail(`Generic-Rückgängig stellt Position nicht wieder her: ${afterUndo} statt ${beforeSecondDrag}`);
  state = await page.evaluate(() => ({ writes: [...window.__writes], dirty: window.KPTouchGestureRuntime?.isDirty?.() }));
  if (state.writes.length !== 1) fail('Rückgängig hat unerwartet gespeichert.');
  if (!state.dirty) fail('Rückgängig markiert den lokalen Entwurf nicht als ungespeichert.');

  // Entwurf wieder sichern, damit die folgenden Zähler eindeutig bleiben.
  await page.evaluate(() => window.KPTouchGestureRuntime.flush());

  // 3) Die komplette mobile Menükarte wird als eine Einheit verschoben, ohne Auto-Save.
  const menuBefore = await page.locator('.wp-block-navigation__responsive-close').evaluate(el => el.style.transform);
  const writesBeforeMenu = await page.evaluate(() => window.__writes.length);
  await drag('.wp-block-navigation__responsive-close', 52, -18);
  const menuState = await page.evaluate(() => ({
    transform: document.querySelector('.wp-block-navigation__responsive-close')?.style.transform || '',
    dirty: window.KPFreeLayoutRuntime?.isDirty?.(),
    writes: window.__writes.length
  }));
  if (!menuState.dirty) fail('Menü-Drag markiert keinen lokalen Free-Layout-Entwurf.');
  if (!menuState.transform || menuState.transform === menuBefore) fail(`Menükarte bewegt sich nicht als Einheit: ${menuState.transform}`);
  if (menuState.writes !== writesBeforeMenu) fail('Menü-Drag speichert automatisch.');

  // 4) Orange Speichern-Taste bündelt offene Touch-Entwürfe und reicht den normalen Editor-Save genau einmal weiter.
  const writesBeforeButton = await page.evaluate(() => window.__writes.length);
  await page.locator('.kp-fe2-save').click();
  await page.waitForTimeout(120);
  const saveState = await page.evaluate(() => ({
    writes: [...window.__writes],
    nativeSaveClicks: window.__nativeSaveClicks,
    freeDirty: window.KPFreeLayoutRuntime?.isDirty?.(),
    genericDirty: window.KPTouchGestureRuntime?.isDirty?.()
  }));
  const newWrites = saveState.writes.slice(writesBeforeButton);
  if (!newWrites.includes('kp_touch_free_layout_save')) fail(`Orange Speichern sichert Free-Layout nicht: ${newWrites.join(', ')}`);
  if (saveState.freeDirty || saveState.genericDirty) fail('Nach orange Speichern bleibt ein Touch-Entwurf dirty.');
  if (saveState.nativeSaveClicks !== 1) fail(`Normaler Editor-Save wurde ${saveState.nativeSaveClicks}x statt 1x weitergereicht.`);

  console.log('PASS: Touch-Runtimes verschieben lokal, Undo bleibt lokal und nur orange Speichern persistiert.');
} finally {
  await browser.close();
}
