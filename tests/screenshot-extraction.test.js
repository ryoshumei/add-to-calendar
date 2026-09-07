// tests/screenshot-extraction.test.js
// Drives a whole-tab Screenshot from the popup button through the backend
// Extraction path against the stub backend: no OpenAI key, no real Supabase
// project, no money spent.
//
// One thing here is not the shipped code: chrome.tabs.captureVisibleTab needs
// the activeTab grant Chrome only gives on a real toolbar click, which
// Playwright cannot produce, so the service worker's one-line wrapper around
// it is replaced with a known image. Everything downstream — pipeline,
// request, modal, usage — is what ships. The real capture is a manual check
// before release.
import { test, expect, openPopup } from './fixtures/extension-fixtures.js';

const PROCESS_IMAGE_PATH = '/functions/v1/process-image';

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

// Clicks "Capture screenshot" in the popup. The popup is a tab here, so the
// page under Extraction has to be the front tab for the service worker to
// resolve it the way it resolves the page under a real popup.
async function captureFromPopup(popupPage, sourcePage) {
  await sourcePage.bringToFront();
  await popupPage.locator('#captureScreenshotBtn').click();
}

test.describe('Screenshot Extraction (stub backend)', () => {
  test('the Screenshot is posted to the stub and its Event reaches the modal', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    const [serviceWorker] = context.serviceWorkers();
    const manifestVersion = await serviceWorker.evaluate(
      () => chrome.runtime.getManifest().version
    );
    await standInForCapture(context, sourcePage, { width: 2400, height: 1200 });
    const popupPage = await openPopup(context, extensionId);

    await captureFromPopup(popupPage, sourcePage);

    const card = sourcePage.locator('.calendar-modal-overlay .event-card');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.event-title')).toHaveText('Stubbed Design Review');

    const posts = stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(posts[0].body.currentDateTime).toBeTruthy();
    expect(posts[0].headers.authorization).toBe(`Bearer ${signedIn.session.access_token}`);
    expect(posts[0].headers['x-extension-version']).toBe(manifestVersion);
  });

  test('the modal shows a thumbnail of the Screenshot that was sent', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await standInForCapture(context, sourcePage);
    const popupPage = await openPopup(context, extensionId);

    await captureFromPopup(popupPage, sourcePage);

    const thumbnail = sourcePage.locator('.calendar-modal-overlay .screenshot-thumbnail');
    await expect(thumbnail).toBeVisible();

    const [post] = stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST');
    expect(await thumbnail.getAttribute('src')).toBe(post.body.image);
  });

  test('the popup usage bar reflects the usage the stub returned', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    stubBackend.usage = { usageCount: 31, limit: 50, yearMonth: '2026-03' };
    await standInForCapture(context, sourcePage);
    const popupPage = await openPopup(context, extensionId);

    await captureFromPopup(popupPage, sourcePage);

    await expect(popupPage.locator('#usageStats')).toBeVisible();
    await expect(popupPage.locator('#usageText')).toHaveText(
      '31 / 50 requests used this month'
    );
  });

  test('a second trigger on the same tab while one is in flight is ignored', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    // The stub holds its answer, so the second click lands while the first
    // Extraction is still in flight.
    stubBackend.responseDelayMs = 750;
    await standInForCapture(context, sourcePage);
    const popupPage = await openPopup(context, extensionId);
    await sourcePage.bringToFront();

    await popupPage.locator('#captureScreenshotBtn').click();
    await popupPage.locator('#captureScreenshotBtn').click();

    const card = sourcePage.locator('.calendar-modal-overlay .event-card');
    await expect(card).toHaveCount(1);
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(1);
  });
});
