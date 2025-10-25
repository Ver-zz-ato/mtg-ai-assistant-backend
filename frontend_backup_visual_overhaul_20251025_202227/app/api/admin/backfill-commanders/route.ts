import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/backfill-commanders
 * One-time migration to populate the commander field for existing Commander decks
 * 
 * This extracts the first card from deck_text and sets it as the commander
 * for all Commander format decks that don't have a commander set yet.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    
    // Admin check (optional - remove if you want any logged-in user to run this)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all Commander format decks without a commander
    const { data: decks, error: fetchError } = await supabase
      .from("decks")
      .select("id, deck_text, format")
      .eq("format", "Commander")
      .is("commander", null);

    if (fetchError) {
      console.error("Error fetching decks:", fetchError);
      return NextResponse.json({ 
        ok: false, 
        error: fetchError.message 
      }, { status: 500 });
    }

    if (!decks || decks.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        message: "No decks to update",
        updated: 0 
      });
    }

    console.log(`Found ${decks.length} Commander decks without commanders`);

    // Process each deck
    let updated = 0;
    const errors: string[] = [];

    for (const deck of decks) {
      try {
        // Get all cards from this deck
        const { data: deckCards } = await supabase
          .from("deck_cards")
          .select("name")
          .eq("deck_id", deck.id)
          .limit(100); // First 100 cards should include commander

        if (!deckCards || deckCards.length === 0) {
          // Fallback: try parsing deck_text
                 if (!deck.deck_text) continue;
                 
                 const lines = deck.deck_text
                   .split(/\r?\n/)
                   .map((l: string) => l.trim())
                   .filter(Boolean);

          // Try each line until we find a legendary
          for (const line of lines.slice(0, 20)) { // Check first 20 lines
            const match = line.match(/^(\d+)\s*x?\s+(.+?)\s*$/i);
            if (!match) continue;
            
            const cardName = match[2].trim();
            const isCommander = await checkIfCommander(cardName);
            
            if (isCommander) {
              const { error: updateError } = await supabase
                .from("decks")
                .update({ commander: cardName })
                .eq("id", deck.id);

              if (updateError) {
                errors.push(`${deck.id}: ${updateError.message}`);
              } else {
                updated++;
                console.log(`Updated deck ${deck.id} with commander: ${cardName}`);
              }
              break; // Found commander, move to next deck
            }
          }
          continue;
        }

        // Check each card to see if it's a commander
        for (const card of deckCards) {
          const isCommander = await checkIfCommander(card.name);
          
          if (isCommander) {
            const { error: updateError } = await supabase
              .from("decks")
              .update({ commander: card.name })
              .eq("id", deck.id);

            if (updateError) {
              errors.push(`${deck.id}: ${updateError.message}`);
            } else {
              updated++;
              console.log(`Updated deck ${deck.id} with commander: ${card.name}`);
            }
            break; // Found commander, move to next deck
          }
        }
      } catch (err: any) {
        errors.push(`${deck.id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Backfill complete`,
      totalDecks: decks.length,
      updated,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Check if a card can be a commander by querying Scryfall
 */
async function checkIfCommander(cardName: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`
    );
    
    if (!response.ok) return false;
    
    const card = await response.json();
    const typeLine = (card.type_line || '').toLowerCase();
    const oracleText = (card.oracle_text || '').toLowerCase();
    
    // Check if it's a legendary creature or planeswalker
    if (typeLine.includes('legendary creature')) return true;
    if (typeLine.includes('legendary planeswalker') && oracleText.includes('can be your commander')) return true;
    
    // Check for special commander abilities (Partner, etc.)
    if (oracleText.includes('can be your commander')) return true;
    
    return false;
  } catch {
    return false;
  }
}

