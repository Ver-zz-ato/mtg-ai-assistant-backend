// lib/server/scryfallCache.ts
import { createClient } from "@/lib/supabase/server";
import { ImageInfo, fetchEnglishCardImages } from "@/lib/scryfall";

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

// Returns a map of normalized name -> rich card object containing type_line, oracle_text, color_identity, and image URIs
export async function getDetailsForNamesCached(names: string[]) {
  const supabase = await createClient();
  const uniq = Array.from(new Set((names || []).filter(Boolean)));
  const keys = uniq.map(norm);
  const out = new Map<string, any>();
  if (!keys.length) return out;

  type Row = { name: string; small: string|null; normal: string|null; art_crop: string|null; type_line?: string|null; oracle_text?: string|null; color_identity?: string[]|null; rarity?: string|null; set?: string|null; collector_number?: string|null; legalities?: Record<string, string>|null; updated_at?: string|null };
  let rows: Row[] = [];
  try {
    const { data } = await supabase
      .from("scryfall_cache")
      .select("name, small, normal, art_crop, type_line, oracle_text, color_identity, rarity, set, collector_number, legalities, updated_at")
      .in("name", keys);
    rows = (data || []) as any;
    for (const row of rows) {
      out.set(row.name, {
        image_uris: { small: row.small || undefined, normal: row.normal || undefined, art_crop: row.art_crop || undefined },
        type_line: row.type_line || undefined,
        oracle_text: row.oracle_text || undefined,
        color_identity: row.color_identity || [],
        rarity: row.rarity || undefined,
        set: row.set || undefined,
        collector_number: row.collector_number || undefined,
        legalities: (row.legalities && typeof row.legalities === "object") ? row.legalities as Record<string, string> : undefined,
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
        headers: {
          "content-type": "application/json",
          Accept: "application/json",
          "User-Agent": "ManaTap-AI/1.0 (https://manatap.ai)",
        },
        body: JSON.stringify({ identifiers }),
      });
      const j: any = await r.json().catch(() => ({}));
      const dataRows: any[] = Array.isArray(j?.data) ? j.data : [];
      const up: any[] = [];
      for (let idx = 0; idx < dataRows.length; idx++) {
        const c = dataRows[idx];
        const requestedName = toFetch[idx] !== undefined ? uniq[keys.indexOf(toFetch[idx])] : null;
        const key = requestedName ? norm(requestedName) : norm(c?.name || "");
        if (!key) continue;
        let img = c?.image_uris || c?.card_faces?.[0]?.image_uris || {};
        // Prefer English: Scryfall collection returns "newest" which can be non-English
        if (c?.lang && c.lang !== "en" && requestedName) {
          const enInfo = await fetchEnglishCardImages(requestedName);
          if (enInfo?.normal || enInfo?.small) {
            img = { small: enInfo.small, normal: enInfo.normal, art_crop: enInfo.art_crop };
          }
        }
        const colorIdentity = Array.isArray(c?.color_identity) ? c.color_identity : [];
        const legalities = (c?.legalities && typeof c.legalities === "object") ? c.legalities as Record<string, string> : null;
        out.set(key, { 
          image_uris: img, 
          type_line: c?.type_line, 
          oracle_text: c?.oracle_text || c?.card_faces?.[0]?.oracle_text,
          color_identity: colorIdentity,
          rarity: c?.rarity,
          set: c?.set,
          collector_number: c?.collector_number,
          legalities: legalities ?? undefined,
        });
        up.push({
          name: key,
          small: img.small || null,
          normal: img.normal || null,
          art_crop: img.art_crop || null,
          type_line: c?.type_line || null,
          oracle_text: c?.oracle_text || (c?.card_faces?.[0]?.oracle_text || null),
          color_identity: colorIdentity,
          rarity: c?.rarity || null,
          set: c?.set || null,
          collector_number: c?.collector_number || null,
          legalities,
          updated_at: new Date().toISOString(),
        });
      }
      if (up.length) await supabase.from("scryfall_cache").upsert(up, { onConflict: "name" });
    } catch {}
  }

  return out;
}

/** Cache-only read: type_line + oracle_text from scryfall_cache. No live Scryfall fetch. Used for module detection. */
export async function getDetailsForNamesCacheOnly(names: string[]) {
  const supabase = await createClient();
  const uniq = Array.from(new Set((names || []).filter(Boolean)));
  const keys = uniq.map(norm);
  const out = new Map<string, { type_line?: string; oracle_text?: string }>();
  if (!keys.length) return out;
  try {
    const { data } = await supabase
      .from("scryfall_cache")
      .select("name, type_line, oracle_text")
      .in("name", keys);
    const rows = (data || []) as { name: string; type_line?: string | null; oracle_text?: string | null }[];
    for (const row of rows) {
      out.set(row.name, {
        type_line: row.type_line ?? undefined,
        oracle_text: row.oracle_text ?? undefined,
      });
    }
  } catch {}
  return out;
}

