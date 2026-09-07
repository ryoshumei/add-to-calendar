// Curated Screenshot eval cases: HTML fixtures rendered to PNG at eval time
// and run through the real image prompt + parser (llm-screenshot.eval.ts).
// No binaries are committed — the fixtures are the HTML in ./eval-screenshots.
// Add a case here whenever a real-world Screenshot extracts wrongly.

import type { EvalExpectation } from "./eval-cases.ts";

/** The Source shapes a Screenshot most often carries. */
export const SCREENSHOT_CATEGORIES = [
  "invite-email",
  "poster",
  "timetable",
] as const;

export type ScreenshotCategory = typeof SCREENSHOT_CATEGORIES[number];

export interface ScreenshotEvalCase {
  name: string;
  /** File name inside ./eval-screenshots, rendered to PNG by Playwright. */
  fixture: string;
  lang: "en" | "ja";
  category: ScreenshotCategory;
  /** Viewport used for the render; the Screenshot is the full page. */
  viewport?: { width: number; height: number };
  expect: EvalExpectation;
}

const DEFAULT_VIEWPORT = { width: 900, height: 800 };

/** Absolute path of a case's HTML fixture. */
export function screenshotFixturePath(evalCase: ScreenshotEvalCase): string {
  const url = new URL(`./eval-screenshots/${evalCase.fixture}`, import.meta.url);
  return decodeURIComponent(url.pathname);
}

/** Render jobs for scripts/render-eval-screenshots.js. */
export function screenshotRenderJobs(
  cases: ScreenshotEvalCase[] = SCREENSHOT_EVAL_CASES,
): Array<{ name: string; html: string; width: number; height: number }> {
  return cases.map((evalCase) => ({
    name: evalCase.name,
    html: screenshotFixturePath(evalCase),
    width: (evalCase.viewport ?? DEFAULT_VIEWPORT).width,
    height: (evalCase.viewport ?? DEFAULT_VIEWPORT).height,
  }));
}

export const SCREENSHOT_EVAL_CASES: ScreenshotEvalCase[] = [
  {
    name: "invite-email-en",
    fixture: "invite-email-en.html",
    lang: "en",
    category: "invite-email",
    expect: {
      minEvents: 1,
      maxEvents: 1,
      startTime: "2026-07-09T14:00:00",
      titleIncludes: ["planning", "q3", "sync"],
      recurrence: null,
    },
  },
  {
    name: "invite-email-ja",
    fixture: "invite-email-ja.html",
    lang: "ja",
    category: "invite-email",
    expect: {
      minEvents: 1,
      maxEvents: 1,
      startTime: "2026-07-14T10:00:00",
      titleIncludes: ["打ち合わせ", "ローンチ", "新製品"],
      recurrence: null,
    },
  },
  {
    name: "poster-en",
    fixture: "poster-en.html",
    lang: "en",
    category: "poster",
    expect: {
      minEvents: 1,
      maxEvents: 1,
      startTime: "2026-08-15T19:00:00",
      titleIncludes: ["jazz", "summer"],
      recurrence: null,
    },
  },
  {
    name: "poster-ja",
    fixture: "poster-ja.html",
    lang: "ja",
    category: "poster",
    expect: {
      minEvents: 1,
      maxEvents: 1,
      startTime: "2026-08-08T17:00:00",
      titleIncludes: ["夏祭", "みなと"],
      recurrence: null,
    },
  },
  {
    // Story 11: a timetable Screenshot produces one Event per session.
    name: "timetable-en",
    fixture: "timetable-en.html",
    lang: "en",
    category: "timetable",
    expect: {
      minEvents: 3,
      maxEvents: 3,
      startTime: "2026-07-24T09:30:00",
      titleIncludes: ["keynote", "opening", "ship smaller"],
    },
  },
  {
    name: "timetable-ja",
    fixture: "timetable-ja.html",
    lang: "ja",
    category: "timetable",
    expect: {
      minEvents: 3,
      maxEvents: 3,
      startTime: "2026-09-03T10:00:00",
      titleIncludes: ["研修", "オリエン"],
    },
  },
];
