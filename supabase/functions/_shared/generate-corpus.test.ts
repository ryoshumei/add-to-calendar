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

Deno.test("parseArgs rejects --count without --category", () => {
  assertThrows(() => parseArgs(["--count", "3"]), Error, "--count requires --category");
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
