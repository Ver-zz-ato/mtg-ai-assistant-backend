import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function norm(s: string) { return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const deckId = sp.get('deckId');
    if (!deckId) return NextResponse.json({ ok:false, error:'deckId required' }, { status:400 });

    const supabase = await createClient();
    const { data: rows } = await supabase
      .from('deck_cards')
      .select('id, name')
      .eq('deck_id', deckId)
      .limit(1000);
    const cards = Array.isArray(rows) ? rows as any[] : [];

    // Find names not present in scryfall_cache
    const names = Array.from(new Set(cards.map(r=>r.name)));
    
    // Check which names exist in cache using case-insensitive matching
    // Build a map of normalized name -> proper cache name for later correction
    const cacheNameMap = new Map<string, string>(); // normalized -> actual cache name
    const batchSize = 50; // Smaller batches for case-insensitive queries
    
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      
      for (const deckCardName of batch) {
        const isDFC = deckCardName.includes('//');
        
        // Try exact case-insensitive match first
        const { data: exactMatch } = await supabase
          .from('scryfall_cache')
          .select('name')
          .ilike('name', deckCardName)
          .limit(1);
        
        if (exactMatch && exactMatch.length > 0) {
          // For DFCs, verify the full name matches (including back face)
          const cacheNorm = norm(exactMatch[0].name);
          const deckNorm = norm(deckCardName);
          
          if (cacheNorm === deckNorm) {
            // Perfect match (accounting for case)
            cacheNameMap.set(deckNorm, exactMatch[0].name);
            continue;
          } else if (isDFC) {
            // DFC with mismatched back face - need to fix it
            // Don't mark as found, let it go to suggestions
          } else {
            // Non-DFC with case difference only
            cacheNameMap.set(deckNorm, exactMatch[0].name);
            continue;
          }
        }
        
        // For DFCs, try to find the correct full card by front face
        if (isDFC) {
          const frontPart = deckCardName.split('//')[0].trim();
          const { data: dfcMatches } = await supabase
            .from('scryfall_cache')
            .select('name')
            .ilike('name', `${frontPart} //%`) // Front face followed by //
            .limit(10);
          
          if (dfcMatches && dfcMatches.length > 0) {
            // Find the best DFC match
            // Prefer exact front face match (case-insensitive)
            const frontNorm = norm(frontPart);
            const bestMatch = dfcMatches.find((r: any) => {
              const cacheFront = r.name.split('//')[0].trim();
              return norm(cacheFront) === frontNorm;
            });
            
            if (bestMatch) {
              // Check if it's the same as what we have (normalized)
              if (norm(bestMatch.name) === norm(deckCardName)) {
                // Same card, just need capitalization fix
                cacheNameMap.set(norm(deckCardName), bestMatch.name);
              } else {
                // Different back face - this needs fixing, don't mark as found
              }
            }
          }
        }
      }
    }

    // Filter cards that don't have matches in cache
    const unknown = cards.filter(r => !cacheNameMap.has(norm(r.name)));
    
    if (unknown.length === 0) return NextResponse.json({ ok:true, items: [] });

    // Ask fuzzy endpoint for suggestions in batch (limit to 50 distinct names)
    const uniq = Array.from(new Set(unknown.map(r=>r.name))).slice(0,50);
    // Call fuzzy handler directly to avoid network TLS/proxy issues
    try {
      const { POST: fuzzy } = await import("@/app/api/cards/fuzzy/route");
      const fuzzyReq = new (await import('next/server')).NextRequest(new URL('/api/cards/fuzzy', req.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' } as any,
        body: JSON.stringify({ names: uniq }),
      } as any);
      const fuzzyRes = await fuzzy(fuzzyReq);
      const j:any = await fuzzyRes.json().catch(()=>({}));
      const map = j?.results || {};

      // For each suggestion, look up the proper cache name to ensure correct capitalization
      const itemsWithProperNames = await Promise.all(
        unknown.map(async (r) => {
          const all: string[] = Array.isArray(map[r.name]?.all) ? map[r.name].all : [];
          if (all.length === 0) return null as any;
          
          // Look up each suggestion in cache to get proper capitalization
          const properSuggestions: string[] = [];
          for (const suggestion of all.slice(0, 10)) { // Limit to top 10 suggestions
            const { data: cacheMatch } = await supabase
              .from('scryfall_cache')
              .select('name')
              .ilike('name', suggestion)
              .limit(1);
            
            if (cacheMatch && cacheMatch.length > 0) {
              properSuggestions.push(cacheMatch[0].name);
            } else {
              // Fallback to fuzzy suggestion if not in cache
              properSuggestions.push(suggestion);
            }
          }
          
          return { id: r.id, name: r.name, suggestions: properSuggestions };
        })
      );
      
      const items = itemsWithProperNames.filter(Boolean);
      return NextResponse.json({ ok:true, items });
    } catch (e:any) {
      return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
    }
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
