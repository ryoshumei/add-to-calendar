import {
  assertEquals,
  assertInstanceOf,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { ApiError, mapOpenAIError } from "./api-error.ts";

Deno.test("mapOpenAIError turns insufficient_quota into a 503 without leaking billing text", () => {
  const err = mapOpenAIError(429, {
    error: {
      type: "insufficient_quota",
      code: "insufficient_quota",
      message:
        "You exceeded your current quota, please check your plan and billing details.",
    },
  });

  assertInstanceOf(err, ApiError);
  assertEquals(err.status, 503);
  assertEquals(
    err.message,
    "Event processing is temporarily unavailable. Please try again later.",
  );
});

Deno.test("mapOpenAIError keeps the provider message for other errors", () => {
  const err = mapOpenAIError(400, {
    error: { type: "invalid_request_error", message: "Invalid model" },
  });

  assertEquals(err instanceof ApiError, false);
  assertEquals(err.message, "Invalid model");
});

Deno.test("mapOpenAIError falls back to a generic message for unrecognized bodies", () => {
  const err = mapOpenAIError(500, {});

  assertEquals(err.message, "OpenAI API request failed");
});
