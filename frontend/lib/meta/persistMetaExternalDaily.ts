/**
 * Persists external Scryfall snapshots into meta_commander_daily / meta_card_daily.
 * Fail-open: errors are logged; caller should still retain meta_signals from last run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedGlobalMetaRow } from "./scryfallGlobalMeta";

export async function fetchCommanderRanksForDate(
  admin: SupabaseClient,
  snapshotDate: string,
  source: string,
  timeWindow: string
): Promise<Map<string, number>> {
  try {
    const { data, error } = await admin
      .from("meta_commander_daily")
      .select("commander_name_norm, rank")
      .eq("snapshot_date", snapshotDate)
      .eq("source", source)
      .eq("time_window", timeWindow);
    if (error || !data?.length) return new Map();
    const m = new Map<string, number>();
    for (const row of data as { commander_name_norm: string; rank: number }[]) {
      if (row.commander_name_norm) m.set(row.commander_name_norm, row.rank);
    }
    return m;
  } catch {
    return new Map();
  }
}

export async function upsertCommanderDaily(
  admin: SupabaseClient,
  snapshotDate: string,
  rows: NormalizedGlobalMetaRow[],
  source: string,
  timeWindow: string
): Promise<boolean> {
  if (rows.length === 0) return true;
  try {
    const now = new Date().toISOString();
    const payload = rows.map((r) => ({
      snapshot_date: snapshotDate,
      commander_name: r.name,
      commander_name_norm: r.nameNorm,
      rank: r.rank,
      score: r.score,
      trend_score: r.trendScore,
      deck_count: r.deckCount ?? null,
      source,
      time_window: timeWindow,
      payload_json: r.meta ?? {},
      updated_at: now,
    }));
    const { error } = await admin.from("meta_commander_daily").upsert(payload, {
      onConflict: "snapshot_date,commander_name_norm,source,time_window",
    });
    if (error) {
      console.warn("[meta_external] meta_commander_daily upsert:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[meta_external] meta_commander_daily exception:", e);
    return false;
  }
}

export async function upsertCardDaily(
  admin: SupabaseClient,
  snapshotDate: string,
  rows: NormalizedGlobalMetaRow[],
  source: string,
  timeWindow: string
): Promise<boolean> {
  if (rows.length === 0) return true;
  try {
    const now = new Date().toISOString();
    const payload = rows.map((r) => ({
      snapshot_date: snapshotDate,
      card_name: r.name,
      card_name_norm: r.nameNorm,
      rank: r.rank,
      score: r.score,
      trend_score: r.trendScore,
      deck_count: r.deckCount ?? null,
      source,
      time_window: timeWindow,
      payload_json: r.meta ?? {},
      updated_at: now,
    }));
    const { error } = await admin.from("meta_card_daily").upsert(payload, {
      onConflict: "snapshot_date,card_name_norm,source,time_window",
    });
    if (error) {
      console.warn("[meta_external] meta_card_daily upsert:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[meta_external] meta_card_daily exception:", e);
    return false;
  }
}
