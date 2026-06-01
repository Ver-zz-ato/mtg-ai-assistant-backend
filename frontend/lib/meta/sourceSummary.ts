import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/supa";
import { parseMetaSignalsJobDetail } from "@/lib/meta/metaSignalsJobStatus";
import { SCRYFALL_META } from "@/lib/meta/scryfallGlobalMeta";

export type MetaSourceSummary = {
  publicCommanderDecks: number | null;
  globalCommanderRows: number | null;
  budgetCommanderRows: number | null;
  globalCardRows: number | null;
  budgetCardRows: number | null;
  recentSetCommanderRows: number | null;
  lastUpdated: string | null;
  snapshotDate: string | null;
  sourceLabel: string;
};

async function getDb(): Promise<SupabaseClient> {
  try {
    return getAdmin();
  } catch {
    return createClient() as Promise<SupabaseClient>;
  }
}

async function countLatestRows(
  db: SupabaseClient,
  table: "meta_commander_daily" | "meta_card_daily",
  timeWindow: string
): Promise<{ count: number | null; snapshotDate: string | null }> {
  const { data: latest } = await db
    .from(table)
    .select("snapshot_date")
    .eq("source", SCRYFALL_META.source)
    .eq("time_window", timeWindow)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshotDate = (latest as { snapshot_date?: string } | null)?.snapshot_date ?? null;
  if (!snapshotDate) return { count: null, snapshotDate: null };

  const { count } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("source", SCRYFALL_META.source)
    .eq("time_window", timeWindow)
    .eq("snapshot_date", snapshotDate);

  return { count: count ?? null, snapshotDate };
}

export async function getMetaSourceSummary(): Promise<MetaSourceSummary> {
  const db = await getDb();

  const [
    jobConfig,
    deckCountResult,
    commanderRows,
    budgetCommanderRows,
    popularCardRows,
    budgetCardRows,
  ] = await Promise.all([
    db
      .from("app_config")
      .select("value")
      .eq("key", "job:meta-signals:detail")
      .maybeSingle(),
    db
      .from("decks")
      .select("id", { count: "exact", head: true })
      .eq("is_public", true)
      .eq("format", "Commander"),
    countLatestRows(db, "meta_commander_daily", SCRYFALL_META.twPopular),
    countLatestRows(db, "meta_commander_daily", SCRYFALL_META.twBudget),
    countLatestRows(db, "meta_card_daily", SCRYFALL_META.twPopular),
    countLatestRows(db, "meta_card_daily", SCRYFALL_META.twBudget),
  ]);

  const rawJobValue = (jobConfig.data as { value?: string | null } | null)?.value ?? null;
  const jobDetail = parseMetaSignalsJobDetail(rawJobValue);
  const sources = jobDetail?.sources;

  return {
    publicCommanderDecks: deckCountResult.count ?? null,
    globalCommanderRows: commanderRows.count ?? sources?.scryfallCommanders ?? null,
    budgetCommanderRows: budgetCommanderRows.count ?? sources?.scryfallBudgetCommanders ?? null,
    globalCardRows: popularCardRows.count ?? sources?.scryfallCards ?? null,
    budgetCardRows: budgetCardRows.count ?? sources?.scryfallBudget ?? null,
    recentSetCommanderRows: sources?.recentSetCommanders ?? null,
    lastUpdated: jobDetail?.finishedAt ?? null,
    snapshotDate:
      jobDetail?.snapshotDate ??
      commanderRows.snapshotDate ??
      popularCardRows.snapshotDate ??
      budgetCardRows.snapshotDate ??
      null,
    sourceLabel: "ManaTap public Commander decks + Scryfall EDHREC-order global signals",
  };
}
