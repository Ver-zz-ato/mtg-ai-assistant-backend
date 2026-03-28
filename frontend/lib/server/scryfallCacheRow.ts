/**
 * Canonical row shaping for public.scryfall_cache writes (Phase 2A+).
 * Single source for PK normalization and Scryfall API → DB upsert shape.
 * Reads are unchanged; consumers do not depend on new columns yet.
 */

/**
 * Light cleanup for image-fetch / prewarm inputs. Does not replace Scryfall resolution.
 * Phase 2B: drop obvious non-card strings before hitting the API or DB.
 */
export function sanitizeImageCacheInputName(raw: string): string | null {
  let s = String(raw || "").trim();
  if (!s) return null;
  // Strip common markdown / list noise (leading bullets, dashes)
  s = s.replace(/^[\s*•·‣⁃]+/u, "").trim();
  s = s.replace(/^[\-–—]\s+/u, "").trim();
  if (!s) return null;
  // Reject obvious sentence-like prompts (conservative — real card names stay well below these)
  if (s.length > 220) return null;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 28) return null;
  return s;
}

/**
 * Canonical PK for `scryfall_cache.name` / `name_norm`. Single source of truth for cache rows.
 *
 * **Lockstep copies** (must match this algorithm byte-for-byte):
 * - `bulk-jobs-server/server.js` → `norm()`
 *
 * **Near-match (do not use for scryfall_cache PK):** `bulk-price-import/route.ts` adds apostrophe
 * normalization for `price_cache` keys — intentional; not interchangeable with this function.
 */
export function normalizeScryfallCacheName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Optional structured logging for cache writes / merge (route or subsystem label). */
export type ScryfallCacheWriteContext = {
  route?: string;
  source?: string;
};

/**
 * Conservative type flags from full type_line (including MDFC " // ").
 * Uses word boundaries so "Island" does not match Land.
 */
export function deriveTypeFlagsFromTypeLine(typeLine: string | null | undefined): {
  is_land: boolean | null;
  is_creature: boolean | null;
  is_instant: boolean | null;
  is_sorcery: boolean | null;
  is_enchantment: boolean | null;
  is_artifact: boolean | null;
  is_planeswalker: boolean | null;
} {
  const nil = {
    is_land: null as boolean | null,
    is_creature: null as boolean | null,
    is_instant: null as boolean | null,
    is_sorcery: null as boolean | null,
    is_enchantment: null as boolean | null,
    is_artifact: null as boolean | null,
    is_planeswalker: null as boolean | null,
  };
  if (typeLine == null || !String(typeLine).trim()) return nil;
  const tl = String(typeLine);
  const has = (word: string) => new RegExp(`\\b${word}\\b`, "i").test(tl);
  return {
    is_land: has("Land"),
    is_creature: has("Creature"),
    is_instant: has("Instant"),
    is_sorcery: has("Sorcery"),
    is_enchantment: has("Enchantment"),
    is_artifact: has("Artifact"),
    is_planeswalker: has("Planeswalker"),
  };
}

export type ScryfallApiCard = Record<string, unknown>;

function legalitiesForUpsert(card: ScryfallApiCard): Record<string, string> | null {
  const leg = card.legalities;
  if (!leg || typeof leg !== "object" || Array.isArray(leg)) return null;
  const o = leg as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Full upsert row from a Scryfall API card object (collection, named, or bulk default_cards shape).
 * PK is always `normalizeScryfallCacheName` of top-level `card.name` only (never request key, never `card_faces[0].name`).
 * @returns null if `card.name` is missing or blank after trim — caller must not upsert.
 */
export function buildScryfallCacheRowFromApiCard(
  card: ScryfallApiCard,
  context?: ScryfallCacheWriteContext
): Record<string, unknown> | null {
  const raw = String(card.name ?? "").trim();
  if (!raw) {
    console.warn("[scryfall_cache] skip upsert: missing or empty top-level card.name", {
      set: card.set,
      collector_number: card.collector_number,
      ...context,
    });
    return null;
  }
  const nameKey = normalizeScryfallCacheName(raw);
  if (!nameKey) {
    console.warn("[scryfall_cache] skip upsert: normalized name empty", { ...context });
    return null;
  }
  return buildScryfallCacheRowCore(card, nameKey);
}

const MERGE_BOOLEAN_FLAG_KEYS = [
  "is_land",
  "is_creature",
  "is_instant",
  "is_sorcery",
  "is_enchantment",
  "is_artifact",
  "is_planeswalker",
] as const;

function isEmptyLegalities(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v !== "object" || Array.isArray(v)) return true;
  return Object.keys(v as Record<string, unknown>).length === 0;
}

