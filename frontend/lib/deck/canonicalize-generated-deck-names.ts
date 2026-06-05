import { createClient } from "@/lib/supabase/server";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import {
  normalizeScryfallCacheName,
  scryfallCacheLookupNameKeys,
} from "@/lib/server/scryfallCacheRow";

export type GeneratedDeckQtyRow = { name: string; qty: number };

export type CanonicalizeGeneratedDeckRowsOptions = {
  resolveNameOverride?: (name: string) => Promise<string | null>;
};

function titleCaseCardName(raw: string): string {
  const small = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "the", "to", "up", "with"]);
  return raw
    .split(/(\s+|\/\/|-|,)/)
    .map((part, index, parts) => {
      if (!part || /^\s+$/.test(part) || part === "//" || part === "-" || part === ",") return part;
      const lower = part.toLowerCase();
      const prev = parts[index - 1];
      const force = index === 0 || prev === "//" || prev === "-" || prev === ",";
      if (!force && small.has(lower)) return lower;
      return lower.replace(/^[a-z]/, (c) => c.toUpperCase());
    })
    .join("")
    .replace(/\s*\/\/\s*/g, " // ")
    .replace(/\s+,/g, ",");
}

function displayNameForCacheHit(cacheName: string, original: string): string {
  const trimmed = original.trim();
  if (normalizeScryfallCacheName(trimmed) === cacheName && /[A-Z]/.test(trimmed)) {
    return trimmed;
  }
  return titleCaseCardName(cacheName);
}

async function defaultResolveGeneratedCardName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  try {
    const supabase = await createClient();
    const keys = scryfallCacheLookupNameKeys(trimmed);
    if (keys.length > 0) {
      const { data } = await supabase.from("scryfall_cache").select("name").in("name", keys).limit(4);
      const names = [...new Set(((data ?? []) as { name?: string }[]).map((row) => row.name).filter((n): n is string => Boolean(n?.trim())))];
      if (names.length === 1) return displayNameForCacheHit(names[0], trimmed);
      if (names.length > 1) return null;
    }
  } catch {
    // Fall through to Scryfall fuzzy.
  }

  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(trimmed)}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "ManaTap-AI/1.0 (https://manatap.ai)",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { name?: string } | null;
    const apiName = json?.name?.trim();
    if (!apiName) return null;
    await getDetailsForNamesCached([apiName]).catch(() => new Map());
    return apiName;
  } catch {
    return null;
  }
}

export async function canonicalizeGeneratedDeckRows(
  rows: GeneratedDeckQtyRow[],
  opts?: CanonicalizeGeneratedDeckRowsOptions,
): Promise<{
  rows: GeneratedDeckQtyRow[];
  changes: Array<{ from: string; to: string }>;
}> {
  const resolveName = opts?.resolveNameOverride ?? defaultResolveGeneratedCardName;
  const cache = new Map<string, string | null>();
  const merged = new Map<string, GeneratedDeckQtyRow>();
  const changes: Array<{ from: string; to: string }> = [];

  for (const row of rows) {
    const original = String(row.name ?? "").trim();
    if (!original) continue;
    const cacheKey = normalizeScryfallCacheName(original);
    let canonical = cache.get(cacheKey);
    if (!cache.has(cacheKey)) {
      canonical = await resolveName(original);
      cache.set(cacheKey, canonical);
    }
    const nextName = canonical?.trim() || original;
    if (normalizeScryfallCacheName(nextName) !== normalizeScryfallCacheName(original)) {
      changes.push({ from: original, to: nextName });
    }
    const mergeKey = normalizeScryfallCacheName(nextName);
    const prev = merged.get(mergeKey);
    const qty = Math.max(1, Number(row.qty) || 1);
    if (prev) prev.qty += qty;
    else merged.set(mergeKey, { name: nextName, qty });
  }

  return { rows: [...merged.values()], changes };
}
