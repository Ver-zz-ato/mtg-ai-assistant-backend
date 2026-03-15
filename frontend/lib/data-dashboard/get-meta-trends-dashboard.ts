/**
 * Read-only meta trends from meta_signals_history and commander_aggregates_history.
 * Expects Supabase admin client (service role).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type MetaTrendsDashboard = {
  metaSignalsTotal: number;
  commanderHistoryTotal: number;
  latestMetaSignalsDate: string | null;
  latestCommanderHistoryDate: string | null;
  metaSignalsHistory: Array<{
    snapshot_date: string;
    signal_type: string;
    data_preview: string;
  }>;
  commanderHistorySummary: Array<{
    commander_slug: string;
    row_count: number;
    latest_deck_count: number | null;
    min_date: string | null;
    max_date: string | null;
  }>;
  commanderTrendDetail: Array<{
    commander_slug: string;
    latest_deck_count: number;
    earliest_deck_count: number;
    delta: number;
  }>;
  countsByDateMeta: Array<{ snapshot_date: string; count: number }>;
  countsByDateCommander: Array<{ snapshot_date: string; count: number }>;
};

export async function getMetaTrendsDashboard(admin: SupabaseClient): Promise<MetaTrendsDashboard> {
  const out: MetaTrendsDashboard = {
    metaSignalsTotal: 0,
    commanderHistoryTotal: 0,
    latestMetaSignalsDate: null,
    latestCommanderHistoryDate: null,
    metaSignalsHistory: [],
    commanderHistorySummary: [],
    commanderTrendDetail: [],
    countsByDateMeta: [],
    countsByDateCommander: [],
  };

  try {
    const [c1, c2] = await Promise.all([
      admin.from("meta_signals_history").select("id", { count: "exact", head: true }),
      admin.from("commander_aggregates_history").select("id", { count: "exact", head: true }),
    ]);
    out.metaSignalsTotal = c1.count ?? 0;
    out.commanderHistoryTotal = c2.count ?? 0;
  } catch {}

  try {
    const { data: d1 } = await admin
      .from("meta_signals_history")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (d1?.snapshot_date) out.latestMetaSignalsDate = String(d1.snapshot_date);
  } catch {}

  try {
    const { data: d2 } = await admin
      .from("commander_aggregates_history")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (d2?.snapshot_date) out.latestCommanderHistoryDate = String(d2.snapshot_date);
  } catch {}

  try {
    const { data } = await admin
      .from("meta_signals_history")
      .select("snapshot_date, signal_type, data")
      .order("snapshot_date", { ascending: false })
      .limit(100);
    out.metaSignalsHistory = (data ?? []).map((r: { snapshot_date?: string; signal_type?: string; data?: unknown }) => {
      let preview = "{}";
      try {
        preview = typeof r.data === "object" && r.data !== null
          ? JSON.stringify(r.data).slice(0, 200) + (JSON.stringify(r.data).length > 200 ? "…" : "")
          : String(r.data ?? "{}").slice(0, 200);
      } catch {}
      return {
        snapshot_date: String(r.snapshot_date ?? ""),
        signal_type: String(r.signal_type ?? ""),
        data_preview: preview,
      };
    });
  } catch {}

  try {
    const { data } = await admin
      .from("commander_aggregates_history")
      .select("commander_slug, snapshot_date, deck_count");
    const rows = data ?? [];
    const bySlug = new Map<string, { rows: number; deck_counts: number[]; dates: string[] }>();
    rows.forEach((r: { commander_slug?: string; deck_count?: number | null; snapshot_date?: string }) => {
      const s = r.commander_slug?.trim() || "";
      if (!s) return;
      const cur = bySlug.get(s) ?? { rows: 0, deck_counts: [], dates: [] };
      cur.rows += 1;
      if (r.deck_count != null) cur.deck_counts.push(Number(r.deck_count));
      if (r.snapshot_date) cur.dates.push(String(r.snapshot_date));
      bySlug.set(s, cur);
    });
    out.commanderHistorySummary = Array.from(bySlug.entries())
      .map(([commander_slug, v]) => ({
        commander_slug,
        row_count: v.rows,
        latest_deck_count: v.deck_counts.length ? v.deck_counts[v.deck_counts.length - 1] : null,
        min_date: v.dates.length ? v.dates.sort()[0] : null,
        max_date: v.dates.length ? v.dates.sort().reverse()[0] : null,
      }))
      .sort((a, b) => b.row_count - a.row_count)
      .slice(0, 25);
  } catch {}

  try {
    const { data } = await admin
      .from("commander_aggregates_history")
      .select("commander_slug, snapshot_date, deck_count")
      .not("deck_count", "is", null);
    const rows = data ?? [];
    const bySlug = new Map<string, Array<{ date: string; deck_count: number }>>();
    rows.forEach((r: { commander_slug?: string; snapshot_date?: string; deck_count?: number }) => {
      const s = r.commander_slug?.trim() || "";
      if (!s) return;
      const arr = bySlug.get(s) ?? [];
      arr.push({ date: String(r.snapshot_date ?? ""), deck_count: Number(r.deck_count) });
      bySlug.set(s, arr);
    });
    out.commanderTrendDetail = Array.from(bySlug.entries())
      .map(([commander_slug, arr]) => {
        const sorted = arr.slice().sort((a, b) => a.date.localeCompare(b.date));
        const earliest = sorted[0]?.deck_count ?? 0;
        const latest = sorted[sorted.length - 1]?.deck_count ?? 0;
        return { commander_slug, latest_deck_count: latest, earliest_deck_count: earliest, delta: latest - earliest };
      })
      .filter((x) => x.latest_deck_count > 0 || x.earliest_deck_count > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 20);
  } catch {}

  try {
    const { data } = await admin.from("meta_signals_history").select("snapshot_date");
    const dateCounts = new Map<string, number>();
    (data ?? []).forEach((r: { snapshot_date?: string }) => {
      const d = String(r.snapshot_date ?? "");
      if (d) dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
    });
    out.countsByDateMeta = Array.from(dateCounts.entries())
      .map(([snapshot_date, count]) => ({ snapshot_date, count }))
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
      .slice(0, 14);
  } catch {}

  try {
    const { data } = await admin.from("commander_aggregates_history").select("snapshot_date");
    const dateCounts = new Map<string, number>();
    (data ?? []).forEach((r: { snapshot_date?: string }) => {
      const d = String(r.snapshot_date ?? "");
      if (d) dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
    });
    out.countsByDateCommander = Array.from(dateCounts.entries())
      .map(([snapshot_date, count]) => ({ snapshot_date, count }))
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
      .slice(0, 14);
  } catch {}

  return out;
}
