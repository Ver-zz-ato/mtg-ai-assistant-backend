/**
 * Cache headers utility for API responses
 * Provides consistent caching behavior across API routes
 */

/**
 * Generate Cache-Control headers for API responses
 * @param maxAge - Maximum age in seconds (s-maxage for CDN)
 * @param staleWhileRevalidate - Stale-while-revalidate time in seconds
 * @returns Headers object with Cache-Control
 */
export function cacheHeaders(
  maxAge: number,
  staleWhileRevalidate: number
): Record<string, string> {
  return {
    'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
  };
}

/**
 * Common cache presets
 */
export const CachePresets = {
  /** Short cache (1 minute) for frequently changing data */
  SHORT: cacheHeaders(60, 300),
  
  /** Medium cache (5 minutes) for semi-static data */
  MEDIUM: cacheHeaders(300, 600),
  
  /** Long cache (1 hour) for static/semi-static data */
  LONG: cacheHeaders(3600, 86400),
  
  /** Very long cache (2 hours) for historical/archived data */
  VERY_LONG: cacheHeaders(7200, 86400),
  
  /** No cache */
  NO_CACHE: {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  },
} as const;

