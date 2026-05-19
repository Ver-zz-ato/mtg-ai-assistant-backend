// frontend/lib/scryfall-cache.ts
// Helper to batch-fetch card images via the internal cache-backed endpoint.
// This keeps client-side display behavior aligned with imports/search/fix-name flows.

import { getImagesForNames as getImagesFromScryfall } from "@/lib/scryfall";

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

function coerceImageInfo(raw: Partial<ImageInfo> | null | undefined): ImageInfo {
  const small = raw?.small || raw?.normal || raw?.art_crop;
  const normal = raw?.normal || raw?.small || raw?.art_crop;
  const art_crop = raw?.art_crop || raw?.normal || raw?.small;
  return { small, normal, art_crop };
}

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

  // Fetch misses from the cache-backed API in batches of 150.
  for (let i = 0; i < missesNorm.length; i += 150) {
    const batchNorm = missesNorm.slice(i, i + 150);
    if (batchNorm.length === 0) continue;

    const batchOrigNames = batchNorm.map((n) => origForNorm.get(n)!);

    try {
      const res = await fetch("/api/cards/batch-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: batchOrigNames }),
      });

      if (res.ok) {
        const { data } = await res.json();
        if (Array.isArray(data)) {
          for (const card of data) {
            const key = norm(card?.name || "");
            if (!key) continue;
            const imageUris = card?.image_uris || {};
            const imageInfo = coerceImageInfo({
              small: card?.small || imageUris?.small,
              normal: card?.normal || imageUris?.normal,
              art_crop: card?.art_crop || imageUris?.art_crop,
            });
            if (imageInfo.small || imageInfo.normal || imageInfo.art_crop) {
              memCache.set(key, imageInfo);
              out.set(key, imageInfo);
            }
          }
        }
      }

      const unresolvedNorm = batchNorm.filter((n) => !out.has(n));
      if (unresolvedNorm.length > 0) {
        const fallbackImages = await getImagesFromScryfall(unresolvedNorm.map((n) => origForNorm.get(n)!));
        fallbackImages.forEach((info, key) => {
          const imageInfo = coerceImageInfo(info);
          if (imageInfo.small || imageInfo.normal || imageInfo.art_crop) {
            memCache.set(key, imageInfo);
            out.set(key, imageInfo);
          }
        });
      }
    } catch (err) {
      console.warn("[getImagesForNames] Batch image fetch failed:", err);
      try {
        const fallbackImages = await getImagesFromScryfall(batchOrigNames);
        fallbackImages.forEach((info, key) => {
          const imageInfo = coerceImageInfo(info);
          if (imageInfo.small || imageInfo.normal || imageInfo.art_crop) {
            memCache.set(key, imageInfo);
            out.set(key, imageInfo);
          }
        });
      } catch (fallbackErr) {
        console.warn("[getImagesForNames] Direct Scryfall fallback failed:", fallbackErr);
      }
    }
  }

  return out;
}

