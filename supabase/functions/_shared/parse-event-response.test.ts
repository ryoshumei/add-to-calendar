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

// Inverted times are REPAIRED, not rejected — a hard error here used to
// fail the entire extraction (2026-07-27 production report: a 23:12
// receipt + default 1h duration → model emitted end 00:12 on the same day).

Deno.test("repairs midnight-crossing endTime by rolling it to the next day", () => {
  const bad = {
    ...VALID_EVENT,
    startTime: "2026-07-26T23:12:00",
    endTime: "2026-07-26T00:12:00",
  };
  const { events } = parseEventResponse(JSON.stringify({ events: [bad] }));
  assertEquals(events[0].startTime, "2026-07-26T23:12:00");
  assertEquals(events[0].endTime, "2026-07-27T00:12:00");
});

Deno.test("repairs inverted same-day times as an overnight event", () => {
  const bad = {
    ...VALID_EVENT,
    startTime: "2026-07-05T15:00:00",
    endTime: "2026-07-05T14:00:00",
  };
  const { events } = parseEventResponse(JSON.stringify({ events: [bad] }));
  assertEquals(events[0].endTime, "2026-07-06T14:00:00");
});

Deno.test("repairs zero-length events to one hour", () => {
  const bad = {
    ...VALID_EVENT,
    startTime: "2026-07-05T14:00:00",
    endTime: "2026-07-05T14:00:00",
  };
  const { events } = parseEventResponse(JSON.stringify({ events: [bad] }));
  assertEquals(events[0].endTime, "2026-07-05T15:00:00");
});

Deno.test("repairs endTime more than a day before startTime to one hour", () => {
  const bad = {
    ...VALID_EVENT,
    startTime: "2026-07-10T10:00:00",
    endTime: "2026-07-08T10:00:00",
  };
  const { events } = parseEventResponse(JSON.stringify({ events: [bad] }));
  assertEquals(events[0].endTime, "2026-07-10T11:00:00");
});

Deno.test("leaves valid time ranges untouched", () => {
  const { events } = parseEventResponse(JSON.stringify({ events: [VALID_EVENT] }));
  assertEquals(events[0].startTime, VALID_EVENT.startTime);
  assertEquals(events[0].endTime, VALID_EVENT.endTime);
});
