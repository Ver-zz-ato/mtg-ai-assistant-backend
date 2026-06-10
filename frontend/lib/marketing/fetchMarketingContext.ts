import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketingMetaSnapshot, MarketingSignalRow } from "./marketingBriefSchema";

const META_SIGNAL_TYPES = [
  "trending-cards",
  "trending-commanders",
  "new-set-breakouts",
  "discover-meta-label",
] as const;

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

export async function fetchRecentMarketingSignals(
  admin: SupabaseClient,
  opts?: { days?: number; limit?: number }
): Promise<MarketingSignalRow[]> {
  const days = opts?.days ?? 7;
  const limit = opts?.limit ?? 50;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await admin
    .from("marketing_signals")
    .select(
      "id, source_id, source_type, title, url, raw_text, detected_cards, detected_topics, score, created_at"
    )
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as MarketingSignalRow[];
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

export async function fetchMarketingContext(admin: SupabaseClient) {
  const [signals, meta_snapshot] = await Promise.all([
    fetchRecentMarketingSignals(admin),
    fetchMetaSignalsSnapshot(admin),
  ]);
  return { signals, meta_snapshot };
}
