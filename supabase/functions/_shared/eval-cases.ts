// Curated prompt-eval cases + expectation matcher.
// Run live against OpenAI via llm-prompt.eval.ts (opt-in, not part of CI).
// Add a case here whenever a real-world text extracts wrongly.

import type { EventDetails } from "./parse-event-response.ts";

export interface EvalExpectation {
  /** events.length must be >= this */
  minEvents: number;
  /** events.length must be <= this (set with minEvents for exact counts) */
  maxEvents?: number;
  /** exact startTime of the first event, YYYY-MM-DDTHH:mm:ss */
  startTime?: string;
  /** date part of the first event's startTime, YYYY-MM-DD */
  startDate?: string;
  /** first event's title must contain AT LEAST ONE of these, case-insensitive */
  titleIncludes?: string[];
  /**
   * Recurrence expectation for the first event:
   * - omit → not checked
   * - null → event must NOT have a recurrence
   * - object → recurrence must exist and listed fields must match
   */
  recurrence?: {
    frequency: "daily" | "weekly" | "monthly" | "yearly";
    interval?: number;
    daysOfWeek?: string[];
  } | null;
}

export interface EvalCase {
  name: string;
  text: string;
  expect: EvalExpectation;
}

/** Fixed reference "now" so relative dates in cases are deterministic. */
export const FIXED_NOW = "7/6/2026, 10:00:00 AM";

/**
 * Compare extracted events against an expectation.
 * Returns a list of human-readable failures; empty list = pass.
 */
export function assertEventsMatch(
  events: EventDetails[],
  expect: EvalExpectation,
): string[] {
  const failures: string[] = [];

  if (events.length < expect.minEvents) {
    failures.push(
      `expected at least ${expect.minEvents} event(s), got ${events.length}`,
    );
  }
  if (expect.maxEvents !== undefined && events.length > expect.maxEvents) {
    failures.push(
      `expected at most ${expect.maxEvents} event(s), got ${events.length}`,
    );
  }

  // Field checks apply to the first event; skip when none exist (count
  // failures above already cover the unexpected-empty case).
  const first = events[0];
  if (!first) return failures;

  if (expect.startTime && first.startTime !== expect.startTime) {
    failures.push(
      `startTime mismatch: expected ${expect.startTime}, got ${first.startTime}`,
    );
  }
  if (expect.startDate && !first.startTime?.startsWith(expect.startDate)) {
    failures.push(
      `startDate mismatch: expected ${expect.startDate}, got ${first.startTime}`,
    );
  }
  if (expect.titleIncludes && expect.titleIncludes.length > 0) {
    const title = (first.title ?? "").toLowerCase();
    const hit = expect.titleIncludes.some((s) =>
      title.includes(s.toLowerCase())
    );
    if (!hit) {
      failures.push(
        `title "${first.title}" contains none of: ${
          expect.titleIncludes.join(", ")
        }`,
      );
    }
  }

  if (expect.recurrence !== undefined) {
    if (expect.recurrence === null) {
      if (first.recurrence) {
        failures.push(
          `expected no recurrence, got ${JSON.stringify(first.recurrence)}`,
        );
      }
    } else if (!first.recurrence) {
      failures.push(
        `expected recurrence ${JSON.stringify(expect.recurrence)}, got none`,
      );
    } else {
      const got = first.recurrence;
      if (got.frequency !== expect.recurrence.frequency) {
        failures.push(
          `recurrence.frequency mismatch: expected ${expect.recurrence.frequency}, got ${got.frequency}`,
        );
      }
      if (
        expect.recurrence.interval !== undefined &&
        (got.interval ?? 1) !== expect.recurrence.interval
      ) {
        failures.push(
          `recurrence.interval mismatch: expected ${expect.recurrence.interval}, got ${got.interval ?? 1}`,
        );
      }
      if (expect.recurrence.daysOfWeek) {
        const gotDays = (got.daysOfWeek ?? []).map((d) => d.toUpperCase())
          .sort();
        const wantDays = [...expect.recurrence.daysOfWeek].sort();
        if (gotDays.join(",") !== wantDays.join(",")) {
          failures.push(
            `recurrence.daysOfWeek mismatch: expected ${
              wantDays.join(",")
            }, got ${gotDays.join(",") || "(none)"}`,
          );
        }
      }
    }
  }

  return failures;
}

