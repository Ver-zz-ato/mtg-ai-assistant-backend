import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanCardName, stringSimilarity } from "@/lib/deck/cleanCardName";

function norm(s: string) { 
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[''`´]/g, "'").replace(/\s+/g,' ').trim(); 
}

export const runtime = "nodejs";

/**
 * Fast count-only endpoint for unrecognized cards
 * Used by the banner to quickly check if there are cards needing attention
 * Uses multi-pass matching: exact, cleaned, prefix, contains, DFC
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
    
    // ===== PASS 1: Exact case-insensitive matching (fast batch query) =====
    const batchSize = 100;
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
        cacheMatches.forEach((row: any) => {
          foundNames.add(norm(row.name));
        });
        batch.forEach(deckName => {
          if (cacheMatches.some((row: any) => norm(row.name) === norm(deckName))) {
            foundNames.add(norm(deckName));
          }
        });
      }
    }
    
    let unmatched = uniqueNames.filter(name => !foundNames.has(norm(name)));
    
    // ===== PASS 2: Clean names and try exact match =====
    for (const name of unmatched) {
      if (foundNames.has(norm(name))) continue;
      
      const cleaned = cleanCardName(name);
      if (cleaned !== name) {
        const escaped = cleaned.replace(/[%_]/g, '\\$&');
        const { data: match } = await supabase
          .from('scryfall_cache')
          .select('name')
          .ilike('name', escaped)
          .limit(1);
        
        if (match && match.length > 0) {
          foundNames.add(norm(name));
        }
      }
    }
    
    unmatched = uniqueNames.filter(name => !foundNames.has(norm(name)));
    
    // ===== PASS 3: Prefix matching =====
    for (const name of unmatched) {
      if (foundNames.has(norm(name))) continue;
      if (name.length < 3) continue;
      
      const cleaned = cleanCardName(name);
      const escaped = cleaned.replace(/[%_]/g, '\\$&');
      const { data: prefixMatches } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `${escaped}%`)
        .limit(1);
      
      if (prefixMatches && prefixMatches.length > 0) {
        foundNames.add(norm(name));
      }
    }
    
    unmatched = uniqueNames.filter(name => !foundNames.has(norm(name)));
    
    // ===== PASS 4: Contains matching (for partial names) =====
    for (const name of unmatched) {
      if (foundNames.has(norm(name))) continue;
      if (name.length < 5) continue;
      
      const cleaned = cleanCardName(name);
      const escaped = cleaned.replace(/[%_]/g, '\\$&');
      const { data: containsMatches } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `%${escaped}%`)
        .limit(3);
      
      if (containsMatches && containsMatches.length === 1) {
        foundNames.add(norm(name));
      } else if (containsMatches && containsMatches.length > 1) {
        // Multiple matches - check if any is a good similarity match
        const best = containsMatches
          .map(m => ({ name: m.name, score: stringSimilarity(cleaned, m.name) }))
          .sort((a, b) => b.score - a.score)[0];
        
        if (best && best.score > 0.6) {
          foundNames.add(norm(name));
        }
      }
    }
    
    unmatched = uniqueNames.filter(name => !foundNames.has(norm(name)));
    
    // ===== PASS 5: DFC front-face matching =====
    for (const name of unmatched) {
      if (foundNames.has(norm(name))) continue;
      
      const cleaned = cleanCardName(name);
      const escaped = cleaned.replace(/[%_]/g, '\\$&');
      const { data: dfcMatch } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `${escaped} // %`)
        .limit(1);
      
      if (dfcMatch && dfcMatch.length > 0) {
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
