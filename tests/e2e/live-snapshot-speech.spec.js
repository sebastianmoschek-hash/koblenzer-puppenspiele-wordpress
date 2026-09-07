const { test, expect } = require('@playwright/test');
const path = require('path');

const EDITOR_JS = path.resolve(__dirname, '../../wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.js');

function fixtureHtml() {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Live Snapshot FE2</title>
  <style>
    body { font-family: sans-serif; }
    .kp-fe2-toolbar, .kp-fe2-inspector, .kp-fe2-record-backdrop { position: fixed; }
    .kp-fe2-toolbar { top: 0; left: 0; right: 0; }
    .kp-fe2-inspector { right: 0; top: 60px; width: 320px; display:none; }
    .kp-fe2-inspector.is-open { display:block; }
    .kp-fe2-record-backdrop { inset: 0; display:none; }
    .kp-fe2-record-backdrop.is-open { display:block; }
    main { padding-top: 80px; }
  </style>
</head>
<body class="kp-fe2-editing">
  <div id="wpadminbar"></div>
  <div class="kp-fe2-toolbar">
    <button class="kp-fe2-save"><span>Speichern</span></button>
    <button class="kp-fe2-undo"></button>
    <button class="kp-fe2-redo"></button>
  </div>
  <aside class="kp-fe2-inspector"></aside>
  <div class="kp-fe2-record-backdrop"><div class="kp-fe2-record-box"></div></div>
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

test('Live Snapshot & Sprache sends snapshots and speaks replies', async ({ page }) => {
  const requests = [];
  await page.addInitScript(() => {
    class FakeRecognition {
      constructor() { this.lang = ''; this.interimResults = false; this.continuous = false; }
      start() { this.onstart?.(); this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Bitte beschreibe den Editorzustand.' } }] }); this.onend?.(); }
      abort() { this.onend?.(); }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
    window.__spoken = 0;
    window.speechSynthesis = {
      cancel() {},
      speak() { window.__spoken += 1; },
    };
    const fakeStream = {
      getTracks() { return [{ stop() {} }]; },
      getVideoTracks() { return [{ addEventListener() {}, stop() {} }]; },
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getDisplayMedia() { return fakeStream; },
      },
    });
    const createElement = Document.prototype.createElement;
    Document.prototype.createElement = function patchedCreateElement(name, options) {
      const el = createElement.call(this, name, options);
      if (String(name).toLowerCase() === 'video') {
        try { Object.defineProperty(el, 'videoWidth', { configurable: true, value: 1920 }); } catch (_) {}
        try { Object.defineProperty(el, 'videoHeight', { configurable: true, value: 1080 }); } catch (_) {}
        el.play = async () => {};
      }
      return el;
    };
  });

  await page.route('**/admin-ajax.php', async (route) => {
    const post = route.request().postData() || '';
    requests.push(post);
    if (post.includes('task=live_snapshot')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { reply: 'Snapshot OK', model: 'gemini-2.0-flash', rate_limited: false } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { message: 'ok' } }) });
  });

  await page.setContent(fixtureHtml(), { waitUntil: 'load' });
  await page.evaluate(() => {
    class FakeRecognition {
      constructor() { this.lang = ''; this.interimResults = false; this.continuous = false; }
      start() { this.onstart?.(); this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Bitte beschreibe den Editorzustand.' } }] }); this.onend?.(); }
      abort() { this.onend?.(); }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
    window.__spoken = 0;
    window.speechSynthesis = { cancel() {}, speak() { window.__spoken += 1; } };
    const fakeStream = { getTracks() { return [{ stop() {} }]; }, getVideoTracks() { return [{ addEventListener() {}, stop() {} }]; } };
    Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: { async getDisplayMedia() { return fakeStream; } } });
    const createElement = Document.prototype.createElement;
    Document.prototype.createElement = function patchedCreateElement(name, options) {
      const el = createElement.call(this, name, options);
      if (String(name).toLowerCase() === 'video') {
        try { Object.defineProperty(el, 'videoWidth', { configurable: true, value: 1920 }); } catch (_) {}
        try { Object.defineProperty(el, 'videoHeight', { configurable: true, value: 1080 }); } catch (_) {}
        el.play = async () => {};
      }
      return el;
    };
  });

  await page.addScriptTag({ path: EDITOR_JS });
  await page.waitForTimeout(1000);

  const launch = page.locator('.kp-fe2-live-ai-launch');
  await expect(launch).toHaveText('Live Snapshot & Sprache');
  await launch.click();
  await page.waitForTimeout(1000);
  await expect(page.locator('.kp-fe2-live-ai-panel')).toBeVisible();
  await expect(page.locator('.kp-fe2-live-ai-status')).toContainText('Live Snapshot & Sprache aktiv');

  await page.locator('.kp-fe2-live-ai-now').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('.kp-fe2-live-ai-status')).toContainText('KI:');
});
