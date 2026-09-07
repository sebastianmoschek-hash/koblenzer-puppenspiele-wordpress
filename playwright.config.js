const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const authFile = path.join(__dirname, 'tests/e2e/.auth/admin.json');
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://neu.koblenzer-puppenspiele.de';
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\b/i.test(baseURL);

module.exports = defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: [['list'], ['json', { outputFile: './tests/screenshots/playwright-results.json' }]],
  use: {
    baseURL,
    storageState: authFile,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    launchOptions: { slowMo: 3000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: isLocal ? {
    command: 'php -S localhost:8000 -t .',
    url: `${baseURL}/package.json`,
    reuseExistingServer: true,
    timeout: 30_000,
  } : undefined,
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
    },
    {
      name: 'editor-visual',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
