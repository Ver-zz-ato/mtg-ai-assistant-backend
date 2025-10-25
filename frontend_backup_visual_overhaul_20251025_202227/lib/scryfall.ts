// frontend/lib/scryfall.ts
// Helper to batch-fetch Scryfall images for a list of card names using /cards/collection.
// Returns a map from normalized name to { small, normal, art_crop } image URIs.
// Uses a simple in-memory cache to reduce duplicate network hits during a session.

export type ImageInfo = { small?: string; normal?: string; art_crop?: string };

const memCache: Map<string, ImageInfo> = new Map(); // key = normalized name

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export async function getImagesForNames(names: string[]): Promise<Map<string, ImageInfo>> {
  const out = new Map<string, ImageInfo>();
  if (!Array.isArray(names) || names.length === 0) return out;

  // Map normalized -> first seen original so we can query Scryfall with exact names
  const origForNorm = new Map<string, string>();
  for (const raw of names) {
    const n = norm(raw);
    if (!n) continue;
    if (!origForNorm.has(n)) origForNorm.set(n, String(raw));
  }

  // Partition into cache hits and misses (by normalized key)
  const missesNorm: string[] = [];
  for (const n of origForNorm.keys()) {
    if (memCache.has(n)) {
      out.set(n, memCache.get(n)!);
    } else {
      missesNorm.push(n);
    }
  }

  // Batch fetch in chunks of 75 (Scryfall limit)
  for (let i = 0; i < missesNorm.length; i += 75) {
    const batchNorm = missesNorm.slice(i, i + 75);
    if (batchNorm.length === 0) continue;
    const identifiers = batchNorm.map((n) => ({ name: origForNorm.get(n)! })); // use original names for accuracy
    const body = { identifiers } as any;
    const unresolved = new Set(batchNorm);
    try {
      const r = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const ok = r.ok;
      const j: any = ok ? await r.json().catch(() => ({})) : {};
      const data = Array.isArray(j?.data) ? j.data : [];
      for (const card of data) {
        const key = norm(card?.name || "");
        const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
        const info: ImageInfo = { small: img.small, normal: img.normal, art_crop: img.art_crop };
        if (key) {
          memCache.set(key, info);
          out.set(key, info);
          unresolved.delete(key);
        }
      }

      // Fuzzy fallback for any unresolved names in this batch (best-effort, small volume)
      if (unresolved.size > 0) {
        const pending = Array.from(unresolved).slice(0, 20); // cap to be gentle
        await Promise.all(
          pending.map(async (n) => {
            const orig = origForNorm.get(n)!;
            try {
              const fr = await fetch(
                `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(orig)}`,
                { cache: "no-store" }
              );
              if (!fr.ok) return;
              const card: any = await fr.json().catch(() => ({}));
              const key = norm(card?.name || "");
              if (!key) return;
              const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
              const info: ImageInfo = { small: img.small, normal: img.normal, art_crop: img.art_crop };
              memCache.set(key, info);
              out.set(key, info);
            } catch {}
          })
        );
      }
    } catch {}
  }

  return out;
}
