/**
 * Price utilities for server-side use
 * Extracted from route to allow sharing across routes
 */

import { createClient } from "@/lib/supabase/server";

/**
 * Normalize a card name so the client and server use the exact same key.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check price cache for existing prices (24-hour TTL)
 * Exported for use in other server-side routes
 */
export async function getCachedPrices(names: string[]): Promise<Record<string, { usd?: number; eur?: number; gbp?: number }>> {
  try {
    const supabase = await createClient();
    const normalizedNames = names.map(normalizeName);
    
    // Note: price_cache uses card_name, usd_price, eur_price columns (from bulk-price-import)
    const { data } = await supabase
      .from('price_cache')
      .select('card_name, usd_price, eur_price, updated_at')
      .in('card_name', normalizedNames)
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // 24 hours ago
    
    const cached: Record<string, { usd?: number; eur?: number; gbp?: number }> = {};
    for (const row of (data || [])) {
      const usd = row.usd_price ? Number(row.usd_price) : undefined;
      cached[row.card_name] = {
        usd,
        eur: row.eur_price ? Number(row.eur_price) : undefined,
        gbp: usd ? Number((usd * 0.78).toFixed(2)) : undefined // GBP derived from USD (approx rate)
      };
    }
    
    return cached;
  } catch (error) {
    console.warn('Price cache lookup failed:', error);
    return {};
  }
}

