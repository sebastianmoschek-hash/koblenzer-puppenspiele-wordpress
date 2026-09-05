import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, '../wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.js');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.setContent('<!doctype html><html><body><main><a id="button" data-kp-edit-key="b-link" data-kp-block-name="core/button" href="/kontakt/">Kontakt</a><div data-kp-edit-key="b-spare" data-kp-block-name="core/group">Reserve</div></main></body></html>');
  await page.evaluate(() => {
    window.KPFrontendEditorV2 = { editMode:true, canEdit:true, ajaxUrl:'/ajax', nonce:'test', pageKey:'post-17', global:{}, page:{}, exitUrl:'/', editUrl:'/?kp_edit=1' };
    window.fetch = async () => ({ json: async () => ({ success:true, data:{ message:'Gespeichert.' } }) });
  });
  await page.addScriptTag({ path: script });
  await page.locator('#button').evaluate(el => el.click());
  const field = page.locator('.kp-fe2-link-url');
  await field.fill('javascript:alert(1)');
  if ((await page.locator('#button').getAttribute('href') || '').toLowerCase().startsWith('javascript:')) throw new Error('Unsicheres javascript:-Linkziel wurde in die Vorschau übernommen.');
  if (!(await field.evaluate(el => !el.checkValidity()))) throw new Error('Unsicheres Linkziel wird dem Nutzer nicht als ungültig angezeigt.');
  await field.fill('https://example.org/karten');
  const httpsHref = await page.locator('#button').getAttribute('href');
  if (httpsHref !== 'https://example.org/karten') throw new Error(`Gültiges HTTPS-Linkziel wurde nicht übernommen: href=${httpsHref}, value=${await field.inputValue()}, validation=${await field.evaluate(el => el.validationMessage)}`);
  if (!(await field.evaluate(el => el.checkValidity()))) throw new Error('Gültiges HTTPS-Linkziel bleibt fälschlich ungültig.');
  await field.fill('/kontakt/');
  if (await page.locator('#button').getAttribute('href') !== '/kontakt/') throw new Error('Interner relativer Link wurde nicht übernommen.');
  console.log('PASS frontend link safety: unsafe schemes blocked; HTTPS and relative links remain editable.');
} finally {
  await browser.close();
}
