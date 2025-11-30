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
    
    const { data } = await supabase
      .from('price_cache')
      .select('name, usd, eur, gbp, updated_at')
      .in('name', normalizedNames)
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // 24 hours ago
    
    const cached: Record<string, { usd?: number; eur?: number; gbp?: number }> = {};
    for (const row of (data || [])) {
      cached[row.name] = {
        usd: row.usd ? Number(row.usd) : undefined,
        eur: row.eur ? Number(row.eur) : undefined,
        gbp: row.gbp ? Number(row.gbp) : undefined
      };
    }
    
    return cached;
  } catch (error) {
    console.warn('Price cache lookup failed:', error);
    return {};
  }
}

