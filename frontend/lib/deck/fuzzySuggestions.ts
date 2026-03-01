import { createClient } from "@/lib/supabase/server";

/**
 * Get fuzzy match suggestions for card names
 */
export async function getFuzzySuggestions(
  names: string[]
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  
  if (names.length === 0) return results;
  
  try {
    // Call internal fuzzy API
    const { POST: fuzzy } = await import("@/app/api/cards/fuzzy/route");
    const { NextRequest } = await import('next/server');
    
    const fuzzyReq = new NextRequest(
      new URL('/api/cards/fuzzy', 'http://localhost'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ names: names.slice(0, 50) }),
      }
    );
    
    const fuzzyRes = await fuzzy(fuzzyReq);
    const json: any = await fuzzyRes.json().catch(() => ({}));
    const map = json?.results || {};
    
    const supabase = await createClient();
    
    // Get proper capitalization for suggestions from cache
    for (const name of names) {
      const all: string[] = Array.isArray(map[name]?.all) ? map[name].all : [];
      const properSuggestions: string[] = [];
      
      for (const suggestion of all.slice(0, 5)) {
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
      
      results.set(name, properSuggestions);
    }
  } catch (error) {
    console.error('[getFuzzySuggestions] Error:', error);
  }
  
  return results;
}
