import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdmin } from "@/app/api/_lib/supa";
import {
  blendCardLists,
  blendMostPlayedCommanders,
  blendTrendingCardsWithGlobal,
  blendTrendingCommanders,
  toLegacyCardShape,
  toLegacyCommanderShape,
} from "@/lib/meta/discoverBlend";
import {
  fetchCommanderRanksForDate,
  upsertCardDaily,
  upsertCommanderDaily,
} from "@/lib/meta/persistMetaExternalDaily";
import type { MetaSignalsJobDetail, MetaSignalsPillMode } from "@/lib/meta/metaSignalsJobStatus";
import type { NormalizedGlobalMetaRow } from "@/lib/meta/scryfallGlobalMeta";
import {
  fetchGlobalBudgetCards,
  fetchGlobalCommanderPopular,
  fetchGlobalPopularCards,
  fetchRecentSetPopularCommanders,
  normName,
  SCRYFALL_META,
} from "@/lib/meta/scryfallGlobalMeta";
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
  "new-set-breakouts",
  "discover-meta-label",
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

function asNameCountArray(x: unknown): { name: string; count: number }[] {
  if (!Array.isArray(x)) return [];
  return x.filter((r): r is { name: string; count: number } => {
    const o = r as { name?: unknown; count?: unknown };
    return typeof o?.name === "string" && typeof o?.count === "number";
  });
}

/** Older budget rows used commander median cost; normalize to card-shaped entries for fallback. */
type LegacyCmdRow = ReturnType<typeof toLegacyCommanderShape>[number] & { movementLabel?: string };
type LegacyCardRow = ReturnType<typeof toLegacyCardShape>[number];

function cmdFallback(name: string, count: number): LegacyCmdRow {
  return { name, count, blendedScore: undefined, badge: undefined, dataScope: "internal" };
}

function cardFallback(name: string, count: number): LegacyCardRow {
  return { name, count, blendedScore: undefined, badge: undefined, dataScope: "internal" };
}

function asBudgetCardLikeArray(x: unknown): { name: string; count: number; dataScope: "internal" }[] {
  if (!Array.isArray(x)) return [];
  const out: { name: string; count: number; dataScope: "internal" }[] = [];
  for (const r of x) {
    const o = r as { name?: string; count?: number };
    if (typeof o.name === "string") {
      out.push({
        name: o.name,
        count: typeof o.count === "number" ? o.count : 1,
        dataScope: "internal",
      });
    }
  }
  return out;
}

async function loadPreviousSignalData(
  admin: SupabaseClient,
  types: readonly string[]
): Promise<Record<string, unknown>> {
  const { data } = await admin.from("meta_signals").select("signal_type, data").in("signal_type", [...types]);
  const out: Record<string, unknown> = {};
  for (const row of data ?? []) {
    const r = row as { signal_type: string; data: unknown };
    out[r.signal_type] = r.data;
  }
  return out;
}

