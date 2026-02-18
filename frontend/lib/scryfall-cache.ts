// frontend/lib/scryfall-cache.ts
// Helper to batch-fetch card images from internal scryfall_cache database
// Uses internal API instead of hitting Scryfall directly

import { fetchEnglishCardImages } from "@/lib/scryfall";

export type ImageInfo = { small?: string; normal?: string; art_crop?: string };

const memCache: Map<string, ImageInfo> = new Map(); // in-memory cache for session

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch card images from internal cache database first, then fallback to Scryfall API
 * Checks cache first for performance, falls back to Scryfall for cache misses
 */
export async function getImagesForNames(names: string[]): Promise<Map<string, ImageInfo>> {
  const out = new Map<string, ImageInfo>();
  if (!Array.isArray(names) || names.length === 0) return out;

  // Normalize and deduplicate
  const origForNorm = new Map<string, string>();
  for (const raw of names) {
    const n = norm(raw);
    if (!n) continue;
    if (!origForNorm.has(n)) origForNorm.set(n, String(raw));
  }

  // Check in-memory cache first
  const missesNorm: string[] = [];
  for (const n of origForNorm.keys()) {
    if (memCache.has(n)) {
      out.set(n, memCache.get(n)!);
    } else {
      missesNorm.push(n);
    }
  }

  // Fetch misses from database in batches of 100
  const dbMissesNorm: string[] = [];
  for (let i = 0; i < missesNorm.length; i += 100) {
    const batchNorm = missesNorm.slice(i, i + 100);
    if (batchNorm.length === 0) continue;
    
    const batchOrigNames = batchNorm.map((n) => origForNorm.get(n)!);
    
    try {
      const res = await fetch("/api/cards/batch-images-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: batchOrigNames }),
      });

      if (res.ok) {
        const { ok, images } = await res.json();
        if (ok && images) {
          // Store results from database in both caches
          for (const [normalizedName, info] of Object.entries(images)) {
            const imageInfo = info as ImageInfo;
            if (imageInfo.small || imageInfo.normal || imageInfo.art_crop) {
              memCache.set(normalizedName, imageInfo);
              out.set(normalizedName, imageInfo);
            }
          }
        }
      }

      // Track which cards from this batch weren't found in database (or had no images)
      for (const n of batchNorm) {
        if (!out.has(n)) {
          dbMissesNorm.push(n);
        }
      }
    } catch (err) {
      console.warn("[getImagesForNames] Database batch fetch failed:", err);
      // On error, mark all as misses for Scryfall fallback
      dbMissesNorm.push(...batchNorm);
    }
  }

  // Fallback to Scryfall API for cards not found in database cache
  if (dbMissesNorm.length > 0) {
    try {
      // Batch fetch from Scryfall in chunks of 75 (Scryfall limit)
      for (let i = 0; i < dbMissesNorm.length; i += 75) {
        const batchNorm = dbMissesNorm.slice(i, i + 75);
        if (batchNorm.length === 0) continue;
        
        const identifiers = batchNorm.map((n) => ({ name: origForNorm.get(n)! }));
        
        try {
          const r = await fetch("https://api.scryfall.com/cards/collection", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ identifiers }),
            cache: "no-store",
          });

          if (r.ok) {
            const j: any = await r.json().catch(() => ({}));
            const data = Array.isArray(j?.data) ? j.data : [];
            const identifiers = batchNorm.map((n) => ({ name: origForNorm.get(n)! }));

            for (let idx = 0; idx < data.length; idx++) {
              const card = data[idx];
              const requestedName = identifiers[idx]?.name;
              const key = requestedName ? norm(requestedName) : norm(card?.name || "");
              if (!key || !origForNorm.has(key)) continue;

              let img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
              let info: ImageInfo = { small: img.small, normal: img.normal, art_crop: img.art_crop };
              if (card?.lang && card.lang !== "en" && requestedName) {
                const enInfo = await fetchEnglishCardImages(requestedName);
                if (enInfo?.normal || enInfo?.small) info = enInfo;
              }

              memCache.set(key, info);
              out.set(key, info);
            }
          }
        } catch (err) {
          console.warn("[getImagesForNames] Scryfall batch fetch failed:", err);
        }
      }
    } catch (err) {
      console.warn("[getImagesForNames] Scryfall fallback failed:", err);
    }
  }

  return out;
}

