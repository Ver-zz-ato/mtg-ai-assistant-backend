// frontend/lib/server/scryfallTtl.ts
export const SCRYFALL_CACHE_TTL_DAYS = 30;
export function isStale(updatedAt: string | null | undefined, ttlDays = SCRYFALL_CACHE_TTL_DAYS): boolean {
  try {
    if (!updatedAt) return true;
    const t = new Date(updatedAt).getTime();
    if (!isFinite(t)) return true;
    const ageMs = Date.now() - t;
    return ageMs > ttlDays * 24 * 60 * 60 * 1000;
  } catch { return true; }
}
