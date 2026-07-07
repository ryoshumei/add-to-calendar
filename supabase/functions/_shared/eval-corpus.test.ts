import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { corpusHash, parseCorpusJsonl } from "./eval-corpus.ts";
import {
  CORPUS_CATEGORIES,
  CORPUS_LANGS,
  missingCells,
  nextId,
  TARGET_PER_CELL,
} from "./eval-corpus.ts";
import type { CorpusItem } from "./eval-corpus.ts";

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

function item(id: string, lang: "ja" | "en", category: string): CorpusItem {
  return { id, lang, category, text: "placeholder text" };
}

Deno.test("missingCells reports every cell at target count when corpus is empty", () => {
  const gaps = missingCells([]);
  assertEquals(gaps.length, CORPUS_CATEGORIES.length * CORPUS_LANGS.length);
  assertEquals(gaps.every((g) => g.missing === TARGET_PER_CELL), true);
});

Deno.test("missingCells reports only the shortfall for partial cells", () => {
  const gaps = missingCells([item("ja-receipt-01", "ja", "receipt")]);
  const receiptJa = gaps.find((g) => g.lang === "ja" && g.category === "receipt");
  assertEquals(receiptJa?.missing, 1);
});

Deno.test("missingCells is empty for a full corpus", () => {
  const items: CorpusItem[] = [];
  for (const category of CORPUS_CATEGORIES) {
    for (const lang of CORPUS_LANGS) {
      for (let n = 1; n <= TARGET_PER_CELL; n++) {
        items.push(item(`${lang}-${category}-0${n}`, lang, category));
      }
    }
  }
  assertEquals(missingCells(items), []);
});

Deno.test("nextId continues from the max existing number", () => {
  const items = [
    item("ja-receipt-01", "ja", "receipt"),
    item("ja-receipt-03", "ja", "receipt"),
  ];
  assertEquals(nextId(items, "ja", "receipt"), "ja-receipt-04");
  assertEquals(nextId(items, "en", "receipt"), "en-receipt-01");
});