// Specialized function for profile trends - gets color identity and card details for analysis
export async function getCardDataForProfileTrends(names: string[]) {
  const supabase = await createClient();
  const uniq = Array.from(new Set((names || []).filter(Boolean)));
  const keys = uniq.map(norm);
  const out = new Map<string, any>();
  if (!keys.length) return out;

  // Get cached data first - include cmc and mana_cost from our bulk import
  try {
    const { data, error } = await supabase
      .from("scryfall_cache")
      .select("name, type_line, oracle_text, color_identity, cmc, mana_cost, updated_at")
      .in("name", keys);
    const rows = (data || []) as any[];
    
    for (const row of rows) {
      // Use cached data regardless of staleness since we have comprehensive bulk import now
      out.set(row.name, {
        type_line: row.type_line || '',
        oracle_text: row.oracle_text || '',
        color_identity: row.color_identity || [],
        cmc: row.cmc || 0,
        mana_cost: row.mana_cost || ''
      });
    }
  } catch {}

  return out;
}

/** Enrichment data for deck intelligence. Returns type_line, oracle_text, color_identity, cmc, mana_cost, legalities, power, toughness, layout. */
export type EnrichmentRow = {
  name: string;
  type_line?: string;
  oracle_text?: string;
  color_identity?: string[];
  cmc?: number;
  mana_cost?: string;
  legalities?: Record<string, string>;
  power?: string;
  toughness?: string;
  layout?: string;
  cache_miss?: boolean;
};

/** Batch enrichment for deck cards. Cache + Scryfall API fallback. Power/toughness/layout from API when fetched. */
export async function getEnrichmentForNames(names: string[]): Promise<Map<string, EnrichmentRow>> {
  const supabase = await createClient();
  const uniq = Array.from(new Set((names || []).filter(Boolean)));
  const keys = uniq.map(norm);
  const out = new Map<string, EnrichmentRow>();
  if (!keys.length) return out;

  type Row = { name: string; type_line?: string|null; oracle_text?: string|null; color_identity?: string[]|null; cmc?: number|null; mana_cost?: string|null; legalities?: Record<string, string>|null; updated_at?: string|null };
  let rows: Row[] = [];
  try {
    const { data } = await supabase
      .from("scryfall_cache")
      .select("name, type_line, oracle_text, color_identity, cmc, mana_cost, legalities, updated_at")
      .in("name", keys);
    rows = (data || []) as Row[];
    for (const row of rows) {
      if (!row.name) continue;
      out.set(row.name, {
        name: row.name,
        type_line: row.type_line ?? undefined,
        oracle_text: row.oracle_text ?? undefined,
        color_identity: row.color_identity ?? [],
        cmc: typeof row.cmc === "number" ? row.cmc : undefined,
        mana_cost: row.mana_cost ?? undefined,
        legalities: (row.legalities && typeof row.legalities === "object") ? (row.legalities as Record<string, string>) : undefined,
      });
    }
  } catch {}

  const present = new Set(rows.map((r) => r.name));
  const misses = keys.filter((k) => !present.has(k));
  const stale = rows.filter((r) => isStale(r.updated_at)).map((r) => r.name);
  const toFetch = Array.from(new Set([...misses, ...stale])).slice(0, MAX_REFRESH_PER_REQUEST);

  if (toFetch.length) {
    try {
      const identifiers = toFetch.map((n) => ({ name: uniq[keys.indexOf(n)] }));
      const r = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Accept: "application/json",
          "User-Agent": "ManaTap-AI/1.0 (https://manatap.ai)",
        },
        body: JSON.stringify({ identifiers }),
      });
      const j: any = await r.json().catch(() => ({}));
      const dataRows: any[] = Array.isArray(j?.data) ? j.data : [];
      const up: any[] = [];
      for (let idx = 0; idx < dataRows.length; idx++) {
        const c = dataRows[idx];
        const requestedName = toFetch[idx] !== undefined ? uniq[keys.indexOf(toFetch[idx])] : null;
        const key = requestedName ? norm(requestedName) : norm(c?.name || "");
        if (!key) continue;
        const colorIdentity = Array.isArray(c?.color_identity) ? c.color_identity : [];
        const legalities = (c?.legalities && typeof c.legalities === "object") ? (c.legalities as Record<string, string>) : null;
        const oracleText = c?.oracle_text ?? c?.card_faces?.[0]?.oracle_text;
        const front = c?.card_faces?.[0];
        out.set(key, {
          name: key,
          type_line: c?.type_line,
          oracle_text: oracleText,
          color_identity: colorIdentity,
          cmc: typeof c?.cmc === "number" ? c.cmc : undefined,
          mana_cost: c?.mana_cost ?? front?.mana_cost,
          legalities: legalities ?? undefined,
          power: c?.power ?? front?.power,
          toughness: c?.toughness ?? front?.toughness,
          layout: c?.layout,
        });
        up.push({
          name: key,
          type_line: c?.type_line || null,
          oracle_text: oracleText || null,
          color_identity: colorIdentity,
          cmc: typeof c?.cmc === "number" ? c.cmc : 0,
          mana_cost: c?.mana_cost ?? front?.mana_cost ?? null,
          legalities,
          updated_at: new Date().toISOString(),
        });
      }
      if (up.length) {
        await supabase.from("scryfall_cache").upsert(up, { onConflict: "name" });
      }
    } catch (e) {
      if (process.env.DEBUG_DECK_INTELLIGENCE === "1") {
        console.warn("[DECK_ENRICH] Scryfall fetch failed:", e);
      }
    }
  }

  for (const k of keys) {
    if (!out.has(k)) {
      out.set(k, { name: k, cache_miss: true });
      if (process.env.DEBUG_DECK_INTELLIGENCE === "1") {
        console.log(`[DECK_ENRICH] cache_miss: ${k}`);
      }
    }
  }
  return out;
}
