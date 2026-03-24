/**
 * Deck enrichment: fetch card data from scryfall_cache for deck intelligence.
 * Handles normalization, split/MDFC/adventure names, and graceful fallback on cache miss.
 */

import { getEnrichmentForNames, type EnrichmentRow } from "@/lib/server/scryfallCache";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export type EnrichedCard = {
  name: string;
  qty: number;
  type_line?: string;
  oracle_text?: string;
  color_identity?: string[];
  cmc?: number;
  mana_cost?: string;
  legalities?: Record<string, string>;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  keywords?: string[];
  layout?: string;
  commander_eligible?: boolean;
  /** From scryfall_cache when present; see Phase 4I role tagging / deck facts. */
  is_land?: boolean;
  is_creature?: boolean;
  cache_miss?: boolean;
};

function resolveScryfallName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.includes("//")) {
    return n.split("//")[0].trim();
  }
  return n;
}

/** Exported for rules-facts module. Checks commander eligibility per MTG rules. */
export function isCommanderEligible(typeLine: string | undefined, oracleText: string | undefined): boolean {
  if (!typeLine) return false;
  const tl = typeLine.toLowerCase();
  const ot = (oracleText || "").toLowerCase();
  if (tl.includes("legendary creature")) return true;
  if (tl.includes("legendary planeswalker") && ot.includes("can be your commander")) return true;
  if (ot.includes("can be your commander")) return true;
  if (ot.includes("choose a background")) return true;
  if (ot.includes("partner with") || ot.includes("partner")) return true;
  if (ot.includes("friends forever")) return true;
  if (ot.includes("doctor's companion")) return true;
  return false;
}

export type EnrichDeckOptions = {
  format?: "Commander" | "Modern" | "Pioneer";
  commander?: string | null;
};

/**
 * Enrich deck entries from scryfall_cache. Returns EnrichedCard[] with cache_miss flag for unresolved cards.
 */
export async function enrichDeck(
  entries: Array<{ name: string; qty: number }>,
  _options: EnrichDeckOptions = {}
): Promise<EnrichedCard[]> {
  if (entries.length === 0) return [];

  const namesToFetch = entries.map((e) => resolveScryfallName(e.name));
  const uniqueNames = Array.from(new Set(namesToFetch.filter(Boolean)));
  const lookupNames = uniqueNames;

  const enrichmentMap = await getEnrichmentForNames(lookupNames);

  const result: EnrichedCard[] = [];
  for (const { name, qty } of entries) {
    const resolved = resolveScryfallName(name);
    const key = norm(resolved);
    const row = enrichmentMap.get(key);
    if (!row) {
      result.push({ name: name.trim(), qty, cache_miss: true });
      continue;
    }
    const r = row as EnrichmentRow;
    result.push({
      name: name.trim(),
      qty,
      type_line: r.type_line,
      oracle_text: r.oracle_text,
      color_identity: r.color_identity,
      cmc: r.cmc,
      mana_cost: r.mana_cost,
      legalities: r.legalities,
      power: r.power,
      toughness: r.toughness,
      loyalty: r.loyalty,
      colors: r.colors,
      keywords: r.keywords,
      layout: r.layout,
      commander_eligible: isCommanderEligible(r.type_line, r.oracle_text),
      cache_miss: r.cache_miss,
      ...(typeof r.is_land === "boolean" ? { is_land: r.is_land } : {}),
      ...(typeof r.is_creature === "boolean" ? { is_creature: r.is_creature } : {}),
    });
  }
  return result;
}
