import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function norm(s: string) { 
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); 
}

function parseDeckText(text: string): Array<{ name: string; qty: number }> {
  const cards: Array<{ name: string; qty: number }> = [];
  if (!text) return cards;
  
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    
    // Skip comment lines and headers
    if (/^(#|\/\/|SB:|COMMANDER|SIDEBOARD|LANDS|CREATURES|INSTANTS|SORCERIES|ARTIFACTS|ENCHANTMENTS|PLANESWALKERS)/i.test(line)) continue;
    
    let qty = 1;
    let name = line;
    
    // Try patterns:
    // "1 Sol Ring"
    // "Sol Ring x1"
    // "4x Lightning Bolt"
    // "Sol Ring,1" (CSV format)
    // "Card Name, 2" (CSV with space)
    const mLead = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (mLead) {
      qty = Math.max(1, parseInt(mLead[1], 10));
      name = mLead[2].trim();
    } else {
      const mTrail = line.match(/^(.+?)\s+[xX]\s*(\d+)$/);
      if (mTrail) {
        name = mTrail[1].trim();
        qty = Math.max(1, parseInt(mTrail[2], 10));
      } else {
        const mComma = line.match(/^(.+?)\s*,\s*(\d+)$/);
        if (mComma) {
          name = mComma[1].trim();
          qty = Math.max(1, parseInt(mComma[2], 10));
        }
      }
    }
    
    // Remove quotes if present
    name = name.replace(/^["']|["']$/g, '').trim();
    
    if (name) {
      cards.push({ name, qty });
    }
  }
  
  return cards;
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deckText = String(body?.deckText || '').trim();
    
    if (!deckText) {
      return NextResponse.json({ ok: false, error: 'deckText required' }, { status: 400 });
    }
    
    // Parse deck text
    const cards = parseDeckText(deckText);
    
    if (cards.length === 0) {
      return NextResponse.json({ ok: true, items: [], cards: [] });
    }
    
    const supabase = await createClient();
    const names = Array.from(new Set(cards.map(c => c.name)));
    
    // Check which names exist in cache
    const cacheNameMap = new Map<string, string>(); // normalized -> actual cache name
    const batchSize = 50;
    
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      
      for (const cardName of batch) {
        const isDFC = cardName.includes('//');
        
        if (isDFC) {
          const parts = cardName.split('//').map((p: string) => p.trim());
          const frontNorm = norm(parts[0]);
          const backNorm = norm(parts[1] || '');
          
          if (frontNorm === backNorm) {
            continue; // Invalid DFC, needs fixing
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
          const cardNorm = norm(cardName);
          
          if (isDFC) {
            const cacheParts = exactMatch[0].name.split('//').map((p: string) => p.trim());
            const cacheFrontNorm = norm(cacheParts[0]);
            const cacheBackNorm = norm(cacheParts[1] || '');
            
            if (cacheFrontNorm === cacheBackNorm) {
              // Invalid cache entry, skip
            } else if (cacheNorm === cardNorm) {
              cacheNameMap.set(cardNorm, exactMatch[0].name);
              continue;
            }
          } else {
            cacheNameMap.set(cardNorm, exactMatch[0].name);
            continue;
          }
        }
      }
    }
    
    // Find cards that don't have matches
    const unknown = cards.filter(c => !cacheNameMap.has(norm(c.name)));
    
    if (unknown.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        items: [], 
        cards: cards.map(c => ({ name: cacheNameMap.get(norm(c.name)) || c.name, qty: c.qty }))
      });
    }
    
    // Get fuzzy suggestions for unknown cards
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
      
      // Build corrected cards list (known cards + unknown with first suggestion as default)
      const correctedCards = cards.map(c => {
        const normalized = norm(c.name);
        if (cacheNameMap.has(normalized)) {
          return { name: cacheNameMap.get(normalized)!, qty: c.qty };
        }
        // Find the item for this card
        const item = items.find(it => it.originalName === c.name);
        return { 
          name: item && item.suggestions.length > 0 ? item.suggestions[0] : c.name, 
          qty: c.qty 
        };
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

