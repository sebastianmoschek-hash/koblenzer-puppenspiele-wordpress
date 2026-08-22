import { chromium } from 'playwright';
import path from 'node:path';

const safetyJs = process.env.KP_TOUCH_SAFETY || path.resolve('wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-gesture-safety.js');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const fail = message => { throw new Error(message); };

async function pointer(selector, type, x, y, pointerId = 17) {
  await page.locator(selector).evaluate((el, args) => {
    el.dispatchEvent(new PointerEvent(args.type, {
      bubbles: true,
      cancelable: true,
      pointerId: args.pointerId,
      pointerType: 'touch',
      isPrimary: true,
      clientX: args.x,
      clientY: args.y,
      buttons: args.type === 'pointerup' ? 0 : 1,
      pressure: args.type === 'pointerup' ? 0 : 0.5,
    }));
  }, { type, x, y, pointerId });
}

try {
  await page.setContent(`<!doctype html><html><body class="kp-touch-gestures-enabled" style="min-height:2400px;margin:0">
    <div style="height:280px"></div>
    <div id="range-row" style="position:relative;margin:0 30px;width:330px;padding:24px 0">
      <input id="range" type="range" min="0" max="100" step="1" value="50" style="width:300px" />
    </div>
    <div style="height:1800px"></div>
  </body></html>`);

  await page.evaluate(() => {
    window.KPTouchGestures = { editMode: true, canEdit: true, holdMs: 320 };
    window.__sliderInputEvents = 0;
    window.__sliderChangeEvents = 0;
    document.querySelector('#range')?.addEventListener('input', () => window.__sliderInputEvents += 1);
    document.querySelector('#range')?.addEventListener('change', () => window.__sliderChangeEvents += 1);
  });

  await page.addScriptTag({ path: safetyJs });
  await page.waitForTimeout(50);

  const guard = page.locator('.kp-touch-range-hardlock');
  if (await guard.count() !== 1) fail('Slider-Schutzschicht wurde nicht erzeugt.');
  const hardlock = await page.locator('#range').getAttribute('data-kp-touch-hardlocked');
  if (hardlock !== '3') fail(`Unerwartete Hardlock-Version: ${hardlock}`);

  let box = await guard.boundingBox();
  if (!box) fail('Slider-Schutzschicht ist nicht sichtbar.');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // A normal swipe must scroll, not change the slider.
  const initial = Number(await page.locator('#range').inputValue());
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await pointer('.kp-touch-range-hardlock', 'pointerdown', cx, cy, 21);
  await page.waitForTimeout(35);
  await pointer('.kp-touch-range-hardlock', 'pointermove', cx, cy - 70, 21);
  await pointer('.kp-touch-range-hardlock', 'pointerup', cx, cy - 70, 21);
  await page.waitForTimeout(40);
  const quick = await page.evaluate(() => ({
    value: Number(document.querySelector('#range')?.value || 0),
    scrollY: window.scrollY,
    inputs: window.__sliderInputEvents,
    changes: window.__sliderChangeEvents,
  }));
  if (quick.value !== initial) fail(`Normales Wischen verändert den Regler: ${JSON.stringify(quick)}`);
  if (quick.scrollY <= scrollBefore) fail(`Normales Wischen scrollt die Seite nicht: ${JSON.stringify(quick)}`);
  if (quick.inputs !== 0 || quick.changes !== 0) fail(`Normales Wischen feuert Slider-Events: ${JSON.stringify(quick)}`);

  // After a hold, the exact same pointer must become a horizontal slider drag.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(30);
  box = await guard.boundingBox();
  if (!box) fail('Slider-Schutzschicht nach Scroll nicht sichtbar.');
  const startX = box.x + box.width * 0.35;
  const targetX = box.x + box.width * 0.86;
  const y = box.y + box.height / 2;

  await pointer('.kp-touch-range-hardlock', 'pointerdown', startX, y, 31);
  await page.waitForTimeout(370);
  const armed = await guard.evaluate(el => el.classList.contains('is-armed'));
  if (!armed) fail('Regler wird nach langem Halten nicht entsperrt.');
  await pointer('.kp-touch-range-hardlock', 'pointermove', targetX, y, 31);
  await pointer('.kp-touch-range-hardlock', 'pointerup', targetX, y, 31);
  await page.waitForTimeout(40);

  const held = await page.evaluate(() => ({
    value: Number(document.querySelector('#range')?.value || 0),
    inputs: window.__sliderInputEvents,
    changes: window.__sliderChangeEvents,
    armed: document.querySelector('.kp-touch-range-hardlock')?.classList.contains('is-armed') || false,
  }));
  if (held.value < 75) fail(`Halten + derselbe Finger ziehen bewegt den Regler nicht ausreichend: ${JSON.stringify(held)}`);
  if (held.inputs < 1 || held.changes !== 1) fail(`Slider-Events nach Halten/Ziehen fehlerhaft: ${JSON.stringify(held)}`);
  if (held.armed) fail('Slider bleibt nach Loslassen entsperrt.');

  console.log(`PASS: Touch-Regler – Wischen scrollt; Halten + derselbe Pointer zieht von ${initial} auf ${held.value}; input/change korrekt.`);
} finally {
  await browser.close();
}
