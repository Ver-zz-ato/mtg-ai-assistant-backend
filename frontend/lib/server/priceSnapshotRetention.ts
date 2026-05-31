import type { SupabaseClient } from "@supabase/supabase-js";

export const PRICE_SNAPSHOT_RETENTION_DAYS = 60;

export type PriceSnapshotRetentionResult = {
  retentionDays: number;
  cutoffDate: string;
  daysDeleted: number;
  rowsDeleted: number;
  oldestDeletedDate: string | null;
  newestDeletedDate: string | null;
  oldestRemainingDate: string | null;
};

type RetentionLogger = (message: string) => void;

function utcDateStringDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function enforcePriceSnapshotRetention(
  supabase: SupabaseClient,
  logger?: RetentionLogger,
): Promise<PriceSnapshotRetentionResult> {
  const cutoffDate = utcDateStringDaysAgo(PRICE_SNAPSHOT_RETENTION_DAYS);
  let daysDeleted = 0;
  let rowsDeleted = 0;
  let oldestDeletedDate: string | null = null;
  let newestDeletedDate: string | null = null;

  while (true) {
    const { data: oldestRow, error: oldestError } = await supabase
      .from("price_snapshots")
      .select("snapshot_date")
      .lt("snapshot_date", cutoffDate)
      .order("snapshot_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (oldestError) throw new Error(oldestError.message);

    const snapshotDate = oldestRow?.snapshot_date ? String(oldestRow.snapshot_date) : null;
    if (!snapshotDate) break;

    const { count, error: countError } = await supabase
      .from("price_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_date", snapshotDate);

    if (countError) throw new Error(countError.message);

    const rowsForDate = count || 0;
    const { error: deleteError } = await supabase
      .from("price_snapshots")
      .delete()
      .eq("snapshot_date", snapshotDate);

    if (deleteError) throw new Error(deleteError.message);

    daysDeleted += 1;
    rowsDeleted += rowsForDate;
    if (!oldestDeletedDate) oldestDeletedDate = snapshotDate;
    newestDeletedDate = snapshotDate;
    logger?.(`Deleted ${rowsForDate.toLocaleString()} rows for ${snapshotDate}`);
  }

  const { data: oldestRemainingRow, error: remainingError } = await supabase
    .from("price_snapshots")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (remainingError) throw new Error(remainingError.message);

  return {
    retentionDays: PRICE_SNAPSHOT_RETENTION_DAYS,
    cutoffDate,
    daysDeleted,
    rowsDeleted,
    oldestDeletedDate,
    newestDeletedDate,
    oldestRemainingDate: oldestRemainingRow?.snapshot_date ? String(oldestRemainingRow.snapshot_date) : null,
  };
}