/**
 * Phase 3 backfill: merge Scryfall API card into an existing row without replacing good data with nulls.
 * Returns null if API oracle identity does not match PK (historic junk / mismatch — skip row).
 */
export function mergeScryfallCacheRowFromApiCard(
  existing: Record<string, unknown>,
  card: ScryfallApiCard,
  context?: ScryfallCacheWriteContext
): Record<string, unknown> | null {
  const pk = String(existing.name ?? "");
  const fromApi = normalizeScryfallCacheName(String(card.name ?? "").trim());
  if (!pk) {
    console.warn("[scryfall_cache] merge skip: empty existing PK", { ...context });
    return null;
  }
  if (!String(card.name ?? "").trim()) {
    console.warn("[scryfall_cache] merge skip: empty API card.name", {
      existingPk: pk,
      set: card.set,
      collector_number: card.collector_number,
      ...context,
    });
    return null;
  }
  if (fromApi !== pk) {
    console.warn("[scryfall_cache] merge skip: DB PK does not match normalized API card.name", {
      existingPk: pk,
      apiCardName: String(card.name ?? ""),
      set: card.set,
      collector_number: card.collector_number,
      ...context,
    });
    return null;
  }

  const built = buildScryfallCacheRowFromApiCard(card, { ...context, source: context?.source ?? "mergeScryfallCacheRowFromApiCard" });
  if (!built) return null;
  const out: Record<string, unknown> = { ...built, name: pk, name_norm: pk };

  const takeExistingIfNewEmpty = (key: string) => {
    const newVal = built[key];
    const oldVal = existing[key];
    if (oldVal == null || oldVal === "") return;
    if (newVal == null || newVal === "") out[key] = oldVal;
  };

  for (const key of [
    "small",
    "normal",
    "art_crop",
    "type_line",
    "oracle_text",
    "color_identity",
    "colors",
    "keywords",
    "power",
    "toughness",
    "loyalty",
    "cmc",
    "mana_cost",
    "rarity",
    "set",
    "collector_number",
  ]) {
    takeExistingIfNewEmpty(key);
  }

  for (const key of MERGE_BOOLEAN_FLAG_KEYS) {
    const newVal = built[key];
    const oldVal = existing[key];
    if (newVal === null || newVal === undefined) {
      if (oldVal !== null && oldVal !== undefined) out[key] = oldVal;
    }
  }

  if (!isEmptyLegalities(existing.legalities) && isEmptyLegalities(built.legalities)) {
    out.legalities = existing.legalities;
  }

  return out;
}

/** Phase 3 backfill candidate filter (used by cron route). */
export function needsPhase3Backfill(row: Record<string, unknown>): boolean {
  const nn = row.name_norm;
  if (nn == null || String(nn).trim() === "") return true;
  if (isEmptyLegalities(row.legalities)) return true;

  const hasAnyTypeFlag =
    row.is_land != null ||
    row.is_creature != null ||
    row.is_instant != null ||
    row.is_sorcery != null ||
    row.is_enchantment != null ||
    row.is_artifact != null ||
    row.is_planeswalker != null;

  if (row.type_line && !hasAnyTypeFlag) return true;
  if ((row.small || row.normal) && !row.type_line && !hasAnyTypeFlag) return true;
  if (row.type_line && row.colors == null) return true;
  if (row.type_line && row.keywords == null) return true;

  return false;
}

