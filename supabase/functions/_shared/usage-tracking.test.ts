import {
  assertEquals,
  assertMatch,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  checkAndIncrementUsage,
  MONTHLY_LIMIT,
  refundUsage,
} from "./usage-tracking.ts";

interface FakeResult {
  data: { usage_count: number } | null;
  error: { code?: string; message?: string } | null;
}

interface RecordedFilter {
  kind: string;
  column: string;
  value: unknown;
}

/**
 * Minimal fake of the supabase-js client covering the query chains the
 * usage-tracking module uses: select().eq().eq().single(),
 * upsert().select().single(), and update().eq().eq() (awaited directly).
 */
function fakeAdmin(opts: {
  selectResult: FakeResult;
  upsertError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const calls = {
    upserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    filters: [] as RecordedFilter[],
  };

  function builder(kind: "select" | "upsert" | "update", payload?: unknown) {
    const b = {
      eq(column: string, value: unknown) {
        calls.filters.push({ kind, column, value });
        return b;
      },
      select() {
        return b;
      },
      single(): Promise<FakeResult> {
        if (kind === "select") return Promise.resolve(opts.selectResult);
        return Promise.resolve({
          data: payload as { usage_count: number },
          error: opts.upsertError ?? null,
        });
      },
      // supabase-js builders are thenables; update() chains are awaited
      // without a terminal .single().
      then<TResult1 = { error: { message?: string } | null }, TResult2 = never>(
        onfulfilled?:
          | ((value: { error: { message?: string } | null }) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        return Promise.resolve({
          error: kind === "update" ? (opts.updateError ?? null) : null,
        }).then(onfulfilled, onrejected);
      },
    };
    return b;
  }

  const admin = {
    from(_table: string) {
      return {
        select(_columns: string) {
          return builder("select");
        },
        upsert(payload: Record<string, unknown>, _options?: unknown) {
          calls.upserts.push(payload);
          return builder("upsert", payload);
        },
        update(payload: Record<string, unknown>) {
          calls.updates.push(payload);
          return builder("update", payload);
        },
      };
    },
  };

  return { admin, calls };
}

Deno.test("refundUsage decrements the stored count by one", async () => {
  const { admin, calls } = fakeAdmin({
    selectResult: { data: { usage_count: 6 }, error: null },
  });

  await refundUsage(admin, "user-1", "2026-07");

  assertEquals(calls.updates.length, 1);
  assertEquals(calls.updates[0].usage_count, 5);
  const updateFilters = calls.filters.filter((f) => f.kind === "update");
  assertEquals(
    updateFilters.some((f) => f.column === "user_id" && f.value === "user-1"),
    true,
  );
  assertEquals(
    updateFilters.some((f) => f.column === "year_month" && f.value === "2026-07"),
    true,
  );
});

Deno.test("refundUsage does not write when the count is already zero", async () => {
  const { admin, calls } = fakeAdmin({
    selectResult: { data: { usage_count: 0 }, error: null },
  });

  await refundUsage(admin, "user-1", "2026-07");

  assertEquals(calls.updates.length, 0);
});

Deno.test("refundUsage does not write when no usage row exists", async () => {
  const { admin, calls } = fakeAdmin({
    selectResult: { data: null, error: { code: "PGRST116" } },
  });

  await refundUsage(admin, "user-1", "2026-07");

  assertEquals(calls.updates.length, 0);
});

Deno.test("refundUsage never throws on database errors", async () => {
  const failingRead = fakeAdmin({
    selectResult: { data: null, error: { code: "500", message: "db down" } },
  });
  await refundUsage(failingRead.admin, "user-1", "2026-07");

  const failingWrite = fakeAdmin({
    selectResult: { data: { usage_count: 3 }, error: null },
    updateError: { message: "write failed" },
  });
  await refundUsage(failingWrite.admin, "user-1", "2026-07");
});

Deno.test("checkAndIncrementUsage increments an existing count and returns usage info", async () => {
  const { admin, calls } = fakeAdmin({
    selectResult: { data: { usage_count: 5 }, error: null },
  });

  const usage = await checkAndIncrementUsage(admin, "user-1");

  assertEquals(calls.upserts.length, 1);
  assertEquals(calls.upserts[0].usage_count, 6);
  assertEquals(calls.upserts[0].user_id, "user-1");
  assertEquals(usage.usageCount, 6);
  assertEquals(usage.limit, MONTHLY_LIMIT);
  assertMatch(usage.yearMonth, /^\d{4}-\d{2}$/);
  assertEquals(calls.upserts[0].year_month, usage.yearMonth);
});

Deno.test("checkAndIncrementUsage starts at one when no row exists", async () => {
  const { admin, calls } = fakeAdmin({
    selectResult: { data: null, error: { code: "PGRST116" } },
  });

  const usage = await checkAndIncrementUsage(admin, "user-1");

  assertEquals(calls.upserts[0].usage_count, 1);
  assertEquals(usage.usageCount, 1);
});

Deno.test("checkAndIncrementUsage throws without incrementing when the limit is reached", async () => {
  const { admin, calls } = fakeAdmin({
    selectResult: { data: { usage_count: MONTHLY_LIMIT }, error: null },
  });

  await assertRejects(
    () => checkAndIncrementUsage(admin, "user-1"),
    Error,
    "Monthly limit exceeded",
  );
  assertEquals(calls.upserts.length, 0);
});

Deno.test("checkAndIncrementUsage surfaces unexpected fetch errors", async () => {
  const { admin } = fakeAdmin({
    selectResult: { data: null, error: { code: "XX000", message: "db down" } },
  });

  await assertRejects(
    () => checkAndIncrementUsage(admin, "user-1"),
    Error,
    "Failed to check usage limit",
  );
});
