/**
 * Read-only deck metrics dashboard from deck_metrics_snapshot.
 * Expects Supabase admin client (service role).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DeckMetricsDashboard = {
  totalRows: number;
  uniqueDecks: number;
  snapshotsToday: number;
  latestSnapshotDate: string | null;
  avgLandCount: number | null;
  avgRampCount: number | null;
  avgRemovalCount: number | null;
  avgDrawCount: number | null;
  byCommander: Array<{
    commander: string;
    snapshot_count: number;
    avg_land: number;
    avg_ramp: number;
    avg_removal: number;
    avg_draw: number;
  }>;
  archetypeTagCounts: { tag: string; count: number }[];
  curveBucketAvgs: Array<{ bucket: number; avg_count: number }>;
  recent: Array<{
    snapshot_date: string;
    commander: string | null;
    format: string | null;
    land_count: number | null;
    ramp_count: number | null;
    removal_count: number | null;
    draw_count: number | null;
    deck_id: string;
  }>;
  lowestLandCounts: Array<{ deck_id: string; commander: string | null; land_count: number | null }>;
  highestLandCounts: Array<{ deck_id: string; commander: string | null; land_count: number | null }>;
  highestRampCounts: Array<{ deck_id: string; commander: string | null; ramp_count: number | null }>;
};

export async function getDeckMetricsDashboard(admin: SupabaseClient): Promise<DeckMetricsDashboard> {
  const out: DeckMetricsDashboard = {
    totalRows: 0,
    uniqueDecks: 0,
    snapshotsToday: 0,
    latestSnapshotDate: null,
    avgLandCount: null,
    avgRampCount: null,
    avgRemovalCount: null,
    avgDrawCount: null,
    byCommander: [],
    archetypeTagCounts: [],
    curveBucketAvgs: [],
    recent: [],
    lowestLandCounts: [],
    highestLandCounts: [],
    highestRampCounts: [],
  };

  const today = new Date().toISOString().slice(0, 10);

  try {
    const { data, count } = await admin
      .from("deck_metrics_snapshot")
      .select("deck_id, snapshot_date, land_count, ramp_count, removal_count, draw_count, commander, format", { count: "exact" });
    const rows = data ?? [];
    out.totalRows = count ?? rows.length;
    const deckIds = new Set(rows.map((r: { deck_id?: string }) => String(r.deck_id ?? "")).filter(Boolean));
    out.uniqueDecks = deckIds.size;
    out.snapshotsToday = rows.filter((r: { snapshot_date?: string }) => r.snapshot_date === today).length;
    if (rows.length) {
      const dates = rows.map((r: { snapshot_date?: string }) => r.snapshot_date).filter(Boolean) as string[];
      out.latestSnapshotDate = dates.sort().reverse()[0] ?? null;
    }
    const num = rows.length;
    if (num) {
      const sum = (key: string) => rows.reduce((a: number, r: Record<string, unknown>) => a + (Number(r[key]) || 0), 0);
      out.avgLandCount = sum("land_count") / num;
      out.avgRampCount = sum("ramp_count") / num;
      out.avgRemovalCount = sum("removal_count") / num;
      out.avgDrawCount = sum("draw_count") / num;
    }
  } catch {}

  try {
    const { data } = await admin
      .from("deck_metrics_snapshot")
      .select("commander, land_count, ramp_count, removal_count, draw_count");
    const rows = data ?? [];
    const byCmd = new Map<string, { n: number; land: number; ramp: number; removal: number; draw: number }>();
    rows.forEach((r: { commander?: string | null; land_count?: number | null; ramp_count?: number | null; removal_count?: number | null; draw_count?: number | null }) => {
      const c = r.commander?.trim() || "(blank)";
      const cur = byCmd.get(c) ?? { n: 0, land: 0, ramp: 0, removal: 0, draw: 0 };
      cur.n += 1;
      cur.land += Number(r.land_count) || 0;
      cur.ramp += Number(r.ramp_count) || 0;
      cur.removal += Number(r.removal_count) || 0;
      cur.draw += Number(r.draw_count) || 0;
      byCmd.set(c, cur);
    });
    out.byCommander = Array.from(byCmd.entries())
      .map(([commander, v]) => ({
        commander,
        snapshot_count: v.n,
        avg_land: v.n ? v.land / v.n : 0,
        avg_ramp: v.n ? v.ramp / v.n : 0,
        avg_removal: v.n ? v.removal / v.n : 0,
        avg_draw: v.n ? v.draw / v.n : 0,
      }))
      .sort((a, b) => b.snapshot_count - a.snapshot_count)
      .slice(0, 25);
  } catch {}

  try {
    const { data } = await admin.from("deck_metrics_snapshot").select("archetype_tags");
    const tagCounts = new Map<string, number>();
    (data ?? []).forEach((r: { archetype_tags?: unknown }) => {
      const arr = Array.isArray(r.archetype_tags) ? r.archetype_tags : [];
      arr.forEach((t: unknown) => {
        const s = typeof t === "string" ? t.trim() : String(t);
        if (s) tagCounts.set(s, (tagCounts.get(s) ?? 0) + 1);
      });
    });
    out.archetypeTagCounts = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
  } catch {}

  try {
    const { data } = await admin.from("deck_metrics_snapshot").select("curve_histogram");
    const buckets: number[][] = [];
    (data ?? []).forEach((r: { curve_histogram?: unknown }) => {
      if (Array.isArray(r.curve_histogram)) buckets.push(r.curve_histogram.map(Number));
    });
    if (buckets.length) {
      const maxLen = Math.max(...buckets.map((b) => b.length));
      for (let i = 0; i < maxLen; i++) {
        let sum = 0;
        let cnt = 0;
        buckets.forEach((b) => {
          if (typeof b[i] === "number") {
            sum += b[i];
            cnt++;
          }
        });
        out.curveBucketAvgs.push({ bucket: i, avg_count: cnt ? sum / cnt : 0 });
      }
    }
  } catch {}

  try {
    const { data } = await admin
      .from("deck_metrics_snapshot")
      .select("snapshot_date, commander, format, land_count, ramp_count, removal_count, draw_count, deck_id")
      .order("snapshot_date", { ascending: false })
      .limit(50);
    out.recent = (data ?? []).map((r: Record<string, unknown>) => ({
      snapshot_date: String(r.snapshot_date ?? ""),
      commander: r.commander != null ? String(r.commander) : null,
      format: r.format != null ? String(r.format) : null,
      land_count: r.land_count != null ? Number(r.land_count) : null,
      ramp_count: r.ramp_count != null ? Number(r.ramp_count) : null,
      removal_count: r.removal_count != null ? Number(r.removal_count) : null,
      draw_count: r.draw_count != null ? Number(r.draw_count) : null,
      deck_id: String(r.deck_id ?? ""),
    }));
  } catch {}

  try {
    const { data: low } = await admin
      .from("deck_metrics_snapshot")
      .select("deck_id, commander, land_count")
      .not("land_count", "is", null)
      .order("land_count", { ascending: true })
      .limit(10);
    out.lowestLandCounts = (low ?? []).map((r: Record<string, unknown>) => ({
      deck_id: String(r.deck_id ?? ""),
      commander: r.commander != null ? String(r.commander) : null,
      land_count: r.land_count != null ? Number(r.land_count) : null,
    }));
  } catch {}

  try {
    const { data: high } = await admin
      .from("deck_metrics_snapshot")
      .select("deck_id, commander, land_count")
      .not("land_count", "is", null)
      .order("land_count", { ascending: false })
      .limit(10);
    out.highestLandCounts = (high ?? []).map((r: Record<string, unknown>) => ({
      deck_id: String(r.deck_id ?? ""),
      commander: r.commander != null ? String(r.commander) : null,
      land_count: r.land_count != null ? Number(r.land_count) : null,
    }));
  } catch {}

  try {
    const { data: ramp } = await admin
      .from("deck_metrics_snapshot")
      .select("deck_id, commander, ramp_count")
      .not("ramp_count", "is", null)
      .order("ramp_count", { ascending: false })
      .limit(10);
    out.highestRampCounts = (ramp ?? []).map((r: Record<string, unknown>) => ({
      deck_id: String(r.deck_id ?? ""),
      commander: r.commander != null ? String(r.commander) : null,
      ramp_count: r.ramp_count != null ? Number(r.ramp_count) : null,
    }));
  } catch {}

  return out;
}
