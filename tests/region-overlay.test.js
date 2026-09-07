// tests/region-overlay.test.js
// The Region overlay is what the user drags on: the trigger opens it, the
// rectangle follows the pointer, and how it closes decides whether anything is
// captured at all. Everything here is observed in the page and at the stub —
// the overlay's visible state, and whether a Screenshot reached the backend.
import {
  test,
  expect,
  openPopup,
  standInForCapture,
  triggerCapture,
  drawRegion,
} from './fixtures/extension-fixtures.js';

const PROCESS_IMAGE_PATH = '/functions/v1/process-image';
const OVERLAY = '#calendar-region-overlay';
const REGION_RECT = `${OVERLAY} .region-rect`;

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
