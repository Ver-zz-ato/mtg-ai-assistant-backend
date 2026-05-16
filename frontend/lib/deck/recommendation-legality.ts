/**
 * Server-side enforcement for suggested / recommended card names.
 * Drops banned, not_legal, and unknown (cache miss / missing legality) cards before responses.
 */

import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { getBannedCards, bannedDataToMaps } from "@/lib/data/get-banned-cards";
import { cleanCardName } from "@/lib/deck/cleanCardName";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  userFormatToScryfallLegalityKey,
  userFormatToBannedDataKey,
  scryfallStatusAllowsInFormat,
} from "@/lib/deck/mtgValidators";

/**
 * [rec-legality] console output is off in production, tests, and CI unless DEBUG_REC_LEGALITY=1 (or "true").
 * Local Next dev uses NODE_ENV=development → logs on.
 */
function shouldLogRecLegalityRemovals(): boolean {
  const dbg = process.env.DEBUG_REC_LEGALITY;
  if (dbg === "1" || dbg === "true") return true;
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.NODE_ENV === "test") return false;
  if (process.env.CI === "1" || process.env.CI === "true") return false;
  return process.env.NODE_ENV === "development";
}

export type RecommendationLegalityRemovalReason =
  | "banned"
  | "not_legal"
  | "missing_legality"
  | "cache_miss"
  | "unknown_format";

function buildNormalizedBanSet(bannedMap: Record<string, true> | undefined): Set<string> {
  const s = new Set<string>();
  if (!bannedMap) return s;
  for (const k of Object.keys(bannedMap)) {
    s.add(normalizeScryfallCacheName(k));
  }
  return s;
}

/**
 * Normalized ban-name set for a user-visible format label (same overlay as recommendation filters).
 * Returns null when the format has no curated ban bucket (e.g. Legacy).
 */
export function banNormSetForUserFormat(
  bannedLists: Record<string, Record<string, true>>,
  userFormat: string
): Set<string> | null {
  const bk = userFormatToBannedDataKey(userFormat);
  if (!bk) return null;
  return buildNormalizedBanSet(bannedLists[bk]);
}

function logRemoved(
  prefix: string,
  removed: Array<{ name: string; reason: RecommendationLegalityRemovalReason }>
) {
  if (!shouldLogRecLegalityRemovals() || removed.length === 0) return;
  console.warn(`[rec-legality] ${prefix}`, removed);
}

function resolveDetailEntry<T>(
  details: Map<string, T>,
  requestedName: string,
): T | undefined {
  const key = normalizeScryfallCacheName(requestedName);
  let entry = details.get(key);
  if (entry) return entry;
  for (const [candidateKey, value] of details.entries()) {
    const normalizedCandidate = normalizeScryfallCacheName(candidateKey);
    if (normalizedCandidate === key) return value;
    if (normalizeScryfallCacheName(cleanCardName(candidateKey)) === key) return value;
    const faceMatches = candidateKey
      .split(/\s*\/\/\s*/)
      .map((face) => normalizeScryfallCacheName(cleanCardName(face)))
      .filter(Boolean);
    if (faceMatches.includes(key)) return value;
  }
  return undefined;
}

export type RecommendationLegalityRow = {
  legalities?: Record<string, string> | null;
};
type RecommendationLegalityCardRow = RecommendationLegalityRow & { color_identity?: string[] };

const NON_CARD_BRACKET_TERMS = new Set([
  "deathtouch",
  "defender",
  "double strike",
  "first strike",
  "flash",
  "flying",
  "haste",
  "hexproof",
  "indestructible",
  "lifelink",
  "menace",
  "protection",
  "prowess",
  "reach",
  "trample",
  "vigilance",
  "ward",
  "affinity",
  "afterlife",
  "cascade",
  "convoke",
  "delve",
  "escape",
  "flashback",
  "kicker",
  "madness",
  "morph",
  "mutate",
  "suspend",
  "the stack",
  "priority",
  "state-based actions",
]);

