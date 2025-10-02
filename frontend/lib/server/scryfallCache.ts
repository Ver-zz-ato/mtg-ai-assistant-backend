// lib/server/scryfallCache.ts
import { createClient } from "@/lib/supabase/server";
import { ImageInfo } from "@/lib/scryfall";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export const SCRYFALL_CACHE_TTL_DAYS = 30;
const MAX_REFRESH_PER_REQUEST = 200; // cap to reduce burst refreshes (raised for better banner coverage on listings)

import { isStale } from "./scryfallTtl";

export async function getImagesForNamesCached(names: string[]) {
  const supabase = await createClient();
  const uniq = Array.from(new Set((names || []).filter(Boolean)));
  const keys = uniq.map(norm);
  if (keys.length === 0) return new Map<string, ImageInfo>();
  const out = new Map<string, ImageInfo>();

  // 1) try DB cache
  type Row = { name: string; small: string|null; normal: string|null; art_crop: string|null; updated_at?: string|null };
  let rows: Row[] = [];
  try {
    const { data } = await supabase
      .from("scryfall_cache")
      .select("name, small, normal, art_crop, updated_at")
      .in("name", keys);
    rows = (data || []) as any;
    for (const row of rows) {
      out.set(row.name, { small: row.small || undefined, normal: row.normal || undefined, art_crop: row.art_crop || undefined });
    }
  } catch {}

  // Determine misses and stale rows (refresh limited per-request)
  const present = new Set(rows.map(r=>r.name));
  const misses = keys.filter((k) => !present.has(k));
  const stale = rows.filter(r => isStale(r.updated_at)).map(r => r.name);
  const toFetch = Array.from(new Set([...misses, ...stale])).slice(0, MAX_REFRESH_PER_REQUEST);

  // 2) fetch needed from Scryfall and upsert
  if (toFetch.length) {
    try {
      const { getImagesForNames } = await import("@/lib/scryfall");
      const fetched = await getImagesForNames(toFetch);
      const up: any[] = [];
      fetched.forEach((v, k) => {
        out.set(k, v);
        up.push({ name: k, small: v.small || null, normal: v.normal || null, art_crop: v.art_crop || null, updated_at: new Date().toISOString() });
      });
      if (up.length) {
        await supabase.from("scryfall_cache").upsert(up, { onConflict: "name" });
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

  type Row = { name: string; small: string|null; normal: string|null; art_crop: string|null; type_line?: string|null; oracle_text?: string|null; updated_at?: string|null };
  let rows: Row[] = [];
  try {
    const { data } = await supabase
      .from("scryfall_cache")
      .select("name, small, normal, art_crop, type_line, oracle_text, updated_at")
      .in("name", keys);
    rows = (data || []) as any;
    for (const row of rows) {
      out.set(row.name, {
        image_uris: { small: row.small || undefined, normal: row.normal || undefined, art_crop: row.art_crop || undefined },
        type_line: row.type_line || undefined,
        oracle_text: row.oracle_text || undefined,
      });
    }
  } catch {}

  const present = new Set(rows.map(r=>r.name));
  const misses = keys.filter((k) => !present.has(k));
  const stale = rows.filter(r => isStale(r.updated_at)).map(r => r.name);
  const toFetch = Array.from(new Set([...misses, ...stale])).slice(0, MAX_REFRESH_PER_REQUEST);

  if (toFetch.length) {
    try {
      const identifiers = toFetch.map((n) => ({ name: uniq[keys.indexOf(n)] }));
      const r = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifiers }),
      });
      const j: any = await r.json().catch(() => ({}));
      const dataRows: any[] = Array.isArray(j?.data) ? j.data : [];
      const up: any[] = [];
      for (const c of dataRows) {
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
