import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseEventResponse } from "./parse-event-response.ts";

const VALID_EVENT = {
  title: "Team meeting",
  description: "Weekly sync",
  startTime: "2026-07-05T14:00:00",
  endTime: "2026-07-05T15:00:00",
  location: "Room A",
};

Deno.test("returns empty events for null content", () => {
  assertEquals(parseEventResponse(null), { events: [] });
  assertEquals(parseEventResponse(undefined), { events: [] });
});

Deno.test("returns empty events for whitespace-only content", () => {
  assertEquals(parseEventResponse("   \n  "), { events: [] });
});

Deno.test("returns empty events for an events array with no entries", () => {
  // Regression: GPT answers {"events": []} for text with no event in it
  // (e.g. a payment receipt). This must be a valid no-events result, not an error.
  assertEquals(parseEventResponse('{\n  "events": []\n}'), { events: [] });
});

Deno.test("strips markdown code fences before parsing", () => {
  const fenced = '```json\n{"events": []}\n```';
  assertEquals(parseEventResponse(fenced), { events: [] });
});

Deno.test("wraps a bare single event object for backward compatibility", () => {
  const result = parseEventResponse(JSON.stringify(VALID_EVENT));
  assertEquals(result.events.length, 1);
  assertEquals(result.events[0].title, "Team meeting");
});

Deno.test("returns empty events when events key is missing and no title", () => {
  assertEquals(parseEventResponse('{"note": "nothing here"}'), { events: [] });
});

Deno.test("accepts multiple valid events", () => {
  const second = {
    ...VALID_EVENT,
    title: "Dinner",
    startTime: "2026-07-05T19:00:00",
    endTime: "2026-07-05T21:00:00",
  };
  const result = parseEventResponse(
    JSON.stringify({ events: [VALID_EVENT, second] }),
  );
  assertEquals(result.events.length, 2);
  assertEquals(result.events[1].title, "Dinner");
});

Deno.test("throws the parse message on invalid JSON", () => {
  assertThrows(
    () => parseEventResponse("not json at all"),
    Error,
    "Failed to parse GPT response as JSON",
  );
});

Deno.test("throws with the event index on missing required fields", () => {
  const missing = { ...VALID_EVENT, startTime: "" };
  assertThrows(
    () => parseEventResponse(JSON.stringify({ events: [VALID_EVENT, missing] })),
    Error,
    "Event 2: Missing required fields: startTime",
  );
});

Deno.test("throws on invalid datetime format", () => {
  const bad = { ...VALID_EVENT, startTime: "2026/07/05 14:00" };
  assertThrows(
    () => parseEventResponse(JSON.stringify({ events: [bad] })),
    Error,
    "Event 1: Invalid datetime format",
  );
});

Deno.test("throws when start time is not before end time", () => {
  const bad = {
    ...VALID_EVENT,
    startTime: "2026-07-05T15:00:00",
    endTime: "2026-07-05T14:00:00",
  };
  assertThrows(
    () => parseEventResponse(JSON.stringify({ events: [bad] })),
    Error,
    "Event 1: Start time must be before end time",
  );
});
