import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { MetaLabelPayload } from "@/lib/meta/freshness";
import {
  buildCommanderMetaShadowReport,
  fetchApprovedExternalCommanderProfiles,
  readPublicCommanderExternalMetaFlags,
} from "@/lib/meta/publicCommanderExternalBlend";

export const runtime = 'edge';
export const revalidate = 300; // 5 minutes

type CommanderRow = {
  name: string;
  count?: number;
};

type CardRow = {
  name: string;
  count?: number;
};

function toSlug(n: string) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseCommanderRows(data: unknown): CommanderRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is CommanderRow => !!row && typeof row === "object" && typeof (row as { name?: unknown }).name === "string")
    .map((row) => ({
      name: row.name.trim(),
      count: typeof row.count === "number" ? row.count : 0,
    }))
    .filter((row) => row.name.length > 0);
}

function parseCardRows(data: unknown): CardRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is CardRow => !!row && typeof row === "object" && typeof (row as { name?: unknown }).name === "string")
    .map((row) => ({
      name: row.name.trim(),
      count: typeof row.count === "number" ? row.count : 0,
    }))
    .filter((row) => row.name.length > 0);
}

function getExternalMetaAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

async function logCommanderExternalMetaShadowReport(
  trendingCommanders: CommanderRow[],
  mostPlayedCommanders: CommanderRow[]
) {
  try {
    const admin = getExternalMetaAdminClient();
    if (!admin) return;
    const flags = await readPublicCommanderExternalMetaFlags(admin);
    if (!flags.apiMetaTrendingShadow) return;

    const names = [
      ...trendingCommanders.map((row) => row.name),
      ...mostPlayedCommanders.map((row) => row.name),
    ];
    const profiles = await fetchApprovedExternalCommanderProfiles(admin, names);
    const trendingBase = trendingCommanders.map((row, index) => ({ ...row, rank: index + 1 }));
    const mostPlayedBase = mostPlayedCommanders.map((row, index) => ({ ...row, rank: index + 1 }));
    const report = {
      surface: "/api/meta/trending",
      generatedAt: new Date().toISOString(),
      trendingCommanders: buildCommanderMetaShadowReport(trendingBase, profiles, flags.weight),
      mostPlayedCommanders: buildCommanderMetaShadowReport(mostPlayedBase, profiles, flags.weight),
    };
    console.info("[public-external-meta-shadow]", JSON.stringify(report));
  } catch (error) {
    console.warn("[public-external-meta-shadow] skipped", error instanceof Error ? error.message : "unknown_error");
  }
}

