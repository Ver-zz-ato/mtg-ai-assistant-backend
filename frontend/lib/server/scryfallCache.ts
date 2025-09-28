// lib/server/scryfallCache.ts
import { createClient } from "@/lib/supabase/server";
import { ImageInfo } from "@/lib/scryfall";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export async function getImagesForNamesCached(names: string[]) {
  const supabase = await createClient();
  const uniq = Array.from(new Set((names || []).filter(Boolean)));
  const keys = uniq.map(norm);
  if (keys.length === 0) return new Map<string, ImageInfo>();
  const out = new Map<string, ImageInfo>();

  // 1) try DB cache
  try {
    const { data } = await supabase
      .from("scryfall_cache")
      .select("name, small, normal, art_crop")
      .in("name", keys);
    for (const row of (data || [])) {
      out.set(row.name, { small: row.small || undefined, normal: row.normal || undefined, art_crop: row.art_crop || undefined });
    }
  } catch {}

  // 2) fetch misses from Scryfall and upsert
  const misses = keys.filter((k) => !out.has(k));
  if (misses.length) {
    try {
      const { getImagesForNames } = await import("@/lib/scryfall");
      const fetched = await getImagesForNames(misses);
      const rows: any[] = [];
      fetched.forEach((v, k) => {
        out.set(k, v);
        rows.push({ name: k, small: v.small || null, normal: v.normal || null, art_crop: v.art_crop || null, updated_at: new Date().toISOString() });
      });
      if (rows.length) {
        await supabase.from("scryfall_cache").upsert(rows, { onConflict: "name" });
      }
    } catch {}
  }

  return out;
}

// Returns a map of normalized name -> rich card object containing type_line, oracle_text, and image URIs
export async function getDetailsForNamesCached(names: string[]) {
  const supabase = await createClient();
  const uniq = Array.from(new Set((names || []).filter(Boolean)));
  const keys = uniq.map(norm);
  const out = new Map<string, any>();
  if (!keys.length) return out;

  try {
    const { data } = await supabase
      .from("scryfall_cache")
      .select("name, small, normal, art_crop, type_line, oracle_text")
      .in("name", keys);
    for (const row of (data || [])) {
      out.set(row.name, {
        image_uris: { small: row.small || undefined, normal: row.normal || undefined, art_crop: row.art_crop || undefined },
        type_line: row.type_line || undefined,
        oracle_text: row.oracle_text || undefined,
      });
    }
  } catch {}

  const misses = keys.filter((k) => !out.has(k));
  if (misses.length) {
    try {
      const identifiers = misses.map((n) => ({ name: uniq[keys.indexOf(n)] }));
      const r = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifiers }),
      });
      const j: any = await r.json().catch(() => ({}));
      const rows: any[] = Array.isArray(j?.data) ? j.data : [];
      const up: any[] = [];
      for (const c of rows) {
        const key = norm(c?.name || "");
        const img = c?.image_uris || c?.card_faces?.[0]?.image_uris || {};
        out.set(key, { image_uris: img, type_line: c?.type_line, oracle_text: c?.oracle_text || c?.card_faces?.[0]?.oracle_text });
        up.push({
          name: key,
          small: img.small || null,
          normal: img.normal || null,
          art_crop: img.art_crop || null,
          type_line: c?.type_line || null,
          oracle_text: c?.oracle_text || (c?.card_faces?.[0]?.oracle_text || null),
          updated_at: new Date().toISOString(),
        });
      }
      if (up.length) await supabase.from("scryfall_cache").upsert(up, { onConflict: "name" });
    } catch {}
  }

  return out;
}
