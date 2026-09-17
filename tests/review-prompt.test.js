// tests/review-prompt.test.js
// The ask for a Chrome Web Store rating. It is worth a rating only once the
// extension has worked for someone, so what is counted is Events the user
// actually sent to their calendar — and once answered, either way, it is done.
import {
  test,
  expect,
  selectText,
  extractFromSelection,
} from './fixtures/extension-fixtures.js';

const ASK = '.gc-review-ask';
const ADD_BUTTON = '.calendar-modal-overlay .event-add-button';
const IOS_PROMO = '.gc-ios-promo';

// One Extraction, ending with the user adding the Event it found.
async function extractAndAdd(context, page) {
  await selectText(page, '#selection-source');
  await extractFromSelection(context, page);
  await expect(page.locator(ADD_BUTTON)).toBeVisible();
  // Google Calendar opens in a tab of its own; it is not what is under test.
  const opened = context.waitForEvent('page');
  await page.locator(ADD_BUTTON).first().click();
  await (await opened).close();
  await expect(page.locator(ADD_BUTTON).first()).toBeDisabled();
}

// An Extraction the user does not act on, to read what the modal offers.
async function extractOnly(context, page) {
  await selectText(page, '#selection-source');
  await extractFromSelection(context, page);
  await expect(page.locator(ADD_BUTTON)).toBeVisible();
}

// What the worker has stored, which is where the count actually lives.
async function storedPrompt(context) {
  const [serviceWorker] = context.serviceWorkers();
  return serviceWorker.evaluate(async () => {
    const { reviewPrompt } = await chrome.storage.sync.get('reviewPrompt');
    return reviewPrompt ?? null;
  });
}

test.describe('Review prompt', () => {
  test('stays out of the way until the extension has worked three times', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    // First and second Events added: still nothing to say.
    await extractAndAdd(context, sourcePage);
    await expect(sourcePage.locator(ASK)).toHaveCount(0);

    await extractAndAdd(context, sourcePage);
    await expect(sourcePage.locator(ASK)).toHaveCount(0);

    expect(await storedPrompt(context)).toMatchObject({ adds: 2, asked: false });

    // The third goes in, and the next modal is the one that asks.
    await extractAndAdd(context, sourcePage);
    await expect(sourcePage.locator(ASK)).toHaveCount(0);

    await extractOnly(context, sourcePage);
    await expect(sourcePage.locator(ASK)).toBeVisible();
  });

  test('takes the place of the App Store promo, so one modal makes one request', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    await extractOnly(context, sourcePage);
    await expect(sourcePage.locator(IOS_PROMO)).toBeVisible();
    await expect(sourcePage.locator(ASK)).toHaveCount(0);

    for (let i = 0; i < 3; i += 1) {
      await extractAndAdd(context, sourcePage);
    }
    await extractOnly(context, sourcePage);

    await expect(sourcePage.locator(ASK)).toBeVisible();
    await expect(sourcePage.locator(IOS_PROMO)).toHaveCount(0);
  });

  test('"Not now" is an answer, and is not asked again', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    for (let i = 0; i < 3; i += 1) {
      await extractAndAdd(context, sourcePage);
    }
    await extractOnly(context, sourcePage);
    await expect(sourcePage.locator(ASK)).toBeVisible();

    await sourcePage.locator('.gc-review-ask__later').click();
    await expect(sourcePage.locator(ASK)).toHaveCount(0);
    await expect.poll(async () => (await storedPrompt(context))?.asked).toBe(true);

    // Every later Extraction is back to the App Store promo.
    await extractOnly(context, sourcePage);
    await expect(sourcePage.locator(ASK)).toHaveCount(0);
    await expect(sourcePage.locator(IOS_PROMO)).toBeVisible();
  });

  test('"Rate it" opens the listing\'s reviews, and settles the ask', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
    extensionId,
  }) => {
    for (let i = 0; i < 3; i += 1) {
      await extractAndAdd(context, sourcePage);
    }
    await extractOnly(context, sourcePage);

    const opened = context.waitForEvent('page');
    await sourcePage.locator('.gc-review-ask__rate').click();
    const reviewTab = await opened;
    // A new tab starts on about:blank and navigates a moment later, so the
    // address is polled rather than read once. The Web Store then redirects
    // /detail/<id>/reviews to a canonical /detail/<slug>/<id>/reviews, so what
    // is pinned is the extension it landed on and the page it asked for.
    await expect
      .poll(() => reviewTab.url())
      .toContain(`/${extensionId}/reviews`);
    expect(reviewTab.url()).toContain('chromewebstore.google.com');
    await reviewTab.close();

    await expect(sourcePage.locator(ASK)).toHaveCount(0);
    await expect.poll(async () => (await storedPrompt(context))?.asked).toBe(true);

    await extractOnly(context, sourcePage);
    await expect(sourcePage.locator(ASK)).toHaveCount(0);
  });
});