export function stripNonCardRuleTermBrackets(text: string): string {
  if (!text || !String(text).includes("[[")) return text;
  return String(text).replace(/\[\[([^\]]+)\]\]/g, (full, inner: string) => {
    const name = String(inner || "").trim();
    return NON_CARD_BRACKET_TERMS.has(normalizeScryfallCacheName(name)) ? name : full;
  });
}

/**
 * Legality + ban overlay when cache row and normalized PK are known (sync).
 */
export function evaluateCardRecommendationLegality(
  row: RecommendationLegalityRow | null | undefined,
  cacheNormKey: string,
  userFormat: string,
  banNormSet: Set<string> | null
): { allowed: boolean; reason: RecommendationLegalityRemovalReason | null } {
  const sk = userFormatToScryfallLegalityKey(userFormat);
  if (!sk) return { allowed: false, reason: "unknown_format" };

  if (banNormSet && banNormSet.has(cacheNormKey)) {
    return { allowed: false, reason: "banned" };
  }

  if (!row) {
    return { allowed: false, reason: "cache_miss" };
  }

  const legalities = row.legalities;
  if (legalities == null || typeof legalities !== "object" || Object.keys(legalities).length === 0) {
    return { allowed: false, reason: "missing_legality" };
  }

  const status = legalities[sk];
  if (!scryfallStatusAllowsInFormat(status, sk)) {
    if (status === "banned") return { allowed: false, reason: "banned" };
    if (status === "not_legal") return { allowed: false, reason: "not_legal" };
    return { allowed: false, reason: "missing_legality" };
  }

  return { allowed: true, reason: null };
}

export type FilterSuggestedNamesOptions = {
  logPrefix?: string;
  bannedMaps?: Record<string, Record<string, true>>;
  /**
   * Tests (and rare tooling): bypass DB/Scryfall; map keys should match {@link normalizeScryfallCacheName}(name).
   */
  getDetailsForNamesCachedOverride?: (
    names: string[]
  ) => Promise<Map<string, RecommendationLegalityCardRow>>;
  fetchExactCardOverride?: (name: string) => Promise<RecommendationLegalityCardRow | null>;
};

const exactCardFallbackCache = new Map<string, RecommendationLegalityCardRow>();

async function fetchDfcFrontFaceFromCache(name: string): Promise<RecommendationLegalityCardRow | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !service) return null;
  const frontFace = String(name || "").split("//")[0]?.trim();
  if (!frontFace) return null;
  try {
    const admin = createAdminClient(url, service, { auth: { persistSession: false } });
    const { data } = await admin
      .from("scryfall_cache")
      .select("name, legalities, color_identity")
      .ilike("name", `${frontFace} //%`)
      .limit(8);
    const target = normalizeScryfallCacheName(cleanCardName(frontFace));
    const rows = Array.isArray(data) ? data : [];
    const hit = rows.find((row: any) => {
      const candidateFront = String(row?.name || "").split("//")[0]?.trim() || "";
      return normalizeScryfallCacheName(cleanCardName(candidateFront)) === target;
    });
    if (!hit) return null;
    return {
      legalities: hit.legalities && typeof hit.legalities === "object" ? hit.legalities : null,
      color_identity: Array.isArray(hit.color_identity) ? hit.color_identity.map((value: unknown) => String(value)) : undefined,
    };
  } catch {
    return null;
  }
}

