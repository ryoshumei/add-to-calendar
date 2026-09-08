// tests/context-menu.test.js
// The right-click trigger and the setting that hides it. Playwright cannot
// open a native context menu, so the item's presence is asked of Chrome — the
// registry the menu is drawn from — and the click is driven through the
// service worker's handler, the way the Selection suite drives its own.
import {
  test,
  expect,
  menuItemExists,
  clickMenuItem,
  selectText,
  standInForCapture,
  drawRegion,
  openPopup,
  waitForPopupReady,
  DEFAULT_REGION,
} from './fixtures/extension-fixtures.js';

const PROCESS_IMAGE_PATH = '/functions/v1/process-image';
const PROCESS_TEXT_PATH = '/functions/v1/process-text';
const OVERLAY = '#calendar-region-overlay';
const TOGGLE = '#screenshotMenuToggle';

const SCREENSHOT_ITEM = 'addScreenshotToCalendar';
const SELECTION_ITEM = 'addToCalendar';

// Chrome hands the extension its install event a moment after the worker
// starts, and the menu is built from there, so what is asserted is where the
// menu settles rather than what it holds this instant.
async function expectMenuItem(context, menuItemId, present) {
  await expect
    .poll(() => menuItemExists(context, menuItemId))
    .toBe(present);
}

test.describe('Screenshot context-menu item', () => {
  test('is in the menu of a fresh install, beside the Selection item', async ({ context }) => {
    await expectMenuItem(context, SCREENSHOT_ITEM, true);
    await expectMenuItem(context, SELECTION_ITEM, true);
  });

  test('opens the Region overlay on a page with nothing highlighted', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await standInForCapture(context, sourcePage);

    await clickMenuItem(context, sourcePage, SCREENSHOT_ITEM);

    await expect(sourcePage.locator(OVERLAY)).toBeVisible();
    await drawRegion(sourcePage, DEFAULT_REGION);

    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(1);
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(1);
  });

  test('opens the Region overlay, ignoring the text the user had highlighted', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await standInForCapture(context, sourcePage);
    await selectText(sourcePage, '#selection-source');

    await clickMenuItem(context, sourcePage, SCREENSHOT_ITEM);

    await expect(sourcePage.locator(OVERLAY)).toBeVisible();
    await drawRegion(sourcePage, DEFAULT_REGION);

    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(1);
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(1);
    // One Source per Extraction: the highlighted text is not a second one.
    expect(stubBackend.requestsTo(PROCESS_TEXT_PATH, 'POST')).toHaveLength(0);
  });
});

test.describe('The setting that hides it', () => {
  test('is on until the user turns it off, and stays off across popup reopens', async ({
    context,
    extensionId,
  }) => {
    const popupPage = await openPopup(context, extensionId);
    await waitForPopupReady(popupPage);
    // The checkbox ships checked and disabled, and is enabled once the stored
    // setting has been read: asserted before that, "checked" would be the
    // static HTML answering rather than storage.
    await expect(popupPage.locator(TOGGLE)).toBeEnabled();
    await expect(popupPage.locator(TOGGLE)).toBeChecked();

    await popupPage.locator(TOGGLE).uncheck();

    const reopened = await openPopup(context, extensionId);
    await waitForPopupReady(reopened);
    await expect(reopened.locator(TOGGLE)).toBeEnabled();
    await expect(reopened.locator(TOGGLE)).not.toBeChecked();

    // Sync storage, not local: the choice follows the user's Chrome profile
    // the way their API key does.
    const stored = await reopened.evaluate(() =>
      chrome.storage.sync.get({ showScreenshotMenuItem: true })
    );
    expect(stored.showScreenshotMenuItem).toBe(false);
  });

  test('goes back to what is stored when the setting cannot be saved', async ({
    context,
    extensionId,
  }) => {
    const popupPage = await openPopup(context, extensionId);
    await waitForPopupReady(popupPage);
    await expect(popupPage.locator(TOGGLE)).toBeEnabled();

    // Sync storage full, offline, a quota hit: whatever the reason, the save
    // did not happen.
    await popupPage.evaluate(() => {
      chrome.storage.sync.set = () => Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
    });

    // A click, not uncheck(): the state the user is left in is the assertion.
    await popupPage.locator(TOGGLE).click();

    // The item is still on the menu, so the checkbox says so.
    await expect(popupPage.locator(TOGGLE)).toBeChecked();
    await expect(popupPage.locator('#message')).toContainText('Could not save that setting');
    await expectMenuItem(context, SCREENSHOT_ITEM, true);
  });

  test('takes the item off the menu and puts it back, with no reload in between', async ({
    context,
    extensionId,
  }) => {
    const popupPage = await openPopup(context, extensionId);
    await expectMenuItem(context, SCREENSHOT_ITEM, true);

    await popupPage.locator(TOGGLE).uncheck();

    await expectMenuItem(context, SCREENSHOT_ITEM, false);
    // The Selection item is not the user's to hide, and this does not.
    await expectMenuItem(context, SELECTION_ITEM, true);

    await popupPage.locator(TOGGLE).check();

    await expectMenuItem(context, SCREENSHOT_ITEM, true);
    await expectMenuItem(context, SELECTION_ITEM, true);
  });
});
