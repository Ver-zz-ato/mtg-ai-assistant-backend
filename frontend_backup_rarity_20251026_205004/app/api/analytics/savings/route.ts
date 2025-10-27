import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/savings
 * Returns budget swap savings analytics for the current user
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's budget swap actions from activity tracking
    // This assumes you're tracking swap acceptances somewhere
    // For now, we'll create a placeholder analytics table
    const { data: swaps, error: swapsError } = await supabase
      .from("budget_swap_analytics")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (swapsError) {
      console.error("Error fetching swap analytics:", swapsError);
      // If table doesn't exist, return empty stats
      return NextResponse.json({
        ok: true,
        stats: {
          totalSaved: 0,
          swapCount: 0,
          avgSavingsPerSwap: 0,
          bestSwap: null,
          recentSwaps: [],
        },
      });
    }

    // Calculate statistics
    const totalSaved = swaps.reduce((sum, swap) => sum + (swap.savings || 0), 0);
    const swapCount = swaps.length;
    const avgSavingsPerSwap = swapCount > 0 ? totalSaved / swapCount : 0;
    
    // Find best swap
    const bestSwap = swaps.reduce((best, current) => {
      if (!best || (current.savings || 0) > (best.savings || 0)) {
        return current;
      }
      return best;
    }, null as any);

    // Get recent swaps (last 10)
    const recentSwaps = swaps.slice(0, 10).map(swap => ({
      id: swap.id,
      deckName: swap.deck_name,
      originalCard: swap.original_card,
      swappedCard: swap.swapped_card,
      savings: swap.savings,
      createdAt: swap.created_at,
    }));

    return NextResponse.json({
      ok: true,
      stats: {
        totalSaved: Math.round(totalSaved * 100) / 100,
        swapCount,
        avgSavingsPerSwap: Math.round(avgSavingsPerSwap * 100) / 100,
        bestSwap: bestSwap ? {
          originalCard: bestSwap.original_card,
          swappedCard: bestSwap.swapped_card,
          savings: bestSwap.savings,
          deckName: bestSwap.deck_name,
        } : null,
        recentSwaps,
      },
    });
  } catch (error: any) {
    console.error("Error in savings analytics:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics/savings
 * Track a budget swap acceptance
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { deck_id, deck_name, original_card, swapped_card, original_price, swapped_price } = body;

    if (!original_card || !swapped_card) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const savings = (original_price || 0) - (swapped_price || 0);

    const { data, error } = await supabase
      .from("budget_swap_analytics")
      .insert({
        user_id: user.id,
        deck_id,
        deck_name,
        original_card,
        swapped_card,
        original_price,
        swapped_price,
        savings,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error tracking swap:", error);
      // Silently fail if table doesn't exist - this is optional tracking
      return NextResponse.json({ ok: true, tracked: false });
    }

    return NextResponse.json({ ok: true, tracked: true, data });
  } catch (error: any) {
    console.error("Error tracking swap:", error);
    return NextResponse.json({ ok: true, tracked: false });
  }
}

