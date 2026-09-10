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
  recordNotifications,
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

// Both items at once, because either one alone cannot say whether the menu has
// settled: Chrome hands the extension its install event a moment after the
// worker starts, and the setting is applied a moment after it is written.
async function readMenu(context) {
  return {
    selection: await menuItemExists(context, SELECTION_ITEM),
    screenshot: await menuItemExists(context, SCREENSHOT_ITEM),
  };
}

// What the menu settles as. Read twice running and only believed when the two
// agree: an answer taken while the menu is being registered is about a menu
// that is halfway somewhere, and "the Screenshot item is absent" is exactly
// the answer that would come back from one of those.
async function expectMenu(context, expected) {
  await expect
    .poll(async () => {
      const first = await readMenu(context);
      const second = await readMenu(context);
      return JSON.stringify(first) === JSON.stringify(second) ? first : null;
    })
    .toEqual(expected);
}

test.describe('Screenshot context-menu item', () => {
  test('is in the menu of a fresh install, beside the Selection item', async ({ context }) => {
    await expectMenu(context, { selection: true, screenshot: true });
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

  test('a trigger that fails outright says so, rather than failing silently', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    const [serviceWorker] = context.serviceWorkers();
    const notificationsRaised = await recordNotifications(context);

    // Whatever goes wrong in here, the listener that called the handler drops
    // the promise: a rejection would be an unhandled one, and the user would
    // right-click, choose the item, and be told nothing at all.
    await serviceWorker.evaluate(() => {
      self.startRegionCapture = async () => {
        throw new Error('Chrome would not open the overlay');
      };
    });

    await clickMenuItem(context, sourcePage, SCREENSHOT_ITEM);

    const messages = (await notificationsRaised()).map((notification) => notification.message);
    expect(messages.join('\n')).toContain('Chrome would not open the overlay');
    await expect(sourcePage.locator(OVERLAY)).toHaveCount(0);
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
    await expectMenu(context, { selection: true, screenshot: true });
  });

  test('takes the item off the menu and puts it back, with no reload in between', async ({
    context,
    extensionId,
  }) => {
    const popupPage = await openPopup(context, extensionId);
    await waitForPopupReady(popupPage);
    await expect(popupPage.locator(TOGGLE)).toBeEnabled();
    await expectMenu(context, { selection: true, screenshot: true });

    await popupPage.locator(TOGGLE).uncheck();

    // The Selection item is not the user's to hide, and this does not.
    await expectMenu(context, { selection: true, screenshot: false });

    await popupPage.locator(TOGGLE).check();

    await expectMenu(context, { selection: true, screenshot: true });
  });

  test('never leaves the user with no menu while it is applied', async ({
    context,
    extensionId,
  }) => {
    const [serviceWorker] = context.serviceWorkers();

    // Clearing the whole menu and building it again is a window in which the
    // user right-clicks and the extension is simply not there — and nothing
    // brings it back until the next browser start.
    await serviceWorker.evaluate(() => {
      self.menuWipes = 0;
      const removeAll = chrome.contextMenus.removeAll.bind(chrome.contextMenus);
      chrome.contextMenus.removeAll = (...args) => {
        self.menuWipes += 1;
        return removeAll(...args);
      };
    });

    const popupPage = await openPopup(context, extensionId);
    await waitForPopupReady(popupPage);
    await expect(popupPage.locator(TOGGLE)).toBeEnabled();

    await popupPage.locator(TOGGLE).uncheck();
    await expectMenu(context, { selection: true, screenshot: false });
    await popupPage.locator(TOGGLE).check();
    await expectMenu(context, { selection: true, screenshot: true });

    expect(await serviceWorker.evaluate(() => self.menuWipes)).toBe(0);
  });

  test('keeps the checkbox out of the user\'s hands when the setting cannot be read', async ({
    context,
    extensionId,
  }) => {
    const popupPage = await context.newPage();

    // The checkbox ships checked and disabled. A read that never lands leaves
    // it saying the item is on the menu, which nobody has established — so it
    // stays out of reach rather than inviting a change to an unknown state.
    await popupPage.addInitScript(() => {
      const get = chrome.storage.sync.get.bind(chrome.storage.sync);
      chrome.storage.sync.get = (keys) => {
        const asksForTheSetting =
          keys && typeof keys === 'object' && 'showScreenshotMenuItem' in keys;
        return asksForTheSetting
          ? Promise.reject(new Error('storage unavailable'))
          : get(keys);
      };
    });
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await waitForPopupReady(popupPage);

    await expect(popupPage.locator(TOGGLE)).toBeDisabled();
  });
});
