# Tier-2 LLM-Judge Eval System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully automated, scored quality benchmark: synthetic corpus (32 items) → production-path extraction → cross-model LLM judge (6 dimensions, hard-fail rules) → committed baseline ratchet with regression thresholds.

**Architecture:** Pure logic lives in `eval-corpus.ts` (corpus domain) and `llm-judge.ts` (judge/scoring/baseline domain), both fully TDD'd in the regular Deno suite. Two thin entrypoints do live LLM I/O: `generate-corpus.ts` (a `deno run` script, `import.meta.main`-guarded) and `llm-judge.eval.ts` (a single wrapping `Deno.test`, same opt-in pattern as the existing Tier 1 `llm-prompt.eval.ts`). Nothing is imported by deployed function entrypoints.

**Tech Stack:** Deno 2.x, std@0.168 asserts, OpenAI chat completions (extractor: `LLM_CONFIG.model` = gpt-4.1-mini; judge: `gpt-4.1` default, `JUDGE_MODEL` env override), existing `parseEventResponse` + `FIXED_NOW`.

**Spec:** `docs/superpowers/specs/2026-07-08-llm-judge-eval-design.md` (approved). Work happens on branch `feat/llm-judge-evals`.

## Global Constraints

- New files live in `supabase/functions/_shared/`; NONE may be imported by `process-text/index.ts` or `process-image/index.ts`.
- Live-LLM entrypoints must not match `*.test.ts` / `*_test.ts` (so `deno test supabase/functions/_shared/` never hits the network). Use `.eval.ts` suffix or `deno run` scripts.
- Test imports use `https://deno.land/std@0.168.0/testing/asserts.ts` (repo convention).
- Double-quoted strings in new `_shared` files (matches existing eval files / deno fmt).
- No new dependencies. No `Date.now()` needed anywhere except baseline `date` (passed in as a parameter to pure functions; read from `new Date()` only in the runner).
- Thresholds are constants: `OVERALL_DROP_LIMIT = 0.2`, `DIMENSION_DROP_LIMIT = 0.4`, `ERROR_ABORT_RATIO = 0.2`, `TARGET_PER_CELL = 2`.
- All aggregate numbers rounded to 2 decimals via `Math.round(x * 100) / 100`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Verification command for the regular suite: `deno test supabase/functions/_shared/` — must stay green and must NOT show any `prompt-eval:` or `tier-2` test names.

---

### Task 1: Corpus domain — types, JSONL parsing, hashing

**Files:**
- Create: `supabase/functions/_shared/eval-corpus.ts`
- Test: `supabase/functions/_shared/eval-corpus.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (used by Tasks 2, 3, 7):
  - `interface CorpusItem { id: string; lang: "ja" | "en"; category: string; text: string; }`
  - `const CORPUS_CATEGORIES: readonly string[]` (8 categories), `const CORPUS_LANGS: readonly ["ja","en"]`, `const TARGET_PER_CELL = 2`
  - `function parseCorpusJsonl(raw: string): CorpusItem[]` — throws `Error` naming the 1-based line number on malformed lines
  - `async function corpusHash(raw: string): Promise<string>` — sha256 hex of the raw file text

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/eval-corpus.test.ts`:

```ts
import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { corpusHash, parseCorpusJsonl } from "./eval-corpus.ts";

const LINE_A =
  '{"id":"ja-receipt-01","lang":"ja","category":"receipt","text":"取引日時 2026/07/03 18:36"}';
const LINE_B =
  '{"id":"en-chat-01","lang":"en","category":"chat","text":"lunch tomorrow at noon?"}';

Deno.test("parseCorpusJsonl parses valid lines and skips blanks", () => {
  const items = parseCorpusJsonl(`${LINE_A}\n\n${LINE_B}\n`);
  assertEquals(items.length, 2);
  assertEquals(items[0].id, "ja-receipt-01");
  assertEquals(items[1].lang, "en");
});

Deno.test("parseCorpusJsonl names the line number on malformed JSON", () => {
  assertThrows(
    () => parseCorpusJsonl(`${LINE_A}\nnot json`),
    Error,
    "line 2",
  );
});

Deno.test("parseCorpusJsonl rejects items with missing fields", () => {
  assertThrows(
    () => parseCorpusJsonl('{"id":"x","lang":"ja","category":"receipt"}'),
    Error,
    "line 1",
  );
});

Deno.test("parseCorpusJsonl rejects invalid lang", () => {
  assertThrows(
    () =>
      parseCorpusJsonl(
        '{"id":"x","lang":"fr","category":"receipt","text":"t"}',
      ),
    Error,
    "line 1",
  );
});

Deno.test("corpusHash is deterministic and content-sensitive", async () => {
  const a = await corpusHash("hello\n");
  const b = await corpusHash("hello\n");
  const c = await corpusHash("hello!\n");
  assertEquals(a, b);
  assertEquals(a === c, false);
  assertEquals(a.length, 64);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/eval-corpus.test.ts`
Expected: FAIL — `Cannot find module ... eval-corpus.ts`

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/_shared/eval-corpus.ts`:

```ts
// Tier-2 eval corpus: synthetic texts used by the LLM-judge benchmark.
// See docs/superpowers/specs/2026-07-08-llm-judge-eval-design.md

export interface CorpusItem {
  id: string;
  lang: "ja" | "en";
  category: string;
  text: string;
}

export const CORPUS_CATEGORIES = [
  "receipt",
  "reservation",
  "meeting-email",
  "chat",
  "poster",
  "delivery",
  "deadline",
  "no-event",
] as const;

export const CORPUS_LANGS = ["ja", "en"] as const;

export const TARGET_PER_CELL = 2;

