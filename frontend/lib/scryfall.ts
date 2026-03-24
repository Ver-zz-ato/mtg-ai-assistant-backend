// frontend/lib/scryfall.ts
// Helper to batch-fetch Scryfall images for a list of card names using /cards/collection.
// Returns a map from normalized name to { small, normal, art_crop } image URIs.
// Uses a simple in-memory cache to reduce duplicate network hits during a session.

import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

export type ImageInfo = { small?: string; normal?: string; art_crop?: string };

/** In-memory cache: keyed by request lookup key and by canonical oracle name (Phase 2B). */
const memCache: Map<string, ImageInfo> = new Map();

/** Internal result: callers use byRequestKey; DB upserts must use cacheWritesByCanonicalName only (Phase 2B). */
export type GetImagesForNamesInternalResult = {
  byRequestKey: Map<string, ImageInfo>;
  /** Resolved Scryfall oracle identity -> images. Used for scryfall_cache upserts only. */
  cacheWritesByCanonicalName: Map<string, ImageInfo>;
};

/** Fetch English printing of a card by name. Scryfall collection can return non-English "newest" printings. Exported for use in server cache. */
export async function fetchEnglishCardImages(name: string): Promise<ImageInfo | null> {
  try {
    const r = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name.replace(/"/g, "")}"`)} lang:en`,
      {
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": "ManaTap-AI/1.0 (https://manatap.ai)" },
      }
    );
    if (!r.ok) return null;
    const j: any = await r.json().catch(() => ({}));
    const card = Array.isArray(j?.data) ? j.data[0] : null;
    if (!card) return null;
    const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
    return { small: img.small, normal: img.normal, art_crop: img.art_crop };
  } catch {
    return null;
  }
}

async function fetchImagesForNamesInternal(names: string[]): Promise<GetImagesForNamesInternalResult> {
  const byRequestKey = new Map<string, ImageInfo>();
  const cacheWritesByCanonicalName = new Map<string, ImageInfo>();
  if (!Array.isArray(names) || names.length === 0) {
    return { byRequestKey, cacheWritesByCanonicalName };
  }

  // Map normalized request key -> first-seen string for Scryfall identifiers (caller-facing keys unchanged).
  const origForNorm = new Map<string, string>();
  for (const raw of names) {
    const n = normalizeScryfallCacheName(String(raw));
    if (!n) continue;
    if (!origForNorm.has(n)) origForNorm.set(n, String(raw));
  }

  const missesNorm: string[] = [];
  for (const n of origForNorm.keys()) {
    if (memCache.has(n)) {
      byRequestKey.set(n, memCache.get(n)!);
    } else {
      missesNorm.push(n);
    }
  }

  /**
   * Record in-memory result by request key; DB upserts use canonical oracle name only.
   * Phase 2B: previously we upserted with the request key as `name`, which polluted scryfall_cache
   * with punctuation/junk when fuzzy matched a real card.
   */
  const recordResolved = (requestKey: string, cardNameFromApi: string | undefined, info: ImageInfo) => {
    byRequestKey.set(requestKey, info);
    memCache.set(requestKey, info);
    const cn = cardNameFromApi ? normalizeScryfallCacheName(cardNameFromApi) : "";
    if (cn) {
      memCache.set(cn, info);
      cacheWritesByCanonicalName.set(cn, info);
    }
  };

  for (let i = 0; i < missesNorm.length; i += 75) {
    const batchNorm = missesNorm.slice(i, i + 75);
    if (batchNorm.length === 0) continue;
    const identifiers = batchNorm.map((n) => ({ name: origForNorm.get(n)! }));
    const unresolved = new Set(batchNorm);
    try {
      const r = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Accept: "application/json",
          "User-Agent": "ManaTap-AI/1.0 (https://manatap.ai)",
        },
        body: JSON.stringify({ identifiers }),
        cache: "no-store",
      });
      const ok = r.ok;
      const j: any = ok ? await r.json().catch(() => ({})) : {};
      const data = Array.isArray(j?.data) ? j.data : [];
      for (let idx = 0; idx < data.length; idx++) {
        const card = data[idx];
        const requestedName = identifiers[idx]?.name;
        const key = requestedName
          ? normalizeScryfallCacheName(String(requestedName))
          : normalizeScryfallCacheName(String(card?.name || ""));
        if (!key) continue;
        const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
        let info: ImageInfo = { small: img.small, normal: img.normal, art_crop: img.art_crop };
        if (card?.lang && card.lang !== "en" && requestedName) {
          const enInfo = await fetchEnglishCardImages(requestedName);
          if (enInfo?.normal || enInfo?.small) info = enInfo;
        }
        recordResolved(key, String(card?.name || ""), info);
        unresolved.delete(key);
      }

      if (unresolved.size > 0) {
        const pending = Array.from(unresolved).slice(0, 20);
        await Promise.all(
          pending.map(async (n) => {
            const orig = origForNorm.get(n)!;
            try {
              const fr = await fetch(
                `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(orig)}`,
                {
                  cache: "no-store",
                  headers: { Accept: "application/json", "User-Agent": "ManaTap-AI/1.0 (https://manatap.ai)" },
                }
              );
              if (!fr.ok) return;
              const card: any = await fr.json().catch(() => ({}));
              const requestKey = n;
              if (!requestKey) return;
              const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
              let info: ImageInfo = { small: img.small, normal: img.normal, art_crop: img.art_crop };
              if (card?.lang && card.lang !== "en") {
                const enInfo = await fetchEnglishCardImages(orig);
                if (enInfo?.normal || enInfo?.small) info = enInfo;
              }
              recordResolved(requestKey, String(card?.name || ""), info);
            } catch {}
          })
        );
      }
    } catch {}
  }

  return { byRequestKey, cacheWritesByCanonicalName };
}

export async function getImagesForNames(names: string[]): Promise<Map<string, ImageInfo>> {
  const r = await fetchImagesForNamesInternal(names);
  return r.byRequestKey;
}

/** Full fetch metadata: use cacheWritesByCanonicalName for scryfall_cache upserts only (Phase 2B). */
export async function getImagesForNamesForCache(names: string[]): Promise<GetImagesForNamesInternalResult> {
  return fetchImagesForNamesInternal(names);
}
