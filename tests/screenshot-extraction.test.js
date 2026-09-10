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
  capturesTaken,
  imageSize,
  tabIdFor,
  DEFAULT_REGION,
} from './fixtures/extension-fixtures.js';

const PROCESS_IMAGE_PATH = '/functions/v1/process-image';
const OVERLAY = '#calendar-region-overlay';

// What the thumbnail is painting, read off a screenshot of it: the Screenshot
// itself is out of the page's reach, so this is how a test sees it at all.
// Samples the middle row a little in from each edge, clear of the frame.
async function thumbnailPixels(page, thumbnail) {
  const png = await thumbnail.screenshot();

  return page.evaluate(async (base64) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('The thumbnail screenshot could not be decoded'));
      image.src = `data:image/png;base64,${base64}`;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    const at = (fraction) => {
      const [r, g, b] = context.getImageData(
        Math.floor(canvas.width * fraction),
        Math.floor(canvas.height / 2),
        1,
        1
      ).data;
      return { r, g, b };
    };

    return { left: at(0.25), right: at(0.75) };
  }, png.toString('base64'));
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

  test('the modal shows the Screenshot back, where the page cannot read it', async ({
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

    // The Screenshot is a picture of the user's screen — cross-origin frames
    // the page can never otherwise read included — so the page it was taken
    // of is not handed the pixels back. Everything the page can reach is
    // swept: the host's shadow root, every attribute, the serialised DOM.
    const whatThePageCanRead = await sourcePage.evaluate(() => {
      const host = document.querySelector('.screenshot-thumbnail');
      const attributes = [...document.querySelectorAll('*')].flatMap((element) =>
        [...element.attributes].map((attribute) => attribute.value)
      );

      return {
        shadowRoot: host?.shadowRoot ?? null,
        imagesInside: host?.querySelectorAll('img').length ?? -1,
        dataUrlAttributes: attributes.filter((value) => value.startsWith('data:image')).length,
        serialisedDom: document.documentElement.innerHTML.includes('data:image/jpeg'),
      };
    });

    expect(whatThePageCanRead.shadowRoot).toBeNull();
    expect(whatThePageCanRead.imagesInside).toBe(0);
    expect(whatThePageCanRead.dataUrlAttributes).toBe(0);
    expect(whatThePageCanRead.serialisedDom).toBe(false);

    // And the user is still looking at their Screenshot. The stand-in capture
    // is a red-to-blue gradient and the Region is cut from its red end, so the
    // frame paints red shading bluer to the right; an empty frame would be the
    // near-neutral background instead.
    const painted = await thumbnailPixels(sourcePage, thumbnail);
    expect(painted.left.r - painted.left.b).toBeGreaterThan(100);
    expect(painted.right.r - painted.right.b).toBeGreaterThan(100);
    expect(painted.right.b).toBeGreaterThan(painted.left.b);

    // The Screenshot did leave for Extraction, which is the only place it goes.
    const [post] = stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST');
    expect(post.body.image).toMatch(/^data:image\/jpeg;base64,/);
  });

  test('a model-produced title is text, never markup the page runs', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    // A Screenshot's Source is whatever was rendered inside the Region, so
    // the Events come back carrying whatever that page displayed. Built into
    // HTML, an onerror handler in a title would run in that page's origin.
    const title = '<img src=x onerror="window.__ranInThePage = true">Party';
    stubBackend.events = [
      {
        title,
        startTime: '2026-03-03T10:00:00',
        endTime: '2026-03-03T11:00:00',
        location: '<b>Room 4</b>',
        description: '<script>window.__ranInThePage = true</script>Bring cake',
      },
    ];
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

    const card = sourcePage.locator('.calendar-modal-overlay .event-card');
    await expect(card.locator('.event-title')).toHaveText(title);
    await expect(card.locator('.event-location')).toContainText('<b>Room 4</b>');
    await expect(card.locator('.event-description')).toContainText('Bring cake');

    // Nothing the model wrote became an element, and nothing of it ran.
    expect(await sourcePage.locator('.calendar-modal-overlay img').count()).toBe(0);
    expect(await sourcePage.evaluate(() => window.__ranInThePage ?? false)).toBe(false);
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
    // The tab has been photographed, so the first Extraction is under way —
    // and the stub is still holding its answer, so it has not finished.
    await expect.poll(() => capturesTaken(context)).toBe(1);

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

  test('a Region from a tab that is no longer in front captures nothing', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    // Chrome captures the window's active tab, not a tab id, and between the
    // drag and the capture the user has time to switch tabs. Capturing anyway
    // would send a picture of a page they never pointed at.
    const [serviceWorker] = context.serviceWorkers();
    await standInForCapture(context, sourcePage);
    const sourceTabId = await tabIdFor(context, sourcePage);

    const otherPage = await context.newPage();
    await otherPage.goto(stubBackend.pageUrl);
    await otherPage.bringToFront();

    const result = await serviceWorker.evaluate(
      (tabId) => chrome.tabs.get(tabId).then((tab) => handleScreenshotCapture(tab, null, {
        devicePixelRatio: 1,
      })),
      sourceTabId
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('cannot be captured');
    expect(await capturesTaken(context)).toBe(0);
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(0);
    await expect(sourcePage.locator('.calendar-modal-overlay .extraction-error')).toContainText(
      'cannot be captured'
    );
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
