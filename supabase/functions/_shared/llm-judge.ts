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
    for (const [key, value] of Object.entries(candidate.rationales)) {
      if (typeof value !== "string") {
        throw new Error(`judge rationales["${key}"] must be a string`);
      }
    }
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
