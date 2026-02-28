/**
 * Standard rotation tracking utility.
 * Fetches current Standard-legal sets from Scryfall API with caching.
 */

// Cache for Standard-legal sets (expires after 24h)
let cachedSets: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fallback sets (updated manually as backup)
// Last updated: Feb 2026
const FALLBACK_STANDARD_SETS = [
  'woe', // Wilds of Eldraine
  'lci', // Lost Caverns of Ixalan
  'mkm', // Murders at Karlov Manor
  'otj', // Outlaws of Thunder Junction
  'blb', // Bloomburrow
  'dsk', // Duskmourn: House of Horror
  'fdn', // Foundations
];

export type StandardSetInfo = {
  code: string;
  name: string;
  released_at: string;
  set_type: string;
};

/**
 * Fetch current Standard-legal sets from Scryfall API.
 * Returns array of set codes (lowercase).
 */
export async function getStandardLegalSets(): Promise<string[]> {
  // Return cached result if valid
  if (cachedSets && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSets;
  }

  try {
    const response = await fetch('https://api.scryfall.com/sets', {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 86400 }, // Cache for 24h in Next.js
    });

    if (!response.ok) {
      throw new Error(`Scryfall API error: ${response.status}`);
    }

    const data = await response.json();
    const sets: StandardSetInfo[] = data.data || [];

    // Filter for Standard-legal sets
    // A set is Standard-legal if:
    // 1. It's a core set or expansion
    // 2. It was released recently (within ~2 years)
    // 3. Scryfall marks cards from it as Standard-legal
    const standardSets = sets.filter((set: any) => {
      // Only core sets and expansions can be Standard-legal
      if (!['core', 'expansion'].includes(set.set_type)) {
        return false;
      }

      // Check if set has Standard-legal cards
      // Scryfall doesn't have a direct "is_standard" field on sets,
      // but we can check if the set is recent enough
      const releaseDate = new Date(set.released_at);
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      return releaseDate >= twoYearsAgo;
    });

    // Extract set codes
    const setCodes = standardSets.map((set: any) => set.code.toLowerCase());

    // Update cache
    cachedSets = setCodes;
    cacheTimestamp = Date.now();

    console.log(`[standard-sets] Fetched ${setCodes.length} Standard-legal sets:`, setCodes.join(', '));
    return setCodes;
  } catch (error) {
    console.warn('[standard-sets] Failed to fetch from Scryfall, using fallback:', error);
    return FALLBACK_STANDARD_SETS;
  }
}

/**
 * Check if a set code is Standard-legal.
 */
export async function isSetStandardLegal(setCode: string): Promise<boolean> {
  const standardSets = await getStandardLegalSets();
  return standardSets.includes(setCode.toLowerCase());
}

/**
 * Get Standard rotation info for display purposes.
 */
export async function getStandardRotationInfo(): Promise<{
  currentSets: string[];
  nextRotation: string | null;
  lastUpdated: Date;
}> {
  const sets = await getStandardLegalSets();
  
  // Standard rotation happens in Q4 each year with the fall set
  const now = new Date();
  const currentYear = now.getFullYear();
  const rotationMonth = 9; // September/October
  
  let nextRotation: string | null = null;
  if (now.getMonth() < rotationMonth) {
    nextRotation = `Fall ${currentYear}`;
  } else {
    nextRotation = `Fall ${currentYear + 1}`;
  }

  return {
    currentSets: sets,
    nextRotation,
    lastUpdated: new Date(cacheTimestamp || Date.now()),
  };
}

/**
 * Invalidate the cache (for testing or manual refresh).
 */
export function invalidateStandardSetsCache(): void {
  cachedSets = null;
  cacheTimestamp = 0;
}
