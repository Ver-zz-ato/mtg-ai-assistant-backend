import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";
import { withLogging } from "@/lib/api/withLogging";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { CachePresets } from "@/lib/api/cache";
import {
  normalizeScryfallCacheName,
  scryfallCacheLookupNameKeys,
} from "@/lib/scryfall-cache-lookup";

const DAY = 24 * 60 * 60 * 1000;
const IN_CHUNK = 80;

function coerceStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string");
  return out.length ? out : undefined;
}

function optionalBool(v: unknown): boolean | undefined {
  if (v === true) return true;
  if (v === false) return false;
  return undefined;
}

function optionalStat(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

/** Non-empty jsonb legalities only. */
function normalizeLegalities(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { names } = body;

    if (!names || !Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: "Invalid names array" }, { status: 400 });
    }

    const cacheKey = `batch-metadata:v2:${names.sort().join(",")}`;
    const cached = memoGet<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    const supabase = await createClient();
    const uniq = Array.from(new Set(names.map((n: string) => n.trim()).filter(Boolean)));
    const allLookupKeys = new Set<string>();
    for (const name of uniq) {
      for (const key of scryfallCacheLookupNameKeys(name)) {
        allLookupKeys.add(key);
      }
    }
    const lookupList = [...allLookupKeys];

    logger.debug("[batch-metadata] Querying for", lookupList.length, "lookup keys from", uniq.length, "names");

    const rowsArray: any[] = [];
    for (let i = 0; i < lookupList.length; i += IN_CHUNK) {
      const chunk = lookupList.slice(i, i + IN_CHUNK);
      const { data: rows, error } = await supabase
        .from("scryfall_cache")
        .select(
          "name, type_line, oracle_text, mana_cost, cmc, color_identity, rarity, set, collector_number, small, normal, art_crop, legalities, keywords, colors, power, toughness, loyalty, is_land, is_creature, is_instant, is_sorcery, is_enchantment, is_artifact, is_planeswalker",
        )
        .in("name", chunk);
      if (error) logger.error("[batch-metadata] Query error:", error);
      if (rows?.length) rowsArray.push(...rows);
    }

    logger.debug("[batch-metadata] Query returned", rowsArray.length, "rows");

    const dataMap = new Map<string, Record<string, unknown>>();
    
    for (const row of rowsArray) {
      const base: Record<string, unknown> = {
        set: String(row.set || "").toUpperCase(),
        collector_number: row.collector_number ? String(row.collector_number) : null,
        rarity: row.rarity ? String(row.rarity).toLowerCase() : null,
        type_line: String(row.type_line || ""),
        oracle_text: String(row.oracle_text || ""),
        mana_cost: row.mana_cost ? String(row.mana_cost) : null,
        cmc: typeof row.cmc === "number" ? row.cmc : null,
        color_identity: Array.isArray(row.color_identity) ? row.color_identity : [],
        image_uris: {
          small: row.small || undefined,
          normal: row.normal || undefined,
          art_crop: row.art_crop || undefined,
        },
      };
      const leg = normalizeLegalities(row.legalities);
      if (leg) base.legalities = leg;
      const kw = coerceStringArray(row.keywords);
      if (kw) base.keywords = kw;
      const col = coerceStringArray(row.colors);
      if (col) base.colors = col;
      const p = optionalStat(row.power);
      const t = optionalStat(row.toughness);
      const l = optionalStat(row.loyalty);
      if (p !== undefined) base.power = p;
      if (t !== undefined) base.toughness = t;
      if (l !== undefined) base.loyalty = l;
      const il = optionalBool(row.is_land);
      const ic = optionalBool(row.is_creature);
      const ii = optionalBool(row.is_instant);
      const is = optionalBool(row.is_sorcery);
      const ie = optionalBool(row.is_enchantment);
      const ia = optionalBool(row.is_artifact);
      const ip = optionalBool(row.is_planeswalker);
      if (il !== undefined) base.is_land = il;
      if (ic !== undefined) base.is_creature = ic;
      if (ii !== undefined) base.is_instant = ii;
      if (is !== undefined) base.is_sorcery = is;
      if (ie !== undefined) base.is_enchantment = ie;
      if (ia !== undefined) base.is_artifact = ia;
      if (ip !== undefined) base.is_planeswalker = ip;
      dataMap.set(normalizeScryfallCacheName(String(row.name || "")), base);
    }

    // Format response for client
    const data: any[] = [];
    const not_found: any[] = [];
    
    for (const name of names) {
      const trimmed = name.trim();
      let metadata: Record<string, unknown> | undefined;
      for (const key of scryfallCacheLookupNameKeys(trimmed)) {
        metadata = dataMap.get(key);
        if (metadata) break;
      }
      
      if (metadata) {
        data.push({
          name: name.trim(),
          ...metadata
        });
      } else {
        not_found.push({ name: name.trim() });
      }
    }
    
    const result = { data, not_found };

    // Cache for 1 day
    memoSet(cacheKey, result, DAY);
    
    return NextResponse.json(result, { 
      status: 200,
      headers: CachePresets.LONG
    });
  } catch (error) {
    logger.error('Batch metadata API error:', error);
    return NextResponse.json(
      { error: "Failed to fetch card metadata" }, 
      { status: 500 }
    );
  }
});
