// frontend/lib/scryfall-cache.ts
// Helper to batch-fetch card images via the internal cache-backed endpoint.
// This keeps client-side display behavior aligned with imports/search/fix-name flows.

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
            const imageInfo: ImageInfo = {
              small: card?.small,
              normal: card?.normal,
              art_crop: card?.art_crop,
            };
            if (imageInfo.small || imageInfo.normal || imageInfo.art_crop) {
              memCache.set(key, imageInfo);
              out.set(key, imageInfo);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[getImagesForNames] Batch image fetch failed:", err);
    }
  }

  return out;
}

