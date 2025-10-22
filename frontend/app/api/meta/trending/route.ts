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
    
    // Get top commanders from public decks (last 90 days for better data)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    
    let { data: decks, error: decksError } = await supabase
      .from("decks")
      .select("commander, format, created_at")
      .eq("is_public", true)
      .gte("created_at", ninetyDaysAgo);
    
    // Fallback: If no public decks, get any recent decks (for initial data)
    if (!decksError && (!decks || decks.length === 0)) {
      const { data: fallbackDecks } = await supabase
        .from("decks")
        .select("commander, format, created_at")
        .gte("created_at", ninetyDaysAgo)
        .limit(500); // Get sample of all decks
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
      
      const format = deck.format?.trim() || 'Unknown';
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

