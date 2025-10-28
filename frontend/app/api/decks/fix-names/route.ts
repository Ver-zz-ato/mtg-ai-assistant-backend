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
        
        // For DFCs with identical front/back faces, always flag as needing fix
        if (isDFC) {
          const parts = deckCardName.split('//').map((p: string) => p.trim());
          const frontNorm = norm(parts[0]);
          const backNorm = norm(parts[1] || '');
          
          if (frontNorm === backNorm) {
            // DFC with same name on both faces - this is almost always wrong
            // Skip this and let it go to suggestions
            continue;
          }
        }
        
        // Try exact case-insensitive match
        const { data: exactMatch } = await supabase
          .from('scryfall_cache')
          .select('name')
          .ilike('name', deckCardName)
          .limit(1);
        
        if (exactMatch && exactMatch.length > 0) {
          const cacheNorm = norm(exactMatch[0].name);
          const deckNorm = norm(deckCardName);
          
          // For DFCs, verify it's not a duplicate/incorrect cache entry
          if (isDFC) {
            const cacheParts = exactMatch[0].name.split('//').map((p: string) => p.trim());
            const cacheFrontNorm = norm(cacheParts[0]);
            const cacheBackNorm = norm(cacheParts[1] || '');
            
            if (cacheFrontNorm === cacheBackNorm) {
              // Cache has incorrect DFC (same face twice) - need to find the right one
              // Don't mark as found
            } else if (cacheNorm === deckNorm) {
              // Valid DFC match
              cacheNameMap.set(deckNorm, exactMatch[0].name);
              continue;
            }
          } else {
            // Non-DFC - simple match
            cacheNameMap.set(deckNorm, exactMatch[0].name);
            continue;
          }
        }
        
        // For DFCs, search for the correct card by front face
        if (isDFC) {
          const frontPart = deckCardName.split('//')[0].trim();
          const { data: dfcMatches } = await supabase
            .from('scryfall_cache')
            .select('name')
            .ilike('name', `${frontPart} //%`)
            .limit(10);
          
          if (dfcMatches && dfcMatches.length > 0) {
            const frontNorm = norm(frontPart);
            
            // Prefer DFCs where front ≠ back (the correct format)
            const validDFCs = dfcMatches.filter((r: any) => {
              const cacheParts = r.name.split('//').map((p: string) => p.trim());
              const cacheFrontNorm = norm(cacheParts[0]);
              const cacheBackNorm = norm(cacheParts[1] || '');
              return cacheFrontNorm === frontNorm && cacheFrontNorm !== cacheBackNorm;
            });
            
            if (validDFCs.length > 0) {
              // Use the first valid DFC
              const bestMatch = validDFCs[0];
              
              // Check if it's different from what we have
              if (norm(bestMatch.name) !== norm(deckCardName)) {
                // Different - needs fixing, don't mark as found
              } else {
                // Exact match
                cacheNameMap.set(norm(deckCardName), bestMatch.name);
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
      
      // For DFCs, enhance suggestions by adding all valid cache variants
      const enhancedItems = await Promise.all(
        itemsWithProperNames.filter(Boolean).map(async (item: any) => {
          if (!item) return null;
          
          // Check if this is a DFC
          const isDFC = item.name.includes('//');
          if (!isDFC) return item;
          
          // Get the front face
          const frontFace = item.name.split('//')[0].trim();
          
          // Query cache for ALL DFCs with this front face
          const { data: allDFCs } = await supabase
            .from('scryfall_cache')
            .select('name')
            .ilike('name', `${frontFace} //%`)
            .limit(20);
          
          if (allDFCs && allDFCs.length > 1) {
            // Filter to only valid DFCs (front ≠ back)
            const validDFCs = allDFCs.filter((r: any) => {
              const parts = r.name.split('//').map((p: string) => p.trim());
              const frontNorm = norm(parts[0]);
              const backNorm = norm(parts[1] || '');
              return frontNorm !== backNorm && frontNorm === norm(frontFace);
            });
            
            // Add all valid variants to suggestions (deduplicate)
            const existingSuggestions = new Set(item.suggestions.map((s: string) => norm(s)));
            const newSuggestions = validDFCs
              .map((r: any) => r.name)
              .filter((name: string) => !existingSuggestions.has(norm(name)));
            
            return {
              ...item,
              suggestions: [...validDFCs.map((r: any) => r.name), ...item.suggestions.filter((s: string) => {
                // Keep non-DFC suggestions or invalid ones that weren't replaced
                const isValidDFC = validDFCs.some((r: any) => norm(r.name) === norm(s));
                return !isValidDFC;
              })]
            };
          }
          
          return item;
        })
      );
      
      const items = enhancedItems.filter(Boolean);
      return NextResponse.json({ ok:true, items });
    } catch (e:any) {
      return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
    }
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
