/**
 * Error recovery and graceful degradation utilities
 */

export type FallbackLayer = 'scryfall_cache' | 'keyword_search' | 'cached_response' | 'error_message';

export interface FallbackResult<T> {
  success: boolean;
  data?: T;
  layer: FallbackLayer;
  error?: Error;
}

/**
 * Layer 1: Scryfall API fallback to cache
 */
export async function fallbackToScryfallCache(
  cardName: string,
  supabase: any
): Promise<FallbackResult<any>> {
  try {
    const { data } = await supabase
      .from('scryfall_cache')
      .select('*')
      .eq('name', cardName)
      .maybeSingle();
    
    if (data) {
      return { success: true, data, layer: 'scryfall_cache' };
    }
    return { success: false, layer: 'scryfall_cache' };
  } catch (error) {
    return { success: false, layer: 'scryfall_cache', error: error as Error };
  }
}

/**
 * Layer 2: Embeddings fallback to keyword search
 */
export function fallbackToKeywordSearch(
  query: string,
  messages: Array<{ content: string }>
): FallbackResult<string[]> {
  try {
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(w => w.length > 3);
    
    const matches: string[] = [];
    for (const msg of messages.slice(-10)) {
      const content = msg.content.toLowerCase();
      if (keywords.some(kw => content.includes(kw))) {
        matches.push(msg.content);
      }
    }
    
    return { success: matches.length > 0, data: matches, layer: 'keyword_search' };
  } catch (error) {
    return { success: false, layer: 'keyword_search', error: error as Error };
  }
}

/**
 * Layer 4: Final error message
 */
export function getHelpfulErrorMessage(context?: string): string {
  return "I'm having trouble right now. Try rephrasing your question or check back in a moment. If the issue persists, please let us know!";
}

