// lib/utils/memoCache.ts
// In-memory TTL cache with LRU eviction and metrics
type Entry<T> = { value: T; exp: number; lastAccessed: number };

const MAX_ENTRIES = 1000;
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

const g: any = globalThis as any;
if (!g.__MEMO_CACHE__) g.__MEMO_CACHE__ = new Map<string, Entry<any>>();
if (!g.__MEMO_CACHE_METRICS__) g.__MEMO_CACHE_METRICS__ = { hits: 0, misses: 0, evictions: 0 };
const store: Map<string, Entry<any>> = g.__MEMO_CACHE__;
const metrics: { hits: number; misses: number; evictions: number } = g.__MEMO_CACHE_METRICS__;

// Auto-cleanup on interval
if (!g.__MEMO_CACHE_CLEANUP_TIMER__) {
  g.__MEMO_CACHE_CLEANUP_TIMER__ = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of store.entries()) {
      if (now > entry.exp) {
        store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0 && process.env.NODE_ENV === 'development') {
      console.log(`[memoCache] Auto-cleaned ${cleaned} expired entries`);
    }
  }, CLEANUP_INTERVAL);
}

export function memoGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) {
    metrics.misses++;
    return undefined;
  }
  if (Date.now() > hit.exp) {
    store.delete(key);
    metrics.misses++;
    return undefined;
  }
  // Update last accessed time for LRU
  hit.lastAccessed = Date.now();
  metrics.hits++;
  return hit.value as T;
}

export function memoSet<T>(key: string, value: T, ttlMs: number) {
  const now = Date.now();
  
  // LRU eviction if at capacity
  if (store.size >= MAX_ENTRIES && !store.has(key)) {
    // Find and remove the least recently accessed entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [k, entry] of store.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = k;
      }
    }
    
    if (oldestKey) {
      store.delete(oldestKey);
      metrics.evictions++;
    }
  }
  
  store.set(key, { value, exp: now + ttlMs, lastAccessed: now });
}

export function memoGetMetrics() {
  return {
    ...metrics,
    size: store.size,
    maxSize: MAX_ENTRIES,
    hitRate: metrics.hits + metrics.misses > 0 
      ? (metrics.hits / (metrics.hits + metrics.misses) * 100).toFixed(2) + '%'
      : 'N/A'
  };
}

export function memoClear() {
  store.clear();
  if (process.env.NODE_ENV === 'development') {
    console.log('[memoCache] Cache cleared manually');
  }
}
