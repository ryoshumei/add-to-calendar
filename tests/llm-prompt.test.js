// tests/llm-prompt.test.js
import { test, expect } from './fixtures/extension-fixtures.js';

test.describe('LLM Prompt Configuration', () => {
  test.describe('LLM_CONFIG Loading', () => {
    test('should load LLM_CONFIG in background script', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const loaded = await serviceWorker.evaluate(() => {
        return typeof LLM_CONFIG !== 'undefined' && LLM_CONFIG !== null;
      });

      expect(loaded).toBe(true);
    });

    test('should have correct model and parameters', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const config = await serviceWorker.evaluate(() => ({
        model: LLM_CONFIG.model,
        temperature: LLM_CONFIG.temperature,
        top_p: LLM_CONFIG.top_p,
      }));

      expect(config.model).toBe('gpt-4.1-mini');
      expect(config.temperature).toBe(0.3);
      expect(config.top_p).toBe(1);
    });
  });

  test.describe('buildSystemPrompt', () => {
    test('should include current date/time in prompt', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const prompt = await serviceWorker.evaluate(() => {
        return LLM_CONFIG.buildSystemPrompt('3/2/2026, 10:00:00 AM');
      });

      expect(prompt).toContain('3/2/2026, 10:00:00 AM');
    });

    test('should request JSON events array format', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const prompt = await serviceWorker.evaluate(() => {
        return LLM_CONFIG.buildSystemPrompt('1/1/2026, 12:00:00 PM');
      });

      expect(prompt).toContain('"events"');
      expect(prompt).toContain('"title"');
      expect(prompt).toContain('"startTime"');
      expect(prompt).toContain('"endTime"');
      expect(prompt).toContain('YYYY-MM-DDTHH:mm:ss');
      expect(prompt).toContain('ONLY return the JSON object itself');
    });
  });

  test.describe('buildMessages', () => {
    test('should return system and user messages', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const messages = await serviceWorker.evaluate(() => {
        return LLM_CONFIG.buildMessages('Meeting tomorrow at 3pm', '3/2/2026, 10:00:00 AM');
      });

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    test('should include selected text in user message', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const messages = await serviceWorker.evaluate(() => {
        return LLM_CONFIG.buildMessages('Lunch with Bob on Friday at noon', '3/2/2026, 10:00:00 AM');
      });

      expect(messages[1].content).toContain('Lunch with Bob on Friday at noon');
      expect(messages[1].content).toContain('3/2/2026, 10:00:00 AM');
    });
  });

  test.describe('buildRequestBody', () => {
    test('should return complete OpenAI request body', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const body = await serviceWorker.evaluate(() => {
        return LLM_CONFIG.buildRequestBody('Team standup at 9am', '3/2/2026, 10:00:00 AM');
      });

      expect(body.model).toBe('gpt-4.1-mini');
      expect(body.temperature).toBe(0.3);
      expect(body.top_p).toBe(1);
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toContain('Team standup at 9am');
    });
  });
});