async function fetchExactCardFallback(name: string): Promise<RecommendationLegalityCardRow | null> {
  const cleaned = cleanCardName(name);
  const cacheKey = normalizeScryfallCacheName(cleaned || name);
  if (!cacheKey) return null;
  const cacheDfcHit = await fetchDfcFrontFaceFromCache(cleaned || name);
  if (cacheDfcHit) {
    exactCardFallbackCache.set(cacheKey, cacheDfcHit);
    return cacheDfcHit;
  }
  const cached = exactCardFallbackCache.get(cacheKey);
  if (cached) return cached;

  async function fetchNamed(endpoint: string): Promise<{ row: RecommendationLegalityCardRow | null; final: boolean }> {
    try {
      const res = await fetch(endpoint, {
        cache: "no-store",
        headers: {
          "User-Agent": "Manatap legality fallback/1.0",
          Accept: "application/json",
        },
      });
      if (res.status === 404) {
        return { row: null, final: false };
      }
      if (!res.ok) {
        return { row: null, final: false };
      }
      const json = await res.json().catch(() => null);
      if (!json || typeof json !== "object") {
        return { row: null, final: false };
      }
      return {
        row: {
          legalities: json.legalities && typeof json.legalities === "object" ? json.legalities : null,
          color_identity: Array.isArray(json.color_identity) ? json.color_identity.map((value: unknown) => String(value)) : undefined,
        },
        final: true,
      };
    } catch {
      return { row: null, final: false };
    }
  }

  try {
    const exact = await fetchNamed(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleaned || name)}`);
    if (exact.row) {
      exactCardFallbackCache.set(cacheKey, exact.row);
      return exact.row;
    }
    const fuzzy = await fetchNamed(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cleaned || name)}`);
    if (fuzzy.row) {
      exactCardFallbackCache.set(cacheKey, fuzzy.row);
      return fuzzy.row;
    }
    return null;
  } catch {
    return null;
  }
}

async function rescueLegalityEntryIfNeeded(
  name: string,
  row: RecommendationLegalityCardRow | undefined,
  cacheNormKey: string,
  userFormat: string,
  banNormSet: Set<string> | null,
  opts?: FilterSuggestedNamesOptions,
): Promise<{ allowed: boolean; reason: RecommendationLegalityRemovalReason | null }> {
  const initial = evaluateCardRecommendationLegality(row, cacheNormKey, userFormat, banNormSet);
  if (initial.allowed) return initial;
  if (initial.reason !== "cache_miss" && initial.reason !== "not_legal") return initial;
  const fallback = await (opts?.fetchExactCardOverride?.(name) ?? fetchExactCardFallback(name));
  if (!fallback) return initial;
  const rescued = evaluateCardRecommendationLegality(fallback, cacheNormKey, userFormat, banNormSet);
  return rescued.allowed ? rescued : initial;
}

/**
 * Filter card names in **input order**; duplicates are evaluated independently.
 */
export async function filterSuggestedCardNamesForFormat(
  names: string[],
  userFormat: string,
  opts?: FilterSuggestedNamesOptions
): Promise<{
  allowed: string[];
  removed: Array<{ name: string; reason: RecommendationLegalityRemovalReason }>;
}> {
  const trimmed = names.map((n) => String(n || "").trim()).filter(Boolean);
  if (trimmed.length === 0) return { allowed: [], removed: [] };

  let maps = opts?.bannedMaps;
  if (!maps) {
    maps = bannedDataToMaps(await getBannedCards());
  }

  const banKey = userFormatToBannedDataKey(userFormat);
  const banNormSet = banKey ? buildNormalizedBanSet(maps[banKey]) : null;

  const uniqRaw = [...new Set(trimmed)];
  const fetchDetails = opts?.getDetailsForNamesCachedOverride ?? getDetailsForNamesCached;
  const details = await fetchDetails(uniqRaw);

  const allowed: string[] = [];
  const removed: Array<{ name: string; reason: RecommendationLegalityRemovalReason }> = [];

  for (const name of trimmed) {
    const k = normalizeScryfallCacheName(name);
    const row = resolveDetailEntry(details, name);

    const { allowed: ok, reason } = await rescueLegalityEntryIfNeeded(name, row, k, userFormat, banNormSet, opts);
    if (ok) allowed.push(name);
    else if (reason) removed.push({ name, reason });
  }

  logRemoved(opts?.logPrefix ?? "filterSuggestedCardNamesForFormat", removed);
  return { allowed, removed };
}

