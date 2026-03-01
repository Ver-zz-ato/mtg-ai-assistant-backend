import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function norm(s: string) { 
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); 
}

export const runtime = "nodejs";

/**
 * Fast count-only endpoint for unrecognized cards
 * Used by the banner to quickly check if there are cards needing attention
 * Uses smart matching: case-insensitive + prefix matching
 */
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const deckId = sp.get('deckId');
    if (!deckId) return NextResponse.json({ ok: false, error: 'deckId required' }, { status: 400 });

    const supabase = await createClient();
    
    // Get all card names from deck
    const { data: rows } = await supabase
      .from('deck_cards')
      .select('name')
      .eq('deck_id', deckId)
      .limit(500);
    
    const cards = Array.isArray(rows) ? rows : [];
    if (cards.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    // Get unique names
    const uniqueNames = Array.from(new Set(cards.map((r: any) => r.name)));
    
    // Track which names we've found matches for
    const foundNames = new Set<string>();
    
    // First pass: exact case-insensitive matching (fast batch query)
    const batchSize = 50;
    for (let i = 0; i < uniqueNames.length; i += batchSize) {
      const batch = uniqueNames.slice(i, i + batchSize);
      
      const orConditions = batch.map(name => {
        const escaped = name.replace(/[%_]/g, '\\$&');
        return `name.ilike.${escaped}`;
      }).join(',');
      
      const { data: cacheMatches } = await supabase
        .from('scryfall_cache')
        .select('name')
        .or(orConditions);
      
      if (cacheMatches) {
        // Mark normalized versions as found
        cacheMatches.forEach((row: any) => {
          foundNames.add(norm(row.name));
        });
        // Also check if deck card name normalizes to match
        batch.forEach(deckName => {
          if (cacheMatches.some((row: any) => norm(row.name) === norm(deckName))) {
            foundNames.add(norm(deckName));
          }
        });
      }
    }
    
    // Second pass: prefix matching for remaining unmatched names
    // This catches cases like "mizzix" matching "Mizzix of the Izmagnus"
    const stillUnmatched = uniqueNames.filter(name => !foundNames.has(norm(name)));
    
    for (const name of stillUnmatched) {
      // Skip very short names (too ambiguous)
      if (name.length < 4) continue;
      
      const { data: prefixMatches } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `${name}%`)
        .limit(1);
      
      if (prefixMatches && prefixMatches.length > 0) {
        foundNames.add(norm(name));
      }
    }
    
    // Count truly unrecognized
    const unrecognizedCount = uniqueNames.filter(name => !foundNames.has(norm(name))).length;
    
    return NextResponse.json({ ok: true, count: unrecognizedCount });
  } catch (e: any) {
    console.error('[unrecognized-count] Error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
