// Metadata checks for the Screenshot eval cases. Deliberately permission-free
// so `deno test supabase/functions/_shared/` keeps working with no flags —
// the checks that touch the filesystem (fixtures exist, nothing binary is
// committed) live in tests/eval-screenshot-render.test.js, which renders them.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  SCREENSHOT_CATEGORIES,
  SCREENSHOT_EVAL_CASES,
  screenshotFixturePath,
  screenshotRenderJobs,
} from "./eval-screenshot-cases.ts";

Deno.test("every case names a distinct HTML fixture", () => {
  const names = new Set<string>();
  const fixtures = new Set<string>();

  for (const evalCase of SCREENSHOT_EVAL_CASES) {
    assertEquals(
      evalCase.fixture.endsWith(".html"),
      true,
      `${evalCase.name}: fixture must be an HTML file, got ${evalCase.fixture}`,
    );
    assertEquals(names.has(evalCase.name), false, `duplicate case ${evalCase.name}`);
    assertEquals(
      fixtures.has(evalCase.fixture),
      false,
      `duplicate fixture ${evalCase.fixture}`,
    );
    names.add(evalCase.name);
    fixtures.add(evalCase.fixture);
  }

  assertEquals(SCREENSHOT_EVAL_CASES.length > 0, true, "no cases declared");
});

Deno.test("covers every category in both English and Japanese", () => {
  for (const category of SCREENSHOT_CATEGORIES) {
    for (const lang of ["en", "ja"] as const) {
      const hit = SCREENSHOT_EVAL_CASES.some((c) =>
        c.category === category && c.lang === lang
      );
      assertEquals(hit, true, `no ${lang} case for category ${category}`);
    }
  }
});

Deno.test("render jobs point one Screenshot at each case's fixture", () => {
  const jobs = screenshotRenderJobs();

  assertEquals(jobs.length, SCREENSHOT_EVAL_CASES.length);
  for (const [index, job] of jobs.entries()) {
    const evalCase = SCREENSHOT_EVAL_CASES[index];
    assertEquals(job.name, evalCase.name);
    assertEquals(job.html, screenshotFixturePath(evalCase));
    assertEquals(
      job.html.endsWith(`/eval-screenshots/${evalCase.fixture}`),
      true,
      `${evalCase.name}: unexpected fixture path ${job.html}`,
    );
  }
});