export async function filterRecommendationRowsByName<T extends { name: string }>(
  rows: T[],
  userFormat: string,
  opts?: FilterSuggestedNamesOptions
): Promise<{
  allowed: T[];
  removed: Array<{ name: string; reason: RecommendationLegalityRemovalReason }>;
}> {
  if (rows.length === 0) return { allowed: [], removed: [] };

  let maps = opts?.bannedMaps;
  if (!maps) {
    maps = bannedDataToMaps(await getBannedCards());
  }
  const banKey = userFormatToBannedDataKey(userFormat);
  const banNormSet = banKey ? buildNormalizedBanSet(maps[banKey]) : null;

  const names = rows.map((r) => String(r.name || "").trim()).filter(Boolean);
  const uniqRaw = [...new Set(names)];
  const fetchDetails = opts?.getDetailsForNamesCachedOverride ?? getDetailsForNamesCached;
  const details = await fetchDetails(uniqRaw);

  const allowed: T[] = [];
  const removed: Array<{ name: string; reason: RecommendationLegalityRemovalReason }> = [];

  for (const row of rows) {
    const name = String(row.name || "").trim();
    if (!name) continue;
    const k = normalizeScryfallCacheName(name);
    const entry = resolveDetailEntry(details, name);
    const { allowed: ok, reason } = await rescueLegalityEntryIfNeeded(name, entry, k, userFormat, banNormSet, opts);
    if (ok) allowed.push(row);
    else if (reason) removed.push({ name, reason });
  }

  logRemoved(opts?.logPrefix ?? "filterRecommendationRowsByName", removed);
  return { allowed, removed };
}

/**
 * Remove links from `[[Card Name]]` tokens that are not allowed in the format (chat / compare prose).
 * Keep the plain card name so prose does not collapse into blank commas.
 */
export async function stripIllegalBracketCardTokensFromText(
  text: string,
  userFormat: string,
  opts?: FilterSuggestedNamesOptions
): Promise<string> {
  if (!text || !String(text).includes("[[")) return text;

  const re = /\[\[([^\]]+)\]\]/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = (m[1] || "").trim();
    if (inner) found.push(inner);
  }
  if (found.length === 0) return text;

  const { allowed } = await filterSuggestedCardNamesForFormat(found, userFormat, {
    ...opts,
    logPrefix: opts?.logPrefix ?? "stripIllegalBracketCardTokensFromText",
  });
  const allowNorm = new Set(allowed.map((n) => normalizeScryfallCacheName(n)));

  let out = text;
  const re2 = /\[\[([^\]]+)\]\]/g;
  out = out.replace(re2, (full, inner: string) => {
    const name = String(inner || "").trim();
    if (!name) return full;
    const norm = normalizeScryfallCacheName(name);
    if (allowNorm.has(norm)) return full;
    if (NON_CARD_BRACKET_TERMS.has(norm)) return name;
    return name;
  });

  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}

export async function filterDecklistQtyRowsForFormat(
  lines: Array<{ name: string; qty: number }>,
  userFormat: string,
  opts?: FilterSuggestedNamesOptions
): Promise<{
  lines: Array<{ name: string; qty: number }>;
  removed: Array<{ name: string; reason: RecommendationLegalityRemovalReason }>;
}> {
  if (lines.length === 0) return { lines: [], removed: [] };

  let maps = opts?.bannedMaps;
  if (!maps) {
    maps = bannedDataToMaps(await getBannedCards());
  }
  const banKey = userFormatToBannedDataKey(userFormat);
  const banNormSet = banKey ? buildNormalizedBanSet(maps[banKey]) : null;

  const uniqRaw = [...new Set(lines.map((l) => String(l.name || "").trim()).filter(Boolean))];
  const fetchDetails = opts?.getDetailsForNamesCachedOverride ?? getDetailsForNamesCached;
  const details = await fetchDetails(uniqRaw);

  const kept: Array<{ name: string; qty: number }> = [];
  const removed: Array<{ name: string; reason: RecommendationLegalityRemovalReason }> = [];

  for (const line of lines) {
    const name = String(line.name || "").trim();
    if (!name) continue;
    const k = normalizeScryfallCacheName(name);
    const entry = resolveDetailEntry(details, name);
    const { allowed: ok, reason } = await rescueLegalityEntryIfNeeded(name, entry, k, userFormat, banNormSet, opts);
    if (ok) kept.push(line);
    else if (reason) removed.push({ name, reason });
  }

  logRemoved(opts?.logPrefix ?? "filterDecklistQtyRowsForFormat", removed);
  return { lines: kept, removed };
}
