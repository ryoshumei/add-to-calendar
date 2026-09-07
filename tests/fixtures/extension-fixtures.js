const { test: base, chromium, expect } = require('@playwright/test');
const path = require('path');
const { startStubBackend, buildStubSession } = require('./stub-backend.js');

const extensionPath = path.resolve(__dirname, '..', '..');

// Test-only key: with it absent from chrome.storage.local — every real
// install — the extension talks to the production backend in config.js.
const BACKEND_BASE_URL_OVERRIDE_KEY = 'backend_base_url_override';

// Nothing is ever spent on it: the override sends the key path to the stub.
const STUB_API_KEY = 'sk-stub-own-key';

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

  // Stores the backend override, so every service the extension calls — the
  // Supabase auth endpoints, the Edge Functions and OpenAI — lands on the
  // stub. Signs nobody in and saves no key: the two paths add those.
  stubbedEndpoints: async ({ context, stubBackend }, use) => {
    const [serviceWorker] = context.serviceWorkers();

    await serviceWorker.evaluate(
      ({ baseUrl, overrideKey }) => chrome.storage.local.set({ [overrideKey]: baseUrl }),
      { baseUrl: stubBackend.baseUrl, overrideKey: BACKEND_BASE_URL_OVERRIDE_KEY }
    );

    await use(stubBackend.baseUrl);
  },

  // Seeds a session, using the same storage key the auth client persists, then
  // re-runs the service worker's auth start-up so it picks the session and the
  // override up. After this the extension reports itself signed in and every
  // backend call lands on the stub.
  signedIn: async ({ context, stubbedEndpoints }, use) => {
    const [serviceWorker] = context.serviceWorkers();
    const session = buildStubSession();

    const authState = await serviceWorker.evaluate(async (session) => {
      await chrome.storage.local.set({ supabase_session: session });
      await initializeAuth();
      return {
        isAuthenticated: supabaseAuth?.isAuthenticated() ?? false,
        email: currentUser?.email ?? null,
      };
    }, session);

    if (!authState.isAuthenticated) {
      throw new Error(
        'Seeded session did not sign the extension in — the stub backend was likely not reached.'
      );
    }

    await use({ session, ...authState });
  },

  // Saves an OpenAI key the way the popup's settings do, so the Extraction
  // takes the user's own key path. Combine it with `signedIn` for a user who
  // has both.
  ownKey: async ({ context, stubbedEndpoints }, use) => {
    const [serviceWorker] = context.serviceWorkers();

    await serviceWorker.evaluate(
      (apiKey) => chrome.storage.sync.set({ apiKey }),
      STUB_API_KEY
    );

    await use(STUB_API_KEY);
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

// Draws a capture-sized image in the page and hands it to the service worker
// as the tab capture the next trigger will see.
async function standInForCapture(context, page, { width = 1200, height = 800 } = {}) {
  const captureDataUrl = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#ff0000');
      gradient.addColorStop(1, '#0000ff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png');
    },
    { width, height }
  );

  const [serviceWorker] = context.serviceWorkers();
  await serviceWorker.evaluate((dataUrl) => {
    self.captureVisibleTab = async () => dataUrl;
  }, captureDataUrl);

  return captureDataUrl;
}

// The capture button is in the popup's static HTML, but its click handler and
// the storage listener behind the usage bar are attached only after an async
// start-up. Driving the popup before that finishes loses the click or the
// usage update, so wait until start-up has painted the auth UI.
async function waitForPopupReady(popupPage) {
  await popupPage.waitForFunction(
    () => document.getElementById('loginSection').style.display !== ''
  );
}

// Clicks "Capture screenshot" in the popup. The popup is a tab here, so the
// page under Extraction has to be the front tab for the service worker to
// resolve it the way it resolves the page under a real popup.
async function captureFromPopup(popupPage, sourcePage) {
  await sourcePage.bringToFront();
  await waitForPopupReady(popupPage);
  await popupPage.locator('#captureScreenshotBtn').click();
}

module.exports = {
  test,
  expect,
  selectText,
  extractFromSelection,
  openPopup,
  standInForCapture,
  captureFromPopup,
  BACKEND_BASE_URL_OVERRIDE_KEY,
  STUB_API_KEY,
};
