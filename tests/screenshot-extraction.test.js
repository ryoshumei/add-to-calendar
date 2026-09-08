// tests/screenshot-extraction.test.js
// Drives a Screenshot from the popup button — overlay, Region, capture — through
// the backend Extraction path against the stub backend: no OpenAI key, no real
// Supabase project, no money spent.
//
// One thing here is not the shipped code: chrome.tabs.captureVisibleTab needs
// the activeTab grant Chrome only gives on a real toolbar click, which
// Playwright cannot produce, so the service worker's one-line wrapper around
// it is replaced with a known image. Everything downstream — pipeline,
// request, modal, usage — is what ships. The real capture is a manual check
// before release.
import {
  test,
  expect,
  openPopup,
  standInForCapture,
  triggerCapture,
  captureFromPopup,
  imageSize,
  DEFAULT_REGION,
} from './fixtures/extension-fixtures.js';

const PROCESS_IMAGE_PATH = '/functions/v1/process-image';
const OVERLAY = '#calendar-region-overlay';

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
    await captureFromPopup(context, extensionId, sourcePage);

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

  test('the Screenshot that reaches the stub is the Region the user drew', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    // A capture the size a real one would be: the viewport in device pixels.
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage, DEFAULT_REGION);

    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(1);
    const [post] = stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST');
    const devicePixelRatio = await sourcePage.evaluate(() => window.devicePixelRatio);

    // The Region is drawn in CSS pixels and captured in device pixels, and at
    // this size the 1600 px cap never bites, so nothing is downscaled away.
    expect(await imageSize(sourcePage, post.body.image)).toEqual({
      width: Math.round(DEFAULT_REGION.width * devicePixelRatio),
      height: Math.round(DEFAULT_REGION.height * devicePixelRatio),
    });
  });

  test('the modal shows a thumbnail of the Screenshot that was sent', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

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
    await captureFromPopup(context, extensionId, sourcePage);

    // The usage is only stored once the Extraction comes back, and the whole
    // capture runs first, so the modal is the sign that it is worth reading.
    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(1);

    // The popup closed itself to get out of the way of the drag, so looking at
    // what is left of the allowance means opening it again, as a user would.
    const popupPage = await openPopup(context, extensionId);
    await expect(popupPage.locator('#userSection')).toBeVisible();
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
    await captureFromPopup(context, extensionId, sourcePage);
    // The first trigger closed the popup behind it, so a second one is a
    // second visit to the toolbar.
    await triggerCapture(context, extensionId, sourcePage);

    // Not even an overlay to draw a second Region on.
    await expect(sourcePage.locator(OVERLAY)).toHaveCount(0);
    const card = sourcePage.locator('.calendar-modal-overlay .event-card');
    await expect(card).toHaveCount(1);
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(1);
  });

  test('an expired session shows the message the Selection flow shows', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    stubBackend.imageResponse = { status: 401, body: { error: 'Invalid JWT' } };
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

    const authModal = sourcePage.locator('.calendar-modal-overlay .status-modal.error');
    await expect(authModal).toContainText('Session expired. Please sign in again with Google.');
    await expect(authModal.locator('.signin-button')).toBeVisible();
    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(0);
  });

  test('a monthly limit shows the backend message, with no basic fallback event', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    const limitMessage = 'Monthly limit exceeded (50/50). Resets on 2026-04-01.';
    stubBackend.imageResponse = { status: 429, body: { error: limitMessage } };
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

    await expect(sourcePage.locator('.calendar-modal-overlay .extraction-error')).toContainText(
      limitMessage
    );
    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(0);
  });

  test('a Screenshot with nothing to extract says so', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    stubBackend.events = [];
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

    await expect(sourcePage.locator('.calendar-modal-overlay .no-events-message')).toContainText(
      'screenshot'
    );
  });

  test('a page Chrome will not capture says so on the page', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    // No stand-in here: the real chrome.tabs.captureVisibleTab refuses this
    // page for the same reason it refuses a browser-internal one — the
    // extension is not allowed to capture it. By the time the Region is drawn
    // the popup has closed, so the page is where the user is looking.
    await captureFromPopup(context, extensionId, sourcePage);

    await expect(sourcePage.locator('.calendar-modal-overlay .extraction-error')).toContainText(
      'cannot be captured'
    );
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(0);
  });

  test('with no session the trigger shows the setup guidance', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
  }) => {
    await standInForCapture(context, sourcePage);

    await triggerCapture(context, extensionId, sourcePage);

    // Before the drawing, not after: with nothing to send a Region to, the
    // overlay never opens.
    await expect(sourcePage.locator('.calendar-modal-overlay .status-modal.error h3')).toContainText(
      'Setup Required'
    );
    await expect(sourcePage.locator(OVERLAY)).toHaveCount(0);
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(0);
  });
});
