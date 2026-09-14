// tests/usage-refresh.test.js
// The usage bar is the count of Extractions the signed-in user has spent this
// month. It used to be whatever the last Extraction happened to report, which
// is stale the moment the same account extracts anywhere else — the iOS app
// shares this backend. These drive the popup against the stub backend's
// read-only usage endpoint: what it answers is what the bar shows, a
// signed-out popup never asks, and an answer that never comes leaves the
// number the user last saw alone.
import {
  test,
  expect,
  openPopup,
  waitForPopupReady,
} from './fixtures/extension-fixtures.js';

const GET_USAGE_PATH = '/functions/v1/get-usage';

// What the popup would show with nothing but its cache: the usage stored by
// the last Extraction this browser ran.
async function cacheUsage(context, usage) {
  const [serviceWorker] = context.serviceWorkers();
  await serviceWorker.evaluate(
    (value) => chrome.storage.local.set({ usage_info: value }),
    usage
  );
}

test.describe('Usage refresh (stub backend)', () => {
  test('an opening popup shows the usage the backend reports, not the cached one', async ({
    context,
    extensionId,
    stubBackend,
    signedIn,
  }) => {
    await cacheUsage(context, { usageCount: 3, limit: 50, yearMonth: '2026-03' });
    stubBackend.usage = { usageCount: 31, limit: 50, yearMonth: '2026-03' };

    const popupPage = await openPopup(context, extensionId);

    await expect(popupPage.locator('#usageStats')).toBeVisible();
    await expect(popupPage.locator('#usageText')).toHaveText(
      '31 / 50 requests used this month'
    );

    const reads = stubBackend.requestsTo(GET_USAGE_PATH, 'GET');
    expect(reads).toHaveLength(1);
    expect(reads[0].headers.authorization).toBe(`Bearer ${signedIn.session.access_token}`);
  });

  test('a signed-out popup asks the backend nothing', async ({
    context,
    extensionId,
    stubBackend,
    stubbedEndpoints,
  }) => {
    const popupPage = await openPopup(context, extensionId);
    await waitForPopupReady(popupPage);

    // Nobody to ask about: there is no session, and no bar to put a number on.
    await expect(popupPage.locator('#loginSection')).toBeVisible();
    await expect(popupPage.locator('#usageStats')).toBeHidden();
    expect(stubBackend.requestsTo(GET_USAGE_PATH)).toHaveLength(0);
  });

  test('a usage read that fails leaves the number the user last saw', async ({
    context,
    extensionId,
    stubBackend,
    signedIn,
  }) => {
    await cacheUsage(context, { usageCount: 12, limit: 50, yearMonth: '2026-03' });
    stubBackend.usageResponse = { status: 500, body: { error: 'usage is unavailable' } };

    const popupPage = await openPopup(context, extensionId);

    await expect
      .poll(() => stubBackend.requestsTo(GET_USAGE_PATH, 'GET').length)
      .toBe(1);
    // The popup has no reason to touch the bar after this, so the wait is for
    // it to have had the chance: an assertion that retries would pass on the
    // value that was there before the answer came back.
    await popupPage.waitForTimeout(300);

    await expect(popupPage.locator('#usageText')).toHaveText(
      '12 / 50 requests used this month'
    );
    // Nobody asked for the refresh, so its failure is not the user's problem.
    await expect(popupPage.locator('#message')).toBeHidden();
  });

  test('a usage read answered with no count leaves the number alone', async ({
    context,
    extensionId,
    stubBackend,
    signedIn,
  }) => {
    await cacheUsage(context, { usageCount: 12, limit: 50, yearMonth: '2026-03' });
    // A 200 in the right shape but without the one field that matters. Stored,
    // it would read as nothing spent this month — a wrong number is worse than
    // yesterday's number.
    stubBackend.usageResponse = {
      status: 200,
      body: { usage: { limit: 50, yearMonth: '2026-03' } },
    };

    const popupPage = await openPopup(context, extensionId);

    await expect
      .poll(() => stubBackend.requestsTo(GET_USAGE_PATH, 'GET').length)
      .toBe(1);
    await popupPage.waitForTimeout(300);

    await expect(popupPage.locator('#usageText')).toHaveText(
      '12 / 50 requests used this month'
    );
  });
});
