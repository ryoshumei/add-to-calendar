// tests/llm-prompt-sync.test.js
// Verifies that the client-side (scripts/llm-prompt.js) and backend
// (supabase/functions/_shared/llm-prompt.ts) LLM configs produce
// identical output. Catches drift when one file is updated without the other.

import { test, expect } from './fixtures/extension-fixtures.js';
import fs from 'fs';
import path from 'path';

function loadBackendConfig() {
  const tsPath = path.resolve(__dirname, '..', 'supabase', 'functions', '_shared', 'llm-prompt.ts');
  let src = fs.readFileSync(tsPath, 'utf-8');

  // Strip TypeScript-only syntax to get evaluable JS
  src = src.replace(/^export /m, '');
  src = src.replace(/:\s*string/g, '');
  src = src.replace(/:\s*object/g, '');
  src = src.replace(/:\s*Array<\{[^}]*\}>/g, '');

  // Evaluate and return the config object
  const fn = new Function(`${src}\nreturn LLM_CONFIG;`);
  return fn();
}

const sampleText = 'Team meeting tomorrow at 2pm in Room 301';
const sampleDateTime = '3/2/2026, 10:00:00 AM';

test.describe('LLM Prompt Sync (client ↔ backend)', () => {
  test('should produce identical system prompts', async ({ context }) => {
    const [serviceWorker] = context.serviceWorkers();

    const clientPrompt = await serviceWorker.evaluate((dt) => {
      return LLM_CONFIG.buildSystemPrompt(dt);
    }, sampleDateTime);

    const backendConfig = loadBackendConfig();
    const backendPrompt = backendConfig.buildSystemPrompt(sampleDateTime);

    expect(clientPrompt).toBe(backendPrompt);
  });

  test('should produce identical messages', async ({ context }) => {
    const [serviceWorker] = context.serviceWorkers();

    const clientMessages = await serviceWorker.evaluate(({ text, dt }) => {
      return LLM_CONFIG.buildMessages(text, dt);
    }, { text: sampleText, dt: sampleDateTime });

    const backendConfig = loadBackendConfig();
    const backendMessages = backendConfig.buildMessages(sampleText, sampleDateTime);

    expect(clientMessages).toEqual(backendMessages);
  });

  test('should produce identical request bodies', async ({ context }) => {
    const [serviceWorker] = context.serviceWorkers();

    const clientBody = await serviceWorker.evaluate(({ text, dt }) => {
      return LLM_CONFIG.buildRequestBody(text, dt);
    }, { text: sampleText, dt: sampleDateTime });

    const backendConfig = loadBackendConfig();
    const backendBody = backendConfig.buildRequestBody(sampleText, sampleDateTime);

    expect(clientBody).toEqual(backendBody);
  });

  test('should use the same model and parameters', async ({ context }) => {
    const [serviceWorker] = context.serviceWorkers();

    const clientConfig = await serviceWorker.evaluate(() => ({
      model: LLM_CONFIG.model,
      temperature: LLM_CONFIG.temperature,
      top_p: LLM_CONFIG.top_p,
    }));

    const backendConfig = loadBackendConfig();

    expect(clientConfig.model).toBe(backendConfig.model);
    expect(clientConfig.temperature).toBe(backendConfig.temperature);
    expect(clientConfig.top_p).toBe(backendConfig.top_p);
  });
});