import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  SCREENSHOT_CATEGORIES,
  SCREENSHOT_EVAL_CASES,
  screenshotFixturePath,
} from "./eval-screenshot-cases.ts";

Deno.test("every case points at an HTML fixture that exists", async () => {
  for (const evalCase of SCREENSHOT_EVAL_CASES) {
    assertEquals(
      evalCase.fixture.endsWith(".html"),
      true,
      `${evalCase.name}: fixture must be an HTML file, got ${evalCase.fixture}`,
    );
    const path = screenshotFixturePath(evalCase);
    const html = await Deno.readTextFile(path);
    assertEquals(
      html.includes("<html"),
      true,
      `${evalCase.name}: ${path} does not look like an HTML document`,
    );
  }
});

Deno.test("the fixture directory holds HTML only, never rendered binaries", () => {
  const dir = new URL("./eval-screenshots/", import.meta.url).pathname;
  for (const entry of Deno.readDirSync(dir)) {
    assertEquals(
      entry.name.endsWith(".html"),
      true,
      `${entry.name} is not HTML — Screenshots are rendered at eval time, not committed`,
    );
  }
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
