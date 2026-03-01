// app/api/decks/[id]/commander/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Fetches color identity for a commander card.
 * 1. First tries scryfall_cache (fast, no API calls)
 * 2. Falls back to Scryfall API if not cached (automatically caches result)
 * For partner/double-faced commanders, handles "A // B" format
 */
async function getCommanderColorIdentity(commanderName: string): Promise<string[]> {
  if (!commanderName?.trim()) return [];
  
  const cleanName = commanderName.trim();
  
  // Handle partner commanders (e.g., "Thrasios // Tymna" or "Thrasios, Triton Hero // Tymna the Weaver")
  const parts = cleanName.split(/\s*\/\/\s*/);
  const allColors = new Set<string>();
  
  try {
    // Fetch all parts (handles single commander or partners)
    const details = await getDetailsForNamesCached(parts);
    
    for (const part of parts) {
      const key = norm(part);
      const cardData = details.get(key);
      if (cardData?.color_identity && Array.isArray(cardData.color_identity)) {
        cardData.color_identity.forEach((c: string) => allColors.add(c.toUpperCase()));
      }
    }
    
    // Return in WUBRG order for consistency
    const wubrgOrder = ['W', 'U', 'B', 'R', 'G'];
    return wubrgOrder.filter(c => allColors.has(c));
  } catch (error) {
    console.error('[Commander] Failed to fetch color identity:', error);
    return [];
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { commander } = body;

    if (typeof commander !== 'string') {
      return NextResponse.json({ ok: false, error: "Commander must be a string" }, { status: 400 });
    }

    // Verify deck ownership
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('user_id')
      .eq('id', id)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
    }

    if (deck.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const trimmedCommander = commander.trim() || null;
    
    // Fetch commander's color identity (from cache first, then Scryfall API fallback)
    let colors: string[] = [];
    if (trimmedCommander) {
      colors = await getCommanderColorIdentity(trimmedCommander);
    }

    // Update commander AND colors together
    const { error: updateError } = await supabase
      .from('decks')
      .update({ 
        commander: trimmedCommander,
        colors: colors.length > 0 ? colors : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('Failed to update commander:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, colors });
  } catch (error: any) {
    console.error('Error updating commander:', error);
    return NextResponse.json({ ok: false, error: error.message || "Server error" }, { status: 500 });
  }
}
