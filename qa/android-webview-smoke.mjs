import { chromium } from 'playwright';

const port = process.env.ANDROID_WEBVIEW_CDP_PORT || '9225';
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
try {
  const pages = browser.contexts().flatMap(context => context.pages());
  const page = pages.find(candidate => candidate.url().startsWith('http://127.0.0.1:8080/'));
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
  await page.locator('#close').click();
  const view = await page.evaluate(() => window.KPEditorV2.store.get().mode === 'view');
  const result = { ...inventory, nativeEditTap: true, edit, toolbar, imageEditor, view };
  if (!result.edit || !result.toolbar || !result.imageEditor || !result.view || result.brokenImages) throw new Error(`Android-WebView-Prüfung fehlgeschlagen: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result));
  console.log('Android WebView V2 Smoke erfolgreich.');
} finally {
  await browser.close();
}
