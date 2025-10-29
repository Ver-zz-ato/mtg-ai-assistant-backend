import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = 'edge';
export const revalidate = 300; // 5 minutes

/**
 * GET /api/meta/trending
 * Returns trending commanders, popular cards, and format distribution
 * from public decks
 */
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Get top commanders from public decks (last 6 months)
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    
    let { data: decks, error: decksError } = await supabase
      .from("decks")
      .select("commander, format, created_at")
      .eq("is_public", true)
      .gte("created_at", sixMonthsAgo);
    
    // Fallback 1: If no recent public decks, get ALL public decks (no date filter)
    if (!decksError && (!decks || decks.length === 0)) {
      console.log('[Meta] No public decks in last 6 months, trying all public decks');
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

    // Sort commanders by count
    const topCommanders = Object.entries(commanderCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

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
  } catch (error: any) {
    console.error("Error in meta trending:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

