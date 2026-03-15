/**
 * Read-only overview for /admin/datadashboard landing.
 * Expects Supabase admin client (service role).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DataDashboardOverview = {
  ai_suggestion_outcomes_total: number;
  deck_metrics_snapshot_total: number;
  meta_signals_history_total: number;
  commander_aggregates_history_total: number;
  ai_suggestion_outcomes_latest_at: string | null;
  deck_metrics_snapshot_latest_date: string | null;
  meta_signals_history_latest_date: string | null;
  commander_aggregates_history_latest_date: string | null;
};

export async function getDataDashboardOverview(
  admin: SupabaseClient
): Promise<DataDashboardOverview> {
  const out: DataDashboardOverview = {
    ai_suggestion_outcomes_total: 0,
    deck_metrics_snapshot_total: 0,
    meta_signals_history_total: 0,
    commander_aggregates_history_total: 0,
    ai_suggestion_outcomes_latest_at: null,
    deck_metrics_snapshot_latest_date: null,
    meta_signals_history_latest_date: null,
    commander_aggregates_history_latest_date: null,
  };

  try {
    const [r1, r2, r3, r4] = await Promise.all([
      admin.from("ai_suggestion_outcomes").select("id", { count: "exact", head: true }),
      admin.from("deck_metrics_snapshot").select("id", { count: "exact", head: true }),
      admin.from("meta_signals_history").select("id", { count: "exact", head: true }),
      admin.from("commander_aggregates_history").select("id", { count: "exact", head: true }),
    ]);
    out.ai_suggestion_outcomes_total = r1.count ?? 0;
    out.deck_metrics_snapshot_total = r2.count ?? 0;
    out.meta_signals_history_total = r3.count ?? 0;
    out.commander_aggregates_history_total = r4.count ?? 0;
  } catch {
    // leave zeros
  }

  try {
    const { data: d1 } = await admin
      .from("ai_suggestion_outcomes")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (d1?.created_at) out.ai_suggestion_outcomes_latest_at = String(d1.created_at);
  } catch {}

  try {
    const { data: d2 } = await admin
      .from("deck_metrics_snapshot")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (d2?.snapshot_date) out.deck_metrics_snapshot_latest_date = String(d2.snapshot_date);
  } catch {}

  try {
    const { data: d3 } = await admin
      .from("meta_signals_history")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (d3?.snapshot_date) out.meta_signals_history_latest_date = String(d3.snapshot_date);
  } catch {}

  try {
    const { data: d4 } = await admin
      .from("commander_aggregates_history")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (d4?.snapshot_date) out.commander_aggregates_history_latest_date = String(d4.snapshot_date);
  } catch {}

  return out;
}
