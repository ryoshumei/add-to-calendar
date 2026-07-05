// Live prompt evaluation against the real OpenAI API.
// NOT part of the regular test suite (the filename intentionally avoids the
// *.test.ts pattern so `deno test supabase/functions/_shared/` skips it).
//
// Run:  OPENAI_API_KEY=sk-... npm run eval:prompt
//
// Exercises the exact production path: LLM_CONFIG.buildRequestBody →
// chat/completions → parseEventResponse, against the cases in eval-cases.ts.
// Cases are skipped (ignored) when OPENAI_API_KEY is not set.

import { LLM_CONFIG } from "./llm-prompt.ts";
import { parseEventResponse } from "./parse-event-response.ts";
import { assertEventsMatch, EVAL_CASES, FIXED_NOW } from "./eval-cases.ts";

const apiKey = Deno.env.get("OPENAI_API_KEY");

if (!apiKey) {
  console.warn(
    "OPENAI_API_KEY is not set — all prompt-eval cases will be skipped.",
  );
}

for (const evalCase of EVAL_CASES) {
  Deno.test({
    name: `prompt-eval: ${evalCase.name}`,
    ignore: !apiKey,
    fn: async () => {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify(
            LLM_CONFIG.buildRequestBody(evalCase.text, FIXED_NOW),
          ),
        },
      );
      if (!response.ok) {
        throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      const { events } = parseEventResponse(content);

      // Always show what came back — useful for judging near-misses.
      console.log(
        `\n[${evalCase.name}] extracted ${events.length} event(s):`,
        JSON.stringify(events, null, 2),
      );

      const failures = assertEventsMatch(events, evalCase.expect);
      if (failures.length > 0) {
        throw new Error(
          `${evalCase.name} failed:\n  - ${failures.join("\n  - ")}`,
        );
      }
    },
  });
}
