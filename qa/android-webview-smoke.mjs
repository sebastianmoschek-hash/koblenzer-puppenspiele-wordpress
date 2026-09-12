import { chromium } from 'playwright';

const port = process.env.ANDROID_WEBVIEW_CDP_PORT || '9225';
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
try {
  const pages = browser.contexts().flatMap(context => context.pages());
  const page = pages.find(candidate => candidate.url().startsWith('http://127.0.0.1:8080/'));
  if (!page) throw new Error('Lokale Editor-V2-WebView wurde nicht gefunden.');
  await page.waitForFunction(() => window.KPEditorV2 && window.KPEditorV2AI, null, { timeout: 15000 });
  const result = await page.evaluate(async () => {
    document.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
    await Promise.all([...document.images].map(image => image.decode().catch(() => null)));
    document.getElementById('edit')?.click();
    const edit = window.KPEditorV2.store.get().mode === 'edit';
    document.getElementById('close')?.click();
    const view = window.KPEditorV2.store.get().mode === 'view';
    return { edit, view, images: [...document.images].length, brokenImages: [...document.images].filter(image => !image.naturalWidth).length, url: location.href };
  });
  if (!result.edit || !result.view || result.brokenImages) throw new Error(`Android-WebView-Prüfung fehlgeschlagen: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result));
  console.log('Android WebView V2 Smoke erfolgreich.');
} finally {
  await browser.close();
}
