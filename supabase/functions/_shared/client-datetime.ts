// Resolve the "current time" injected into the LLM prompt.
//
// Edge Functions run in UTC, but relative dates in the user's text
// ("tomorrow", "next Friday") must resolve against the USER's clock — at
// 1 AM JST the server is still on yesterday's date, so server time shifts
// every relative date by a day for timezones ahead of UTC. Clients
// therefore send their device-local time string (e.g. Date.toString(),
// which embeds the timezone) and the server prefers it.
//
// Falls back to server (UTC) time when the client sent nothing — older
// app/extension versions keep working, with the historical behavior.

const MAX_LENGTH = 120;

export function resolveCurrentDateTime(
  clientValue: unknown,
  now: () => Date = () => new Date(),
): string {
  if (typeof clientValue === "string") {
    // Collapse control characters so the value stays a single prompt line.
    const cleaned = clientValue.replace(/[\x00-\x1F\x7F]+/g, " ").trim();
    // A date string is short; the length cap rejects anything that could
    // carry meaningful prompt-injection payload beyond what selectedText
    // (fully user-controlled) already allows.
    if (cleaned.length > 0 && cleaned.length <= MAX_LENGTH) {
      return cleaned;
    }
  }
  return now().toLocaleString();
}
