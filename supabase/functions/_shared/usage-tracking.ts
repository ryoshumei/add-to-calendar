// Shared monthly usage tracking for Edge Functions (process-text, process-image).
// The client is injected so the logic is unit-testable without a live database.

export const MONTHLY_LIMIT = 50;

export interface UsageInfo {
  usageCount: number;
  limit: number;
  yearMonth: string;
}

interface UsageQueryResult {
  data: { usage_count: number } | null;
  error: { code?: string; message?: string } | null;
}

interface SelectChain {
  eq(column: string, value: unknown): SelectChain;
  single(): Promise<UsageQueryResult>;
}

interface UpsertChain {
  select(): { single(): Promise<{ data: unknown; error: { message?: string } | null }> };
}

interface UpdateChain extends PromiseLike<{ error: { message?: string } | null }> {
  eq(column: string, value: unknown): UpdateChain;
}

/** Minimal structural view of the supabase-js client used by this module. */
export interface UsageTrackingClient {
  from(table: string): {
    select(columns: string): SelectChain;
    upsert(
      payload: Record<string, unknown>,
      options?: { onConflict?: string },
    ): UpsertChain;
    update(payload: Record<string, unknown>): UpdateChain;
  };
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Check and increment usage for a user.
 * Returns current usage info and throws if the monthly limit is exceeded.
 */
export async function checkAndIncrementUsage(
  admin: UsageTrackingClient,
  userId: string,
): Promise<UsageInfo> {
  const yearMonth = currentYearMonth();

  const { data: existingUsage, error: fetchError } = await admin
    .from("usage_tracking")
    .select("usage_count")
    .eq("user_id", userId)
    .eq("year_month", yearMonth)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") { // PGRST116 = not found
    console.error("Error fetching usage:", fetchError);
    throw new Error("Failed to check usage limit");
  }

  const currentUsage = existingUsage?.usage_count || 0;

  if (currentUsage >= MONTHLY_LIMIT) {
    throw new Error(
      `Monthly limit exceeded. You have used ${currentUsage}/${MONTHLY_LIMIT} requests this month.`,
    );
  }

  const newCount = currentUsage + 1;

  console.log(`Attempting to upsert usage for user ${userId}: ${currentUsage} -> ${newCount}`);

  const { data: upsertedData, error: upsertError } = await admin
    .from("usage_tracking")
    .upsert({
      user_id: userId,
      year_month: yearMonth,
      usage_count: newCount,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,year_month",
    })
    .select()
    .single();

  if (upsertError) {
    console.error("Error updating usage:", upsertError);
    throw new Error("Failed to update usage tracking: " + upsertError.message);
  }

  console.log(`✅ Usage updated successfully for user ${userId}:`, {
    oldCount: currentUsage,
    newCount: newCount,
    dbRecord: upsertedData,
  });

  return {
    usageCount: newCount,
    limit: MONTHLY_LIMIT,
    yearMonth,
  };
}

/**
 * Refund one usage after a request that was charged but failed.
 * Best-effort: never throws, so it cannot mask the original error.
 */
export async function refundUsage(
  admin: UsageTrackingClient,
  userId: string,
  yearMonth: string,
): Promise<void> {
  try {
    const { data: existing, error: fetchError } = await admin
      .from("usage_tracking")
      .select("usage_count")
      .eq("user_id", userId)
      .eq("year_month", yearMonth)
      .single();

    if (fetchError) {
      if (fetchError.code !== "PGRST116") {
        console.error("Refund: failed to read usage:", fetchError);
      }
      return;
    }
    if (!existing || existing.usage_count <= 0) {
      return;
    }

    const newCount = existing.usage_count - 1;
    const { error: updateError } = await admin
      .from("usage_tracking")
      .update({
        usage_count: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("year_month", yearMonth);

    if (updateError) {
      console.error("Refund: failed to decrement usage:", updateError);
      return;
    }

    console.log(
      `↩️ Refunded 1 usage for user ${userId} (${yearMonth}): ${existing.usage_count} -> ${newCount}`,
    );
  } catch (err) {
    console.error("Refund: unexpected error (ignored):", err);
  }
}
