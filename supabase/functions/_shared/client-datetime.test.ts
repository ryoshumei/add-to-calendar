import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { resolveCurrentDateTime } from "./client-datetime.ts";

// Fixed server clock for fallback assertions: 2026-07-31T16:00:00Z is
// 1:00 AM Aug 1 in JST — the exact skew from the production bug report.
const SERVER_NOW = () => new Date("2026-07-31T16:00:00Z");
const SERVER_STRING = SERVER_NOW().toLocaleString();

Deno.test("uses the client-supplied local time string verbatim", () => {
  const client = "Sat Aug 01 2026 01:00:00 GMT+0900 (Japan Standard Time)";
  assertEquals(resolveCurrentDateTime(client, SERVER_NOW), client);
});

Deno.test("accepts locale-formatted strings (non-ASCII)", () => {
  const client = "2026/8/1 1:00:00 (日本標準時)";
  assertEquals(resolveCurrentDateTime(client, SERVER_NOW), client);
});

Deno.test("collapses newlines and control characters to one line", () => {
  const client = "Sat Aug 01 2026\n01:00:00\r\nGMT+0900";
  assertEquals(
    resolveCurrentDateTime(client, SERVER_NOW),
    "Sat Aug 01 2026 01:00:00 GMT+0900",
  );
});

Deno.test("falls back to server time when the field is absent", () => {
  assertEquals(resolveCurrentDateTime(undefined, SERVER_NOW), SERVER_STRING);
});

Deno.test("falls back to server time for non-string values", () => {
  assertEquals(resolveCurrentDateTime(12345, SERVER_NOW), SERVER_STRING);
  assertEquals(resolveCurrentDateTime(null, SERVER_NOW), SERVER_STRING);
  assertEquals(
    resolveCurrentDateTime({ tz: "Asia/Tokyo" }, SERVER_NOW),
    SERVER_STRING,
  );
});

Deno.test("falls back to server time for empty or whitespace-only strings", () => {
  assertEquals(resolveCurrentDateTime("", SERVER_NOW), SERVER_STRING);
  assertEquals(resolveCurrentDateTime("   \n\t ", SERVER_NOW), SERVER_STRING);
});

Deno.test("falls back to server time for oversized strings", () => {
  assertEquals(
    resolveCurrentDateTime("x".repeat(121), SERVER_NOW),
    SERVER_STRING,
  );
});

Deno.test("keeps a string exactly at the length cap", () => {
  const client = "x".repeat(120);
  assertEquals(resolveCurrentDateTime(client, SERVER_NOW), client);
});
