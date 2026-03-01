import { createClient } from "@/lib/supabase/server";

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type NormalizedCard = {
  name: string;          // Properly capitalized name from cache
  originalName: string;  // What user typed
  qty: number;
  matched: boolean;      // true if found in cache
};

export type NormalizeResult = {
  cards: NormalizedCard[];
  unrecognized: Array<{ originalName: string; qty: number; suggestions: string[] }>;
  allMatched: boolean;
};

/**
 * Normalize card names to proper capitalization from scryfall_cache.
 * Auto-corrects case differences (e.g., "mizzix" → "Mizzix of the Izmagnus").
 * Returns truly unrecognized cards that need user attention.
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
  
  // Batch lookup - get all potential matches in fewer queries
  const batchSize = 100;
  
  for (let i = 0; i < uniqueNames.length; i += batchSize) {
    const batch = uniqueNames.slice(i, i + batchSize);
    
    // Try exact case-insensitive matches first (most efficient)
    const orConditions = batch.map(name => {
      // Escape special characters for ilike
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
    
    // For names not found, try partial matching (for typos like "mizzix" matching "Mizzix of the Izmagnus")
    const notFound = batch.filter(name => !cacheMap.has(norm(name)));
    
    for (const name of notFound) {
      // Try prefix match first (e.g., "mizzix" → "Mizzix of the Izmagnus")
      const { data: prefixMatches } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `${name}%`)
        .limit(5);
      
      if (prefixMatches && prefixMatches.length > 0) {
        // Use the first match (most likely correct)
        cacheMap.set(norm(name), prefixMatches[0].name);
      } else {
        // Try contains match as fallback
        const { data: containsMatches } = await supabase
          .from('scryfall_cache')
          .select('name')
          .ilike('name', `%${name}%`)
          .limit(5);
        
        if (containsMatches && containsMatches.length === 1) {
          // Only auto-match if there's exactly one result (unambiguous)
          cacheMap.set(norm(name), containsMatches[0].name);
        }
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
