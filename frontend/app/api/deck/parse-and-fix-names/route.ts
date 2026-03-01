import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { stringSimilarity } from "@/lib/deck/cleanCardName";

function norm(s: string) { 
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[''`´]/g, "'").replace(/\s+/g,' ').trim(); 
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deckText = String(body?.deckText || '').trim();
    
    if (!deckText) {
      return NextResponse.json({ ok: false, error: 'deckText required' }, { status: 400 });
    }
    
    // Parse deck text using shared utility (handles all formats)
    const cards = parseDeckText(deckText);
    
    if (cards.length === 0) {
      return NextResponse.json({ ok: true, items: [], cards: [] });
    }
    
    const supabase = await createClient();
    const names = Array.from(new Set(cards.map(c => c.name)));
    
    // Multi-pass matching strategy
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
    
    // ===== PASS 2: Prefix matching =====
    for (const cardName of unmatched) {
      if (cacheNameMap.has(norm(cardName))) continue;
      if (cardName.length < 3) continue;
      
      const escaped = cardName.replace(/[%_]/g, '\\$&');
      const { data: prefixMatch } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `${escaped}%`)
        .limit(5);
      
      if (prefixMatch && prefixMatch.length > 0) {
        // Prefer exact length match, otherwise first
        const exactLen = prefixMatch.find(m => norm(m.name).length === norm(cardName).length);
        cacheNameMap.set(norm(cardName), exactLen?.name || prefixMatch[0].name);
      }
    }
    
    unmatched = names.filter(name => !cacheNameMap.has(norm(name)));
    
    // ===== PASS 3: Contains matching =====
    for (const cardName of unmatched) {
      if (cacheNameMap.has(norm(cardName))) continue;
      if (cardName.length < 5) continue;
      
      const escaped = cardName.replace(/[%_]/g, '\\$&');
      const { data: containsMatch } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `%${escaped}%`)
        .limit(5);
      
      if (containsMatch && containsMatch.length === 1) {
        // Single match - use it
        cacheNameMap.set(norm(cardName), containsMatch[0].name);
      } else if (containsMatch && containsMatch.length > 1) {
        // Multiple matches - pick best by similarity
        const best = containsMatch
          .map(m => ({ name: m.name, score: stringSimilarity(cardName, m.name) }))
          .sort((a, b) => b.score - a.score)[0];
        
        if (best && best.score > 0.6) {
          cacheNameMap.set(norm(cardName), best.name);
        }
      }
    }
    
    unmatched = names.filter(name => !cacheNameMap.has(norm(name)));
    
    // ===== PASS 4: DFC front-face matching =====
    for (const cardName of unmatched) {
      if (cacheNameMap.has(norm(cardName))) continue;
      
      const escaped = cardName.replace(/[%_]/g, '\\$&');
      const { data: dfcMatch } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `${escaped} // %`)
        .limit(3);
      
      if (dfcMatch && dfcMatch.length > 0) {
        // Pick best match
        const best = dfcMatch
          .map(m => ({ name: m.name, score: stringSimilarity(cardName, m.name.split('//')[0].trim()) }))
          .sort((a, b) => b.score - a.score)[0];
        
        if (best) {
          cacheNameMap.set(norm(cardName), best.name);
        }
      }
    }
    
    unmatched = names.filter(name => !cacheNameMap.has(norm(name)));
    
    // ===== PASS 5: Fuzzy word-based matching =====
    // Try matching first few words (for truncated names)
    for (const cardName of unmatched) {
      if (cacheNameMap.has(norm(cardName))) continue;
      
      const words = cardName.split(/\s+/);
      if (words.length >= 2) {
        // Try first 2-3 words as prefix
        const prefix = words.slice(0, Math.min(3, words.length)).join(' ');
        const escaped = prefix.replace(/[%_]/g, '\\$&');
        
        const { data: wordMatch } = await supabase
          .from('scryfall_cache')
          .select('name')
          .ilike('name', `${escaped}%`)
          .limit(5);
        
        if (wordMatch && wordMatch.length > 0) {
          const best = wordMatch
            .map(m => ({ name: m.name, score: stringSimilarity(cardName, m.name) }))
            .sort((a, b) => b.score - a.score)[0];
          
          if (best && best.score > 0.5) {
            cacheNameMap.set(norm(cardName), best.name);
          }
        }
      }
    }
    
    // Find cards that still don't have matches
    const unknown = cards.filter(c => !cacheNameMap.has(norm(c.name)));
    
    if (unknown.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        items: [], 
        cards: cards.map(c => ({ name: cacheNameMap.get(norm(c.name)) || c.name, qty: c.qty }))
      });
    }
    
    // Get fuzzy suggestions for remaining unknown cards
    const uniq = Array.from(new Set(unknown.map(c => c.name))).slice(0, 50);
    
    try {
      const { POST: fuzzy } = await import("@/app/api/cards/fuzzy/route");
      const fuzzyReq = new (await import('next/server')).NextRequest(
        new URL('/api/cards/fuzzy', req.url), 
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' } as any,
          body: JSON.stringify({ names: uniq }),
        } as any
      );
      const fuzzyRes = await fuzzy(fuzzyReq);
      const j: any = await fuzzyRes.json().catch(() => ({}));
      const map = j?.results || {};
      
      // Build items with suggestions
      const itemsWithSuggestions = await Promise.all(
        unknown.map(async (c) => {
          const all: string[] = Array.isArray(map[c.name]?.all) ? map[c.name].all : [];
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
          
          return { 
            originalName: c.name, 
            qty: c.qty,
            suggestions: properSuggestions 
          };
        })
      );
      
      const items = itemsWithSuggestions.filter(Boolean);
      
      // Build corrected cards list
      const correctedCards = cards.map(c => {
        const normalized = norm(c.name);
        if (cacheNameMap.has(normalized)) {
          return { name: cacheNameMap.get(normalized)!, qty: c.qty };
        }
        return { name: c.name, qty: c.qty };
      });
      
      return NextResponse.json({ 
        ok: true, 
        items, 
        cards: correctedCards 
      });
    } catch (e: any) {
      return NextResponse.json({ 
        ok: false, 
        error: e?.message || 'server_error' 
      }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || 'server_error' 
    }, { status: 500 });
  }
}
