// lib/utils/memoCache.ts
// Really simple in-memory TTL cache. Suitable for tiny responses (e.g. Scryfall search).
type Entry<T> = { value: T; exp: number };

const g: any = globalThis as any;
if (!g.__MEMO_CACHE__) g.__MEMO_CACHE__ = new Map<string, Entry<any>>();
const store: Map<string, Entry<any>> = g.__MEMO_CACHE__;

export function memoGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.exp) { store.delete(key); return undefined; }
  return hit.value as T;
}

export function memoSet<T>(key: string, value: T, ttlMs: number) {
  store.set(key, { value, exp: Date.now() + ttlMs });
}
