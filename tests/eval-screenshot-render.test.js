// tests/eval-screenshot-render.test.js
// The Screenshot eval tier renders its HTML fixtures to PNG at run time
// (nothing binary is committed). This guards the fixture directory and the
// renderer: every declared fixture exists and produces a real, non-blank PNG.
// No API key and no network are involved — the live tier is
// `npm run eval:screenshot`.
//
// Caveat: this runs on CI runners that may lack CJK fonts, where a Japanese
// fixture renders as tofu boxes and still passes the size assertions below.
// Only the live tier, run on a machine with CJK fonts, proves the Japanese
// Screenshots are readable.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderScreenshots } from '../scripts/render-eval-screenshots.js';

const sharedDir = path.resolve(__dirname, '..', 'supabase', 'functions', '_shared');
const fixtureDir = path.join(sharedDir, 'eval-screenshots');
const casesFile = path.join(sharedDir, 'eval-screenshot-cases.ts');

/** Fixture file names declared by the eval cases. */
function declaredFixtures() {
  const source = fs.readFileSync(casesFile, 'utf-8');
  return [...source.matchAll(/fixture:\s*'([^']+)'|fixture:\s*"([^"]+)"/g)]
    .map((match) => match[1] || match[2]);
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(buffer.subarray(0, 8).equals(signature)).toBe(true);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test.describe('Screenshot eval fixtures', () => {
  test('the fixture directory holds the declared HTML and nothing else', () => {
    const onDisk = fs.readdirSync(fixtureDir);
    const declared = declaredFixtures();

    expect(declared.length).toBeGreaterThan(0);
    // Screenshots are rendered at eval time, never committed.
    expect(onDisk.filter((f) => !f.endsWith('.html'))).toEqual([]);
    expect(onDisk.sort()).toEqual([...declared].sort());
  });

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
