const { test, expect } = require('@playwright/test');
const path = require('path');

const scriptPath = path.resolve(__dirname, '../../wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-agent-fast-chat.js');

test('Lokale KI toggles immediately and shows ollama hint', async ({ page }) => {
  await page.setContent(`
    <html>
      <body>
        <div class="kp-wa-status">Bereit</div>
        <div class="kp-wa-messages"></div>
        <input class="kp-wa-input" />
        <button class="kp-wa-send"></button>
        <button class="kp-wa-mic"></button>
        <button class="kp-wa-close"></button>
        <script>
          window.KPOwnerWebAgent = { canEdit: true, ajaxUrl: '/noop', repairNonce: 'nonce' };
        </script>
      </body>
    </html>
  `);

  await page.addScriptTag({ path: scriptPath });

  const toggle = page.locator('.kp-wa-live-toggle');
  await expect(toggle).toHaveText('◎ Live lokal öffnen');

  await toggle.click();

  await expect(toggle).toHaveText('■ Live beenden');
  await expect(page.locator('.kp-wa-status')).toContainText('Lokale KI nicht erreichbar – bitte Ollama auf Port 11434 starten');
  await expect(page.locator('.kp-wa-local-live')).toHaveClass(/is-live/);
});