export const EVAL_CASES: EvalCase[] = [
  {
    // The 2026-07-04 production regression: a card-payment receipt with an
    // explicit 取引日時 must extract an event, in Japanese.
    name: "famima-receipt-jp",
    text: `取引金額合計
￥894
　└ クレジット
　￥894
メルカード還元
P8（付与予定）
店舗名
フアミリ―マ―トニチダイセイサン
取引方法
Mastercard
取引日時
2026/07/03 18:36
取引番号
12026070318362457B12`,
    expect: {
      minEvents: 1,
      startTime: "2026-07-03T18:36:00",
      titleIncludes: ["ファミリ", "フアミリ", "894", "メルカード", "カード"],
    },
  },
  {
    name: "simple-meeting-en-relative",
    text: "Team meeting tomorrow at 2pm in Conference Room A",
    expect: {
      minEvents: 1,
      maxEvents: 1,
      startTime: "2026-07-07T14:00:00",
      titleIncludes: ["meeting"],
      recurrence: null,
    },
  },
  {
    // Issue #14 acceptance case (iOS repo): weekly recurrence with day-of-week,
    // startTime anchored to the FIRST occurrence (2026-07-06 is a Monday).
    name: "recurring-weekly-standup",
    text: "Team standup every Tuesday 10-10:30am",
    expect: {
      minEvents: 1,
      maxEvents: 1,
      startTime: "2026-07-07T10:00:00",
      titleIncludes: ["standup"],
      recurrence: {
        frequency: "weekly",
        daysOfWeek: ["TU"],
      },
    },
  },
  {
    name: "recurring-every-other-week",
    text: "Book club every other Wednesday at 7pm at Riverside Library",
    expect: {
      minEvents: 1,
      maxEvents: 1,
      startTime: "2026-07-08T19:00:00",
      titleIncludes: ["book"],
      recurrence: {
        frequency: "weekly",
        interval: 2,
      },
    },
  },
  {
    name: "recurring-monthly-meetup",
    text: "Tokyo JS meetup happens monthly, next one July 15 2026 at 6:30pm",
    expect: {
      minEvents: 1,
      maxEvents: 1,
      startTime: "2026-07-15T18:30:00",
      titleIncludes: ["meetup", "js"],
      recurrence: {
        frequency: "monthly",
      },
    },
  },
  {
    name: "no-datetime-text",
    text:
      "The quick brown fox jumps over the lazy dog. General thoughts about design: keep things simple and readable. Nothing here is scheduled.",
    expect: {
      minEvents: 0,
      maxEvents: 0,
    },
  },
  {
    name: "multi-event-en",
    text:
      "Standup on Monday July 6 2026 at 9:30am for 15 minutes. Dentist appointment on July 8 2026 at 4pm.",
    expect: {
      minEvents: 2,
      maxEvents: 2,
      startDate: "2026-07-06",
    },
  },
  {
    name: "jp-meeting-explicit-range",
    text: "7月10日 14時から16時 プロジェクト定例会議 @会議室B",
    expect: {
      minEvents: 1,
      maxEvents: 1,
      startTime: "2026-07-10T14:00:00",
      titleIncludes: ["会議", "定例"],
    },
  },
  {
    name: "reservation-en",
    text:
      "Your reservation at Sushi Dai is confirmed for July 12, 2026, 7:00 PM. Party of 2. Please arrive 10 minutes early.",
    expect: {
      minEvents: 1,
      maxEvents: 1,
      startTime: "2026-07-12T19:00:00",
      titleIncludes: ["sushi", "reservation"],
      recurrence: null,
    },
  },
];
