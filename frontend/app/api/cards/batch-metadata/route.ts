import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";
import { withLogging } from "@/lib/api/withLogging";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { CachePresets } from "@/lib/api/cache";

const DAY = 24 * 60 * 60 * 1000;

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

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
    const keys = uniq.map(norm);
    
    logger.debug('[batch-metadata] Querying for', keys.length, 'unique cards');
    logger.debug('[batch-metadata] First 3 keys:', keys.slice(0, 3));

    // Fetch metadata from our scryfall_cache table
    const { data: rows, error } = await supabase
      .from("scryfall_cache")
      .select(
        "name, type_line, oracle_text, color_identity, rarity, set, small, normal, art_crop, legalities, keywords, colors, power, toughness, loyalty, is_land, is_creature, is_instant, is_sorcery, is_enchantment, is_artifact, is_planeswalker"
      )
      .in("name", keys);
    
    logger.debug('[batch-metadata] Query returned', rows?.length || 0, 'rows');
    if (error) logger.error('[batch-metadata] Query error:', error);
    if (rows && rows.length > 0) {
      logger.debug('[batch-metadata] First 3 rows:', rows.slice(0, 3));
      logger.debug('[batch-metadata] First row raw data:', JSON.stringify(rows[0], null, 2));
      logger.debug('[batch-metadata] Checking rarity field:', rows[0]?.rarity, 'type:', typeof rows[0]?.rarity);
    }

    const rowsArray = (rows || []) as any[];
    const dataMap = new Map();
    
    for (const row of rowsArray) {
      const base: Record<string, unknown> = {
        set: String(row.set || "").toUpperCase(),
        rarity: row.rarity ? String(row.rarity).toLowerCase() : null,
        type_line: String(row.type_line || ""),
        oracle_text: String(row.oracle_text || ""),
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
      dataMap.set(row.name, base);
    }

    // Format response for client
    const data: any[] = [];
    const not_found: any[] = [];
    
    for (const name of names) {
      const normalizedKey = norm(name.trim());
      const metadata = dataMap.get(normalizedKey);
      
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

