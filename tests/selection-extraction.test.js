// tests/selection-extraction.test.js
// Drives a Selection through the whole Extraction path against the stub
// backend: no OpenAI key, no real Supabase project, no money spent.
import {
  test,
  expect,
  openPopup,
  selectText,
  extractFromSelection,
} from './fixtures/extension-fixtures.js';
import { STUB_USER } from './fixtures/stub-backend.js';

const PROCESS_TEXT_PATH = '/functions/v1/process-text';
const OPENAI_PATH = '/v1/chat/completions';

// Records the Chrome notifications the worker raises: the surface the
// Selection flow reports an error on when it is not a page modal. Returns a
// reader for what has been raised so far.
async function recordNotifications(context) {
  const [serviceWorker] = context.serviceWorkers();

  await serviceWorker.evaluate(() => {
    self.notificationsRaised = [];
    chrome.notifications.create = (options) => {
      self.notificationsRaised.push(options);
      return Promise.resolve('stub-notification');
    };
  });

  return () => serviceWorker.evaluate(() => self.notificationsRaised ?? []);
}

test.describe('Selection Extraction (stub backend)', () => {
  test('a seeded session signs the extension in', async ({
    context,
    extensionId,
    signedIn,
  }) => {
    const popupPage = await openPopup(context, extensionId);

    await expect(popupPage.locator('#userSection')).toBeVisible();
    await expect(popupPage.locator('#userEmail')).toHaveText(STUB_USER.email);
    expect(signedIn.email).toBe(STUB_USER.email);
  });

  test('the Selection is posted to the stub and its Event reaches the modal', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    stubBackend.events = [
      {
        title: 'Stubbed Design Review',
        startTime: '2026-03-03T10:00:00',
        endTime: '2026-03-03T11:00:00',
        location: 'Room 4',
        description: 'Returned by the stub backend',
      },
    ];

    const selection = await selectText(sourcePage, '#selection-source');
    await extractFromSelection(context, sourcePage);

    const posts = stubBackend.requestsTo(PROCESS_TEXT_PATH, 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body.selectedText).toBe(selection);
    expect(posts[0].headers.authorization).toBe(`Bearer ${signedIn.session.access_token}`);

    const card = sourcePage.locator('.calendar-modal-overlay .event-card');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.event-title')).toHaveText('Stubbed Design Review');
    await expect(card.locator('.event-location')).toContainText('Room 4');
  });

  test('the stub receives the extension version header', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    const [serviceWorker] = context.serviceWorkers();
    const manifestVersion = await serviceWorker.evaluate(
      () => chrome.runtime.getManifest().version
    );

    await selectText(sourcePage, '#selection-source');
    await extractFromSelection(context, sourcePage);

    const [post] = stubBackend.requestsTo(PROCESS_TEXT_PATH, 'POST');
    expect(post.headers['x-extension-version']).toBe(manifestVersion);
  });

  // The Screenshot path reports a session expiry in the same words, through
  // the same mapping — this pins the wording the Selection flow shows.
  test('an expired session shows the auth modal', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    stubBackend.textResponse = { status: 401, body: { error: 'Invalid JWT' } };

    await selectText(sourcePage, '#selection-source');
    await extractFromSelection(context, sourcePage);

    const authModal = sourcePage.locator('.calendar-modal-overlay .status-modal.error');
    await expect(authModal).toContainText('Session expired. Please sign in again with Google.');
    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(0);
  });

  // The own-key path, which the Screenshot suite covers for a Screenshot:
  // these two pin it for a Selection, the Source it was built for.
  test('a saved key sends the Selection to OpenAI, never to the backend', async ({
    context,
    stubBackend,
    sourcePage,
    ownKey,
  }) => {
    const selection = await selectText(sourcePage, '#selection-source');
    await extractFromSelection(context, sourcePage);

    const posts = stubBackend.requestsTo(OPENAI_PATH, 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].headers.authorization).toBe(`Bearer ${ownKey}`);
    expect(posts[0].body.model).toBe('gpt-4.1-mini');
    expect(posts[0].body.messages[1].content).toContain(selection);
    // Their key, their request: nothing of the Selection reached the backend.
    expect(stubBackend.requestsTo(PROCESS_TEXT_PATH, 'POST')).toHaveLength(0);

    const card = sourcePage.locator('.calendar-modal-overlay .event-card');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.event-title')).toHaveText('Stubbed Design Review');
  });

  test('a key OpenAI refuses is a key problem, not an expired Google session', async ({
    context,
    stubBackend,
    sourcePage,
    signedIn,
    ownKey,
  }) => {
    // OpenAI's own wording for a rejected key is the wording the Supabase
    // mapping reads as an expired session — and this user's session is fine.
    stubBackend.openAiResponse = {
      status: 401,
      body: { error: { message: 'Unauthorized: incorrect API key provided' } },
    };
    const notificationsRaised = await recordNotifications(context);

    await selectText(sourcePage, '#selection-source');
    await extractFromSelection(context, sourcePage);

    // Signing in to Google again fixes nothing here, so nothing offers it.
    await expect(sourcePage.locator('.calendar-modal-overlay .signin-button')).toHaveCount(0);
    const messages = (await notificationsRaised()).map((notification) => notification.message);
    expect(messages.join('\n')).toContain('Unauthorized: incorrect API key provided');
  });

  test('the popup usage bar reflects the usage the stub returned', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
  }) => {
    stubBackend.usage = { usageCount: 23, limit: 50, yearMonth: '2026-03' };

    await selectText(sourcePage, '#selection-source');
    await extractFromSelection(context, sourcePage);

    const popupPage = await openPopup(context, extensionId);

    await expect(popupPage.locator('#userSection')).toBeVisible();
    await expect(popupPage.locator('#usageStats')).toBeVisible();
    await expect(popupPage.locator('#usageText')).toHaveText(
      '23 / 50 requests used this month'
    );
  });
});
