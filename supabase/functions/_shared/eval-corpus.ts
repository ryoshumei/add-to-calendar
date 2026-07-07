// Tier-2 eval corpus: synthetic texts used by the LLM-judge benchmark.
// See docs/superpowers/specs/2026-07-08-llm-judge-eval-design.md

export interface CorpusItem {
  id: string;
  lang: "ja" | "en";
  category: string;
  text: string;
}

export const CORPUS_CATEGORIES = [
  "receipt",
  "reservation",
  "meeting-email",
  "chat",
  "poster",
  "delivery",
  "deadline",
  "no-event",
] as const;

export const CORPUS_LANGS = ["ja", "en"] as const;

export const TARGET_PER_CELL = 2;

export function parseCorpusJsonl(raw: string): CorpusItem[] {
  const items: CorpusItem[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (_e) {
      throw new Error(`eval-corpus.jsonl line ${i + 1}: not valid JSON`);
    }
    const item = parsed as Partial<CorpusItem>;
    if (
      typeof item.id !== "string" || !item.id ||
      (item.lang !== "ja" && item.lang !== "en") ||
      typeof item.category !== "string" || !item.category ||
      typeof item.text !== "string" || !item.text
    ) {
      throw new Error(
        `eval-corpus.jsonl line ${i + 1}: missing/invalid id, lang, category, or text`,
      );
    }
    items.push(item as CorpusItem);
  }
  return items;
}

export async function corpusHash(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
