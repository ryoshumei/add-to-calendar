const { test: base, chromium, expect } = require('@playwright/test');
const path = require('path');

const extensionPath = path.resolve(__dirname, '..', '..');

const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--disable-gpu',
      ],
    });

    // Wait for service worker to be ready
    if (context.serviceWorkers().length === 0) {
      await context.waitForEvent('serviceworker');
    }

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const [serviceWorker] = context.serviceWorkers();
    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },

  popupPage: async ({ context, extensionId }, use) => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await use(popupPage);
  },

  testPage: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto('https://example.com');
    await use(page);
  },
});

module.exports = { test, expect };