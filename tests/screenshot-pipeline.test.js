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

  return async ({
    capture,
    pattern = 'gradient',
    region = null,
    devicePixelRatio = 1,
    options = undefined,
  }) =>
    page.evaluate(
      async ({ capture, pattern, region, devicePixelRatio, options }) => {
        const source = document.createElement('canvas');
        source.width = capture.width;
        source.height = capture.height;
        const ctx = source.getContext('2d');

        if (pattern === 'quadrants') {
          // Four flat quadrants, so the colour that comes back says which part
          // of the capture the pipeline cropped.
          const half = { width: capture.width / 2, height: capture.height / 2 };
          const colours = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
          [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([column, row], index) => {
            ctx.fillStyle = colours[index];
            ctx.fillRect(column * half.width, row * half.height, half.width, half.height);
          });
        } else {
          // A gradient, not a flat fill: JPEG would compress a flat image to
          // almost nothing, which would make a size assertion meaningless.
          const gradient = ctx.createLinearGradient(0, 0, capture.width, capture.height);
          gradient.addColorStop(0, '#ff0000');
          gradient.addColorStop(0.5, '#00ff88');
          gradient.addColorStop(1, '#0000ff');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, capture.width, capture.height);
        }

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
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('The pipeline returned an image the browser cannot decode'));
          image.src = dataUrl;
        });

        const out = document.createElement('canvas');
        out.width = decoded.naturalWidth;
        out.height = decoded.naturalHeight;
        const outCtx = out.getContext('2d');
        outCtx.drawImage(decoded, 0, 0);
        const centre = outCtx.getImageData(
          Math.floor(out.width / 2),
          Math.floor(out.height / 2),
          1,
          1
        ).data;

        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        return {
          mime: dataUrl.slice(5, dataUrl.indexOf(';')),
          width: decoded.naturalWidth,
          height: decoded.naturalHeight,
          centrePixel: [centre[0], centre[1], centre[2]],
          encodedBytes: Math.floor((base64.length * 3) / 4),
        };
      },
      { capture, pattern, region, devicePixelRatio, options }
    );
}

// JPEG is lossy, so a flat colour comes back close rather than exact.
function expectColour(pixel, expected) {
  const worstChannel = Math.max(
    ...pixel.map((value, index) => Math.abs(value - expected[index]))
  );
  expect(worstChannel, `expected ${expected} but the crop is ${pixel}`).toBeLessThanOrEqual(12);
}

// The capture is drawn as four flat quadrants, so a cropped colour names the
// part of the capture that came back.
const TOP_LEFT = [255, 0, 0];
const BOTTOM_RIGHT = [255, 255, 0];

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

  test('crops to the Region on a display that does not scale', async ({ sourcePage }) => {
    const run = await loadPipeline(sourcePage);

    // Drawn wholly inside the bottom-right quadrant of the capture.
    const result = await run({
      capture: { width: 800, height: 600 },
      pattern: 'quadrants',
      region: { x: 500, y: 350, width: 200, height: 150 },
      devicePixelRatio: 1,
    });

    expect(result.error).toBeUndefined();
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
    expectColour(result.centrePixel, BOTTOM_RIGHT);
  });

  test('crops to the Region, scaled by the device pixel ratio', async ({ sourcePage }) => {
    const run = await loadPipeline(sourcePage);

    // A Retina tab: the capture is in device pixels, the Region in CSS pixels,
    // so this Region lands in the bottom-right quadrant only once it is
    // scaled. Unscaled it would crop the top-left one.
    const result = await run({
      capture: { width: 2000, height: 1000 },
      pattern: 'quadrants',
      region: { x: 600, y: 300, width: 300, height: 150 },
      devicePixelRatio: 2,
    });

    expect(result.error).toBeUndefined();
    expect(result.width).toBe(600);
    expect(result.height).toBe(300);
    expectColour(result.centrePixel, BOTTOM_RIGHT);
  });

  test('keeps a Region that runs past the edge inside the capture', async ({ sourcePage }) => {
    const run = await loadPipeline(sourcePage);

    // Dragged off the bottom-right corner: only the quarter of the Region that
    // is on screen was ever captured, and the rest would be a black band.
    const result = await run({
      capture: { width: 800, height: 600 },
      pattern: 'quadrants',
      region: { x: 700, y: 500, width: 400, height: 400 },
      devicePixelRatio: 1,
    });

    expect(result.error).toBeUndefined();
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expectColour(result.centrePixel, BOTTOM_RIGHT);
  });

  test('crops the top-left corner when the Region starts outside the capture', async ({
    sourcePage,
  }) => {
    const run = await loadPipeline(sourcePage);

    const result = await run({
      capture: { width: 800, height: 600 },
      pattern: 'quadrants',
      region: { x: -100, y: -80, width: 300, height: 200 },
      devicePixelRatio: 1,
    });

    expect(result.error).toBeUndefined();
    expect(result.width).toBe(200);
    expect(result.height).toBe(120);
    expectColour(result.centrePixel, TOP_LEFT);
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
