// Shared parsing/validation of GPT completions into calendar event responses.
// Used by process-text and process-image. An empty events array is a VALID
// result ("no events found in this input"), not an error.

export interface EventDetails {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location?: string;
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

  if (new Date(details.startTime) >= new Date(details.endTime)) {
    throw new Error(`Event ${index + 1}: Start time must be before end time`);
  }
}
