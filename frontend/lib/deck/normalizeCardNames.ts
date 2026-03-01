import { createClient } from "@/lib/supabase/server";
import { cleanCardName, generateNameVariations, stringSimilarity } from './cleanCardName';

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export type NormalizedCard = {
  name: string;          // Properly capitalized name from cache
  originalName: string;  // What user typed (cleaned)
  qty: number;
  matched: boolean;      // true if found in cache
};

export type NormalizeResult = {
  cards: NormalizedCard[];
  unrecognized: Array<{ originalName: string; qty: number; suggestions: string[] }>;
  allMatched: boolean;
};

/**
 * Multi-pass card name matching strategy:
 * 1. Exact match (case-insensitive)
 * 2. Prefix match (e.g., "Mizzix" -> "Mizzix of the Izmagnus")
 * 3. Contains match (e.g., "Vryn's Prodigy" -> "Jace, Vryn's Prodigy")
 * 4. Front-face match for DFCs (e.g., "Jace, Vryn's Prodigy" for "Jace, Vryn's Prodigy // Jace, Telepath Unbound")
 * 5. Fuzzy similarity match (for typos)
 */
export async function normalizeCardNames(
  cards: Array<{ name: string; qty: number }>
): Promise<NormalizeResult> {
  if (cards.length === 0) {
    return { cards: [], unrecognized: [], allMatched: true };
  }

  const supabase = await createClient();
  const uniqueNames = Array.from(new Set(cards.map(c => c.name)));
  
  // Build a map of normalized name -> proper cache name
  const cacheMap = new Map<string, string>();
  
  // ===== PASS 1: Exact case-insensitive matches (batch query) =====
  const batchSize = 100;
  
  for (let i = 0; i < uniqueNames.length; i += batchSize) {
    const batch = uniqueNames.slice(i, i + batchSize);
    
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
        cacheMap.set(norm(row.name), row.name);
      }
    }
  }
  
  // Check what's still unmatched after pass 1
  let unmatched = uniqueNames.filter(name => !cacheMap.has(norm(name)));
  
  // ===== PASS 2: Prefix matching =====
  // Good for abbreviated names like "Mizzix" -> "Mizzix of the Izmagnus"
  for (const name of unmatched) {
    if (cacheMap.has(norm(name))) continue;
    if (name.length < 3) continue; // Too short for prefix match
    
    const { data: prefixMatches } = await supabase
      .from('scryfall_cache')
      .select('name')
      .ilike('name', `${name}%`)
      .limit(5);
    
    if (prefixMatches && prefixMatches.length > 0) {
      // Prefer exact length match if available
      const exactLen = prefixMatches.find(m => m.name.length === name.length);
      cacheMap.set(norm(name), exactLen?.name || prefixMatches[0].name);
    }
  }
  
  unmatched = uniqueNames.filter(name => !cacheMap.has(norm(name)));
  
  // ===== PASS 3: Contains matching =====
  // Good for partial names like "Vryn's Prodigy" finding "Jace, Vryn's Prodigy"
  for (const name of unmatched) {
    if (cacheMap.has(norm(name))) continue;
    if (name.length < 5) continue; // Too short for contains match
    
    const escaped = name.replace(/[%_]/g, '\\$&');
    const { data: containsMatches } = await supabase
      .from('scryfall_cache')
      .select('name')
      .ilike('name', `%${escaped}%`)
      .limit(5);
    
    if (containsMatches && containsMatches.length === 1) {
      // Only auto-match if unambiguous (single result)
      cacheMap.set(norm(name), containsMatches[0].name);
    } else if (containsMatches && containsMatches.length > 1) {
      // Multiple matches - try to find best one by similarity
      const best = containsMatches
        .map(m => ({ name: m.name, score: stringSimilarity(name, m.name) }))
        .sort((a, b) => b.score - a.score)[0];
      
      if (best && best.score > 0.7) {
        cacheMap.set(norm(name), best.name);
      }
    }
  }
  
  unmatched = uniqueNames.filter(name => !cacheMap.has(norm(name)));
  
  // ===== PASS 4: DFC front-face matching =====
  // The database might store "Jace, Vryn's Prodigy // Jace, Telepath Unbound"
  // but user entered just "Jace, Vryn's Prodigy"
  for (const name of unmatched) {
    if (cacheMap.has(norm(name))) continue;
    
    // Search for cards where the front face matches
    const escaped = name.replace(/[%_]/g, '\\$&');
    const { data: dfcMatches } = await supabase
      .from('scryfall_cache')
      .select('name')
      .ilike('name', `${escaped} // %`)
      .limit(3);
    
    if (dfcMatches && dfcMatches.length === 1) {
      cacheMap.set(norm(name), dfcMatches[0].name);
    } else if (dfcMatches && dfcMatches.length > 1) {
      // Multiple DFC matches - pick closest
      const best = dfcMatches
        .map(m => ({ name: m.name, score: stringSimilarity(name, m.name.split('//')[0].trim()) }))
        .sort((a, b) => b.score - a.score)[0];
      
      if (best) {
        cacheMap.set(norm(name), best.name);
      }
    }
  }
  
  unmatched = uniqueNames.filter(name => !cacheMap.has(norm(name)));
  
  // ===== PASS 5: Name variation matching =====
  // Try different variations of the name
  for (const name of unmatched) {
    if (cacheMap.has(norm(name))) continue;
    
    const variations = generateNameVariations(name);
    
    for (const variation of variations) {
      if (variation === name) continue; // Already tried
      
      const escaped = variation.replace(/[%_]/g, '\\$&');
      const { data: varMatches } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', escaped)
        .limit(1);
      
      if (varMatches && varMatches.length > 0) {
        cacheMap.set(norm(name), varMatches[0].name);
        break;
      }
    }
  }
  
  // Build result
  const normalizedCards: NormalizedCard[] = [];
  const unrecognizedMap = new Map<string, { originalName: string; qty: number }>();
  
  for (const card of cards) {
    const normalized = norm(card.name);
    const cachedName = cacheMap.get(normalized);
    
    if (cachedName) {
      normalizedCards.push({
        name: cachedName,
        originalName: card.name,
        qty: card.qty,
        matched: true
      });
    } else {
      normalizedCards.push({
        name: card.name,
        originalName: card.name,
        qty: card.qty,
        matched: false
      });
      
      // Track unrecognized
      const existing = unrecognizedMap.get(normalized);
      if (existing) {
        existing.qty += card.qty;
      } else {
        unrecognizedMap.set(normalized, { originalName: card.name, qty: card.qty });
      }
    }
  }
  
  // Get fuzzy suggestions for unrecognized cards
  const unrecognizedList = Array.from(unrecognizedMap.values());
  const unrecognizedWithSuggestions: Array<{ originalName: string; qty: number; suggestions: string[] }> = [];
  
  if (unrecognizedList.length > 0) {
    try {
      // Call fuzzy endpoint for suggestions
      const { getFuzzySuggestions } = await import("@/lib/deck/fuzzySuggestions");
      const suggestions = await getFuzzySuggestions(unrecognizedList.map(u => u.originalName));
      
      for (const item of unrecognizedList) {
        unrecognizedWithSuggestions.push({
          ...item,
          suggestions: suggestions.get(item.originalName) || []
        });
      }
    } catch {
      // Fallback without suggestions
      for (const item of unrecognizedList) {
        unrecognizedWithSuggestions.push({ ...item, suggestions: [] });
      }
    }
  }
  
  return {
    cards: normalizedCards,
    unrecognized: unrecognizedWithSuggestions,
    allMatched: unrecognizedWithSuggestions.length === 0
  };
}
