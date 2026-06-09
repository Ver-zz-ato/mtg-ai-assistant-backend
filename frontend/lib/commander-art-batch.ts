/**
 * Batch-fetch commander art via the cache-backed batch-images API.
 * Replaces per-commander GET /api/commander-art fan-out on the homepage.
 */

export async function fetchCommanderArtBatch(
  names: string[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const unique = [...new Set(names.map((n) => String(n || "").trim()).filter(Boolean))];
  if (unique.length === 0) return map;

  try {
    const res = await fetch("/api/cards/batch-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: unique }),
    });
    if (!res.ok) return map;

    const { data } = await res.json();
    if (!Array.isArray(data)) return map;

    for (const card of data) {
      const name = card?.name;
      if (!name) continue;
      const uris = card?.image_uris || {};
      const art =
        uris.art_crop || uris.normal || card?.art_crop || card?.normal;
      if (art) map[name] = art;
    }
  } catch {
    // Caller shows placeholder art on miss
  }

  return map;
}
