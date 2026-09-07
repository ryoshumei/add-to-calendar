// tests/region-overlay.test.js
// The Region overlay is what the user drags on: the trigger opens it, the
// rectangle follows the pointer, and how it closes decides whether anything is
// captured at all. Everything here is observed in the page and at the stub —
// the overlay's visible state, and whether a Screenshot reached the backend.
import {
  test,
  expect,
  openPopup,
  waitForPopupReady,
  standInForCapture,
  capturesTaken,
  imageSize,
  triggerCapture,
  drawRegion,
  captureFromPopup,
} from './fixtures/extension-fixtures.js';

const PROCESS_IMAGE_PATH = '/functions/v1/process-image';
const OVERLAY = '#calendar-region-overlay';
const REGION_RECT = `${OVERLAY} .region-rect`;

// A stand-in capture small enough that the 1600 px cap never bites, so a
// Screenshot of these dimensions is the whole visible tab and nothing less.
const WHOLE_TAB = { width: 1200, height: 800 };

// A dismissal is only a dismissal if nothing was captured. Drawing a Region
// afterwards settles it either way: the overlay still works, and the tab was
// captured once — for this Region, not for the one that was dismissed.
async function expectDismissedWithNothingCaptured(
  { context, stubBackend, sourcePage, popupPage }
) {
  await expect(sourcePage.locator(OVERLAY)).toHaveCount(0);

  await captureFromPopup(popupPage, sourcePage);

  await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(1);
  expect(await capturesTaken(context)).toBe(1);
  expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(1);
}

// Holds the capture at the moment the service worker asks for it, so a test
// can look at the page as the camera would see it. Returns a release.
async function holdTheCapture(context) {
  const [serviceWorker] = context.serviceWorkers();

  await serviceWorker.evaluate(() => {
    const standIn = self.captureVisibleTab;
    self.captureReached = false;
    self.captureVisibleTab = async (tab) => {
      self.captureReached = true;
      await new Promise((release) => {
        self.releaseCapture = release;
      });
      return standIn(tab);
    };
  });

  return {
    reached: () =>
      expect
        .poll(() => serviceWorker.evaluate(() => self.captureReached))
        .toBe(true),
    release: () => serviceWorker.evaluate(() => self.releaseCapture()),
  };
}

// Opens the overlay the way a user does, and leaves the pointer pressed at the
// corner the Region starts from.
async function startDrawing(context, extensionId, sourcePage, from) {
  await standInForCapture(context, sourcePage);
  const popupPage = await openPopup(context, extensionId);
  await triggerCapture(popupPage, sourcePage);
  await expect(sourcePage.locator(OVERLAY)).toBeVisible();

  await sourcePage.bringToFront();
  await sourcePage.mouse.move(from.x, from.y);
  await sourcePage.mouse.down();
  return popupPage;
}