export function parseCorpusJsonl(raw: string): CorpusItem[] {
  const items: CorpusItem[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (_e) {
      throw new Error(`eval-corpus.jsonl line ${i + 1}: not valid JSON`);
    }
    const item = parsed as Partial<CorpusItem>;
    if (
      typeof item.id !== "string" || !item.id ||
      (item.lang !== "ja" && item.lang !== "en") ||
      typeof item.category !== "string" || !item.category ||
      typeof item.text !== "string" || !item.text
    ) {
      throw new Error(
        `eval-corpus.jsonl line ${i + 1}: missing/invalid id, lang, category, or text`,
      );
    }
    items.push(item as CorpusItem);
  }
  return items;
}

export async function corpusHash(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_shared/eval-corpus.test.ts`
Expected: `5 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/eval-corpus.ts supabase/functions/_shared/eval-corpus.test.ts
git commit -m "feat(evals): corpus parsing and hashing for tier-2 judge

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Corpus gap-fill selection and id allocation

**Files:**
- Modify: `supabase/functions/_shared/eval-corpus.ts` (append functions)
- Modify: `supabase/functions/_shared/eval-corpus.test.ts` (append tests)

**Interfaces:**
- Consumes: `CorpusItem`, `CORPUS_CATEGORIES`, `CORPUS_LANGS`, `TARGET_PER_CELL` (Task 1).
- Produces (used by Task 3):
  - `interface CellGap { lang: "ja" | "en"; category: string; missing: number; }`
  - `function missingCells(items: CorpusItem[]): CellGap[]` — cells below `TARGET_PER_CELL`, ordered by category then lang
  - `function nextId(items: CorpusItem[], lang: string, category: string): string` — `"{lang}-{category}-NN"`, NN = max existing number + 1, zero-padded to 2

- [ ] **Step 1: Write the failing tests (append to eval-corpus.test.ts)**

```ts
import {
  CORPUS_CATEGORIES,
  CORPUS_LANGS,
  missingCells,
  nextId,
  TARGET_PER_CELL,
} from "./eval-corpus.ts";
import type { CorpusItem } from "./eval-corpus.ts";

function item(id: string, lang: "ja" | "en", category: string): CorpusItem {
  return { id, lang, category, text: "placeholder text" };
}

Deno.test("missingCells reports every cell at target count when corpus is empty", () => {
  const gaps = missingCells([]);
  assertEquals(gaps.length, CORPUS_CATEGORIES.length * CORPUS_LANGS.length);
  assertEquals(gaps.every((g) => g.missing === TARGET_PER_CELL), true);
});

Deno.test("missingCells reports only the shortfall for partial cells", () => {
  const gaps = missingCells([item("ja-receipt-01", "ja", "receipt")]);
  const receiptJa = gaps.find((g) => g.lang === "ja" && g.category === "receipt");
  assertEquals(receiptJa?.missing, 1);
});

Deno.test("missingCells is empty for a full corpus", () => {
  const items: CorpusItem[] = [];
  for (const category of CORPUS_CATEGORIES) {
    for (const lang of CORPUS_LANGS) {
      for (let n = 1; n <= TARGET_PER_CELL; n++) {
        items.push(item(`${lang}-${category}-0${n}`, lang, category));
      }
    }
  }
  assertEquals(missingCells(items), []);
});

Deno.test("nextId continues from the max existing number", () => {
  const items = [
    item("ja-receipt-01", "ja", "receipt"),
    item("ja-receipt-03", "ja", "receipt"),
  ];
  assertEquals(nextId(items, "ja", "receipt"), "ja-receipt-04");
  assertEquals(nextId(items, "en", "receipt"), "en-receipt-01");
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `deno test supabase/functions/_shared/eval-corpus.test.ts`
Expected: FAIL — `missingCells` / `nextId` not exported.

- [ ] **Step 3: Implement (append to eval-corpus.ts)**

```ts
export interface CellGap {
  lang: "ja" | "en";
  category: string;
  missing: number;
}

export function missingCells(items: CorpusItem[]): CellGap[] {
  const gaps: CellGap[] = [];
  for (const category of CORPUS_CATEGORIES) {
    for (const lang of CORPUS_LANGS) {
      const have = items.filter(
        (i) => i.lang === lang && i.category === category,
      ).length;
      if (have < TARGET_PER_CELL) {
        gaps.push({ lang, category, missing: TARGET_PER_CELL - have });
      }
    }
  }
  return gaps;
}

export function nextId(
  items: CorpusItem[],
  lang: string,
  category: string,
): string {
  const prefix = `${lang}-${category}-`;
  let max = 0;
  for (const i of items) {
    if (i.id.startsWith(prefix)) {
      const n = parseInt(i.id.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/eval-corpus.test.ts`
Expected: `9 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/eval-corpus.ts supabase/functions/_shared/eval-corpus.test.ts
git commit -m "feat(evals): corpus gap-fill selection and id allocation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Corpus generator script

**Files:**
- Create: `supabase/functions/_shared/generate-corpus.ts`
- Test: `supabase/functions/_shared/generate-corpus.test.ts`
- Modify: `package.json` (add `eval:generate` script)

**Interfaces:**
- Consumes: `missingCells`, `nextId`, `parseCorpusJsonl`, `CORPUS_CATEGORIES` (Tasks 1–2); `FIXED_NOW` from `./eval-cases.ts`.
- Produces (invoked by humans; Task 8 runs it live):
  - `function parseArgs(args: string[]): { category?: string; count?: number }` — throws on unknown flags or unknown category
  - `function buildGenerationRequest(lang: "ja" | "en", category: string, fixedNow: string): Record<string, unknown>` — OpenAI body, `temperature: 0.9`, `response_format: {type:"json_object"}`, asks for `{"text": "..."}`
  - `function parseGeneratedText(content: string | null | undefined): string` — extracts and validates the generated text
  - CLI (guarded by `import.meta.main`): fills gaps or `--category X --count N`, appends lines to `supabase/functions/_shared/eval-corpus.jsonl`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/generate-corpus.test.ts`:

```ts
import {
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildGenerationRequest,
  parseArgs,
  parseGeneratedText,
} from "./generate-corpus.ts";

Deno.test("parseArgs: no args means gap-fill mode", () => {
  assertEquals(parseArgs([]), {});
});

Deno.test("parseArgs: targeted category and count", () => {
  assertEquals(parseArgs(["--category", "receipt", "--count", "3"]), {
    category: "receipt",
    count: 3,
  });
});

Deno.test("parseArgs rejects unknown categories and flags", () => {
  assertThrows(() => parseArgs(["--category", "sports"]), Error, "category");
  assertThrows(() => parseArgs(["--frobnicate"]), Error, "--frobnicate");
});

Deno.test("buildGenerationRequest shape and diversity temperature", () => {
  const body = buildGenerationRequest("en", "reservation", "7/6/2026, 10:00:00 AM") as {
    temperature: number;
    response_format: { type: string };
    messages: Array<{ role: string; content: string }>;
  };
  assertEquals(body.temperature, 0.9);
  assertEquals(body.response_format.type, "json_object");
  assertStringIncludes(body.messages[0].content, "reservation");
  assertStringIncludes(body.messages[0].content, "7/6/2026, 10:00:00 AM");
});

Deno.test("buildGenerationRequest: ja asks for Japanese text", () => {
  const body = buildGenerationRequest("ja", "receipt", "7/6/2026, 10:00:00 AM") as {
    messages: Array<{ role: string; content: string }>;
  };
  assertStringIncludes(body.messages[0].content, "Japanese");
});

Deno.test("buildGenerationRequest: no-event forbids dates and times", () => {
  const body = buildGenerationRequest("en", "no-event", "7/6/2026, 10:00:00 AM") as {
    messages: Array<{ role: string; content: string }>;
  };
  assertStringIncludes(body.messages[0].content, "no date or time");
});

Deno.test("parseGeneratedText extracts the text field", () => {
  assertEquals(parseGeneratedText('{"text":"Dinner Friday 7pm"}'), "Dinner Friday 7pm");
  assertThrows(() => parseGeneratedText('{"nope":1}'), Error, "text");
  assertThrows(() => parseGeneratedText(null), Error, "empty");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/generate-corpus.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `supabase/functions/_shared/generate-corpus.ts`:

```ts
// Corpus generator for the tier-2 judge benchmark. Appends synthetic texts
// to eval-corpus.jsonl. Never overwrites existing items.
//
// Run:  OPENAI_API_KEY=sk-... npm run eval:generate
//       npm run eval:generate -- --category receipt --count 3

import {
  CORPUS_CATEGORIES,
  missingCells,
  nextId,
  parseCorpusJsonl,
} from "./eval-corpus.ts";
import type { CorpusItem } from "./eval-corpus.ts";
import { FIXED_NOW } from "./eval-cases.ts";

const CORPUS_PATH = new URL("./eval-corpus.jsonl", import.meta.url).pathname;

export function parseArgs(args: string[]): { category?: string; count?: number } {
  const out: { category?: string; count?: number } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--category") {
      const value = args[++i];
      if (!(CORPUS_CATEGORIES as readonly string[]).includes(value)) {
        throw new Error(
          `unknown category "${value}" — valid: ${CORPUS_CATEGORIES.join(", ")}`,
        );
      }
      out.category = value;
    } else if (args[i] === "--count") {
      out.count = parseInt(args[++i], 10);
      if (Number.isNaN(out.count) || out.count < 1) {
        throw new Error("--count must be a positive integer");
      }
    } else {
      throw new Error(`unknown flag ${args[i]}`);
    }
  }
  return out;
}

export function buildGenerationRequest(
  lang: "ja" | "en",
  category: string,
  fixedNow: string,
): Record<string, unknown> {
  const language = lang === "ja" ? "Japanese" : "English";
  const dateRule = category === "no-event"
    ? "The text must contain no date or time information whatsoever — no dates, times, weekdays, or relative expressions like tomorrow."
    : `Include explicit or relative date/time expressions that make sense relative to the reference time ${fixedNow}.`;
  return {
    model: "gpt-4.1-mini",
    temperature: 0.9,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `You generate realistic test texts for a calendar-extraction benchmark. Write in ${language}. ` +
          `Produce one realistic "${category}" text that a user might select in a browser or receive on a phone. ` +
          `${dateRule} ` +
          `Vary formats, names, and phrasing. Return ONLY a JSON object: {"text": "..."}.`,
      },
      { role: "user", content: `Generate one ${language} ${category} text.` },
    ],
  };
}

export function parseGeneratedText(content: string | null | undefined): string {
  if (!content || !content.trim()) throw new Error("generator returned empty content");
  const parsed = JSON.parse(content) as { text?: unknown };
  if (typeof parsed.text !== "string" || !parsed.text.trim()) {
    throw new Error('generator response missing "text" field');
  }
  return parsed.text.trim();
}

async function callOpenAI(apiKey: string, body: Record<string, unknown>): Promise<string> {
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

async function main() {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required. Try: set -a && . ./.env && set +a");
    Deno.exit(1);
  }
  const args = parseArgs(Deno.args);

  let raw = "";
  try {
    raw = await Deno.readTextFile(CORPUS_PATH);
  } catch (_e) {
    // first run — file does not exist yet
  }
  const items = parseCorpusJsonl(raw);

  // Build the work list: targeted (--category) or gap-fill.
  const work: Array<{ lang: "ja" | "en"; category: string }> = [];
  if (args.category) {
    const count = args.count ?? 1;
    for (let i = 0; i < count; i++) {
      work.push({ lang: i % 2 === 0 ? "ja" : "en", category: args.category });
    }
  } else {
    for (const gap of missingCells(items)) {
      for (let i = 0; i < gap.missing; i++) {
        work.push({ lang: gap.lang, category: gap.category });
      }
    }
  }

  if (work.length === 0) {
    console.log("Corpus is already at target — nothing to generate.");
    return;
  }
  console.log(`Generating ${work.length} item(s) (~${work.length} gpt-4.1-mini calls)...`);

  for (const w of work) {
    const body = buildGenerationRequest(w.lang, w.category, FIXED_NOW);
    let content: string;
    try {
      content = await callOpenAI(apiKey, body);
    } catch (firstErr) {
      console.warn(`retrying ${w.lang}/${w.category}: ${firstErr}`);
      content = await callOpenAI(apiKey, body);
    }
    const text = parseGeneratedText(content);
    const id = nextId(items, w.lang, w.category);
    const item: CorpusItem = { id, lang: w.lang, category: w.category, text };
    items.push(item);
    await Deno.writeTextFile(CORPUS_PATH, JSON.stringify(item) + "\n", { append: true });
    console.log(`  + ${id} (${text.length} chars)`);
  }
  console.log(`Done. Corpus now has ${items.length} item(s) at ${CORPUS_PATH}`);
}

if (import.meta.main) {
  await main();
}
```

- [ ] **Step 4: Run tests to verify they pass, and confirm suite isolation**

Run: `deno test supabase/functions/_shared/generate-corpus.test.ts`
Expected: `7 passed | 0 failed`

Run: `deno test supabase/functions/_shared/`
Expected: all pass (50 = 34 pre-existing + 9 from Tasks 1–2 + 7 new); NO network access, NO `prompt-eval:` names.

- [ ] **Step 5: Add npm script**

In `package.json`, after the `"eval:prompt"` line, add:

```json
"eval:generate": "deno run --allow-net --allow-env --allow-read --allow-write supabase/functions/_shared/generate-corpus.ts",
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/generate-corpus.ts supabase/functions/_shared/generate-corpus.test.ts package.json
git commit -m "feat(evals): synthetic corpus generator script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Judge domain — response validation and aggregation

**Files:**
- Create: `supabase/functions/_shared/llm-judge.ts`
- Test: `supabase/functions/_shared/llm-judge.test.ts`

**Interfaces:**
- Consumes: `EventDetails` type from `./parse-event-response.ts` (Task 6 uses it in the request builder; the types here are standalone).
- Produces (used by Tasks 5–7):
  - `const JUDGE_DIMENSIONS = ["eventCount","times","title","description","duration","location"] as const`
  - `type JudgeDimension = typeof JUDGE_DIMENSIONS[number]`
  - `interface JudgeResult { scores: Record<JudgeDimension, number>; hardFail: boolean; rationales?: Record<string, string>; }`
  - `interface ItemResult { id: string; judge: JudgeResult; }`
  - `function validateJudgeResponse(body: unknown): JudgeResult` — throws on missing/out-of-range/non-integer scores or missing hardFail
  - `interface Aggregate { dimensions: Record<JudgeDimension, number>; overall: number; itemCount: number; }`
  - `function aggregate(results: ItemResult[]): Aggregate` — 2-decimal means; throws on empty input
  - `function worstItems(results: ItemResult[], n?: number): ItemResult[]` — ascending by per-item mean, default n=3

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/llm-judge.test.ts`:

```ts
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  aggregate,
  validateJudgeResponse,
  worstItems,
} from "./llm-judge.ts";
import type { ItemResult, JudgeResult } from "./llm-judge.ts";

function judge(score: number, hardFail = false): JudgeResult {
  return {
    scores: {
      eventCount: score,
      times: score,
      title: score,
      description: score,
      duration: score,
      location: score,
    },
    hardFail,
  };
}

Deno.test("validateJudgeResponse accepts a well-formed response", () => {
  const result = validateJudgeResponse({
    scores: { eventCount: 5, times: 4, title: 3, description: 5, duration: 4, location: 5 },
    hardFail: false,
    rationales: { title: "generic wording" },
  });
  assertEquals(result.scores.times, 4);
  assertEquals(result.hardFail, false);
});

Deno.test("validateJudgeResponse rejects missing dimension", () => {
  assertThrows(
    () =>
      validateJudgeResponse({
        scores: { eventCount: 5, times: 4, title: 3, description: 5, duration: 4 },
        hardFail: false,
      }),
    Error,
    "location",
  );
});

Deno.test("validateJudgeResponse rejects out-of-range and non-integer scores", () => {
  const base = { eventCount: 5, times: 4, title: 3, description: 5, duration: 4, location: 5 };
  assertThrows(
    () => validateJudgeResponse({ scores: { ...base, times: 6 }, hardFail: false }),
    Error,
    "times",
  );
  assertThrows(
    () => validateJudgeResponse({ scores: { ...base, title: 3.5 }, hardFail: false }),
    Error,
    "title",
  );
});

Deno.test("validateJudgeResponse rejects missing hardFail", () => {
  assertThrows(
    () =>
      validateJudgeResponse({
        scores: { eventCount: 5, times: 5, title: 5, description: 5, duration: 5, location: 5 },
      }),
    Error,
    "hardFail",
  );
});

Deno.test("aggregate computes 2-decimal dimension means and overall", () => {
  const results: ItemResult[] = [
    { id: "a", judge: judge(5) },
    { id: "b", judge: judge(4) },
    { id: "c", judge: judge(4) },
  ];
  const agg = aggregate(results);
  assertEquals(agg.dimensions.title, 4.33);
  assertEquals(agg.overall, 4.33);
  assertEquals(agg.itemCount, 3);
});

Deno.test("aggregate throws on empty input", () => {
  assertThrows(() => aggregate([]), Error, "no results");
});

Deno.test("worstItems returns the lowest-scoring items ascending", () => {
  const results: ItemResult[] = [
    { id: "good", judge: judge(5) },
    { id: "bad", judge: judge(2) },
    { id: "mid", judge: judge(4) },
    { id: "worst", judge: judge(1) },
  ];
  const worst = worstItems(results, 2);
  assertEquals(worst.map((w) => w.id), ["worst", "bad"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/llm-judge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `supabase/functions/_shared/llm-judge.ts`:

```ts
// Tier-2 judge domain: response validation, aggregation, baseline ratchet,
// judge request building, and report formatting. Pure logic only — the live
// runner is llm-judge.eval.ts.

export const JUDGE_DIMENSIONS = [
  "eventCount",
  "times",
  "title",
  "description",
  "duration",
  "location",
] as const;

export type JudgeDimension = typeof JUDGE_DIMENSIONS[number];

export interface JudgeResult {
  scores: Record<JudgeDimension, number>;
  hardFail: boolean;
  rationales?: Record<string, string>;
}

export interface ItemResult {
  id: string;
  judge: JudgeResult;
}

export interface Aggregate {
  dimensions: Record<JudgeDimension, number>;
  overall: number;
  itemCount: number;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function validateJudgeResponse(body: unknown): JudgeResult {
  const candidate = body as {
    scores?: Record<string, unknown>;
    hardFail?: unknown;
    rationales?: unknown;
  } | null;
  if (!candidate || typeof candidate !== "object" || !candidate.scores) {
    throw new Error("judge response missing scores object");
  }
  const scores = {} as Record<JudgeDimension, number>;
  for (const dim of JUDGE_DIMENSIONS) {
    const value = candidate.scores[dim];
    if (
      typeof value !== "number" || !Number.isInteger(value) || value < 1 ||
      value > 5
    ) {
      throw new Error(`judge score "${dim}" must be an integer 1-5, got ${value}`);
    }
    scores[dim] = value;
  }
  if (typeof candidate.hardFail !== "boolean") {
    throw new Error("judge response missing boolean hardFail");
  }
  const result: JudgeResult = { scores, hardFail: candidate.hardFail };
  if (candidate.rationales && typeof candidate.rationales === "object") {
    result.rationales = candidate.rationales as Record<string, string>;
  }
  return result;
}

export function aggregate(results: ItemResult[]): Aggregate {
  if (results.length === 0) throw new Error("aggregate: no results");
  const dimensions = {} as Record<JudgeDimension, number>;
  for (const dim of JUDGE_DIMENSIONS) {
    const sum = results.reduce((acc, r) => acc + r.judge.scores[dim], 0);
    dimensions[dim] = round2(sum / results.length);
  }
  const overall = round2(
    JUDGE_DIMENSIONS.reduce((acc, dim) => acc + dimensions[dim], 0) /
      JUDGE_DIMENSIONS.length,
  );
  return { dimensions, overall, itemCount: results.length };
}

function itemMean(result: ItemResult): number {
  return JUDGE_DIMENSIONS.reduce((acc, dim) => acc + result.judge.scores[dim], 0) /
    JUDGE_DIMENSIONS.length;
}

export function worstItems(results: ItemResult[], n = 3): ItemResult[] {
  return [...results].sort((a, b) => itemMean(a) - itemMean(b)).slice(0, n);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/llm-judge.test.ts`
Expected: `7 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/llm-judge.ts supabase/functions/_shared/llm-judge.test.ts
git commit -m "feat(evals): judge response validation and score aggregation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Baseline ratchet — comparison and creation

**Files:**
- Modify: `supabase/functions/_shared/llm-judge.ts` (append)
- Modify: `supabase/functions/_shared/llm-judge.test.ts` (append)

**Interfaces:**
- Consumes: `Aggregate`, `JUDGE_DIMENSIONS` (Task 4).
- Produces (used by Task 7):
  - `interface Baseline { date: string; corpusHash: string; extractorModel: string; judgeModel: string; dimensions: Record<JudgeDimension, number>; overall: number; itemCount: number; }`
  - `const OVERALL_DROP_LIMIT = 0.2`, `const DIMENSION_DROP_LIMIT = 0.4`
  - `interface BaselineComparison { ok: boolean; failures: string[]; notes: string[]; }`
  - `function compareToBaseline(agg: Aggregate, corpusHash: string, baseline: Baseline | null, anyHardFail: boolean): BaselineComparison`
  - `function makeBaseline(agg: Aggregate, corpusHash: string, extractorModel: string, judgeModel: string, date: string): Baseline`

- [ ] **Step 1: Write the failing tests (append to llm-judge.test.ts)**

```ts
import {
  compareToBaseline,
  DIMENSION_DROP_LIMIT,
  makeBaseline,
  OVERALL_DROP_LIMIT,
} from "./llm-judge.ts";
import type { Aggregate, Baseline } from "./llm-judge.ts";

function agg(score: number): Aggregate {
  return {
    dimensions: {
      eventCount: score,
      times: score,
      title: score,
      description: score,
      duration: score,
      location: score,
    },
    overall: score,
    itemCount: 32,
  };
}

const BASELINE: Baseline = makeBaseline(agg(4.5), "hash-a", "gpt-4.1-mini", "gpt-4.1", "2026-07-08");

Deno.test("compareToBaseline: first run (null baseline) passes with a note", () => {
  const cmp = compareToBaseline(agg(4.0), "hash-a", null, false);
  assertEquals(cmp.ok, true);
  assertEquals(cmp.notes.length, 1);
});

Deno.test("compareToBaseline: equal or improved scores pass", () => {
  assertEquals(compareToBaseline(agg(4.5), "hash-a", BASELINE, false).ok, true);
  assertEquals(compareToBaseline(agg(4.8), "hash-a", BASELINE, false).ok, true);
});

Deno.test("compareToBaseline: small drop within limits passes", () => {
  // 4.5 -> 4.3 = drop of 0.2, not > OVERALL_DROP_LIMIT (0.2)
  assertEquals(compareToBaseline(agg(4.3), "hash-a", BASELINE, false).ok, true);
});

Deno.test("compareToBaseline: overall drop beyond limit fails", () => {
  const cmp = compareToBaseline(agg(4.2), "hash-a", BASELINE, false);
  assertEquals(cmp.ok, false);
  assertEquals(cmp.failures.some((f) => f.includes("overall")), true);
});

Deno.test("compareToBaseline: single-dimension crash fails even if overall is fine", () => {
  const current = agg(4.5);
  current.dimensions.title = 4.0; // 4.5 -> 4.0 drop of 0.5 > 0.4
  const cmp = compareToBaseline(current, "hash-a", BASELINE, false);
  assertEquals(cmp.ok, false);
  assertEquals(cmp.failures.some((f) => f.includes("title")), true);
});

Deno.test("compareToBaseline: hard fail overrides good scores", () => {
  const cmp = compareToBaseline(agg(5), "hash-a", BASELINE, true);
  assertEquals(cmp.ok, false);
  assertEquals(cmp.failures.some((f) => f.includes("hard-fail")), true);
});

Deno.test("compareToBaseline: corpus hash mismatch refuses comparison", () => {
  const cmp = compareToBaseline(agg(5), "hash-B", BASELINE, false);
  assertEquals(cmp.ok, false);
  assertEquals(cmp.failures.some((f) => f.includes("corpus")), true);
});

Deno.test("makeBaseline snapshots the aggregate with metadata", () => {
  assertEquals(BASELINE.overall, 4.5);
  assertEquals(BASELINE.corpusHash, "hash-a");
  assertEquals(BASELINE.judgeModel, "gpt-4.1");
  assertEquals(BASELINE.itemCount, 32);
  assertEquals(OVERALL_DROP_LIMIT, 0.2);
  assertEquals(DIMENSION_DROP_LIMIT, 0.4);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `deno test supabase/functions/_shared/llm-judge.test.ts`
Expected: FAIL — `compareToBaseline` not exported.

- [ ] **Step 3: Implement (append to llm-judge.ts)**

```ts
export interface Baseline {
  date: string;
  corpusHash: string;
  extractorModel: string;
  judgeModel: string;
  dimensions: Record<JudgeDimension, number>;
  overall: number;
  itemCount: number;
}

export const OVERALL_DROP_LIMIT = 0.2;
export const DIMENSION_DROP_LIMIT = 0.4;

export interface BaselineComparison {
  ok: boolean;
  failures: string[];
  notes: string[];
}

export function compareToBaseline(
  agg: Aggregate,
  corpusHash: string,
  baseline: Baseline | null,
  anyHardFail: boolean,
): BaselineComparison {
  const failures: string[] = [];
  const notes: string[] = [];

  if (anyHardFail) {
    failures.push("one or more items hard-failed (objective factual error)");
  }

  if (!baseline) {
    notes.push("no baseline yet — run with --update-baseline to create one");
    return { ok: failures.length === 0, failures, notes };
  }

  if (baseline.corpusHash !== corpusHash) {
    failures.push(
      "corpus changed since baseline — comparison refused; refresh with --update-baseline",
    );
    return { ok: false, failures, notes };
  }

  const overallDrop = round2(baseline.overall - agg.overall);
  if (overallDrop > OVERALL_DROP_LIMIT) {
    failures.push(
      `overall dropped ${baseline.overall} -> ${agg.overall} (limit ${OVERALL_DROP_LIMIT})`,
    );
  }
  for (const dim of JUDGE_DIMENSIONS) {
    const drop = round2(baseline.dimensions[dim] - agg.dimensions[dim]);
    if (drop > DIMENSION_DROP_LIMIT) {
      failures.push(
        `${dim} dropped ${baseline.dimensions[dim]} -> ${agg.dimensions[dim]} (limit ${DIMENSION_DROP_LIMIT})`,
      );
    }
  }
  return { ok: failures.length === 0, failures, notes };
}

export function makeBaseline(
  agg: Aggregate,
  corpusHash: string,
  extractorModel: string,
  judgeModel: string,
  date: string,
): Baseline {
  return {
    date,
    corpusHash,
    extractorModel,
    judgeModel,
    dimensions: { ...agg.dimensions },
    overall: agg.overall,
    itemCount: agg.itemCount,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/llm-judge.test.ts`
Expected: `15 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/llm-judge.ts supabase/functions/_shared/llm-judge.test.ts
git commit -m "feat(evals): baseline ratchet with regression thresholds

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Judge request builder and report formatting

**Files:**
- Modify: `supabase/functions/_shared/llm-judge.ts` (append)
- Modify: `supabase/functions/_shared/llm-judge.test.ts` (append)

**Interfaces:**
- Consumes: `EventDetails` from `./parse-event-response.ts`; `JUDGE_DIMENSIONS`, `Aggregate`, `Baseline`, `ItemResult` (Tasks 4–5).
- Produces (used by Task 7):
  - `const DEFAULT_JUDGE_MODEL = "gpt-4.1"`
  - `function buildJudgeRequest(text: string, fixedNow: string, events: EventDetails[], judgeModel: string): Record<string, unknown>` — temp 0, json_object
  - `function formatReport(agg: Aggregate, baseline: Baseline | null, worst: ItemResult[], erroredIds: string[]): string`

- [ ] **Step 1: Write the failing tests (append to llm-judge.test.ts)**

```ts
import { assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildJudgeRequest, DEFAULT_JUDGE_MODEL, formatReport } from "./llm-judge.ts";

Deno.test("buildJudgeRequest: strict judging setup", () => {
  const body = buildJudgeRequest(
    "Team meeting tomorrow at 2pm",
    "7/6/2026, 10:00:00 AM",
    [{
      title: "Team meeting",
      description: "",
      startTime: "2026-07-07T14:00:00",
      endTime: "2026-07-07T15:00:00",
    }],
    DEFAULT_JUDGE_MODEL,
  ) as {
    model: string;
    temperature: number;
    response_format: { type: string };
    messages: Array<{ role: string; content: string }>;
  };
  assertEquals(body.model, "gpt-4.1");
  assertEquals(body.temperature, 0);
  assertEquals(body.response_format.type, "json_object");
  const system = body.messages[0].content;
  for (const dim of ["eventCount", "times", "title", "description", "duration", "location"]) {
    assertStringIncludes(system, dim);
  }
  assertStringIncludes(system, "hardFail");
  assertStringIncludes(system, "hallucinat");
  const user = body.messages[1].content;
  assertStringIncludes(user, "Team meeting tomorrow at 2pm");
  assertStringIncludes(user, "2026-07-07T14:00:00");
});

Deno.test("formatReport shows dimensions, deltas, worst items, and errors", () => {
  const current = agg(4.5);
  current.dimensions.title = 4.2;
  const baseline = makeBaseline(agg(4.4), "h", "gpt-4.1-mini", "gpt-4.1", "2026-07-08");
  const worst = [{ id: "ja-receipt-02", judge: judge(3) }];
  const report = formatReport(current, baseline, worst, ["en-poster-01"]);
  assertStringIncludes(report, "title");
  assertStringIncludes(report, "4.2");
  assertStringIncludes(report, "ja-receipt-02");
  assertStringIncludes(report, "en-poster-01");
  assertStringIncludes(report, "overall");
});

Deno.test("formatReport handles the no-baseline first run", () => {
  const report = formatReport(agg(4.0), null, [], []);
  assertStringIncludes(report, "no baseline");
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `deno test supabase/functions/_shared/llm-judge.test.ts`
Expected: FAIL — `buildJudgeRequest` not exported.

- [ ] **Step 3: Implement (append to llm-judge.ts)**

```ts
import type { EventDetails } from "./parse-event-response.ts";

export const DEFAULT_JUDGE_MODEL = "gpt-4.1";

export function buildJudgeRequest(
  text: string,
  fixedNow: string,
  events: EventDetails[],
  judgeModel: string,
): Record<string, unknown> {
  const system =
    `You are a strict evaluator of calendar-event extraction quality. ` +
    `Given a source text and the events extracted from it, score each dimension as an integer 1-5:\n` +
    `- eventCount: is the number of extracted events correct for this text? For texts with no date/time, correct means zero events (extracting one is hallucination).\n` +
    `- times: are startTime/endTime faithful to the text, interpreting relative dates against the reference time?\n` +
    `- title: concise, informative, and in the SAME LANGUAGE as the source text.\n` +
    `- description: useful context (amounts, reference numbers, key details), not a mere echo of the title.\n` +
    `- duration: sensible for the event type when the text does not state one.\n` +
    `- location: captured when present in the text, clean formatting.\n` +
    `Set "hardFail": true ONLY for objective factual errors: an extracted date/time that contradicts the text, or a wrong event count on an unambiguous text (including hallucinated events for no-date texts).\n` +
    `If a dimension is not applicable (e.g. location for a text with no location, or all quality dimensions when zero events is correct), score it 5.\n` +
    `Add a "rationales" object with a one-line reason for every dimension scored 3 or lower.\n` +
    `Return ONLY a JSON object: {"scores": {"eventCount": n, "times": n, "title": n, "description": n, "duration": n, "location": n}, "hardFail": boolean, "rationales": {...}}`;
  const user = `Reference time: ${fixedNow}\n\nSource text:\n${text}\n\nExtracted events JSON:\n${
    JSON.stringify(events, null, 2)
  }`;
  return {
    model: judgeModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

export function formatReport(
  agg: Aggregate,
  baseline: Baseline | null,
  worst: ItemResult[],
  erroredIds: string[],
): string {
  const lines: string[] = [];
  lines.push(`Tier-2 judge report — ${agg.itemCount} item(s)`);
  lines.push("");
  const delta = (dim: JudgeDimension) => {
    if (!baseline) return "  —";
    const d = round2(agg.dimensions[dim] - baseline.dimensions[dim]);
    return d === 0 ? "  ±0.00" : d > 0 ? ` +${d.toFixed(2)}` : ` ${d.toFixed(2)}`;
  };
  for (const dim of JUDGE_DIMENSIONS) {
    lines.push(
      `  ${dim.padEnd(12)} ${agg.dimensions[dim].toFixed(2)}${delta(dim)}`,
    );
  }
  const overallDelta = baseline
    ? ` (baseline ${baseline.overall.toFixed(2)}, ${baseline.date})`
    : " (no baseline yet)";
  lines.push(`  ${"overall".padEnd(12)} ${agg.overall.toFixed(2)}${overallDelta}`);
  if (worst.length > 0) {
    lines.push("");
    lines.push("Worst items:");
    for (const w of worst) {
      const rationales = w.judge.rationales
        ? Object.entries(w.judge.rationales).map(([k, v]) => `${k}: ${v}`).join("; ")
        : "";
      lines.push(`  ${w.id}${rationales ? ` — ${rationales}` : ""}`);
    }
  }
  if (erroredIds.length > 0) {
    lines.push("");
    lines.push(`Errored items (excluded from scores): ${erroredIds.join(", ")}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/llm-judge.test.ts`
Expected: `18 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/llm-judge.ts supabase/functions/_shared/llm-judge.test.ts
git commit -m "feat(evals): judge rubric request builder and report formatting

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Live runner, npm script, and docs

**Files:**
- Create: `supabase/functions/_shared/llm-judge.eval.ts`
- Modify: `package.json` (add `eval:judge` script)
- Modify: `CLAUDE.md` (extend the "Prompt Evals" section)

**Interfaces:**
- Consumes: everything from Tasks 1–6 plus `LLM_CONFIG` (`./llm-prompt.ts`), `parseEventResponse` (`./parse-event-response.ts`), `FIXED_NOW` (`./eval-cases.ts`).
- Produces: the `npm run eval:judge` command; writes `eval-baseline.json` on `--update-baseline`.

No unit tests — thin I/O by design; verified live in Task 8. The single wrapping `Deno.test` (not per-item tests) is deliberate: item errors must be tolerated up to 20% without failing the run, which per-item test semantics cannot express.

- [ ] **Step 1: Create the runner**

Create `supabase/functions/_shared/llm-judge.eval.ts`:

```ts
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
      const next = makeBaseline(
        agg,
        hash,
        LLM_CONFIG.model,
        judgeModel,
        new Date().toISOString().slice(0, 10),
      );
      await Deno.writeTextFile(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
      console.log(`\nBaseline written to ${BASELINE_PATH} — commit it to ratchet.`);
      if (anyHardFail) {
        throw new Error("refusing to bless a baseline containing hard-fails");
      }
      return;
    }

    const cmp = compareToBaseline(agg, hash, baseline, anyHardFail);
    for (const note of cmp.notes) console.log(`note: ${note}`);
    if (!cmp.ok) {
      throw new Error(`Tier-2 regression:\n  - ${cmp.failures.join("\n  - ")}`);
    }
  },
});
```

- [ ] **Step 2: Verify suite isolation and key-less skip**

Run: `deno test supabase/functions/_shared/`
Expected: all pass (existing + new unit tests), NO "tier-2" test name in output.

Run: `deno test --allow-net --allow-env --allow-read --allow-write supabase/functions/_shared/llm-judge.eval.ts`
Expected: `0 passed | 0 failed | 1 ignored` (no key in plain shell env).

Run: `deno check supabase/functions/_shared/llm-judge.eval.ts supabase/functions/_shared/generate-corpus.ts`
Expected: clean.

- [ ] **Step 3: Add npm script**

In `package.json`, after `"eval:generate"`, add:

```json
"eval:judge": "deno test --allow-net --allow-env --allow-read --allow-write supabase/functions/_shared/llm-judge.eval.ts",
```

- [ ] **Step 4: Extend CLAUDE.md**

In the `### Prompt Evals (live LLM, opt-in)` section, after the existing bullet list, add:

```markdown
**Tier 2 — scored judge benchmark** (`npm run eval:generate`, `npm run eval:judge`):
- Synthetic corpus in `supabase/functions/_shared/eval-corpus.jsonl` (32 items, ja/en × 8 categories); grow with `npm run eval:generate` (gap-fill) or `-- --category receipt --count 2` (targeted)
- Each run: production-path extraction (gpt-4.1-mini) judged by a stronger model (`gpt-4.1`, override via `JUDGE_MODEL`) on six 1–5 dimensions with objective hard-fail rules
- Compares against committed `eval-baseline.json`; fails on overall drop >0.2, any dimension drop >0.4, any hard-fail, or corpus/baseline hash mismatch
- Bless improvements explicitly: `npm run eval:judge -- --update-baseline`, then commit the baseline
- Tier 1 (`eval:prompt`) is the hard pre-deploy gate; Tier 2 measures quality direction when tuning prompts or comparing models
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/llm-judge.eval.ts package.json CLAUDE.md
git commit -m "feat(evals): tier-2 judge runner, npm script, and docs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Live smoke, corpus generation, first baseline

Requires `OPENAI_API_KEY` — source it first: `set -a && . ./.env && set +a`

**Files:**
- Create (generated): `supabase/functions/_shared/eval-corpus.jsonl`
- Create (generated): `supabase/functions/_shared/eval-baseline.json`

- [ ] **Step 1: Smoke-test the generator with one targeted item**

Run: `set -a && . ./.env && set +a && npm run eval:generate -- --category chat --count 1`
Expected: `+ ja-chat-01 (NN chars)`; inspect `eval-corpus.jsonl` — the text must be realistic Japanese chat with a date/time expression. If the text is unusable garbage, fix `buildGenerationRequest` wording before proceeding.

- [ ] **Step 2: Fill the whole corpus**

Run: `set -a && . ./.env && set +a && npm run eval:generate`
Expected: generates the remaining items up to 32 total (`Done. Corpus now has 32 item(s)`). Spot-check 3–4 items across categories/langs, especially both `no-event` texts (must contain zero date/time expressions — delete the line and regenerate targeted if one slips through).

- [ ] **Step 3: First judged run and baseline**

Run: `set -a && . ./.env && set +a && npm run eval:judge -- --update-baseline`
Expected: per-item `ok` lines, report table, `Baseline written ... commit it to ratchet.` If any item hard-fails, the command exits nonzero WITHOUT blessing the baseline — inspect that item's rationale; a legitimate extractor bug becomes a Tier 1 case + prompt fix before re-running.

- [ ] **Step 4: Verify the ratchet holds on a clean re-run**

Run: `set -a && . ./.env && set +a && npm run eval:judge`
Expected: PASS — deltas near ±0.0x (judge at temperature 0 on a stable corpus should be nearly deterministic; small wobble within thresholds is fine).

- [ ] **Step 5: Commit corpus + baseline**

```bash
git add supabase/functions/_shared/eval-corpus.jsonl supabase/functions/_shared/eval-baseline.json
git commit -m "feat(evals): initial 32-item corpus and first quality baseline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: PR

- [ ] **Step 1: Full local verification**

Run: `deno test supabase/functions/_shared/` — all unit tests green.
Run: `deno check supabase/functions/_shared/llm-judge.ts supabase/functions/_shared/eval-corpus.ts supabase/functions/_shared/generate-corpus.ts supabase/functions/_shared/llm-judge.eval.ts` — clean.
Run: `grep -rn "eval-corpus\|llm-judge" supabase/functions/process-text/index.ts supabase/functions/process-image/index.ts` — MUST return nothing (deploy isolation).

- [ ] **Step 2: Push and create the PR**

```bash
git push -u origin feat/llm-judge-evals
gh pr create --repo ryoshumei/add-to-calendar --base main --head feat/llm-judge-evals \
  --title "feat(evals): tier-2 LLM-judge benchmark with baseline ratchet" \
  --body "Implements docs/superpowers/specs/2026-07-08-llm-judge-eval-design.md: synthetic 32-item corpus (ja/en × 8 categories), cross-model judge (gpt-4.1 grading gpt-4.1-mini output, 6 dimensions, objective hard-fail rules), committed baseline ratchet (overall −0.2 / dimension −0.4 / corpus-hash guard). All pure logic TDD'd; live I/O opt-in via OPENAI_API_KEY; nothing imported by deployed functions.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: CI + merge (user's standing flow)**

Run: `gh pr checks <N> --repo ryoshumei/add-to-calendar --watch`
Expected: Playwright + GitGuardian pass (this PR touches no extension code paths, but the suite runs regardless).
Then squash-merge with `--delete-branch`, pull main.
