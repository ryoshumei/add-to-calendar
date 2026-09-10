import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { assertEventsMatch } from "./eval-cases.ts";
import type { EventDetails } from "./parse-event-response.ts";

function event(overrides: Partial<EventDetails> = {}): EventDetails {
  return {
    title: "Team meeting",
    description: "Weekly sync",
    startTime: "2026-07-07T14:00:00",
    endTime: "2026-07-07T15:00:00",
    ...overrides,
  };
}

Deno.test("passes when event count is within min and max", () => {
  const failures = assertEventsMatch([event()], { minEvents: 1, maxEvents: 1 });
  assertEquals(failures, []);
});

Deno.test("fails when there are too few events", () => {
  const failures = assertEventsMatch([], { minEvents: 1 });
  assertEquals(failures.length, 1);
  assertEquals(failures[0].includes("expected at least 1"), true);
});

Deno.test("fails when maxEvents is exceeded", () => {
  const failures = assertEventsMatch([event(), event()], {
    minEvents: 0,
    maxEvents: 1,
  });
  assertEquals(failures.length, 1);
  assertEquals(failures[0].includes("expected at most 1"), true);
});

Deno.test("checks exact startTime on the first event", () => {
  const ok = assertEventsMatch([event()], {
    minEvents: 1,
    startTime: "2026-07-07T14:00:00",
  });
  assertEquals(ok, []);

  const bad = assertEventsMatch([event()], {
    minEvents: 1,
    startTime: "2026-07-07T15:30:00",
  });
  assertEquals(bad.length, 1);
  assertEquals(bad[0].includes("startTime"), true);
});

Deno.test("checks only the date part when startDate is used", () => {
  const ok = assertEventsMatch([event({ startTime: "2026-07-12T19:00:00" })], {
    minEvents: 1,
    startDate: "2026-07-12",
  });
  assertEquals(ok, []);

  const bad = assertEventsMatch([event()], {
    minEvents: 1,
    startDate: "2026-07-12",
  });
  assertEquals(bad.length, 1);
});

Deno.test("titleIncludes passes when ANY substring matches, case-insensitive", () => {
  const ok = assertEventsMatch([event({ title: "ファミリーマート ¥894" })], {
    minEvents: 1,
    titleIncludes: ["famima", "ファミリーマート", "894"],
  });
  assertEquals(ok, []);

  const okCase = assertEventsMatch([event({ title: "TEAM MEETING" })], {
    minEvents: 1,
    titleIncludes: ["meeting"],
  });
  assertEquals(okCase, []);

  const bad = assertEventsMatch([event()], {
    minEvents: 1,
    titleIncludes: ["dentist", "歯医者"],
  });
  assertEquals(bad.length, 1);
  assertEquals(bad[0].includes("title"), true);
});

Deno.test("checks events named by position, not just the first", () => {
  const sessions = [
    event({ title: "Opening keynote", startTime: "2026-07-24T09:30:00" }),
    event({ title: "Ship smaller", startTime: "2026-07-24T11:00:00" }),
    event({ title: "Closing panel", startTime: "2026-07-24T15:00:00" }),
  ];

  const ok = assertEventsMatch(sessions, {
    minEvents: 3,
    maxEvents: 3,
    events: [
      { titleIncludes: ["keynote"], startTime: "2026-07-24T09:30:00" },
      { titleIncludes: ["ship smaller"], startTime: "2026-07-24T11:00:00" },
      { titleIncludes: ["panel"], startTime: "2026-07-24T15:00:00" },
    ],
  });
  assertEquals(ok, []);

  // The failure the first-event-only matcher could not see: three Events came
  // back, and the second and third are not the sessions that were asked for.
  const bad = assertEventsMatch(sessions, {
    minEvents: 3,
    maxEvents: 3,
    events: [
      { titleIncludes: ["keynote"] },
      { titleIncludes: ["workshop"] },
      { startTime: "2026-07-24T16:00:00" },
    ],
  });
  assertEquals(bad.length, 2);
  assertEquals(bad[0].includes("event 2"), true);
  assertEquals(bad[1].includes("event 3"), true);
});

Deno.test("names an event that never came back", () => {
  const failures = assertEventsMatch([event()], {
    minEvents: 1,
    events: [{ titleIncludes: ["meeting"] }, { titleIncludes: ["dentist"] }],
  });
  assertEquals(failures, ["event 2: missing"]);
});

Deno.test("skips field checks when no events and minEvents is zero", () => {
  const failures = assertEventsMatch([], {
    minEvents: 0,
    maxEvents: 0,
    titleIncludes: ["anything"],
  });
  assertEquals(failures, []);
});
