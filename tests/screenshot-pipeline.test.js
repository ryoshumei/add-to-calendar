// tests/screenshot-pipeline.test.js
// The Screenshot pipeline turns a captured tab into the JPEG data URL that
// leaves the browser. It has no DOM dependency — the service worker runs it —
// so it is exercised here in a page context, where a test can draw a known
// image and measure what comes back.
import { test, expect } from './fixtures/extension-fixtures.js';
import path from 'path';

const PIPELINE_SCRIPT = path.resolve('scripts/screenshot-pipeline.js');

// Loads the pipeline into the page and hands back a `run` helper that draws a
// capture of the given size, pushes it through the pipeline and measures what
// came out.
async function loadPipeline(page) {
  await page.addScriptTag({ path: PIPELINE_SCRIPT });

  return async ({ capture, region = null, devicePixelRatio = 1, options = undefined }) =>
    page.evaluate(
      async ({ capture, region, devicePixelRatio, options }) => {
        const source = document.createElement('canvas');
        source.width = capture.width;
        source.height = capture.height;
        const ctx = source.getContext('2d');
        // A gradient, not a flat fill: JPEG would compress a flat image to
        // almost nothing, which would make a size assertion meaningless.
        const gradient = ctx.createLinearGradient(0, 0, capture.width, capture.height);
        gradient.addColorStop(0, '#ff0000');
        gradient.addColorStop(0.5, '#00ff88');
        gradient.addColorStop(1, '#0000ff');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, capture.width, capture.height);

        const captureDataUrl = source.toDataURL('image/png');

        let dataUrl;
        try {
          dataUrl = await SCREENSHOT_PIPELINE.buildScreenshotDataUrl(
            captureDataUrl,
            region,
            devicePixelRatio,
            options
          );
        } catch (error) {
          return { error: error.message };
        }

        const decoded = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => reject(new Error('The pipeline returned an image the browser cannot decode'));
          image.src = dataUrl;
        });

        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        return {
          mime: dataUrl.slice(5, dataUrl.indexOf(';')),
          width: decoded.width,
          height: decoded.height,
          encodedBytes: Math.floor((base64.length * 3) / 4),
        };
      },
      { capture, region, devicePixelRatio, options }
    );
}

test.describe('Screenshot pipeline', () => {
  test('caps the longest side at 1600 px and keeps the aspect ratio', async ({ sourcePage }) => {
    const run = await loadPipeline(sourcePage);

    const result = await run({ capture: { width: 2400, height: 1200 } });

    expect(result.error).toBeUndefined();
    expect(Math.max(result.width, result.height)).toBe(1600);
    expect(result.width / result.height).toBeCloseTo(2, 2);
  });

  test('encodes the Screenshot as JPEG', async ({ sourcePage }) => {
    const run = await loadPipeline(sourcePage);

    const result = await run({ capture: { width: 800, height: 600 } });

    expect(result.mime).toBe('image/jpeg');
  });

  test('leaves a capture already under the cap at its own size', async ({ sourcePage }) => {
    const run = await loadPipeline(sourcePage);

    const result = await run({ capture: { width: 800, height: 600 } });

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  test('crops to the Region, scaled by the device pixel ratio', async ({ sourcePage }) => {
    const run = await loadPipeline(sourcePage);

    // A Retina tab: the capture is in device pixels, the Region in CSS pixels.
    const result = await run({
      capture: { width: 2000, height: 1000 },
      region: { x: 100, y: 50, width: 300, height: 200 },
      devicePixelRatio: 2,
    });

    expect(result.error).toBeUndefined();
    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
  });

  test('rejects a Screenshot whose encoded size is over the cap', async ({ sourcePage }) => {
    const run = await loadPipeline(sourcePage);

    const result = await run({
      capture: { width: 2400, height: 1200 },
      options: { maxEncodedBytes: 5000 },
    });

    expect(result.error).toMatch(/too large/i);
  });
});
