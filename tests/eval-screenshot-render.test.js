// tests/eval-screenshot-render.test.js
// The Screenshot eval tier renders its HTML fixtures to PNG at run time
// (nothing binary is committed). This guards the renderer and the fixtures
// themselves: every fixture must produce a real, non-blank PNG. No API key
// and no network are involved — the live tier is npm run eval:screenshot.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderScreenshots } from '../scripts/render-eval-screenshots.js';

const fixtureDir = path.resolve(
  __dirname, '..', 'supabase', 'functions', '_shared', 'eval-screenshots'
);

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(buffer.subarray(0, 8).equals(signature)).toBe(true);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test.describe('Screenshot eval fixtures', () => {
  test('every fixture renders to a non-blank PNG', async () => {
    const fixtures = fs.readdirSync(fixtureDir).filter((f) => f.endsWith('.html'));
    expect(fixtures.length).toBeGreaterThan(0);

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-eval-'));
    const jobs = fixtures.map((file) => ({
      name: path.basename(file, '.html'),
      html: path.join(fixtureDir, file),
    }));

    const rendered = await renderScreenshots({ jobs, outDir });
    expect(rendered.map((r) => r.name).sort()).toEqual(jobs.map((j) => j.name).sort());

    for (const result of rendered) {
      const buffer = fs.readFileSync(result.path);
      const { width, height } = pngSize(buffer);
      expect(width).toBeGreaterThanOrEqual(600);
      expect(height).toBeGreaterThanOrEqual(400);
      // A blank page of this size compresses to a few KB; real content is bigger.
      expect(buffer.byteLength).toBeGreaterThan(8000);
    }

    fs.rmSync(outDir, { recursive: true, force: true });
  });
});
