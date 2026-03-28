import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdmin } from "@/app/api/_lib/supa";
import { getCommanderBySlug } from "@/lib/commanders";
import {
  computeTrendingCardsList,
  isLandFromCacheRow,
  mergeDeckIdsIntoMap,
  mapToDeckCounts,
  TRENDING_CARDS_MIN_RECENT_DECKS,
} from "@/lib/meta/trendingCardsCompute";

export const runtime = "nodejs";
export const maxDuration = 120;

const SIGNAL_TYPES = [
  "trending-commanders",
  "most-played-commanders",
  "budget-commanders",
  "trending-cards",
  "most-played-cards",
] as const;

function isAuthorized(req: NextRequest): boolean {
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const hdr = req.headers.get("x-cron-key") || "";
  const vercelId = req.headers.get("x-vercel-id");
  const url = new URL(req.url);
  const queryKey = url.searchParams.get("key") || "";
  return !!cronKey && (!!vercelId || hdr === cronKey || queryKey === cronKey);
}

/** Unique deck incidence per card (card name -> number of distinct decks containing it). */
async function uniqueDeckCountsForDeckIds(
  admin: SupabaseClient,
  deckIds: string[]
): Promise<Record<string, number>> {
  const acc = new Map<string, Set<string>>();
  const CHUNK = 250;
  for (let i = 0; i < deckIds.length; i += CHUNK) {
    const slice = deckIds.slice(i, i + CHUNK);
    const { data } = await admin.from("deck_cards").select("deck_id, name").in("deck_id", slice);
    mergeDeckIdsIntoMap(data ?? [], acc);
  }
  return mapToDeckCounts(acc);
}

/** Lowercase scryfall `name` keys that are lands (is_land or type_line contains "land"). */
async function fetchLandNameKeysLower(admin: SupabaseClient, names: string[]): Promise<Set<string>> {
  const land = new Set<string>();
  const uniq = [...new Set(names.map((n) => n.toLowerCase().trim()))].filter(Boolean);
  const CHUNK = 150;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    const { data } = await admin
      .from("scryfall_cache")
      .select("name, is_land, type_line")
      .in("name", slice);
    for (const row of data ?? []) {
      const r = row as { name: string; is_land?: boolean | null; type_line?: string | null };
      if (isLandFromCacheRow(r)) land.add(r.name.toLowerCase());
    }
  }
  return land;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runMetaSignals();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runMetaSignals();
}

