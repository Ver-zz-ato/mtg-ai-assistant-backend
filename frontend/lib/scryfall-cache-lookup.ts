/**
 * Client-safe scryfall_cache PK lookup keys (matches server scryfallCacheRow).
 */
import { cleanCardName } from "@/lib/deck/cleanCardName";

export function normalizeScryfallCacheName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function scryfallCacheLookupNameKeys(raw: string): string[] {
  const t = String(raw || "").trim();
  if (!t) return [];
  const a = normalizeScryfallCacheName(t);
  const b = normalizeScryfallCacheName(cleanCardName(t));
  return [...new Set([a, b].filter(Boolean))];
}

export function resolveMetaFromMap<T>(
  map: Map<string, T>,
  rawName: string,
): T | undefined {
  for (const key of scryfallCacheLookupNameKeys(rawName)) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  return undefined;
}
