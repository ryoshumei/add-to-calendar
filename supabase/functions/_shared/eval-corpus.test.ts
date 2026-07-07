import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { corpusHash, parseCorpusJsonl } from "./eval-corpus.ts";

const LINE_A =
  '{"id":"ja-receipt-01","lang":"ja","category":"receipt","text":"取引日時 2026/07/03 18:36"}';
const LINE_B =
  '{"id":"en-chat-01","lang":"en","category":"chat","text":"lunch tomorrow at noon?"}';

Deno.test("parseCorpusJsonl parses valid lines and skips blanks", () => {
  const items = parseCorpusJsonl(`${LINE_A}\n\n${LINE_B}\n`);
  assertEquals(items.length, 2);
  assertEquals(items[0].id, "ja-receipt-01");
  assertEquals(items[1].lang, "en");
});

Deno.test("parseCorpusJsonl names the line number on malformed JSON", () => {
  assertThrows(
    () => parseCorpusJsonl(`${LINE_A}\nnot json`),
    Error,
    "line 2",
  );
});

Deno.test("parseCorpusJsonl rejects items with missing fields", () => {
  assertThrows(
    () => parseCorpusJsonl('{"id":"x","lang":"ja","category":"receipt"}'),
    Error,
    "line 1",
  );
});

Deno.test("parseCorpusJsonl rejects invalid lang", () => {
  assertThrows(
    () =>
      parseCorpusJsonl(
        '{"id":"x","lang":"fr","category":"receipt","text":"t"}',
      ),
    Error,
    "line 1",
  );
});

Deno.test("corpusHash is deterministic and content-sensitive", async () => {
  const a = await corpusHash("hello\n");
  const b = await corpusHash("hello\n");
  const c = await corpusHash("hello!\n");
  assertEquals(a, b);
  assertEquals(a === c, false);
  assertEquals(a.length, 64);
});
