import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanCardName, stringSimilarity } from "@/lib/deck/cleanCardName";

function norm(s: string) { 
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[''`´]/g, "'").replace(/\s+/g,' ').trim(); 
}

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

    if (cards.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Get unique card names
    const names = Array.from(new Set(cards.map(r => r.name)));
    
    // Multi-pass matching strategy (same as import flow)
    const cacheNameMap = new Map<string, string>(); // normalized -> actual cache name
    
    // ===== PASS 1: Exact case-insensitive matches (batch query) =====
    const batchSize = 100;
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      
      const orConditions = batch.map(name => {
        const escaped = name.replace(/[%_]/g, '\\$&');
        return `name.ilike.${escaped}`;
      }).join(',');
      
      const { data: exactMatches } = await supabase
        .from('scryfall_cache')
        .select('name')
        .or(orConditions);
      
      if (exactMatches) {
        for (const row of exactMatches) {
          cacheNameMap.set(norm(row.name), row.name);
        }
      }
    }
    
    // Check what's still unmatched
    let unmatched = names.filter(name => !cacheNameMap.has(norm(name)));
    
    // ===== PASS 2: Clean the name and try again =====
    // The stored name might have artifacts that weren't cleaned on import
    for (const cardName of unmatched) {
      if (cacheNameMap.has(norm(cardName))) continue;
      
      const cleaned = cleanCardName(cardName);
      if (cleaned !== cardName) {
        const escaped = cleaned.replace(/[%_]/g, '\\$&');
        const { data: cleanedMatch } = await supabase
          .from('scryfall_cache')
          .select('name')
          .ilike('name', escaped)
          .limit(1);
        
        if (cleanedMatch && cleanedMatch.length > 0) {
          cacheNameMap.set(norm(cardName), cleanedMatch[0].name);
        }
      }
    }
    
    unmatched = names.filter(name => !cacheNameMap.has(norm(name)));
    
    // ===== PASS 3: Prefix matching =====
    for (const cardName of unmatched) {
      if (cacheNameMap.has(norm(cardName))) continue;
      if (cardName.length < 3) continue;
      
      const cleaned = cleanCardName(cardName);
      const escaped = cleaned.replace(/[%_]/g, '\\$&');
      const { data: prefixMatch } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `${escaped}%`)
        .limit(5);
      
      if (prefixMatch && prefixMatch.length > 0) {
        const exactLen = prefixMatch.find(m => norm(m.name).length === norm(cleaned).length);
        cacheNameMap.set(norm(cardName), exactLen?.name || prefixMatch[0].name);
      }
    }
    
    unmatched = names.filter(name => !cacheNameMap.has(norm(name)));
    
    // ===== PASS 4: Contains matching =====
    for (const cardName of unmatched) {
      if (cacheNameMap.has(norm(cardName))) continue;
      if (cardName.length < 5) continue;
      
      const cleaned = cleanCardName(cardName);
      const escaped = cleaned.replace(/[%_]/g, '\\$&');
      const { data: containsMatch } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `%${escaped}%`)
        .limit(5);
      
      if (containsMatch && containsMatch.length === 1) {
        cacheNameMap.set(norm(cardName), containsMatch[0].name);
      } else if (containsMatch && containsMatch.length > 1) {
        const best = containsMatch
          .map(m => ({ name: m.name, score: stringSimilarity(cleaned, m.name) }))
          .sort((a, b) => b.score - a.score)[0];
        
        if (best && best.score > 0.6) {
          cacheNameMap.set(norm(cardName), best.name);
        }
      }
    }
    
    unmatched = names.filter(name => !cacheNameMap.has(norm(name)));
    
    // ===== PASS 5: DFC front-face matching =====
    for (const cardName of unmatched) {
      if (cacheNameMap.has(norm(cardName))) continue;
      
      const cleaned = cleanCardName(cardName);
      const escaped = cleaned.replace(/[%_]/g, '\\$&');
      const { data: dfcMatch } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `${escaped} // %`)
        .limit(3);
      
      if (dfcMatch && dfcMatch.length > 0) {
        const best = dfcMatch
          .map(m => ({ name: m.name, score: stringSimilarity(cleaned, m.name.split('//')[0].trim()) }))
          .sort((a, b) => b.score - a.score)[0];
        
        if (best) {
          cacheNameMap.set(norm(cardName), best.name);
        }
      }
    }

    // Filter cards that still don't have matches in cache
    const unknown = cards.filter(r => !cacheNameMap.has(norm(r.name)));
    
    if (unknown.length === 0) return NextResponse.json({ ok:true, items: [] });

    // Ask fuzzy endpoint for suggestions (limit to 50 distinct names)
    const uniq = Array.from(new Set(unknown.map(r=>r.name))).slice(0,50);
    
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
      
      // For DFCs, enhance suggestions
      const enhancedItems = await Promise.all(
        itemsWithProperNames.filter(Boolean).map(async (item: any) => {
          if (!item) return null;
          
          const cleaned = cleanCardName(item.name);
          const isDFC = cleaned.includes('//');
          if (!isDFC) return item;
          
          const frontFace = cleaned.split('//')[0].trim();
          
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
            
            const existingSuggestions = new Set(item.suggestions.map((s: string) => norm(s)));
            
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
