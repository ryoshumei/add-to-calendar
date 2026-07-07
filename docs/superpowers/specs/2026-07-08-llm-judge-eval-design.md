# LLM-Judge Eval System (Tier 2) — Design

**Date:** 2026-07-08
**Status:** Approved by Ryan (design review in session)
**Context:** Sub-project 1 of 3 in the continuous-improvement roadmap (2: content-free production metrics, 3: opt-in user feedback). The app stores no user data, so improvement signal must come from synthetic evaluation.

## Goal

A fully automated, scored quality benchmark for the calendar-event extraction prompt that scales beyond the 6 hand-written Tier 1 cases without requiring human review per case, and that turns "is the prompt getting better?" into a number tracked in git.

## Non-goals

- Does not replace Tier 1 (`npm run eval:prompt`) — deterministic cases remain the hard pre-deploy gate.
- No user data anywhere. The corpus is 100% synthetic.
- No CI integration — all runs are explicit and local (live API, costs money).
- No changes to deployed functions; nothing here is imported by `process-text`/`process-image` entrypoints.

## Architecture: two tiers

| | Tier 1 (exists) | Tier 2 (this spec) |
|---|---|---|
| Cases | 6 hand-written, human-verified | ~28 generated, stable corpus |
| Verdict | Deterministic assertions, hard pass/fail | Judge scores 1–5 per dimension + hard-fail rules |
| Role | Contract: "the receipt extracts at 18:36, period" | Direction: "title quality moved 4.2 → 4.6" |
| Command | `npm run eval:prompt` | `npm run eval:judge` |

Promotion path: when a Tier 2 item exposes a specific failure worth locking in, its text is copied into a Tier 1 case with exact assertions.

## Components

All under `supabase/functions/_shared/`, consistent with the existing harness. None are imported by function entrypoints, so no backend redeploy is ever needed.

### 1. `eval-corpus.jsonl` (committed)

One JSON object per line: `{ "id": "ja-receipt-01", "lang": "ja" | "en", "category": string, "text": string }`.

- Categories: `receipt`, `reservation`, `meeting-email`, `chat`, `poster`, `delivery`, `deadline`, `no-event`.
- Target: 2 per {lang × category} cell = 32 items total (28 event-bearing + 4 `no-event` negatives).
- **Stable by design**: generated once; runs stay comparable over time. Growth/regeneration only via explicit command.

### 2. `generate-corpus.ts` — `npm run eval:generate`

- One OpenAI call per item (temperature 0.9 for diversity): "write a realistic {lang} {category} text a user might select in a browser or on a phone; include explicit or relative date/time expressions coherent with reference time {FIXED_NOW}."
- Default behavior fills whatever {lang × category} cells are below target; `--category X --count N` for targeted growth.
- Appends to `eval-corpus.jsonl`; never overwrites existing items (ids are append-only).
- `no-event` items must contain no date/time information at all.

### 3. `llm-judge.ts` + `llm-judge.eval.ts` — `npm run eval:judge`

Per corpus item:
1. **Extract** via the exact production path: `LLM_CONFIG.buildRequestBody(text, FIXED_NOW)` → chat/completions (gpt-4.1-mini) → `parseEventResponse`.
2. **Judge** with a different, stronger model (default `gpt-4.1`, override via `JUDGE_MODEL` env), temperature 0, `response_format: json_object`. Input: source text, FIXED_NOW, extracted events JSON. Output:

```json
{
  "scores": {
    "eventCount": 1-5,
    "times": 1-5,
    "title": 1-5,
    "description": 1-5,
    "duration": 1-5,
    "location": 1-5
  },
  "hardFail": boolean,
  "rationales": { "<dimension>": "one line, only for dimensions <= 3" }
}
```

- Title dimension explicitly includes language match (Japanese text → Japanese title).
- For `no-event` items the judge verifies zero events were extracted (hallucination check); non-applicable dimensions score 5.
- **Hard-fail rules (objective, not vibes)**: extracted date/time contradicts the source text, or wrong event count on an unambiguous text. Any hard-fail fails the entire run regardless of averages.

### 4. `eval-baseline.json` (committed) + report

```json
{
  "date": "...",
  "corpusHash": "sha256 of eval-corpus.jsonl",
  "extractorModel": "gpt-4.1-mini",
  "judgeModel": "gpt-4.1",
  "dimensions": {
    "eventCount": 4.8,
    "times": 4.9,
    "title": 4.5,
    "description": 4.3,
    "duration": 4.6,
    "location": 4.7
  },
  "overall": 4.6,
  "itemCount": 32
}
```

Each run prints a per-dimension delta table vs the committed baseline and the worst 3 items with rationales.

**Fail conditions:**
- any item hard-fails, or
- overall mean drops > 0.2, or
- any single dimension mean drops > 0.4, or
- corpus hash mismatch (comparison refused as apples-to-oranges until baseline refresh).

**Ratchet:** improving runs never auto-write the baseline. `npm run eval:judge -- --update-baseline` writes it; committing is a normal git change, so score history lives in git and prompt PRs show their movement.

## Error handling

- Per-item OpenAI failure (extract or judge): retry once; then mark item errored and continue.
- More than 20% items errored → abort run, no baseline comparison (no conclusions from partial data), nonzero exit.
- Malformed judge JSON: one retry with a "return only the JSON object" nudge, then errored-item path.
- `OPENAI_API_KEY` missing: skip cleanly (same pattern as Tier 1).
- Cost transparency: print estimated call count/cost before running (~32 mini extractions + ~32 gpt-4.1 judgments ≈ a few cents per run).

## npm scripts

```json
"eval:prompt":   (exists) tier 1 deterministic
"eval:generate": "deno run --allow-net --allow-env --allow-read --allow-write supabase/functions/_shared/generate-corpus.ts"
"eval:judge":    "deno test --allow-net --allow-env --allow-read --allow-write supabase/functions/_shared/llm-judge.eval.ts"
```

(Exact flags settled at implementation; `.eval.ts` naming keeps both out of `deno test` auto-discovery, same trick as Tier 1.)

## Testing plan (TDD)

Pure logic gets RED→GREEN unit tests in the regular suite (`*.test.ts`, no network):

- score aggregation (means, worst-N selection)
- hard-fail evaluation
- baseline comparison + thresholds (drop >0.2 overall / >0.4 dimension / hash mismatch)
- corpus gap-fill selection (which cells need generation)
- corpus hashing determinism
- report formatting
- judge-response validation (shape, score ranges)

Thin LLM I/O stays unmocked and is exercised only in live runs. Post-build smoke: generate 1 item, judge 1 item, then full corpus generation + first baseline.

## Documentation

CLAUDE.md "Prompt Evals" section grows a Tier 2 subsection: when to run each tier (Tier 1 before every prompt deploy; Tier 2 when tuning quality or changing models), how the ratchet works, how to grow the corpus.

## Future (out of scope here)

- Sub-project 2: content-free production metrics (also trims raw-content console.logs from deployed functions to align with the no-user-data stance).
- Sub-project 3: opt-in user feedback reporting from extension + iOS app.
- Optional later: model A/B — run Tier 2 with `EXTRACTOR_MODEL` overridden to compare candidate models on identical corpus + judge.
