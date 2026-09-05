import fs from 'node:fs';
import { chromium } from 'playwright';

const envPath = `${process.env.LOCALAPPDATA || ''}/hermes/secrets/staging-test.env`;
if (!process.env.KP_E2E_TOKEN && envPath && fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx > 0) process.env[line.slice(0, idx)] = line.slice(idx + 1);
  }
}

const base = (process.env.KP_E2E_BASE || process.env.STAGING_TEST_URL || 'https://neu.koblenzer-puppenspiele.de').replace(/\/$/, '');
const token = process.env.KP_E2E_TOKEN || '';
const user = process.env.STAGING_TEST_USER || '';
const pass = process.env.STAGING_TEST_PASS || '';
if (!token && (!user || !pass)) throw new Error('Weder kurzlebiger E2E-Token noch lokaler Staging-Testzugang vorhanden.');

const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const result = { base, checks: {}, response: '' };

try {
  if (token) {
    await page.goto(`${base}/?kp_e2e_login=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } else {
    await page.goto(`${base}/wp-login.php?redirect_to=${encodeURIComponent(`${base}/?kp_edit=1&kp_ai=1`)}&testcookie=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#user_login').fill(user);
    await page.locator('#user_pass').fill(pass);
    await Promise.all([
      page.waitForURL(url => !url.pathname.includes('wp-login.php'), { timeout: 30000 }),
      page.locator('#wp-submit').click(),
    ]);
  }

  await page.goto(`${base}/?kp_edit=1&kp_ai=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('.kp-wa-bar [data-kp-wa-ai]').waitFor({ state: 'visible', timeout: 20000 });
  result.checks.ownerAgentVisible = true;

  await page.locator('.kp-wa-bar [data-kp-wa-ai]').click();
  const input = page.locator('.kp-wa-input');
  await input.waitFor({ state: 'visible', timeout: 10000 });
  result.checks.chatOpened = true;

  const before = await page.locator('.kp-wa-msg').count();
  await input.fill('Antworte nur mit: KI-Bereitschaft bestätigt. Bitte nichts verändern.');
  await page.locator('.kp-wa-send').click();
  await page.waitForFunction(
    count => document.querySelectorAll('.kp-wa-msg').length >= count + 2 && !document.querySelector('.kp-wa-status')?.classList.contains('is-busy'),
    before,
    { timeout: 45000 },
  );

  const assistant = page.locator('.kp-wa-msg.is-assistant').last();
  result.response = (await assistant.innerText()).replace(/^KI\s*/i, '').trim();
  const status = (await page.locator('.kp-wa-status').innerText()).trim();
  result.status = status;
  result.checks.noProtectedService503 = !/nicht vollständig geladen|Cloud-Fallback fehlgeschlagen/i.test(`${result.response} ${status}`);
  result.checks.realAnswer = /KI-Bereitschaft bestätigt/i.test(result.response);

  if (!result.checks.noProtectedService503) throw new Error(`Geschützter KI-Dienst nicht bereit: ${status} | ${result.response}`);
  if (!result.checks.realAnswer) throw new Error(`Keine erwartete echte KI-Antwort: ${status} | ${result.response}`);

  result.ok = true;
  console.log(JSON.stringify(result));
} finally {
  await context.close();
  await browser.close();
}
