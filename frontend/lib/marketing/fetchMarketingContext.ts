import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketingMetaSnapshot, MarketingSignalRow } from "./marketingBriefSchema";

const META_SIGNAL_TYPES = [
  "trending-cards",
  "trending-commanders",
  "new-set-breakouts",
  "discover-meta-label",
] as const;

export type SignalFilters = {
  source_type?: string | null;
  topic?: string | null;
  card?: string | null;
  min_score?: number | null;
  from?: string | null;
  to?: string | null;
};

function namesFromMetaData(data: unknown, limit: number): string[] {
  if (!Array.isArray(data)) return [];
  const names: string[] = [];
  for (const item of data) {
    if (typeof item === "string" && item.trim()) {
      names.push(item.trim());
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name = o.name ?? o.label ?? o.title;
      if (typeof name === "string" && name.trim()) names.push(name.trim());
    }
    if (names.length >= limit) break;
  }
  return names;
}

function metaLabelFromData(data: unknown): string | null {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const o = first as Record<string, unknown>;
      if (typeof o.label === "string") return o.label;
      if (typeof o.text === "string") return o.text;
    }
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    if (typeof o.label === "string") return o.label;
    if (typeof o.text === "string") return o.text;
  }
  return null;
}

function signalMatchesFilters(row: MarketingSignalRow, filters?: SignalFilters): boolean {
  if (!filters) return true;
  if (filters.source_type && row.source_type !== filters.source_type) return false;
  if (filters.min_score != null && Number(row.score) < filters.min_score) return false;
  if (filters.card) {
    const cards = JSON.stringify(row.detected_cards ?? []).toLowerCase();
    if (!cards.includes(filters.card.toLowerCase())) return false;
  }
  if (filters.topic) {
    const topics = JSON.stringify(row.detected_topics ?? []).toLowerCase();
    if (!topics.includes(filters.topic.toLowerCase())) return false;
  }
  return true;
}

export async function fetchRecentMarketingSignals(
  admin: SupabaseClient,
  opts?: { days?: number; limit?: number; filters?: SignalFilters; listLimit?: number }
): Promise<MarketingSignalRow[]> {
  const days = opts?.days ?? 7;
  const limit = opts?.limit ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  let query = admin
    .from("marketing_signals")
    .select(
      "id, source_id, source_type, title, url, raw_text, detected_cards, detected_topics, score, created_at"
    )
    .gte("created_at", since.toISOString());

  if (opts?.filters?.from) query = query.gte("created_at", opts.filters.from);
  if (opts?.filters?.to) query = query.lte("created_at", opts.filters.to);
  if (opts?.filters?.source_type) query = query.eq("source_type", opts.filters.source_type);
  if (opts?.filters?.min_score != null) query = query.gte("score", opts.filters.min_score);

  const { data, error } = await query.order("score", { ascending: false }).limit(opts?.listLimit ?? 100);

  if (error) throw new Error(error.message);
  let rows = (data ?? []) as MarketingSignalRow[];
  rows = rows.filter((r) => signalMatchesFilters(r, opts?.filters));
  return rows.slice(0, limit);
}

export async function fetchMetaSignalsSnapshot(admin: SupabaseClient): Promise<MarketingMetaSnapshot> {
  const { data: rows } = await admin
    .from("meta_signals")
    .select("signal_type, data, updated_at")
    .in("signal_type", [...META_SIGNAL_TYPES]);

  const byType: Record<string, { data: unknown; updated_at: string | null }> = {};
  for (const row of rows ?? []) {
    const r = row as { signal_type: string; data: unknown; updated_at?: string };
    byType[r.signal_type] = { data: r.data, updated_at: r.updated_at ?? null };
  }

  const labelRow = byType["discover-meta-label"];
  return {
    trending_cards: namesFromMetaData(byType["trending-cards"]?.data, 10),
    trending_commanders: namesFromMetaData(byType["trending-commanders"]?.data, 10),
    new_set_breakouts: namesFromMetaData(byType["new-set-breakouts"]?.data, 5),
    meta_label: labelRow ? metaLabelFromData(labelRow.data) : null,
    updated_at: {
      trending_cards: byType["trending-cards"]?.updated_at ?? null,
      trending_commanders: byType["trending-commanders"]?.updated_at ?? null,
      new_set_breakouts: byType["new-set-breakouts"]?.updated_at ?? null,
      discover_meta_label: labelRow?.updated_at ?? null,
    },
  };
}

export function metaSnapshotHasData(snapshot: MarketingMetaSnapshot): boolean {
  return (
    snapshot.trending_cards.length > 0 ||
    snapshot.trending_commanders.length > 0 ||
    snapshot.new_set_breakouts.length > 0 ||
    !!snapshot.meta_label
  );
}

export async function fetchMarketingContext(
  admin: SupabaseClient,
  opts?: { days?: number; limit?: number; listLimit?: number; filters?: SignalFilters }
) {
  const [signals, meta_snapshot] = await Promise.all([
    fetchRecentMarketingSignals(admin, {
      days: opts?.days,
      limit: opts?.limit ?? 30,
      listLimit: opts?.listLimit,
      filters: opts?.filters,
    }),
    fetchMetaSignalsSnapshot(admin),
  ]);
  return { signals, meta_snapshot };
}

export async function fetchBriefHistory(admin: SupabaseClient, limit = 20) {
  const { data: briefs, error } = await admin
    .from("marketing_briefs")
    .select("id, brief_date, summary, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const result = [];
  for (const b of briefs ?? []) {
    const brief = b as { id: string; brief_date: string; summary: string | null; created_at: string };
    const { count } = await admin
      .from("marketing_drafts")
      .select("id", { count: "exact", head: true })
      .eq("brief_id", brief.id)
      .is("superseded_at", null);
    result.push({
      ...brief,
      draft_count: count ?? 0,
      summary_preview: (brief.summary ?? "").slice(0, 160),
    });
  }
  return result;
}
