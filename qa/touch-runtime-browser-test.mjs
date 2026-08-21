import { chromium } from 'playwright';

const assets = {
  gestures: process.env.KP_TOUCH_GESTURES || '/tmp/touch-gestures.js',
  free: process.env.KP_TOUCH_FREE || '/tmp/touch-free-layout.js',
  bridge: process.env.KP_TOUCH_BRIDGE || '/tmp/touch-editor-bridge.js',
  menuX: process.env.KP_MENU_X || '/tmp/owner-menu-x.js',
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });

function fail(message) {
  throw new Error(message);
}

async function bootstrap() {
  await page.setContent(`<!doctype html><html><body>
    <div class="kp-fe2-toolbar" style="position:fixed;top:0;left:0;z-index:20;background:#fff">
      <button class="kp-fe2-save">Speichern</button>
      <button class="kp-fe2-undo">Rückgängig</button>
      <div class="kp-fe2-hint"></div>
      <div class="kp-fe2-toast"></div>
    </div>
    <button data-action="design" id="open-design" style="position:absolute;left:12px;top:80px">Design</button>
    <div class="kp-oa-sheet is-design">
      <button class="kp-oa-design-save">Design speichern</button>
      <button class="kp-oa-design-reset">Design zurücksetzen</button>
      <div class="kp-oa-tab" data-pane="menu"><h3>Handy / Tablet</h3></div>
    </div>
    <div id="generic" data-kp-edit-key="generic-test" style="position:absolute;left:30px;top:150px;width:120px;height:80px;background:#ddd">Generic</div>
    <header class="kp-header-stage"><img id="header-image" alt="" style="position:absolute;left:210px;top:130px;width:90px;height:70px" /></header>
    <nav class="kp-site-nav">
      <button class="wp-block-navigation__responsive-container-open" style="position:absolute;left:300px;top:70px;width:50px;height:50px">Menü</button>
      <div class="wp-block-navigation__responsive-container">
        <div class="wp-block-navigation__responsive-close" style="position:absolute;left:70px;top:390px;width:250px;height:240px;background:#ccc">Menükarte</div>
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
    window.KPOwnerMenuX = {
      ajaxUrl: '/ajax', nonce: 'nonce', value: 0
    };
    window.fetch = async (_url, init = {}) => {
      const body = init.body;
      const action = body instanceof FormData ? String(body.get('action') || '') : '';
      window.__writes.push(action);
      let global = {}, page = {};
      try { global = JSON.parse(String(body?.get?.('global') || '{}')); } catch {}
      try { page = JSON.parse(String(body?.get?.('page') || '{}')); } catch {}
      const value = Number(body?.get?.('value') || 0);
      return new Response(JSON.stringify({ success: true, data: { global, page, value } }), {
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
  await page.addScriptTag({ path: assets.menuX });
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

async function pinch(selector, startGap = 40, endGap = 100) {
  const result = await page.evaluate(({ selector, startGap, endGap }) => {
    const el = document.querySelector(selector);
    if (!(el instanceof Element) || typeof Touch !== 'function' || typeof TouchEvent !== 'function') {
      return { supported: false };
    }
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const mk = (id, x, y) => new Touch({
      identifier: id, target: el,
      clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y,
      radiusX: 2, radiusY: 2, rotationAngle: 0, force: 1
    });
    const dispatch = (type, touches, changedTouches) => el.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches, targetTouches: touches, changedTouches
    }));
    const a0 = mk(1, cx - startGap / 2, cy);
    const b0 = mk(2, cx + startGap / 2, cy);
    dispatch('touchstart', [a0, b0], [a0, b0]);
    const a1 = mk(1, cx - endGap / 2, cy);
    const b1 = mk(2, cx + endGap / 2, cy);
    dispatch('touchmove', [a1, b1], [a1, b1]);
    dispatch('touchend', [], [a1, b1]);
    return { supported: true };
  }, { selector, startGap, endGap });
  return result.supported;
}

async function clickSaveAndWait() {
  await page.locator('.kp-fe2-save').click();
  await page.waitForTimeout(140);
}

try {
  await bootstrap();

  await drag('#generic', 44, 26);
  let state = await page.evaluate(() => ({
    translate: document.querySelector('#generic')?.style.translate || '',
    dirty: window.KPTouchGestureRuntime?.isDirty?.(),
    writes: [...window.__writes]
  }));
  if (!state.dirty) fail('Generic-Drag markiert keinen lokalen Entwurf.');
  if (!state.translate || state.translate === '0px 0px') fail(`Generic-Drag bewegt das Element nicht: ${state.translate}`);
  if (state.writes.length !== 0) fail(`Generic-Drag speichert automatisch: ${state.writes.join(', ')}`);

  await clickSaveAndWait();
  state = await page.evaluate(() => ({
    dirty: window.KPTouchGestureRuntime?.isDirty?.(),
    writes: [...window.__writes],
    nativeSaveClicks: window.__nativeSaveClicks
  }));
  if (state.dirty) fail('Generic-Entwurf bleibt nach orange Speichern dirty.');
  if (state.writes.filter(x => x === 'kp_touch_gesture_save').length !== 1) fail(`Orange Speichern schreibt Generic nicht exakt einmal: ${state.writes.join(', ')}`);
  if (state.nativeSaveClicks !== 1) fail(`Normaler Editor-Save wurde nach Generic-Drag ${state.nativeSaveClicks}x statt 1x weitergereicht.`);

  const beforeSecondDrag = await page.locator('#generic').evaluate(el => el.style.translate);
  const writesBeforeUndo = await page.evaluate(() => window.__writes.length);
  await drag('#generic', 30, 0);
  const afterSecondDrag = await page.locator('#generic').evaluate(el => el.style.translate);
  if (afterSecondDrag === beforeSecondDrag) fail('Zweiter Generic-Drag verändert die Position nicht.');
  await page.locator('.kp-fe2-undo').click();
  await page.waitForTimeout(40);
  const afterUndo = await page.locator('#generic').evaluate(el => el.style.translate);
  if (afterUndo !== beforeSecondDrag) fail(`Rückgängig stellt Position nicht wieder her: ${afterUndo} statt ${beforeSecondDrag}`);
  state = await page.evaluate(() => ({ writes: window.__writes.length, dirty: window.KPTouchGestureRuntime?.isDirty?.() }));
  if (state.writes !== writesBeforeUndo) fail('Rückgängig hat unerwartet gespeichert.');
  if (!state.dirty) fail('Rückgängig markiert den lokalen Entwurf nicht als ungespeichert.');
  await clickSaveAndWait();

  const writesBeforePinch = await page.evaluate(() => window.__writes.length);
  const scaleBefore = await page.locator('#generic').evaluate(el => el.style.scale || '1');
  const pinchSupported = await pinch('#generic');
  if (!pinchSupported) fail('Chromium unterstützt den synthetischen Touch-/Pinch-Test nicht.');
  await page.waitForTimeout(40);
  const pinchState = await page.evaluate(() => ({
    scale: document.querySelector('#generic')?.style.scale || '1',
    dirty: window.KPTouchGestureRuntime?.isDirty?.(),
    writes: window.__writes.length
  }));
  if (pinchState.scale === scaleBefore || Number(pinchState.scale) <= 1) fail(`Zwei-Finger-Zoom verändert die Skala nicht: ${pinchState.scale}`);
  if (!pinchState.dirty) fail('Zwei-Finger-Zoom markiert keinen lokalen Entwurf.');
  if (pinchState.writes !== writesBeforePinch) fail('Zwei-Finger-Zoom speichert automatisch.');
  await clickSaveAndWait();

  const menuBefore = await page.locator('.wp-block-navigation__responsive-close').evaluate(el => el.style.transform);
  const writesBeforeMenu = await page.evaluate(() => window.__writes.length);
  const nativeBeforeMenuSave = await page.evaluate(() => window.__nativeSaveClicks);
  await drag('.wp-block-navigation__responsive-close', 52, -18);
  const menuState = await page.evaluate(() => ({
    transform: document.querySelector('.wp-block-navigation__responsive-close')?.style.transform || '',
    dirty: window.KPFreeLayoutRuntime?.isDirty?.(),
    writes: window.__writes.length
  }));
  if (!menuState.dirty) fail('Menü-Drag markiert keinen lokalen Free-Layout-Entwurf.');
  if (!menuState.transform || menuState.transform === menuBefore) fail(`Menükarte bewegt sich nicht als Einheit: ${menuState.transform}`);
  if (menuState.writes !== writesBeforeMenu) fail('Menü-Drag speichert automatisch.');

  await clickSaveAndWait();
  const menuSaveState = await page.evaluate(() => ({
    writes: [...window.__writes],
    nativeSaveClicks: window.__nativeSaveClicks,
    freeDirty: window.KPFreeLayoutRuntime?.isDirty?.(),
    genericDirty: window.KPTouchGestureRuntime?.isDirty?.()
  }));
  const menuNewWrites = menuSaveState.writes.slice(writesBeforeMenu);
  if (!menuNewWrites.includes('kp_touch_free_layout_save')) fail(`Orange Speichern sichert Free-Layout nicht: ${menuNewWrites.join(', ')}`);
  if (menuSaveState.freeDirty || menuSaveState.genericDirty) fail('Nach orange Speichern bleibt ein Touch-Entwurf dirty.');
  if (menuSaveState.nativeSaveClicks !== nativeBeforeMenuSave + 1) fail('Normaler Editor-Save wird nach Menü-Drag nicht genau einmal weitergereicht.');

  await page.locator('#open-design').click();
  await page.waitForTimeout(40);
  const slider = page.locator('[data-kp-menu-x] input[type="range"]');
  if (await slider.count() !== 1) fail('Horizontaler Handy-/Tablet-Menüregler wurde nicht sichtbar injiziert.');
  const writesBeforeSlider = await page.evaluate(() => window.__writes.length);
  await slider.evaluate(el => {
    el.value = '64';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const sliderState = await page.evaluate(() => ({
    css: document.documentElement.style.getPropertyValue('--kp-owner-menu-offset-x').trim(),
    writes: window.__writes.length
  }));
  if (sliderState.css !== '64px') fail(`Horizontaler Menüregler greift live nicht: ${sliderState.css}`);
  if (sliderState.writes !== writesBeforeSlider) fail('Horizontaler Menüregler speichert bereits beim Schieben.');
  await page.locator('.kp-oa-design-save').click();
  await page.waitForTimeout(80);
  const sliderWrites = await page.evaluate(() => window.__writes.slice());
  if (sliderWrites.filter(x => x === 'kp_owner_menu_x_save').length !== 1) fail(`Menüregler wird beim Design-Speichern nicht genau einmal persistiert: ${sliderWrites.join(', ')}`);

  console.log('PASS: Drag, Pinch, Undo, Menükarte, orange Speichern und Handy-/Tablet-Menüregler funktionieren ohne Auto-Save.');
} finally {
  await browser.close();
}