/**
 * GET /api/meta/trending
 * Returns trending commanders, popular cards, and format distribution
 * from public decks
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const url = new URL(request.url);
    const windowParam = url.searchParams.get("window");
    const useToday = windowParam === "today";

    const { data: metaRows, error: metaError } = await supabase
      .from("meta_signals")
      .select("signal_type, data, updated_at")
      .in("signal_type", [
        "trending-commanders",
        "most-played-commanders",
        "trending-cards",
        "discover-meta-label",
      ]);

    if (!metaError && Array.isArray(metaRows) && metaRows.length > 0) {
      let trendingCommanders: CommanderRow[] = [];
      let mostPlayedCommanders: CommanderRow[] = [];
      let trendingCards: CardRow[] = [];
      let labelPayload: MetaLabelPayload | null = null;
      let lastUpdated: string | null = null;

      for (const row of metaRows) {
        const signalType = (row as { signal_type?: string }).signal_type;
        const data = (row as { data?: unknown }).data;
        const updatedAt = (row as { updated_at?: string | null }).updated_at ?? null;
        if (updatedAt && (!lastUpdated || updatedAt > lastUpdated)) lastUpdated = updatedAt;

        if (signalType === "trending-commanders") {
          trendingCommanders = parseCommanderRows(data);
        } else if (signalType === "most-played-commanders") {
          mostPlayedCommanders = parseCommanderRows(data);
        } else if (signalType === "trending-cards") {
          trendingCards = parseCardRows(data);
        } else if (
          signalType === "discover-meta-label" &&
          data &&
          typeof data === "object" &&
          !Array.isArray(data)
        ) {
          labelPayload = data as MetaLabelPayload;
        }
      }

      const primaryCommanders = useToday ? trendingCommanders : mostPlayedCommanders;
      const totalDecks = mostPlayedCommanders.reduce(
        (sum, row) => sum + (typeof row.count === "number" ? row.count : 0),
        0,
      );
      await logCommanderExternalMetaShadowReport(trendingCommanders, mostPlayedCommanders);

      if (
        primaryCommanders.length > 0 ||
        trendingCommanders.length > 0 ||
        mostPlayedCommanders.length > 0 ||
        trendingCards.length > 0
      ) {
        return NextResponse.json(
          {
            ok: true,
            topCommanders: primaryCommanders.slice(0, useToday ? 12 : 10).map((row) => ({
              name: row.name,
              count: row.count ?? 0,
              slug: toSlug(row.name),
            })),
            trendingCommanders: trendingCommanders.slice(0, 10).map((row) => ({
              name: row.name,
              count: row.count ?? 0,
              slug: toSlug(row.name),
            })),
            mostPlayedCommanders: mostPlayedCommanders.slice(0, 10).map((row) => ({
              name: row.name,
              count: row.count ?? 0,
              slug: toSlug(row.name),
            })),
            popularCards: trendingCards.slice(0, 10).map((row) => ({
              name: row.name,
              count: row.count ?? 0,
            })),
            formatDistribution: {},
            totalDecks,
            lastUpdated,
            labelPayload,
          },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
            }
          }
        );
      }
    }

    // Prefer "today" for homepage strip; fallback to 6 months
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartIso = todayStart.toISOString();

    const fromDate = useToday ? todayStartIso : sixMonthsAgo;

    const { data: initialDecks, error: decksError } = await supabase
      .from("decks")
      .select("commander, format, created_at")
      .eq("is_public", true)
      .gte("created_at", fromDate);
    let decks = initialDecks;
    
    // Fallback 1: If no recent public decks (or today empty), try 6-month window then all public
    if (!decksError && (!decks || decks.length === 0) && useToday) {
      const { data: sixMonthDecks } = await supabase
        .from("decks")
        .select("commander, format, created_at")
        .eq("is_public", true)
        .gte("created_at", sixMonthsAgo);
      decks = sixMonthDecks;
    }
    if (!decksError && (!decks || decks.length === 0)) {
      console.log('[Meta] No public decks in window, trying all public decks');
      const { data: allPublicDecks } = await supabase
        .from("decks")
        .select("commander, format, created_at")
        .eq("is_public", true)
        .limit(1000);
      decks = allPublicDecks;
    }
    
    // Fallback 2: If still no public decks, get sample of any decks (for bootstrap)
    if (!decksError && (!decks || decks.length === 0)) {
      console.log('[Meta] No public decks at all, using any decks as sample');
      const { data: fallbackDecks } = await supabase
        .from("decks")
        .select("commander, format, created_at")
        .limit(500);
      decks = fallbackDecks;
    }

    if (decksError) {
      console.error("Error fetching decks:", decksError);
      return NextResponse.json({
        ok: true,
        topCommanders: [],
        formatDistribution: {},
        totalDecks: 0,
      });
    }

    // Count commanders
    const commanderCounts: Record<string, number> = {};
    const formatCounts: Record<string, number> = {};
    
    if (!decks) decks = []; // Null check for TypeScript
    
    decks.forEach((deck) => {
      const commander = deck.commander?.trim();
      if (commander) {
        commanderCounts[commander] = (commanderCounts[commander] || 0) + 1;
      }
      
      // Normalize format to title case (Commander, not commander)
      const rawFormat = deck.format?.trim() || 'Unknown';
      const format = rawFormat.charAt(0).toUpperCase() + rawFormat.slice(1).toLowerCase();
      formatCounts[format] = (formatCounts[format] || 0) + 1;
    });

    const topCommanders = Object.entries(commanderCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count, slug: toSlug(name) }));

    // Get most added cards (from recent deck_cards)
    const { data: cards, error: cardsError } = await supabase
      .from("deck_cards")
      .select("name, deck_id")
      .limit(10000); // Sample recent cards

    const cardCounts: Record<string, number> = {};
    if (!cardsError && cards) {
      cards.forEach((card) => {
        const name = card.name?.trim();
        if (name) {
          cardCounts[name] = (cardCounts[name] || 0) + 1;
        }
      });
    }

    const popularCards = Object.entries(cardCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      ok: true,
      topCommanders,
      popularCards,
      formatDistribution: formatCounts,
      totalDecks: decks.length,
      lastUpdated: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (error: unknown) {
    console.error("Error in meta trending:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
