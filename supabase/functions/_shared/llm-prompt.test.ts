import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { LLM_CONFIG } from "./llm-prompt.ts";

Deno.test("system prompt treats dated records like receipts as events", () => {
  const prompt = LLM_CONFIG.buildSystemPrompt("2026-07-04 00:30:00");

  // Records with a timestamp (receipts, transactions, reservations) must
  // yield an event — the FamilyMart ¥894 receipt regression.
  assertStringIncludes(prompt, "receipt");
  assertStringIncludes(prompt, "transaction");

  // An empty events array is allowed only when the text has no date/time.
  assertStringIncludes(prompt, '{"events": []}');
  assertStringIncludes(prompt, "no date or time information");
});

Deno.test("buildImageRequestBody builds a vision request with json_object format", () => {
  const dataUrl = "data:image/jpeg;base64,QUJD";
  const body = LLM_CONFIG.buildImageRequestBody(dataUrl, "2026-05-21 10:00:00") as {
    model: string;
    response_format: { type: string };
    messages: Array<{ role: string; content: unknown }>;
  };

  assertEquals(body.model, "gpt-4.1-mini");
  assertEquals(body.response_format.type, "json_object");
  assertEquals(body.messages.length, 2);
  assertEquals(body.messages[0].role, "system");

  const userMsg = body.messages[1] as {
    role: string;
    content: Array<{ type: string; image_url?: { url: string }; text?: string }>;
  };
  assertEquals(userMsg.role, "user");
  assertEquals(userMsg.content[0].type, "text");
  assertEquals(userMsg.content[1].type, "image_url");
  assertEquals(userMsg.content[1].image_url?.url, dataUrl);
});
