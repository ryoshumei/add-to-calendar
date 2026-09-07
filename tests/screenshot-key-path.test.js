// tests/screenshot-key-path.test.js
// A Screenshot from a user who saved their own OpenAI key: the Region goes
// straight to OpenAI, built by the client's image request builder, and the
// shared backend is never contacted — the privacy promise a key buys for a
// Selection, kept for a Screenshot too.
//
// The test-only backend override aims that OpenAI call at the same local stub
// the backend path uses, so no key is spent and nothing leaves the machine.
// As in the backend-path suite, the service worker's captureVisibleTab wrapper
// is stood in for, because Playwright cannot produce the toolbar click Chrome
// wants before it grants activeTab.
import {
  test,
  expect,
  standInForCapture,
  captureFromPopup,
} from './fixtures/extension-fixtures.js';

const OPENAI_PATH = '/v1/chat/completions';
const PROCESS_IMAGE_PATH = '/functions/v1/process-image';

test.describe('Screenshot Extraction (own OpenAI key)', () => {
  test('the Screenshot goes to OpenAI with the client builder\'s body, never to the backend', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    ownKey,
  }) => {
    const [serviceWorker] = context.serviceWorkers();
    await standInForCapture(context, sourcePage, { width: 2400, height: 1200 });
    await captureFromPopup(context, extensionId, sourcePage);

    const card = sourcePage.locator('.calendar-modal-overlay .event-card');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.event-title')).toHaveText('Stubbed Design Review');

    // Nothing of the user's screen reached the shared backend.
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(0);

    const posts = stubBackend.requestsTo(OPENAI_PATH, 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].headers.authorization).toBe(`Bearer ${ownKey}`);

    const sent = posts[0].body;
    const [systemMessage, userMessage] = sent.messages;
    expect(sent.model).toBe('gpt-4.1-mini');
    expect(sent.response_format).toEqual({ type: 'json_object' });
    expect(systemMessage.role).toBe('system');
    expect(userMessage.content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);

    // The whole body is the client builder's, for the Screenshot and the time
    // that were sent — a body assembled anywhere else would drift from the
    // backend's, which tests/llm-prompt-sync.test.js pins the builder to.
    const currentDateTime = userMessage.content[0].text.match(/^Time: (.*)\n/)[1];
    const built = await serviceWorker.evaluate(
      ({ imageDataUrl, currentDateTime }) =>
        LLM_CONFIG.buildImageRequestBody(imageDataUrl, currentDateTime),
      { imageDataUrl: userMessage.content[1].image_url.url, currentDateTime }
    );
    expect(sent).toEqual(built);
  });

  test('a signed-in user\'s own key still wins over the backend', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    signedIn,
    ownKey,
  }) => {
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(1);
    expect(stubBackend.requestsTo(OPENAI_PATH, 'POST')).toHaveLength(1);
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(0);
  });

  test('with neither a key nor a session the trigger shows the setup guidance', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    stubbedEndpoints,
  }) => {
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

    await expect(
      sourcePage.locator('.calendar-modal-overlay .status-modal.error h3')
    ).toContainText('Setup Required');
    expect(stubBackend.requestsTo(OPENAI_PATH, 'POST')).toHaveLength(0);
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(0);
  });

  test('a fenced single event object is normalised into one Event card', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    ownKey,
  }) => {
    // What the model sometimes returns instead of the schema: one bare event,
    // wrapped in a markdown fence. The text key path accepts both.
    stubBackend.openAiContent =
      '```json\n' +
      JSON.stringify({
        title: 'Stubbed Poster Night',
        startTime: '2026-03-04T19:00:00',
        endTime: '2026-03-04T21:00:00',
      }) +
      '\n```';
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

    const card = sourcePage.locator('.calendar-modal-overlay .event-card');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.event-title')).toHaveText('Stubbed Poster Night');
  });

  test('a Screenshot with nothing to extract says so', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    ownKey,
  }) => {
    stubBackend.openAiContent = '';
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

    await expect(
      sourcePage.locator('.calendar-modal-overlay .no-events-message')
    ).toContainText('screenshot');
    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(0);
  });

  test('an event OpenAI returned malformed is an error, not a card', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    ownKey,
  }) => {
    // Missing endTime: the same validation the text key path applies rejects
    // it, and a Screenshot has no basic fallback to invent one.
    stubBackend.openAiContent = JSON.stringify({
      events: [{ title: 'Stubbed Half An Event', startTime: '2026-03-04T19:00:00' }],
    });
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

    await expect(sourcePage.locator('.calendar-modal-overlay .extraction-error')).toBeVisible();
    await expect(sourcePage.locator('.calendar-modal-overlay .event-card')).toHaveCount(0);
  });

  test('an OpenAI failure is reported, and never reaches the backend', async ({
    context,
    extensionId,
    stubBackend,
    sourcePage,
    ownKey,
  }) => {
    stubBackend.openAiResponse = {
      status: 401,
      body: { error: { message: 'Incorrect API key provided: sk-stub***.' } },
    };
    await standInForCapture(context, sourcePage);
    await captureFromPopup(context, extensionId, sourcePage);

    await expect(sourcePage.locator('.calendar-modal-overlay .extraction-error')).toContainText(
      'Incorrect API key provided'
    );
    expect(stubBackend.requestsTo(PROCESS_IMAGE_PATH, 'POST')).toHaveLength(0);
  });
});
