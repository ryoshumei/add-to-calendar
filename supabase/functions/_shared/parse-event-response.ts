// Shared parsing/validation of GPT completions into calendar event responses.
// Used by process-text and process-image. An empty events array is a VALID
// result ("no events found in this input"), not an error.

export interface EventDetails {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location?: string;
  // Optional, emitted only for repeating events. Passed through to clients
  // as-is; the iOS app maps it to EventKit/RRULE. Older clients ignore it.
  recurrence?: {
    frequency: "daily" | "weekly" | "monthly" | "yearly";
    interval?: number;
    until?: string; // YYYY-MM-DD
    daysOfWeek?: string[]; // RRULE BYDAY codes, weekly only
  };
}

export interface EventResponse {
  events: EventDetails[];
}

/**
 * Parse a GPT completion into an EventResponse.
 *
 * - null/empty content → { events: [] } (model found nothing / declined)
 * - defensively strips markdown code fences
 * - bare single event object is wrapped for backward compatibility
 * - a JSON object without a usable events array → { events: [] }
 * - every event present is validated (required fields, datetime format, order)
 */
export function parseEventResponse(
  content: string | null | undefined,
): EventResponse {
  if (!content || !content.trim()) {
    return { events: [] };
  }

  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_parseError) {
    throw new Error("Failed to parse GPT response as JSON");
  }

  let candidate = parsed as { events?: unknown; title?: unknown } | null;
  if (!candidate || typeof candidate !== "object") {
    return { events: [] };
  }

  // Backward compatibility: wrap single event in events array
  if (!Array.isArray(candidate.events) && candidate.title) {
    candidate = { events: [candidate] };
  }
  if (!Array.isArray(candidate.events)) {
    return { events: [] };
  }

  const events = candidate.events as EventDetails[];
  events.forEach((event, index) => validateSingleEventDetails(event, index));

  return { events };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Wall-clock arithmetic on timezone-less "YYYY-MM-DDTHH:mm:ss" strings —
 * anchored in UTC so runtime timezone and DST can never skew the math. */
function wallClockMs(dateTime: string): number {
  return new Date(`${dateTime}Z`).getTime();
}

function toWallClockString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

/**
 * Repair model output where endTime is not after startTime. The common
 * cause is an event crossing midnight (a 23:12 receipt + default 1h
 * duration → 00:12 emitted on the SAME date). Rolling endTime forward one
 * day restores the intended duration; anything still nonsensical falls
 * back to a 1-hour event. Repairing beats rejecting: a hard validation
 * error here used to fail the entire extraction.
 */
function normalizeEventTimes(details: EventDetails) {
  const start = wallClockMs(details.startTime);
  const end = wallClockMs(details.endTime);
  if (end > start) return;

  // Midnight crossing needs a strictly earlier end — an EQUAL end is a
  // zero-length event, which becomes 1 hour, not 24.
  const endNextDay = end + DAY_MS;
  if (end < start && endNextDay > start) {
    details.endTime = toWallClockString(endNextDay);
  } else {
    details.endTime = toWallClockString(start + HOUR_MS);
  }
}

function validateSingleEventDetails(details: EventDetails, index: number) {
  const required = ["title", "startTime", "endTime"] as const;
  const missing = required.filter((field) => !details?.[field]);

  if (missing.length > 0) {
    throw new Error(
      `Event ${index + 1}: Missing required fields: ${missing.join(", ")}`,
    );
  }

  const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  if (
    !dateTimeRegex.test(details.startTime) || !dateTimeRegex.test(details.endTime)
  ) {
    throw new Error(`Event ${index + 1}: Invalid datetime format`);
  }

  normalizeEventTimes(details);

  if (new Date(details.startTime) >= new Date(details.endTime)) {
    throw new Error(`Event ${index + 1}: Start time must be before end time`);
  }
}
