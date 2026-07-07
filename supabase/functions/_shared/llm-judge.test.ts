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
  assertThrows(
    () => validateJudgeResponse({ scores: { ...base, duration: 0 }, hardFail: false }),
    Error,
    "duration",
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

Deno.test("validateJudgeResponse rejects non-string rationale values", () => {
  assertThrows(
    () =>
      validateJudgeResponse({
        scores: { eventCount: 5, times: 5, title: 5, description: 5, duration: 5, location: 5 },
        hardFail: false,
        rationales: { title: 42 },
      }),
    Error,
    "rationales",
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
