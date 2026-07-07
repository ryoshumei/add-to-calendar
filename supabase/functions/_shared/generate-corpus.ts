// Corpus generator for the tier-2 judge benchmark. Appends synthetic texts
// to eval-corpus.jsonl. Never overwrites existing items.
//
// Run:  OPENAI_API_KEY=sk-... npm run eval:generate
//       npm run eval:generate -- --category receipt --count 3

import {
  CORPUS_CATEGORIES,
  missingCells,
  nextId,
  parseCorpusJsonl,
} from "./eval-corpus.ts";
import type { CorpusItem } from "./eval-corpus.ts";
import { FIXED_NOW } from "./eval-cases.ts";

const CORPUS_PATH = new URL("./eval-corpus.jsonl", import.meta.url).pathname;

export function parseArgs(args: string[]): { category?: string; count?: number } {
  const out: { category?: string; count?: number } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--category") {
      const value = args[++i];
      if (!(CORPUS_CATEGORIES as readonly string[]).includes(value)) {
        throw new Error(
          `unknown category "${value}" — valid: ${CORPUS_CATEGORIES.join(", ")}`,
        );
      }
      out.category = value;
    } else if (args[i] === "--count") {
      out.count = parseInt(args[++i], 10);
      if (Number.isNaN(out.count) || out.count < 1) {
        throw new Error("--count must be a positive integer");
      }
    } else {
      throw new Error(`unknown flag ${args[i]}`);
    }
  }
  if (out.count !== undefined && !out.category) {
    throw new Error("--count requires --category");
  }
  return out;
}

export function buildGenerationRequest(
  lang: "ja" | "en",
  category: string,
  fixedNow: string,
): Record<string, unknown> {
  const language = lang === "ja" ? "Japanese" : "English";
  const dateRule = category === "no-event"
    ? "The text must contain no date or time information whatsoever — no dates, times, weekdays, or relative expressions like tomorrow."
    : `Include explicit or relative date/time expressions that make sense relative to the reference time ${fixedNow}.`;
  return {
    model: "gpt-4.1-mini",
    temperature: 0.9,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `You generate realistic test texts for a calendar-extraction benchmark. Write in ${language}. ` +
          `Produce one realistic "${category}" text that a user might select in a browser or receive on a phone. ` +
          `${dateRule} ` +
          `Vary formats, names, and phrasing. Return ONLY a JSON object: {"text": "..."}.`,
      },
      { role: "user", content: `Generate one ${language} ${category} text.` },
    ],
  };
}

export function parseGeneratedText(content: string | null | undefined): string {
  if (!content || !content.trim()) throw new Error("generator returned empty content");
  const parsed = JSON.parse(content) as { text?: unknown };
  if (typeof parsed.text !== "string" || !parsed.text.trim()) {
    throw new Error(`generator response missing "text" field`);
  }
  return parsed.text.trim();
}

async function callOpenAI(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}

async function main() {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required. Try: set -a && . ./.env && set +a");
    Deno.exit(1);
  }
  const args = parseArgs(Deno.args);

  let raw = "";
  try {
    raw = await Deno.readTextFile(CORPUS_PATH);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
    // first run — file does not exist yet
  }
  const items = parseCorpusJsonl(raw);

  // Build the work list: targeted (--category) or gap-fill.
  const work: Array<{ lang: "ja" | "en"; category: string }> = [];
  if (args.category) {
    const count = args.count ?? 1;
    for (let i = 0; i < count; i++) {
      work.push({ lang: i % 2 === 0 ? "ja" : "en", category: args.category });
    }
  } else {
    for (const gap of missingCells(items)) {
      for (let i = 0; i < gap.missing; i++) {
        work.push({ lang: gap.lang, category: gap.category });
      }
    }
  }

  if (work.length === 0) {
    console.log("Corpus is already at target — nothing to generate.");
    return;
  }
  console.log(`Generating ${work.length} item(s) (~${work.length} gpt-4.1-mini calls)...`);

  for (const w of work) {
    const body = buildGenerationRequest(w.lang, w.category, FIXED_NOW);
    let content: string;
    try {
      content = await callOpenAI(apiKey, body);
    } catch (firstErr) {
      console.warn(`retrying ${w.lang}/${w.category}: ${firstErr}`);
      content = await callOpenAI(apiKey, body);
    }
    const text = parseGeneratedText(content);
    const id = nextId(items, w.lang, w.category);
    const item: CorpusItem = { id, lang: w.lang, category: w.category, text };
    items.push(item);
    await Deno.writeTextFile(CORPUS_PATH, JSON.stringify(item) + "\n", { append: true });
    console.log(`  + ${id} (${text.length} chars)`);
  }
  console.log(`Done. Corpus now has ${items.length} item(s) at ${CORPUS_PATH}`);
}

if (import.meta.main) {
  await main();
}
