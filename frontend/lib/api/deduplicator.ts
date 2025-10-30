/**
 * Request Deduplication Layer
 * Prevents duplicate API calls within a short time window.
 * 
 * In-flight requests are cached and shared across multiple callers.
 * Completed requests are cached briefly to catch rapid duplicate calls.
 */

interface CacheEntry {
  promise: Promise<Response>;
  timestamp: number;
}

// Global cache for in-flight and recently completed requests
const requestCache = new Map<string, CacheEntry>();

// Cache completed responses for this duration
const CACHE_DURATION_MS = 100; // 100ms window to catch rapid duplicates

// Cleanup interval
const CLEANUP_INTERVAL_MS = 5000; // Clean every 5 seconds

// Stats for monitoring
interface Stats {
  hits: number;
  misses: number;
  requests: number;
}

const stats: Stats = {
  hits: 0,
  misses: 0,
  requests: 0,
};

// Auto-cleanup old entries
if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of requestCache.entries()) {
      if (now - entry.timestamp > CACHE_DURATION_MS) {
        requestCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0 && process.env.NODE_ENV === 'development') {
      console.log(`[Deduplicator] Cleaned ${cleaned} stale entries`);
    }
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Creates a cache key from URL and RequestInit options
 */
function getCacheKey(url: string, options?: RequestInit): string {
  const method = options?.method || 'GET';
  const body = options?.body ? JSON.stringify(options.body) : '';
  return `${method}:${url}:${body}`;
}

/**
 * Fetch with automatic deduplication
 * 
 * @example
 * const response = await deduplicatedFetch('/api/cards/search?q=bolt');
 * 
 * // If called again within 100ms, returns the same promise
 * const response2 = await deduplicatedFetch('/api/cards/search?q=bolt');
 */
export async function deduplicatedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const cacheKey = getCacheKey(url, options);
  const now = Date.now();
  
  stats.requests++;
  
  // Check if we have this request in-flight or recently completed
  const cached = requestCache.get(cacheKey);
  if (cached) {
    const age = now - cached.timestamp;
    if (age < CACHE_DURATION_MS) {
      stats.hits++;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[Deduplicator] 🎯 Cache HIT for: ${url.substring(0, 60)}... (age: ${age}ms)`
        );
      }
      
      // Clone the response so each caller gets their own readable body stream
      // Response bodies can only be read once, so we must clone for multiple consumers
      return cached.promise.then(res => res.clone());
    } else {
      // Expired, remove it
      requestCache.delete(cacheKey);
    }
  }
  
  stats.misses++;
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Deduplicator] ⚡ Cache MISS for: ${url.substring(0, 60)}...`);
  }
  
  // Create new request
  const promise = fetch(url, options);
  
  // Cache the promise
  requestCache.set(cacheKey, {
    promise,
    timestamp: now,
  });
  
  // Clean up after the request completes
  promise.finally(() => {
    // Keep in cache for CACHE_DURATION_MS after completion
    // to catch rapid subsequent calls
    setTimeout(() => {
      const entry = requestCache.get(cacheKey);
      if (entry && entry.promise === promise) {
        requestCache.delete(cacheKey);
      }
    }, CACHE_DURATION_MS);
  });
  
  return promise;
}

/**
 * Get deduplication statistics (for admin monitoring)
 */
export function getDeduplicationStats() {
  const hitRate = stats.requests > 0 
    ? ((stats.hits / stats.requests) * 100).toFixed(2) + '%'
    : 'N/A';
    
  return {
    ...stats,
    hitRate,
    cacheSize: requestCache.size,
  };
}

/**
 * Clear the deduplication cache (useful for testing)
 */
export function clearDeduplicationCache() {
  requestCache.clear();
  stats.hits = 0;
  stats.misses = 0;
  stats.requests = 0;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[Deduplicator] Cache cleared');
  }
}

/**
 * Wrapper function to replace standard fetch calls
 * 
 * @example
 * // Before:
 * const res = await fetch('/api/cards/search?q=bolt');
 * 
 * // After:
 * const res = await dedupFetch('/api/cards/search?q=bolt');
 */
export const dedupFetch = deduplicatedFetch;


