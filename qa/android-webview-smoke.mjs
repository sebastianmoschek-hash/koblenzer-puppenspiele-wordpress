import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const port = process.env.ANDROID_WEBVIEW_CDP_PORT || '9225';
const adb = process.env.ANDROID_ADB;
if (!adb) throw new Error('ANDROID_ADB wurde für den nativen Zurück-Test nicht gesetzt.');
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
try {
  const pages = browser.contexts().flatMap(context => context.pages());
  const page = pages.find(candidate => candidate.url().startsWith('https://appassets.androidplatform.net/assets/index.html'));
  if (!page) throw new Error('Lokale Editor-V2-WebView wurde nicht gefunden.');
  await page.waitForFunction(() => window.KPEditorV2 && window.KPEditorV2AI, null, { timeout: 15000 });
  const inventory = await page.evaluate(async () => {
    document.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
    await Promise.all([...document.images].map(image => image.decode().catch(() => null)));
    return { images: [...document.images].length, brokenImages: [...document.images].filter(image => !image.naturalWidth).length, url: location.href };
  });
  await page.waitForFunction(() => window.KPEditorV2.store.get().mode === 'edit' && !document.querySelector('#editor')?.hidden);
  const edit = await page.evaluate(() => window.KPEditorV2.store.get().mode === 'edit');
  await page.locator('.hero-visual img').click({ position: { x: 20, y: 20 } });
  const toolbar = await page.locator('#kpV2Toolbar').isVisible();
  await page.locator('#kpV2Toolbar [data-v2-tool="edit"]').click();
  const imageEditor = await page.locator('#kpProImageEditor').isVisible();
  await page.locator('#kpProImageEditor [data-close]').click();
  execFileSync(adb, ['shell', 'input', 'keyevent', '4'], { stdio: 'ignore' });
  await page.waitForFunction(() => window.KPEditorV2.store.get().mode === 'view');
  const view = await page.evaluate(() => window.KPEditorV2.store.get().mode === 'view');
  const processAlive = Boolean(execFileSync(adb, ['shell', 'pidof', 'de.koblenzerpuppenspiele.techniker'], { encoding: 'utf8' }).trim());
  const result = { ...inventory, nativeEditTap: true, edit, toolbar, imageEditor, nativeBack: view && processAlive, view };
  if (!result.edit || !result.toolbar || !result.imageEditor || !result.nativeBack || !result.view || result.brokenImages) throw new Error(`Android-WebView-Prüfung fehlgeschlagen: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result));
  console.log('Android WebView V2 Smoke erfolgreich.');
} finally {
  await browser.close();
}
