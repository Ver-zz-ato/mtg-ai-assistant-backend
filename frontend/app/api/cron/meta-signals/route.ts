import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { getCommanderBySlug } from "@/lib/commanders";

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

  // trending-cards: most appearances in decks created/updated last 30 days
  const { data: recentDeckIds } = await admin
    .from("decks")
    .select("id")
    .eq("is_public", true)
    .eq("format", "Commander")
    .or(`created_at.gte.${iso30},updated_at.gte.${iso30}`);

  const recentIds = (recentDeckIds ?? []).map((d) => d.id);
  const cardCountsTrending: Record<string, number> = {};

  if (recentIds.length > 0) {
    const { data: recentCards } = await admin
      .from("deck_cards")
      .select("name")
      .in("deck_id", recentIds.slice(0, 500));
    for (const c of recentCards ?? []) {
      const n = (c.name as string)?.trim();
      if (n) cardCountsTrending[n] = (cardCountsTrending[n] ?? 0) + 1;
    }
  }
  const trendingCards = Object.entries(cardCountsTrending)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }));

  const { error: e4 } = await admin.from("meta_signals").upsert(
    {
      signal_type: "trending-cards",
      data: trendingCards,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "signal_type" }
  );
  if (!e4) updated++;

  // most-played-cards: most appearances across all public decks
  const { data: allDeckIds } = await admin
    .from("decks")
    .select("id")
    .eq("is_public", true)
    .eq("format", "Commander")
    .limit(1000);

  const allIds = (allDeckIds ?? []).map((d) => d.id);
  const cardCountsAll: Record<string, number> = {};

  if (allIds.length > 0) {
    const { data: allCards } = await admin
      .from("deck_cards")
      .select("name")
      .in("deck_id", allIds);
    for (const c of allCards ?? []) {
      const n = (c.name as string)?.trim();
      if (n) cardCountsAll[n] = (cardCountsAll[n] ?? 0) + 1;
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

  return NextResponse.json({
    ok: true,
    updated,
    signal_types: SIGNAL_TYPES.length,
  });
}
