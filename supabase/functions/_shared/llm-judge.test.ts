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
