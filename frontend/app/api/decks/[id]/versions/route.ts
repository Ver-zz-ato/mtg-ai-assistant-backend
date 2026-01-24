import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/decks/[id]/versions
 * Get all versions for a deck (Pro feature)
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { id: deckId } = await context.params;
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if deck exists and user owns it
    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("user_id, title")
      .eq("id", deckId)
      .single();

    if (deckError || !deck) {
      return NextResponse.json(
        { ok: false, error: "Deck not found" },
        { status: 404 }
      );
    }

    if (deck.user_id !== user.id) {
      return NextResponse.json(
        { ok: false, error: "Not your deck" },
        { status: 403 }
      );
    }

    // Check Pro status (single source of truth: profiles.is_pro)
    // Use standardized Pro check that checks both database and metadata
    const { checkProStatus } = await import('@/lib/server-pro-check');
    const isPro = await checkProStatus(user.id);

    if (!isPro) {
      return NextResponse.json(
        { ok: false, error: "Deck versions are a Pro feature. Upgrade to unlock version history!" },
        { status: 403 }
      );
    }

    // Get versions
    const { data: versions, error: versionsError } = await supabase
      .from("deck_versions")
      .select("*")
      .eq("deck_id", deckId)
      .order("version_number", { ascending: false });

    if (versionsError) {
      console.error("Error fetching versions:", versionsError);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch versions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      versions: versions || [],
      count: versions?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in versions GET:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/decks/[id]/versions
 * Create a new version snapshot (Pro feature)
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { id: deckId } = await context.params;
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check Pro status (single source of truth: profiles.is_pro)
    // Use standardized Pro check that checks both database and metadata
    const { checkProStatus } = await import('@/lib/server-pro-check');
    const isPro = await checkProStatus(user.id);

    if (!isPro) {
      return NextResponse.json(
        { ok: false, error: "Deck versions are a Pro feature. Upgrade to unlock version history!" },
        { status: 403 }
      );
    }

    // Check if deck exists and user owns it
    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("user_id, deck_text")
      .eq("id", deckId)
      .single();

    if (deckError || !deck) {
      return NextResponse.json(
        { ok: false, error: "Deck not found" },
        { status: 404 }
      );
    }

    if (deck.user_id !== user.id) {
      return NextResponse.json(
        { ok: false, error: "Not your deck" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { changes_summary } = body;

    // Rebuild deck_text from deck_cards table to ensure it's up-to-date
    const { data: cards } = await supabase
      .from("deck_cards")
      .select("name, qty")
      .eq("deck_id", deckId);

    let currentDeckText = '';
    let cardCount = 0;
    if (cards && cards.length > 0) {
      currentDeckText = cards.map(c => `${c.qty} ${c.name}`).join('\n');
      cardCount = cards.length;
    }

    console.log(`[Version Save] Rebuilding deck_text from ${cards?.length || 0} cards in deck_cards table`);

    // Update deck_text in decks table for consistency
    await supabase
      .from("decks")
      .update({ deck_text: currentDeckText })
      .eq("id", deckId);

    // Get current highest version number
    const { data: latestVersion } = await supabase
      .from("deck_versions")
      .select("version_number")
      .eq("deck_id", deckId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;

    // Insert new version with rebuilt deck_text
    const { data: version, error: insertError } = await supabase
      .from("deck_versions")
      .insert({
        deck_id: deckId,
        version_number: nextVersionNumber,
        deck_text: currentDeckText,
        changes_summary: changes_summary || `Version ${nextVersionNumber}`,
        card_count: cardCount,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating version:", insertError);
      return NextResponse.json(
        { ok: false, error: "Failed to create version" },
        { status: 500 }
      );
    }

    // Keep only last 10 versions for Pro users (unlimited is future enhancement)
    const { data: allVersions } = await supabase
      .from("deck_versions")
      .select("id")
      .eq("deck_id", deckId)
      .order("version_number", { ascending: false });

    if (allVersions && allVersions.length > 10) {
      const toDelete = allVersions.slice(10).map(v => v.id);
      await supabase
        .from("deck_versions")
        .delete()
        .in("id", toDelete);
    }

    return NextResponse.json({
      ok: true,
      version,
    });
  } catch (error: any) {
    console.error("Error in versions POST:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/decks/[id]/versions?versionId=...
 * Restore a deck to a previous version (Pro feature)
 */
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { id: deckId } = await context.params;
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check Pro status (single source of truth: profiles.is_pro)
    // Use standardized Pro check that checks both database and metadata
    const { checkProStatus } = await import('@/lib/server-pro-check');
    const isPro = await checkProStatus(user.id);

    if (!isPro) {
      return NextResponse.json(
        { ok: false, error: "Deck versions are a Pro feature. Upgrade to unlock version history!" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get('versionId');

    if (!versionId) {
      return NextResponse.json(
        { ok: false, error: "versionId required" },
        { status: 400 }
      );
    }

    // Get version
    const { data: version, error: versionError } = await supabase
      .from("deck_versions")
      .select("deck_text, version_number")
      .eq("id", versionId)
      .eq("deck_id", deckId)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { ok: false, error: "Version not found" },
        { status: 404 }
      );
    }

    // Update deck with version's deck_text
    const { error: updateError } = await supabase
      .from("decks")
      .update({ 
        deck_text: version.deck_text,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deckId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error restoring version:", updateError);
      return NextResponse.json(
        { ok: false, error: "Failed to restore version" },
        { status: 500 }
      );
    }

    // Reparse the deck_text into deck_cards table
    try {
      console.log('[Version Restore] Starting deck_cards update for deck:', deckId);
      
      // Delete existing deck_cards
      const { error: deleteError } = await supabase
        .from("deck_cards")
        .delete()
        .eq("deck_id", deckId);
      
      if (deleteError) {
        console.error('[Version Restore] Error deleting existing cards:', deleteError);
        throw deleteError;
      }
      
      console.log('[Version Restore] Deleted existing cards, parsing deck_text...');

      // Parse deck_text and insert new cards
      const lines = (version.deck_text || '').split('\n').filter((l: string) => l.trim());
      const cards: { deck_id: string; name: string; qty: number }[] = [];
      
      for (const line of lines) {
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (match) {
          const qty = parseInt(match[1]);
          const name = match[2].trim();
          if (name && qty > 0) {
            cards.push({ deck_id: deckId, name, qty });
          }
        }
      }

      console.log(`[Version Restore] Parsed ${cards.length} cards from deck_text`);

      if (cards.length > 0) {
        const { error: insertError } = await supabase.from("deck_cards").insert(cards);
        if (insertError) {
          console.error('[Version Restore] Error inserting cards:', insertError);
          throw insertError;
        }
        console.log('[Version Restore] Successfully inserted cards');
      } else {
        console.warn('[Version Restore] No cards to insert!');
      }
    } catch (e) {
      console.error("[Version Restore] Fatal error updating deck_cards:", e);
      return NextResponse.json(
        { ok: false, error: "Failed to restore deck cards" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Restored to version ${version.version_number}`,
    });
  } catch (error: any) {
    console.error("Error in versions PUT:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