test.describe('Region overlay', () => {
  test('the popup trigger opens the overlay on the page', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await standInForCapture(context, sourcePage);
    const popupPage = await openPopup(context, extensionId);

    await triggerCapture(popupPage, sourcePage);

    await expect(sourcePage.locator(OVERLAY)).toBeVisible();
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(0);
  });

  test('the rectangle follows the pointer as the Region is drawn', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await startDrawing(context, extensionId, sourcePage, { x: 120, y: 90 });

    await sourcePage.mouse.move(320, 250);
    expect(await sourcePage.locator(REGION_RECT).boundingBox()).toEqual({
      x: 120,
      y: 90,
      width: 200,
      height: 160,
    });

    await sourcePage.mouse.move(420, 200);
    expect(await sourcePage.locator(REGION_RECT).boundingBox()).toEqual({
      x: 120,
      y: 90,
      width: 300,
      height: 110,
    });
  });

  test('Esc dismisses the overlay and captures nothing', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    const popupPage = await startDrawing(context, extensionId, sourcePage, { x: 120, y: 90 });
    await sourcePage.mouse.move(320, 250);

    await sourcePage.keyboard.press('Escape');

    await expectDismissedWithNothingCaptured({ context, stubBackend, sourcePage, popupPage });
  });

  test('Esc dismisses an overlay nothing has been drawn on', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await standInForCapture(context, sourcePage);
    const popupPage = await openPopup(context, extensionId);
    await triggerCapture(popupPage, sourcePage);
    await expect(sourcePage.locator(OVERLAY)).toBeVisible();

    await sourcePage.keyboard.press('Escape');

    await expectDismissedWithNothingCaptured({ context, stubBackend, sourcePage, popupPage });
  });

  test('a drag under 10 px is a mis-click: it dismisses and captures nothing', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    const popupPage = await startDrawing(context, extensionId, sourcePage, { x: 200, y: 160 });

    await sourcePage.mouse.move(207, 168);
    await sourcePage.mouse.up();

    await expectDismissedWithNothingCaptured({ context, stubBackend, sourcePage, popupPage });
  });

  test('Enter sends the whole visible tab', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await standInForCapture(context, sourcePage, WHOLE_TAB);
    const popupPage = await openPopup(context, extensionId);
    await triggerCapture(popupPage, sourcePage);
    await expect(sourcePage.locator(OVERLAY)).toBeVisible();

    await sourcePage.keyboard.press('Enter');

    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(1);
    const [post] = stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST');
    expect(await imageSize(sourcePage, post.body.image)).toEqual(WHOLE_TAB);
  });

  test('a double-click sends the whole visible tab', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await standInForCapture(context, sourcePage, WHOLE_TAB);
    const popupPage = await openPopup(context, extensionId);
    await triggerCapture(popupPage, sourcePage);
    await expect(sourcePage.locator(OVERLAY)).toBeVisible();

    // Each half of the double-click is a mis-click sized drag on its own, so
    // this also pins that the first one does not take the overlay away first.
    await sourcePage.mouse.dblclick(240, 180);

    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(1);
    const [post] = stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST');
    expect(await imageSize(sourcePage, post.body.image)).toEqual(WHOLE_TAB);
  });

  test('nothing the extension drew is on the page when the tab is captured', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await standInForCapture(context, sourcePage);
    const popupPage = await openPopup(context, extensionId);

    // An earlier Extraction leaves its confirmation modal on the page, and it
    // would be in the next Screenshot as surely as the overlay would.
    await captureFromPopup(popupPage, sourcePage);
    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(1);

    const capture = await holdTheCapture(context);
    await triggerCapture(popupPage, sourcePage);
    await expect(sourcePage.locator(OVERLAY)).toBeVisible();
    await drawRegion(sourcePage, { x: 100, y: 120, width: 260, height: 160 });
    await capture.reached();

    expect(await sourcePage.locator(OVERLAY).count()).toBe(0);
    expect(await sourcePage.locator('.calendar-modal-overlay').count()).toBe(0);

    await capture.release();
    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(1);
  });

  test('a page the overlay cannot open on is reported in the popup', async ({
    context,
    extensionId,
    stubBackend,
    signedIn,
  }) => {
    // A browser page: Chrome runs no content script here, and would refuse to
    // capture it either way. The popup is still open, so it says so.
    const browserPage = await context.newPage();
    await browserPage.goto('chrome://version');
    const popupPage = await openPopup(context, extensionId);

    await browserPage.bringToFront();
    await waitForPopupReady(popupPage);
    await popupPage.locator('#captureScreenshotBtn').click();

    await expect(popupPage.locator('#message')).toContainText('cannot be captured');
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(0);
  });

  test('a Region drawn towards the top left is the same rectangle', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await startDrawing(context, extensionId, sourcePage, { x: 420, y: 300 });

    await sourcePage.mouse.move(220, 140);

    expect(await sourcePage.locator(REGION_RECT).boundingBox()).toEqual({
      x: 220,
      y: 140,
      width: 200,
      height: 160,
    });
  });
});
