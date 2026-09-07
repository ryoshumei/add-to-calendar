// Live Screenshot evaluation against the real OpenAI API.
// NOT part of the regular test suite (the filename intentionally avoids the
// *.test.ts pattern so `deno test supabase/functions/_shared/` skips it) and
// never part of CI — it costs money and is nondeterministic.
//
// Run:  OPENAI_API_KEY=sk-... npm run eval:screenshot
//
// Exercises the exact production path for a Screenshot: the HTML fixtures in
// ./eval-screenshots are rendered to PNG by Playwright at run time, then
// LLM_CONFIG.buildImageRequestBody → chat/completions → parseEventResponse,
// matched with the same events matcher the text tier uses.
// Cases are skipped (ignored) when OPENAI_API_KEY is not set.
//
// The rendered PNG goes to the model as-is: this tier measures the prompt and
// the parser, not the extension's capture step (crop to the Region, downscale
// to 1600 px, JPEG 0.7), which is covered by the Screenshot pipeline tests.

import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { LLM_CONFIG } from "./llm-prompt.ts";
import { parseEventResponse } from "./parse-event-response.ts";
import { assertEventsMatch, FIXED_NOW } from "./eval-cases.ts";
import {
  SCREENSHOT_EVAL_CASES,
  screenshotRenderJobs,
} from "./eval-screenshot-cases.ts";

const apiKey = Deno.env.get("OPENAI_API_KEY");

if (!apiKey) {
  console.warn(
    "OPENAI_API_KEY is not set — all screenshot-eval cases will be skipped.",
  );
}

const repoRoot = decodeURIComponent(
  new URL("../../../", import.meta.url).pathname,
);
const rendererPath = `${repoRoot}scripts/render-eval-screenshots.js`;

/** Rendered PNG path per case name; rendered once for the whole run. */
let renderAllPromise: Promise<Map<string, string>> | null = null;

function renderedScreenshots(): Promise<Map<string, string>> {
  if (!renderAllPromise) renderAllPromise = renderAll();
  return renderAllPromise;
}

async function renderAll(): Promise<Map<string, string>> {
  // One fixed, gitignored directory rather than a fresh temp dir: each run
  // replaces the last, and the Screenshots stay around for inspection when a
  // case fails, instead of piling up in /tmp.
  const outDir = `${repoRoot}test-results/screenshot-eval`;
  await Deno.remove(outDir, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  const payload = JSON.stringify({ outDir, jobs: screenshotRenderJobs() });

  const child = new Deno.Command("node", {
    args: [rendererPath],
    stdin: "piped",
    stdout: "piped",
    stderr: "inherit",
  }).spawn();

  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(payload));
  await writer.close();

  const { code, stdout } = await child.output();
  if (code !== 0) {
    throw new Error(
      `Rendering the Screenshot fixtures failed (node exit ${code}). ` +
        "Run `npm ci` and `npx playwright install chromium` first.",
    );
  }

  const rendered = JSON.parse(new TextDecoder().decode(stdout)) as Array<
    { name: string; path: string }
  >;
  console.log(`\nRendered ${rendered.length} Screenshot(s) into ${outDir}`);
  return new Map(rendered.map((r) => [r.name, r.path]));
}

async function screenshotDataUrl(name: string): Promise<string> {
  const path = (await renderedScreenshots()).get(name);
  if (!path) throw new Error(`no rendered Screenshot for case ${name}`);
  // std@0.168's encoder takes an ArrayBuffer; slice() gives one sized to the file.
  const bytes = await Deno.readFile(path);
  return `data:image/png;base64,${base64Encode(bytes.slice().buffer as ArrayBuffer)}`;
}

for (const evalCase of SCREENSHOT_EVAL_CASES) {
  Deno.test({
    name: `screenshot-eval: ${evalCase.name}`,
    ignore: !apiKey,
    fn: async () => {
      const dataUrl = await screenshotDataUrl(evalCase.name);

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify(
            LLM_CONFIG.buildImageRequestBody(dataUrl, FIXED_NOW),
          ),
        },
      );
      if (!response.ok) {
        throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      const { events } = parseEventResponse(content);

      // Always show what came back — useful for judging near-misses.
      console.log(
        `\n[${evalCase.name}] extracted ${events.length} event(s):`,
        JSON.stringify(events, null, 2),
      );

      const failures = assertEventsMatch(events, evalCase.expect);
      if (failures.length > 0) {
        throw new Error(
          `${evalCase.name} failed:\n  - ${failures.join("\n  - ")}`,
        );
      }
    },
  });
}
