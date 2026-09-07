const { test: base, chromium, expect } = require('@playwright/test');
const path = require('path');
const { startStubBackend, buildStubSession } = require('./stub-backend.js');

const extensionPath = path.resolve(__dirname, '..', '..');

// Test-only key: with it absent from chrome.storage.local — every real
// install — the extension talks to the production backend in config.js.
const BACKEND_BASE_URL_OVERRIDE_KEY = 'backend_base_url_override';

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

  // A local backend the extension can be pointed at, torn down with the test.
  stubBackend: async ({}, use) => {
    const stub = await startStubBackend();
    await use(stub);
    await stub.close();
  },

  // A page served by the stub, so a Selection can be highlighted without
  // reaching the network.
  sourcePage: async ({ context, stubBackend }, use) => {
    const page = await context.newPage();
    await page.goto(stubBackend.pageUrl);
    await use(page);
  },

  // Seeds the backend override and a session, using the same storage keys the
  // auth client persists, then re-runs the service worker's auth start-up so
  // it picks both up. After this the extension reports itself signed in and
  // every backend call lands on the stub.
  signedIn: async ({ context, stubBackend }, use) => {
    const [serviceWorker] = context.serviceWorkers();
    const session = buildStubSession();

    const authState = await serviceWorker.evaluate(
      async ({ session, baseUrl, overrideKey }) => {
        await chrome.storage.local.set({
          [overrideKey]: baseUrl,
          supabase_session: session,
        });
        await initializeAuth();
        return {
          isAuthenticated: supabaseAuth?.isAuthenticated() ?? false,
          email: currentUser?.email ?? null,
        };
      },
      {
        session,
        baseUrl: stubBackend.baseUrl,
        overrideKey: BACKEND_BASE_URL_OVERRIDE_KEY,
      }
    );

    if (!authState.isAuthenticated) {
      throw new Error(
        'Seeded session did not sign the extension in — the stub backend was likely not reached.'
      );
    }

    await use({ session, ...authState });
  },
});

// Highlights an element's text the way a user drags across it, and returns the
// Selection.
async function selectText(page, selector) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) throw new Error(`Nothing to select at ${sel}`);
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  }, selector);
}

// Runs the Extraction the way Chrome does when the context-menu item is
// clicked: the service worker's handler, given the front tab and the text the
// user highlighted. Resolves once the flow has finished with the tab.
async function extractFromSelection(context, page) {
  const [serviceWorker] = context.serviceWorkers();
  await page.bringToFront();
  const selectionText = await page.evaluate(() => window.getSelection().toString());

  return serviceWorker.evaluate(async (text) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await handleContextMenuClick({ menuItemId: 'addToCalendar', selectionText: text }, tab);
    return { tabId: tab.id, selectionText: text };
  }, selectionText);
}

async function openPopup(context, extensionId) {
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  return popupPage;
}

module.exports = {
  test,
  expect,
  selectText,
  extractFromSelection,
  openPopup,
  BACKEND_BASE_URL_OVERRIDE_KEY,
};
