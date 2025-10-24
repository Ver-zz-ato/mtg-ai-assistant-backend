// frontend/lib/scryfall-cache.ts
// Helper to batch-fetch card images from internal scryfall_cache database
// Uses internal API instead of hitting Scryfall directly

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
 * Fetch card images from internal cache database
 * Much faster and doesn't spam Scryfall API
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

      if (!res.ok) continue;

      const { ok, images } = await res.json();
      if (!ok || !images) continue;

      // Store results in both caches
      for (const [normalizedName, info] of Object.entries(images)) {
        const imageInfo = info as ImageInfo;
        memCache.set(normalizedName, imageInfo);
        out.set(normalizedName, imageInfo);
      }
    } catch (err) {
      console.warn("[getImagesForNames] Batch fetch failed:", err);
    }
  }

  return out;
}

