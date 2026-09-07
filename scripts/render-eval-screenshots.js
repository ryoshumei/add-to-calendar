// Renders the Screenshot eval fixtures (HTML) to PNG with Playwright.
// Used by the live tier (supabase/functions/_shared/llm-screenshot.eval.ts,
// which spawns this file with a JSON job list on stdin) and by the fixture
// guard test (tests/eval-screenshot-render.test.js, which imports it).
// Nothing is committed: every Screenshot is rendered at run time.
//
// CLI:  echo '{"outDir":"/tmp/x","jobs":[{"name":"poster-en","html":"/abs/poster-en.html"}]}' \
//         | node scripts/render-eval-screenshots.js
// Prints the rendered files as JSON: [{ "name": "...", "path": "..." }]

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const DEFAULT_VIEWPORT = { width: 900, height: 800 };

/**
 * Render each job's HTML fixture to <outDir>/<name>.png (full page).
 * @param {{ jobs: Array<{name: string, html: string, width?: number, height?: number}>, outDir: string }} options
 * @returns {Promise<Array<{name: string, path: string}>>}
 */
async function renderScreenshots({ jobs, outDir }) {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const rendered = [];
  try {
    for (const job of jobs) {
      const page = await browser.newPage({
        viewport: {
          width: job.width || DEFAULT_VIEWPORT.width,
          height: job.height || DEFAULT_VIEWPORT.height,
        },
        deviceScaleFactor: 1,
      });
      try {
        await page.goto(pathToFileURL(job.html).href, { waitUntil: 'load' });
        // Web fonts and CJK fallbacks must be settled before the capture.
        await page.evaluate(() => document.fonts.ready);
        const file = path.join(outDir, `${job.name}.png`);
        await page.screenshot({ path: file, fullPage: true, type: 'png' });
        rendered.push({ name: job.name, path: file });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  return rendered;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const input = JSON.parse(await readStdin());
  const rendered = await renderScreenshots(input);
  process.stdout.write(JSON.stringify(rendered));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { renderScreenshots };