async function runMetaSignals() {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const iso30 = thirtyDaysAgo.toISOString();
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const iso60 = sixtyDaysAgo.toISOString();

  let updated = 0;

  // trending-commanders: most deck creations in last 30 days
  const { data: recentDecks } = await admin
    .from("decks")
    .select("commander")
    .eq("is_public", true)
    .eq("format", "Commander")
    .gte("created_at", iso30);

  const trendingCounts: Record<string, number> = {};
  for (const d of recentDecks ?? []) {
    const c = (d.commander as string)?.trim();
    if (c) trendingCounts[c] = (trendingCounts[c] ?? 0) + 1;
  }
  const trendingCommanders = Object.entries(trendingCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const { error: e1 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "trending-commanders",
      data: trendingCommanders,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e1) updated++;

  // most-played-commanders: most public decks overall
  const { data: allDecks } = await admin
    .from("decks")
    .select("commander")
    .eq("is_public", true)
    .eq("format", "Commander");

  const totalCounts: Record<string, number> = {};
  for (const d of allDecks ?? []) {
    const c = (d.commander as string)?.trim();
    if (c) totalCounts[c] = (totalCounts[c] ?? 0) + 1;
  }
  const mostPlayedCommanders = Object.entries(totalCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const { error: e2 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "most-played-commanders",
      data: mostPlayedCommanders,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e2) updated++;

  // budget-commanders: lowest median deck cost (from commander_aggregates)
  const { data: agg } = await admin
    .from("commander_aggregates")
    .select("commander_slug, median_deck_cost")
    .not("median_deck_cost", "is", null);

  const budget = (agg ?? [])
    .filter((r) => (r.median_deck_cost as number) > 0)
    .map((r) => ({
      slug: r.commander_slug,
      name: getCommanderBySlug(r.commander_slug)?.name ?? r.commander_slug,
      medianCost: Number(r.median_deck_cost),
    }))
    .sort((a, b) => a.medianCost - b.medianCost)
    .slice(0, 20);

  const { error: e3 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "budget-commanders",
      data: budget,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e3) updated++;

  // Deck sample for global stats (shared: trending inclusion cap + most-played-cards)
  const { data: allDeckRows } = await admin
    .from("decks")
    .select("id")
    .eq("is_public", true)
    .eq("format", "Commander")
    .limit(1000);
  const allIds = (allDeckRows ?? []).map((d) => d.id as string);

  // trending-cards: trend delta vs prior 30d; exclude lands, staples, >40% deck inclusion; min 5 recent decks
  const { data: recentDeckRows } = await admin
    .from("decks")
    .select("id")
    .eq("is_public", true)
    .eq("format", "Commander")
    .or(`created_at.gte.${iso30},updated_at.gte.${iso30}`);
  const recentIds = [...new Set((recentDeckRows ?? []).map((d) => d.id as string))];

  const { data: prevCreated } = await admin
    .from("decks")
    .select("id")
    .eq("is_public", true)
    .eq("format", "Commander")
    .gte("created_at", iso60)
    .lt("created_at", iso30);
  const { data: prevUpdated } = await admin
    .from("decks")
    .select("id")
    .eq("is_public", true)
    .eq("format", "Commander")
    .gte("updated_at", iso60)
    .lt("updated_at", iso30);
  const prevIds = [...new Set([...(prevCreated ?? []), ...(prevUpdated ?? [])].map((d) => d.id as string))];

  const [recentCounts, prevCounts, globalUniqueCounts] = await Promise.all([
    uniqueDeckCountsForDeckIds(admin, recentIds),
    uniqueDeckCountsForDeckIds(admin, prevIds),
    uniqueDeckCountsForDeckIds(admin, allIds),
  ]);

  const namesForLand = Object.entries(recentCounts)
    .filter(([, c]) => c >= TRENDING_CARDS_MIN_RECENT_DECKS)
    .map(([n]) => n);
  const landKeys = await fetchLandNameKeysLower(admin, namesForLand);

  const trendingCards = computeTrendingCardsList({
    recentCounts,
    prevCounts,
    globalCounts: globalUniqueCounts,
    recentTotalDecks: recentIds.length,
    prevTotalDecks: prevIds.length,
    globalTotalDecks: allIds.length,
    landNamesLower: landKeys,
  });

  const { error: e4 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "trending-cards",
      data: trendingCards,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e4) updated++;

  // most-played-cards: row counts across same deck sample (unchanged UI semantics)
  const cardCountsAll: Record<string, number> = {};
  if (allIds.length > 0) {
    const ROW_CHUNK = 400;
    for (let i = 0; i < allIds.length; i += ROW_CHUNK) {
      const slice = allIds.slice(i, i + ROW_CHUNK);
      const { data: allCards } = await admin.from("deck_cards").select("name").in("deck_id", slice);
      for (const c of allCards ?? []) {
        const n = (c.name as string)?.trim();
        if (n) cardCountsAll[n] = (cardCountsAll[n] ?? 0) + 1;
      }
    }
  }
  const mostPlayedCards = Object.entries(cardCountsAll)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }));

  const { error: e5 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "most-played-cards",
      data: mostPlayedCards,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e5) updated++;

  await admin.from("app_config").upsert(
    { key: "job:last:meta-signals", value: new Date().toISOString() },
    { onConflict: "key" }
  );

  try {
    const { snapshotMetaSignals } = await import("@/lib/data-moat/snapshot-meta-signals");
    await snapshotMetaSignals();
  } catch (e) {
    console.warn("[meta-signals] History snapshot failed:", e);
  }

  return NextResponse.json({
    ok: true,
    updated,
    signal_types: SIGNAL_TYPES.length,
  });
}
