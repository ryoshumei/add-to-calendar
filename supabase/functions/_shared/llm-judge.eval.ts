// Tier-2 LLM-judge benchmark run. NOT part of the regular test suite
// (filename avoids *.test.ts). Requires OPENAI_API_KEY.
//
// Run:            npm run eval:judge
// Update ratchet: npm run eval:judge -- --update-baseline
// Judge override: JUDGE_MODEL=gpt-4.1 npm run eval:judge

import { LLM_CONFIG } from "./llm-prompt.ts";
import { parseEventResponse } from "./parse-event-response.ts";
import { FIXED_NOW } from "./eval-cases.ts";
import { corpusHash, parseCorpusJsonl } from "./eval-corpus.ts";
import type { CorpusItem } from "./eval-corpus.ts";
import {
  aggregate,
  buildJudgeRequest,
  compareToBaseline,
  DEFAULT_JUDGE_MODEL,
  formatReport,
  makeBaseline,
  validateJudgeResponse,
  worstItems,
} from "./llm-judge.ts";
import type { Baseline, ItemResult } from "./llm-judge.ts";

const ERROR_ABORT_RATIO = 0.2;
const CORPUS_PATH = new URL("./eval-corpus.jsonl", import.meta.url).pathname;
const BASELINE_PATH = new URL("./eval-baseline.json", import.meta.url).pathname;

const apiKey = Deno.env.get("OPENAI_API_KEY");
const judgeModel = Deno.env.get("JUDGE_MODEL") ?? DEFAULT_JUDGE_MODEL;
const updateBaseline = Deno.args.includes("--update-baseline");

if (!apiKey) {
  console.warn("OPENAI_API_KEY is not set — tier-2 judge run will be skipped.");
}

async function callOpenAI(body: Record<string, unknown>): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (firstErr) {
    console.warn(`  retrying ${label}: ${firstErr}`);
    return await fn();
  }
}

async function runItem(item: CorpusItem): Promise<ItemResult> {
  // 1. Extract via the exact production path.
  const extractBody = LLM_CONFIG.buildRequestBody(item.text, FIXED_NOW);
  const extractContent = await withRetry(
    `${item.id} extract`,
    () => callOpenAI(extractBody as Record<string, unknown>),
  );
  const { events } = parseEventResponse(extractContent);

  // 2. Judge with the stronger model.
  const judgeBody = buildJudgeRequest(item.text, FIXED_NOW, events, judgeModel);
  const judgeRaw = await withRetry(`${item.id} judge`, async () => {
    const content = await callOpenAI(judgeBody);
    try {
      return validateJudgeResponse(JSON.parse(content));
    } catch (_e) {
      // one shape-nudge retry
      const nudged = await callOpenAI({
        ...judgeBody,
        messages: [
          ...(judgeBody.messages as unknown[]),
          { role: "user", content: "Return ONLY the JSON object, exactly as specified." },
        ],
      });
      return validateJudgeResponse(JSON.parse(nudged));
    }
  });

  return { id: item.id, judge: judgeRaw };
}

Deno.test({
  name: "tier-2 LLM-judge benchmark",
  ignore: !apiKey,
  fn: async () => {
    let raw: string;
    try {
      raw = await Deno.readTextFile(CORPUS_PATH);
    } catch (_e) {
      throw new Error(
        "eval-corpus.jsonl not found — run `npm run eval:generate` first",
      );
    }
    const items = parseCorpusJsonl(raw);
    const hash = await corpusHash(raw);
    console.log(
      `Corpus: ${items.length} items. Cost preflight: ~${items.length} ${LLM_CONFIG.model} extractions + ~${items.length} ${judgeModel} judgments (a few cents).`,
    );

    const results: ItemResult[] = [];
    const erroredIds: string[] = [];
    for (const item of items) {
      try {
        const result = await runItem(item);
        results.push(result);
        const flag = result.judge.hardFail ? " HARD-FAIL" : "";
        console.log(`  ${item.id} ok${flag}`);
      } catch (err) {
        erroredIds.push(item.id);
        console.error(`  ${item.id} ERRORED: ${err}`);
      }
    }

    if (erroredIds.length / items.length > ERROR_ABORT_RATIO) {
      throw new Error(
        `${erroredIds.length}/${items.length} items errored (> ${ERROR_ABORT_RATIO * 100}%) — aborting without baseline comparison`,
      );
    }

    const agg = aggregate(results);
    const anyHardFail = results.some((r) => r.judge.hardFail);

    let baseline: Baseline | null = null;
    try {
      baseline = JSON.parse(await Deno.readTextFile(BASELINE_PATH)) as Baseline;
    } catch (_e) {
      // no baseline yet
    }

    console.log("\n" + formatReport(agg, baseline, worstItems(results), erroredIds));

    if (updateBaseline) {
      if (anyHardFail) {
        throw new Error(
          "refusing to bless a baseline containing hard-fails — fix the failures first",
        );
      }
      const next = makeBaseline(
        agg,
        hash,
        LLM_CONFIG.model,
        judgeModel,
        new Date().toISOString().slice(0, 10),
      );
      await Deno.writeTextFile(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
      console.log(`\nBaseline written to ${BASELINE_PATH} — commit it to ratchet.`);
      return;
    }

    const cmp = compareToBaseline(agg, hash, baseline, anyHardFail);
    for (const note of cmp.notes) console.log(`note: ${note}`);
    if (!cmp.ok) {
      throw new Error(`Tier-2 regression:\n  - ${cmp.failures.join("\n  - ")}`);
    }
  },
});
