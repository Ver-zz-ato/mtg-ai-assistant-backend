import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function norm(s: string) { return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const collectionId = sp.get('collectionId');
    if (!collectionId) return NextResponse.json({ ok:false, error:'collectionId required' }, { status:400 });

    const supabase = await createClient();
    const { data: rows } = await supabase
      .from('collection_cards')
      .select('id, name')
      .eq('collection_id', collectionId)
      .limit(1000);
    const cards = Array.isArray(rows) ? rows as any[] : [];

    // Find names not present in scryfall_cache
    const names = Array.from(new Set(cards.map(r=>r.name)));
    
    // Check which names exist in cache using case-insensitive matching
    const cacheNameMap = new Map<string, string>();
    const batchSize = 50;
    
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      
      for (const cardName of batch) {
        const isDFC = cardName.includes('//');
        
        // For DFCs with identical front/back faces, always flag as needing fix
        if (isDFC) {
          const parts = cardName.split('//').map((p: string) => p.trim());
          const frontNorm = norm(parts[0]);
          const backNorm = norm(parts[1] || '');
          
          if (frontNorm === backNorm) {
            continue; // Skip this and let it go to suggestions
          }
        }
        
        // Try exact case-insensitive match
        const { data: exactMatch } = await supabase
          .from('scryfall_cache')
          .select('name')
          .ilike('name', cardName)
          .limit(1);
        
        if (exactMatch && exactMatch.length > 0) {
          const cacheNorm = norm(exactMatch[0].name);
          const deckNorm = norm(cardName);
          
          // For DFCs, verify it's not a duplicate/incorrect cache entry
          if (isDFC) {
            const cacheParts = exactMatch[0].name.split('//').map((p: string) => p.trim());
            const cacheFrontNorm = norm(cacheParts[0]);
            const cacheBackNorm = norm(cacheParts[1] || '');
            
            if (cacheFrontNorm === cacheBackNorm) {
              // Cache has incorrect DFC - don't mark as found
            } else if (cacheNorm === deckNorm) {
              cacheNameMap.set(deckNorm, exactMatch[0].name);
              continue;
            }
          } else {
            cacheNameMap.set(deckNorm, exactMatch[0].name);
            continue;
          }
        }
        
        // For DFCs, search for the correct card by front face
        if (isDFC) {
          const frontPart = cardName.split('//')[0].trim();
          const { data: dfcMatches } = await supabase
            .from('scryfall_cache')
            .select('name')
            .ilike('name', `${frontPart} //%`)
            .limit(10);
          
          if (dfcMatches && dfcMatches.length > 0) {
            const frontNorm = norm(frontPart);
            
            // Prefer DFCs where front ≠ back
            const validDFCs = dfcMatches.filter((r: any) => {
              const cacheParts = r.name.split('//').map((p: string) => p.trim());
              const cacheFrontNorm = norm(cacheParts[0]);
              const cacheBackNorm = norm(cacheParts[1] || '');
              return cacheFrontNorm === frontNorm && cacheFrontNorm !== cacheBackNorm;
            });
            
            if (validDFCs.length > 0) {
              const bestMatch = validDFCs[0];
              if (norm(bestMatch.name) !== norm(cardName)) {
                // Different - needs fixing
              } else {
                cacheNameMap.set(norm(cardName), bestMatch.name);
              }
            }
          }
        }
      }
    }

    // Filter cards that don't have matches in cache
    const unknown = cards.filter(r => !cacheNameMap.has(norm(r.name)));
    
    if (unknown.length === 0) return NextResponse.json({ ok:true, items: [] });

    // Ask fuzzy endpoint for suggestions
    try {
      const { POST: fuzzy } = await import("@/app/api/cards/fuzzy/route");
      const fuzzyReq = new (await import('next/server')).NextRequest(new URL('/api/cards/fuzzy', req.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' } as any,
        body: JSON.stringify({ names: Array.from(new Set(unknown.map(r=>r.name))).slice(0,50) }),
      } as any);
      const fuzzyRes = await fuzzy(fuzzyReq);
      const j:any = await fuzzyRes.json().catch(()=>({}));
      const map = j?.results || {};

      // For each suggestion, look up the proper cache name
      const itemsWithProperNames = await Promise.all(
        unknown.map(async (r) => {
          const all: string[] = Array.isArray(map[r.name]?.all) ? map[r.name].all : [];
          if (all.length === 0) return null as any;
          
          const properSuggestions: string[] = [];
          for (const suggestion of all.slice(0, 10)) {
            const { data: cacheMatch } = await supabase
              .from('scryfall_cache')
              .select('name')
              .ilike('name', suggestion)
              .limit(1);
            
            if (cacheMatch && cacheMatch.length > 0) {
              properSuggestions.push(cacheMatch[0].name);
            } else {
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
          
          const isDFC = item.name.includes('//');
          if (!isDFC) return item;
          
          const frontFace = item.name.split('//')[0].trim();
          
          // Query cache for ALL DFCs with this front face
          const { data: allDFCs } = await supabase
            .from('scryfall_cache')
            .select('name')
            .ilike('name', `${frontFace} //%`)
            .limit(20);
          
          if (allDFCs && allDFCs.length > 1) {
            const validDFCs = allDFCs.filter((r: any) => {
              const parts = r.name.split('//').map((p: string) => p.trim());
              const frontNorm = norm(parts[0]);
              const backNorm = norm(parts[1] || '');
              return frontNorm !== backNorm && frontNorm === norm(frontFace);
            });
            
            return {
              ...item,
              suggestions: [...validDFCs.map((r: any) => r.name), ...item.suggestions.filter((s: string) => {
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