/**
 * Shared row body for merge and full build (Phase 3).
 * `nameKey` must already be `normalizeScryfallCacheName(top-level card.name)` — never derived from `card_faces`.
 */
function buildScryfallCacheRowCore(card: ScryfallApiCard, nameKey: string): Record<string, unknown> {
  const faces = Array.isArray(card.card_faces) ? (card.card_faces as ScryfallApiCard[]) : [];
  const front = faces[0] as ScryfallApiCard | undefined;

  const imageUris = (card.image_uris as { small?: string; normal?: string; art_crop?: string } | undefined) || {};
  const faceUris =
    (front?.image_uris as { small?: string; normal?: string; art_crop?: string } | undefined) || {};
  const img = {
    small: imageUris.small ?? faceUris.small ?? null,
    normal: imageUris.normal ?? faceUris.normal ?? null,
    art_crop: imageUris.art_crop ?? faceUris.art_crop ?? null,
  };

  const oracleRaw =
    (card.oracle_text as string | undefined) ??
    (front?.oracle_text as string | undefined) ??
    null;
  const oracle_text = oracleRaw != null && String(oracleRaw).trim() !== "" ? String(oracleRaw).trim() : null;

  const manaCostRaw =
    (card.mana_cost as string | undefined) ?? (front?.mana_cost as string | undefined) ?? null;
  const mana_cost = manaCostRaw != null && String(manaCostRaw).trim() !== "" ? String(manaCostRaw).trim() : null;

  const cmcRaw = card.cmc ?? card.mana_value;
  const cmc = typeof cmcRaw === "number" ? Math.round(cmcRaw) : 0;

  const typeLineRaw = card.type_line != null ? String(card.type_line).trim() : "";
  const type_line = typeLineRaw !== "" ? typeLineRaw : null;

  const color_identity = Array.isArray(card.color_identity) ? (card.color_identity as string[]) : [];

  const colors = Array.isArray(card.colors) ? (card.colors as string[]) : null;
  const keywords = Array.isArray(card.keywords) ? (card.keywords as string[]) : null;

  const power =
    card.power != null && String(card.power).trim() !== ""
      ? String(card.power)
      : front?.power != null && String(front.power).trim() !== ""
        ? String(front.power)
        : null;
  const toughness =
    card.toughness != null && String(card.toughness).trim() !== ""
      ? String(card.toughness)
      : front?.toughness != null && String(front.toughness).trim() !== ""
        ? String(front.toughness)
        : null;
  const loyalty =
    card.loyalty != null && String(card.loyalty).trim() !== ""
      ? String(card.loyalty)
      : front?.loyalty != null && String(front.loyalty).trim() !== ""
        ? String(front.loyalty)
        : null;

  const flags = deriveTypeFlagsFromTypeLine(type_line);

  const rarity = card.rarity ? String(card.rarity).toLowerCase().trim() : null;
  const set = card.set ? String(card.set).toUpperCase().trim() : null;
  const collector_number =
    card.collector_number != null && String(card.collector_number).trim() !== ""
      ? String(card.collector_number).trim()
      : null;

  const legalities = legalitiesForUpsert(card);

  return {
    name: nameKey,
    name_norm: nameKey,
    small: img.small,
    normal: img.normal,
    art_crop: img.art_crop,
    type_line,
    oracle_text,
    color_identity,
    colors,
    keywords,
    power,
    toughness,
    loyalty,
    ...flags,
    cmc,
    mana_cost,
    rarity,
    set,
    collector_number,
    legalities,
    updated_at: new Date().toISOString(),
  };
}

/** Image-only refresh rows (TTL); keeps name/name_norm aligned without inventing card text. */
export function buildScryfallCachePartialImageRow(
  nameKey: string,
  images: { small?: string | null; normal?: string | null; art_crop?: string | null }
): Record<string, unknown> {
  const k = normalizeScryfallCacheName(nameKey);
  return {
    name: k,
    name_norm: k,
    small: images.small ?? null,
    normal: images.normal ?? null,
    art_crop: images.art_crop ?? null,
    updated_at: new Date().toISOString(),
  };
}
