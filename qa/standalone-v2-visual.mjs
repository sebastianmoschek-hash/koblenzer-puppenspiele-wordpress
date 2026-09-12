import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.STANDALONE_BASE_URL || 'http://127.0.0.1:8080';
const targets = [
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'tablet-820', width: 820, height: 1180, mobile: false },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false }
];
const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const target of targets) {
    const page = await browser.newPage({ viewport: { width: target.width, height: target.height }, isMobile: target.mobile, hasTouch: target.mobile });
    const pageErrors = [], responseErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(baseURL).origin) responseErrors.push(`${response.status()} ${response.url()}`); });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.KPEditorV2 && document.querySelectorAll('#shows .show-card').length > 10 && document.querySelectorAll('#reference-cards .reference').length > 10);
    await page.evaluate(async () => { document.querySelectorAll('img').forEach(image => { image.loading = 'eager'; }); await Promise.all([...document.images].map(image => image.decode().catch(() => null))); });
    const inventory = await page.evaluate(() => ({
      sections: document.querySelectorAll('main > section').length,
      headings: document.querySelectorAll('main h1,main h2,main h3').length,
      images: document.images.length,
      brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).length,
      linksWithoutTarget: [...document.querySelectorAll('a')].filter(link => !link.getAttribute('href')).length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      overflowNodes: [...document.querySelectorAll('body *')].filter(node => { const rect = node.getBoundingClientRect(); return rect.right > innerWidth + 1 || rect.left < -1 || node.scrollWidth > node.clientWidth + 1; }).slice(0, 8).map(node => ({ tag: node.tagName, id: node.id, className: String(node.className || ''), left: Math.round(node.getBoundingClientRect().left), right: Math.round(node.getBoundingClientRect().right), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }))
    }));
    let mobileMenu = true;
    if (target.mobile) {
      await page.locator('#menu').click();
      mobileMenu = await page.locator('#nav').isVisible();
      await page.locator('#nav a[href="#programm"]').click();
      mobileMenu = mobileMenu && !(await page.locator('#nav').isVisible()) && (await page.evaluate(() => location.hash)) === '#programm';
    }
    await page.screenshot({ path: new URL(`standalone-${target.name}.png`, output).pathname.slice(1), fullPage: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator('#edit').click();
    await page.waitForFunction(() => window.KPEditorV2?.store.get().mode === 'edit' && document.querySelector('#kpV2Toolbar'));
    const imageId = await page.evaluate(() => window.KPEditorV2.store.get().document.pages[0].sections.flatMap(section => section.elements).find(element => element.type === 'image')?.id);
    if (imageId) await page.locator(`[data-v2-id="${imageId}"]`).click();
    const editorVisible = Boolean(imageId) && await page.locator('#kpV2Toolbar').isVisible();
    await page.screenshot({ path: new URL(`standalone-editor-${target.name}.png`, output).pathname.slice(1), fullPage: false });
    if (editorVisible) await page.locator('#kpV2Toolbar [data-v2-tool="edit"]').click();
    const imageEditorVisible = editorVisible && await page.locator('#kpProImageEditor').isVisible();
    await page.screenshot({ path: new URL(`standalone-image-editor-${target.name}.png`, output).pathname.slice(1), fullPage: false });
    if (imageEditorVisible) await page.locator('#kpProImageEditor [data-close]').click();
    await page.locator('#close').click();
    const ok = inventory.sections >= 9 && inventory.headings >= 20 && inventory.images >= 40 && inventory.brokenImages === 0 && inventory.linksWithoutTarget === 0 && !inventory.overflow && mobileMenu && editorVisible && imageEditorVisible && pageErrors.length === 0 && responseErrors.length === 0;
    if (!ok) failures.push(`${target.name}: ${JSON.stringify({ inventory, mobileMenu, pageErrors, responseErrors })}`);
    console.log(JSON.stringify({ viewport: target.name, inventory, mobileMenu, editorVisible, imageEditorVisible, pageErrors, responseErrors }));
    await page.close();
  }
} finally {
  await browser.close();
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Standalone Visual-QA erfolgreich (${targets.length} Viewports)`);