function attachCommanderMovement(
  rows: LegacyCmdRow[],
  globalToday: NormalizedGlobalMetaRow[],
  yesterdayRanks: Map<string, number>
): LegacyCmdRow[] {
  const rankToday = new Map(globalToday.map((g) => [g.nameNorm, g.rank]));
  return rows.map((r) => {
    const nn = normName(r.name);
    const prev = yesterdayRanks.get(nn);
    const cur = rankToday.get(nn);
    if (prev == null || cur == null || prev <= 0) return r;
    const delta = prev - cur;
    if (delta === 0) return r;
    const movementLabel = delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`;
    return { ...r, movementLabel };
  });
}

async function runMetaSignals() {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  const attemptStartedAt = new Date().toISOString();
  const warnings: string[] = [];

  try {
  await admin.from("app_config").upsert(
    { key: "job:meta-signals:attempt", value: attemptStartedAt },
    { onConflict: "key" }
  );

  const prevSignals = await loadPreviousSignalData(admin, SIGNAL_TYPES);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const iso30 = thirtyDaysAgo.toISOString();
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const iso60 = sixtyDaysAgo.toISOString();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const iso7 = sevenDaysAgo.toISOString();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  let updated = 0;

  // --- External (Scryfall): Commander / card popularity proxies (EDHREC order); parallel fetches. ---
  let globalPopularCommanders: Awaited<ReturnType<typeof fetchGlobalCommanderPopular>> = [];
  let recentSetCommanders: Awaited<ReturnType<typeof fetchRecentSetPopularCommanders>> = [];
  let globalPopularCards: Awaited<ReturnType<typeof fetchGlobalPopularCards>> = [];
  let globalBudgetCards: Awaited<ReturnType<typeof fetchGlobalBudgetCards>> = [];

  try {
    const [p1, p2, p3, p4] = await Promise.all([
      fetchGlobalCommanderPopular(2),
      fetchRecentSetPopularCommanders(1),
      fetchGlobalPopularCards(2),
      fetchGlobalBudgetCards(2),
    ]);
    globalPopularCommanders = p1;
    recentSetCommanders = p2;
    globalPopularCards = p3;
    globalBudgetCards = p4;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[meta-signals] Scryfall global fetch failed (using internal / prior only):", e);
    warnings.push(`Scryfall fetch error: ${msg}`);
  }

  if (
    globalPopularCommanders.length === 0 &&
    globalPopularCards.length === 0 &&
    globalBudgetCards.length === 0 &&
    recentSetCommanders.length === 0
  ) {
    warnings.push("No Scryfall rows this run — blends are ManaTap-only or use prior rows.");
  }

  /** Persist daily external snapshots (separate from blended meta_signals; no wipe on partial). */
  if (globalPopularCommanders.length > 0) {
    await upsertCommanderDaily(
      admin,
      todayStr,
      globalPopularCommanders,
      SCRYFALL_META.source,
      SCRYFALL_META.twPopular
    );
  }
  if (globalPopularCards.length > 0) {
    await upsertCardDaily(
      admin,
      todayStr,
      globalPopularCards,
      SCRYFALL_META.source,
      SCRYFALL_META.twPopular
    );
  }
  if (globalBudgetCards.length > 0) {
    await upsertCardDaily(
      admin,
      todayStr,
      globalBudgetCards,
      SCRYFALL_META.source,
      SCRYFALL_META.twBudget
    );
  }

  const yesterdayRanks = await fetchCommanderRanksForDate(
    admin,
    yesterdayStr,
    SCRYFALL_META.source,
    SCRYFALL_META.twPopular
  );

  // trending-commanders: internal 30d + Scryfall global / recent momentum
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

  const blendedTrend = blendTrendingCommanders({
    internal30d: trendingCounts,
    globalPopular: globalPopularCommanders,
    recentSet: recentSetCommanders,
    yesterdayRanks,
  });
  let trendingCommandersOut = toLegacyCommanderShape(blendedTrend.rows);
  if (trendingCommandersOut.length === 0) {
    trendingCommandersOut = asNameCountArray(prevSignals["trending-commanders"]).map((r) =>
      cmdFallback(r.name, r.count)
    );
  }
  if (trendingCommandersOut.length === 0) {
    trendingCommandersOut = Object.entries(trendingCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([name, count]) => cmdFallback(name, count));
  }

  trendingCommandersOut = attachCommanderMovement(
    trendingCommandersOut,
    globalPopularCommanders,
    yesterdayRanks
  );

  const { error: e1 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "trending-commanders",
      data: trendingCommandersOut,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e1) updated++;

  // most-played-commanders: internal 7d + Scryfall popularity (weekly feel + global priors)
  const { data: weekDecks } = await admin
    .from("decks")
    .select("commander")
    .eq("is_public", true)
    .eq("format", "Commander")
    .gte("created_at", iso7);

  const weekCounts: Record<string, number> = {};
  for (const d of weekDecks ?? []) {
    const c = (d.commander as string)?.trim();
    if (c) weekCounts[c] = (weekCounts[c] ?? 0) + 1;
  }

  const blendedWeekly = blendMostPlayedCommanders({
    internal7d: weekCounts,
    globalPopular: globalPopularCommanders,
  });
  let mostPlayedCommandersOut = toLegacyCommanderShape(blendedWeekly.rows);
  if (mostPlayedCommandersOut.length === 0) {
    mostPlayedCommandersOut = asNameCountArray(prevSignals["most-played-commanders"]).map((r) =>
      cmdFallback(r.name, r.count)
    );
  }
  if (mostPlayedCommandersOut.length === 0) {
    const { data: allDecksFallback } = await admin
      .from("decks")
      .select("commander")
      .eq("is_public", true)
      .eq("format", "Commander");
    const totalCounts: Record<string, number> = {};
    for (const d of allDecksFallback ?? []) {
      const c = (d.commander as string)?.trim();
      if (c) totalCounts[c] = (totalCounts[c] ?? 0) + 1;
    }
    mostPlayedCommandersOut = Object.entries(totalCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([name, count]) => cmdFallback(name, count));
  }

  const { error: e2 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "most-played-commanders",
      data: mostPlayedCommandersOut,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e2) updated++;

  // Deck sample for global stats (shared: trending inclusion cap + most-played-cards)
  const { data: allDeckRows } = await admin
    .from("decks")
    .select("id")
    .eq("is_public", true)
    .eq("format", "Commander")
    .limit(1000);
  const allIds = (allDeckRows ?? []).map((d) => d.id as string);

  // trending-cards: internal trend delta + Scryfall global prior (same filters as before)
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

  const trendingCardsRaw = computeTrendingCardsList({
    recentCounts,
    prevCounts,
    globalCounts: globalUniqueCounts,
    recentTotalDecks: recentIds.length,
    prevTotalDecks: prevIds.length,
    globalTotalDecks: allIds.length,
    landNamesLower: landKeys,
  });

  const trendingCardsBlended = blendTrendingCardsWithGlobal(trendingCardsRaw, globalPopularCards);
  let trendingCardsOut = toLegacyCardShape(trendingCardsBlended);
  if (trendingCardsOut.length === 0) {
    trendingCardsOut = asNameCountArray(prevSignals["trending-cards"]).map((r) => cardFallback(r.name, r.count));
  }
  if (trendingCardsOut.length === 0) {
    trendingCardsOut = trendingCardsRaw.map((r) => cardFallback(r.name, r.count));
  }

  const { error: e4 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "trending-cards",
      data: trendingCardsOut,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e4) updated++;

  // most-played-cards: row counts + global popularity
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
  const mostPlayedCardsBlended = blendCardLists({
    internalCounts: cardCountsAll,
    globalRows: globalPopularCards,
    weightExternal: 0.8,
  });
  let mostPlayedCardsOut = toLegacyCardShape(mostPlayedCardsBlended.rows);
  if (mostPlayedCardsOut.length === 0) {
    mostPlayedCardsOut = asNameCountArray(prevSignals["most-played-cards"]).map((r) =>
      cardFallback(r.name, r.count)
    );
  }
  if (mostPlayedCardsOut.length === 0) {
    mostPlayedCardsOut = Object.entries(cardCountsAll)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 30)
      .map(([name, count]) => cardFallback(name, count));
  }

  const { error: e5 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "most-played-cards",
      data: mostPlayedCardsOut,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e5) updated++;

  // budget-commanders slug: **cards** — cheap global staples blended with ManaTap inclusion (deck row counts).
  const budgetBlend = blendCardLists({
    internalCounts: cardCountsAll,
    globalRows: globalBudgetCards,
    weightExternal: 0.85,
  });
  let budgetCardsOut = toLegacyCardShape(budgetBlend.rows).slice(0, 24);
  if (budgetCardsOut.length === 0) {
    const fromPrev = asBudgetCardLikeArray(prevSignals["budget-commanders"]);
    budgetCardsOut = fromPrev.length > 0 ? fromPrev.map((r) => cardFallback(r.name, r.count)) : budgetCardsOut;
  }

  const { error: e3 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "budget-commanders",
      data: budgetCardsOut,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e3) updated++;

  const hasCmd = globalPopularCommanders.length > 0;
  const hasCardPop = globalPopularCards.length > 0;
  const hasBudget = globalBudgetCards.length > 0;
  const hasRecent = recentSetCommanders.length > 0;
  const anyExternal = hasCmd || hasCardPop || hasBudget || hasRecent;

  let pillMode: MetaSignalsPillMode = "manatap";
  if (hasCmd && hasCardPop && hasBudget) pillMode = "global";
  else if (anyExternal) pillMode = "blended";

  /** New-set commanders (Scryfall recent-year query) — only publish when list is substantial. */
  let newSetOut: LegacyCmdRow[] = [];
  if (recentSetCommanders.length >= 6) {
    newSetOut = recentSetCommanders.slice(0, 8).map((g, i) => ({
      name: g.name,
      count: i + 1,
      blendedScore: g.score,
      badge: "New" as const,
      dataScope: "blend" as const,
    }));
  } else if (Array.isArray(prevSignals["new-set-breakouts"])) {
    newSetOut = asNameCountArray(prevSignals["new-set-breakouts"]).map((r) => cmdFallback(r.name, r.count));
  }

  if (newSetOut.length > 0) {
    const { error: eNew } = await admin.from("meta_signals").upsert(
      {
        signal_type: "new-set-breakouts",
        data: newSetOut,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "signal_type" }
    );
    if (!eNew) updated++;
  }

  const cardsExternalOk =
    budgetBlend.externalOk ||
    mostPlayedCardsBlended.externalOk ||
    trendingCardsBlended.some((r) => r.dataScope === "blend");

  const { error: eLabel } = await admin.from("meta_signals").upsert(
    {
      signal_type: "discover-meta-label",
      data: {
        style: anyExternal && pillMode !== "manatap" ? "global" : "manatap",
        pillMode,
        commandersExternalOk: blendedTrend.externalOk,
        cardsExternalOk,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!eLabel) updated++;

  const finishedAt = new Date().toISOString();
  const jobDetail: MetaSignalsJobDetail = {
    ok: true,
    finishedAt,
    attemptStartedAt,
    pillMode,
    snapshotDate: todayStr,
    fallbackUsed: warnings.length > 0 && !anyExternal,
    sectionCounts: {
      "trending-commanders": trendingCommandersOut.length,
      "most-played-commanders": mostPlayedCommandersOut.length,
      "trending-cards": trendingCardsOut.length,
      "most-played-cards": mostPlayedCardsOut.length,
      "budget-commanders": budgetCardsOut.length,
      "new-set-breakouts": newSetOut.length,
    },
    sources: {
      scryfallCommanders: globalPopularCommanders.length,
      scryfallCards: globalPopularCards.length,
      scryfallBudget: globalBudgetCards.length,
      recentSetCommanders: recentSetCommanders.length,
    },
    warnings,
    yesterdayRanksAvailable: yesterdayRanks.size > 0,
  };

  await admin.from("app_config").upsert(
    { key: "job:meta-signals:detail", value: JSON.stringify(jobDetail) },
    { onConflict: "key" }
  );

  await admin.from("app_config").upsert(
    { key: "job:last:meta-signals", value: finishedAt },
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[meta-signals] fatal:", e);
    const finishedAt = new Date().toISOString();
    const failDetail: MetaSignalsJobDetail = {
      ok: false,
      finishedAt,
      attemptStartedAt,
      pillMode: "manatap",
      snapshotDate: finishedAt.slice(0, 10),
      fallbackUsed: true,
      sectionCounts: {},
      sources: {
        scryfallCommanders: 0,
        scryfallCards: 0,
        scryfallBudget: 0,
        recentSetCommanders: 0,
      },
      warnings: [],
      lastError: msg,
      yesterdayRanksAvailable: false,
    };
    await admin.from("app_config").upsert(
      { key: "job:meta-signals:detail", value: JSON.stringify(failDetail) },
      { onConflict: "key" }
    );
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
