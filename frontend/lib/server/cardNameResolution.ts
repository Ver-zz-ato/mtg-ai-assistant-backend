import { cleanCardName, normalizeChars, stringSimilarity } from "@/lib/deck/cleanCardName";
import {
  buildScryfallCacheRowFromApiCard,
  normalizeScryfallCacheName,
} from "@/lib/server/scryfallCacheRow";

type SupabaseLike = {
  from: (table: string) => any;
};

type CacheRow = {
  name: string;
  printed_name?: string | null;
  small?: string | null;
  normal?: string | null;
  set?: string | null;
  type_line?: string | null;
};

export type CardMatchStatus = "exact" | "fuzzy" | "notfound";

export type ResolvedCardName = {
  originalName: string;
  matchStatus: CardMatchStatus;
  suggestedName?: string;
  confidence?: number;
  scryfallData?: {
    name: string;
    set?: string;
    image_uri?: string;
  };
};

export type CardNameMatch = {
  name: string;
  score: number;
  source: string;
  scryfallData?: ResolvedCardName["scryfallData"];
};

export type StoredCardNameRecord = {
  id?: string;
  name: string;
  qty?: number;
};

export type StoredCardNameFixItem = {
  id?: string;
  name: string;
  originalName: string;
  qty?: number;
  suggestions: string[];
};

type LookupContext = {
  original: string;
  variants: string[];
  keys: string[];
};

const CACHE_SELECT = "name, printed_name, small, normal, set, type_line";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function escapeIlike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

function cleanPreservingFaces(raw: string): string {
  const text = String(raw || "").trim();
  if (!text.includes("//")) return cleanCardName(text);

  const parts = text.split("//").map((part) => cleanCardName(part));
  if (parts.length === 2 && parts[0] && parts[1]) {
    if (normalizeScryfallCacheName(parts[0]) === normalizeScryfallCacheName(parts[1])) {
      return parts[0];
    }
    return `${parts[0]} // ${parts[1]}`;
  }
  return cleanCardName(text);
}

function isDuplicateDfcName(name: string): boolean {
  const text = String(name || "").trim();
  if (!text.includes("//")) return false;
  const parts = text.split("//").map((part) => normalizeScryfallCacheName(part));
  return parts.length === 2 && !!parts[0] && parts[0] === parts[1];
}

function tokenBaseVariants(raw: string): string[] {
  const text = normalizeChars(String(raw || "").trim());
  if (!/\btoken\b/i.test(text)) return [];

  if (text.includes("//")) {
    const parts = text.split("//").map((part) => cleanCardName(part.replace(/\s+token\b/gi, "")));
    if (parts.length === 2 && parts[0] && parts[1]) return [`${parts[0]} // ${parts[1]}`];
  }

  const simple = cleanCardName(text.replace(/\s+token\b/gi, ""));
  return simple ? [simple] : [];
}

export function cardNameLookupContext(rawName: string): LookupContext {
  const original = String(rawName || "").trim();
  const normalizedChars = normalizeChars(original);
  const preservedFaces = cleanPreservingFaces(normalizedChars);
  const cleaned = cleanCardName(normalizedChars);
  const variants = uniqueStrings([preservedFaces, cleaned, normalizedChars, original]).filter(
    (variant) => !isDuplicateDfcName(variant),
  );
  const keys = uniqueStrings(variants.map((v) => normalizeScryfallCacheName(v)));
  return { original, variants, keys };
}

function titleCaseCardName(key: string): string {
  const smallWords = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "or", "the", "to"]);
  const lower = normalizeScryfallCacheName(key);
  const pieces = lower.split(/( \/\/ |\s+|-)/);
  let wordIndex = 0;
  return pieces
    .map((piece) => {
      if (!piece || /^\s+$/.test(piece) || piece === "-" || piece === " // ") return piece;
      const isSmall = smallWords.has(piece) && wordIndex > 0;
      wordIndex += 1;
      if (isSmall) return piece;
      return piece.charAt(0).toUpperCase() + piece.slice(1);
    })
    .join("");
}

function displayNameForRow(row: CacheRow, ctx?: LookupContext): string {
  const printed = String(row.printed_name || "").trim();
  if (printed) return printed;

  const key = normalizeScryfallCacheName(row.name);
  const matchingInput = ctx?.variants.find((variant) => normalizeScryfallCacheName(variant) === key);
  if (matchingInput && /[A-Z]/.test(matchingInput)) return matchingInput;

  return titleCaseCardName(row.name);
}

function resolvedFromRow(
  ctx: LookupContext,
  row: CacheRow,
  confidence: number,
  sourceStatus?: CardMatchStatus,
): ResolvedCardName {
  const displayName = displayNameForRow(row, ctx);
  const status: CardMatchStatus = sourceStatus || (confidence >= 95 ? "exact" : "fuzzy");
  return {
    originalName: ctx.original,
    matchStatus: status,
    suggestedName: displayName,
    confidence,
    scryfallData: {
      name: displayName,
      set: row.set ?? undefined,
      image_uri: row.small || row.normal || undefined,
    },
  };
}

function scryfallDataFromApiCard(card: any): NonNullable<ResolvedCardName["scryfallData"]> {
  const imageUris = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
  return {
    name: String(card?.name || "").trim(),
    set: card?.set_name || card?.set || undefined,
    image_uri: imageUris?.small || imageUris?.normal || undefined,
  };
}

async function upsertApiCard(supabase: SupabaseLike, card: any): Promise<void> {
  const row = buildScryfallCacheRowFromApiCard(card, {
    route: "cardNameResolution",
    source: "scryfall_api_fallback",
  });
  if (!row) return;
  try {
    await supabase.from("scryfall_cache").upsert(row, { onConflict: "name" });
  } catch {
    /* Matching should not fail just because cache refresh failed. */
  }
}

async function fetchScryfallNamed(param: "exact" | "fuzzy", name: string): Promise<any | null> {
  const q = String(name || "").trim();
  if (q.length < 2) return null;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?${param}=${encodeURIComponent(q)}`, {
      cache: "no-store",
      headers: { "User-Agent": "Manatap card import resolver" },
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json || json.object === "error" || !json.name) return null;
    return json;
  } catch {
    return null;
  }
}

async function fetchScryfallToken(rawName: string): Promise<any | null> {
  const match = String(rawName || "").trim().match(/^(.+?)\s+token$/i);
  const base = match?.[1]?.trim();
  if (!base || base.length < 2) return null;

  try {
    const query = `!"${base.replace(/"/g, '\\"')}" type:token`;
    const res = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=released`,
      { cache: "no-store", headers: { "User-Agent": "Manatap card import resolver" } },
    );
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const card = Array.isArray(json?.data) ? json.data[0] : null;
    return card?.name ? card : null;
  } catch {
    return null;
  }
}

async function fetchScryfallAutocomplete(name: string): Promise<string[]> {
  const q = String(name || "").trim();
  if (q.length < 2) return [];
  try {
    const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
      headers: { "User-Agent": "Manatap card import resolver" },
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    return Array.isArray(json?.data) ? json.data.map((item: string) => String(item)) : [];
  } catch {
    return [];
  }
}

function scoreMatch(ctx: LookupContext, candidateName: string): number {
  const candidateKey = normalizeScryfallCacheName(candidateName);
  if (ctx.keys.includes(candidateKey)) return 1;
  return Math.max(...ctx.keys.map((key) => stringSimilarity(key, candidateKey)), 0);
}

function dedupeMatches(rows: CardNameMatch[]): CardNameMatch[] {
  const byKey = new Map<string, CardNameMatch>();
  for (const row of rows) {
    if (isDuplicateDfcName(row.name)) continue;
    const key = normalizeScryfallCacheName(row.name);
    const prev = byKey.get(key);
    if (!prev || row.score > prev.score) byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

async function queryCacheExactRows(supabase: SupabaseLike, keys: string[]): Promise<Map<string, CacheRow>> {
  const rowsByKey = new Map<string, CacheRow>();
  const uniqueKeys = uniqueStrings(keys);
  for (let i = 0; i < uniqueKeys.length; i += 500) {
    const chunk = uniqueKeys.slice(i, i + 500);
    const { data } = await supabase.from("scryfall_cache").select(CACHE_SELECT).in("name", chunk);
    for (const row of (data || []) as CacheRow[]) {
      rowsByKey.set(normalizeScryfallCacheName(row.name), row);
    }
  }
  return rowsByKey;
}

async function cacheMatchesForContext(supabase: SupabaseLike, ctx: LookupContext, limit: number): Promise<CardNameMatch[]> {
  const matches: CardNameMatch[] = [];
  const exactRows = await queryCacheExactRows(supabase, ctx.keys);
  for (const key of ctx.keys) {
    const row = exactRows.get(key);
    if (row) {
      const display = displayNameForRow(row, ctx);
      matches.push({
        name: display,
        score: 1,
        source: "cache_exact",
        scryfallData: {
          name: display,
          set: row.set ?? undefined,
          image_uri: row.small || row.normal || undefined,
        },
      });
    }
  }
  if (matches.length) return dedupeMatches(matches).slice(0, limit);

  const tokenKeys = tokenBaseVariants(ctx.original).map((name) => normalizeScryfallCacheName(name));
  if (tokenKeys.length) {
    const tokenRows = await queryCacheExactRows(supabase, tokenKeys);
    for (const key of tokenKeys) {
      const row = tokenRows.get(key);
      if (!row) continue;
      const display = displayNameForRow(row);
      matches.push({
        name: display,
        score: 0.9,
        source: "cache_token_base",
        scryfallData: {
          name: display,
          set: row.set ?? undefined,
          image_uri: row.small || row.normal || undefined,
        },
      });
    }
    if (matches.length) return dedupeMatches(matches).slice(0, limit);
  }

  for (const variant of ctx.variants) {
    const key = normalizeScryfallCacheName(variant);
    if (key.length < 3) continue;
    const escaped = escapeIlike(key);

    const { data: containsData } = await supabase
      .from("scryfall_cache")
      .select(CACHE_SELECT)
      .ilike("name", `%${escaped}%`)
      .limit(limit);

    for (const row of (containsData || []) as CacheRow[]) {
      const display = displayNameForRow(row, ctx);
      matches.push({
        name: display,
        score: scoreMatch(ctx, row.name),
        source: "cache_contains",
        scryfallData: {
          name: display,
          set: row.set ?? undefined,
          image_uri: row.small || row.normal || undefined,
        },
      });
    }

    const { data: prefixData } = await supabase
      .from("scryfall_cache")
      .select(CACHE_SELECT)
      .ilike("name", `${escaped}%`)
      .limit(limit);

    for (const row of (prefixData || []) as CacheRow[]) {
      const display = displayNameForRow(row, ctx);
      matches.push({
        name: display,
        score: Math.max(scoreMatch(ctx, row.name), 0.4),
        source: "cache_prefix",
        scryfallData: {
          name: display,
          set: row.set ?? undefined,
          image_uri: row.small || row.normal || undefined,
        },
      });
    }

    if (!variant.includes("//")) {
      const { data: dfcData } = await supabase
        .from("scryfall_cache")
        .select(CACHE_SELECT)
        .ilike("name", `${escaped} // %`)
        .limit(limit);

      for (const row of (dfcData || []) as CacheRow[]) {
        const display = displayNameForRow(row, ctx);
        matches.push({
          name: display,
          score: Math.max(scoreMatch(ctx, row.name), 0.4),
          source: "cache_dfc_front",
          scryfallData: {
            name: display,
            set: row.set ?? undefined,
            image_uri: row.small || row.normal || undefined,
          },
        });
      }
    }

    if (matches.length >= limit) break;
  }

  return dedupeMatches(matches).slice(0, limit);
}

async function scryfallMatchesForContext(supabase: SupabaseLike, ctx: LookupContext, limit: number): Promise<CardNameMatch[]> {
  const matches: CardNameMatch[] = [];

  for (const variant of ctx.variants) {
    const exactCard = await fetchScryfallNamed("exact", variant);
    if (exactCard) {
      await upsertApiCard(supabase, exactCard);
      const data = scryfallDataFromApiCard(exactCard);
      matches.push({ name: data.name, score: 1, source: "scryfall_named_exact", scryfallData: data });
      return matches;
    }
  }

  const tokenCard = await fetchScryfallToken(ctx.variants[0] || ctx.original);
  if (tokenCard) {
    await upsertApiCard(supabase, tokenCard);
    const data = scryfallDataFromApiCard(tokenCard);
    matches.push({ name: data.name, score: 0.9, source: "scryfall_token", scryfallData: data });
    return matches;
  }

  const autocomplete = await fetchScryfallAutocomplete(ctx.variants[0] || ctx.original);
  for (const name of autocomplete.slice(0, limit)) {
    const score = scoreMatch(ctx, name);
    if (score >= 0.3) matches.push({ name, score, source: "scryfall_autocomplete" });
  }
  if (matches.length) return dedupeMatches(matches).slice(0, limit);

  const fuzzyCard = await fetchScryfallNamed("fuzzy", ctx.variants[0] || ctx.original);
  if (fuzzyCard) {
    await upsertApiCard(supabase, fuzzyCard);
    const data = scryfallDataFromApiCard(fuzzyCard);
    matches.push({
      name: data.name,
      score: scoreMatch(ctx, data.name),
      source: "scryfall_named_fuzzy",
      scryfallData: data,
    });
  }

  return dedupeMatches(matches).slice(0, limit);
}

export async function findCardNameMatches(
  supabase: SupabaseLike,
  rawName: string,
  limit = 12,
): Promise<CardNameMatch[]> {
  const ctx = cardNameLookupContext(rawName);
  if (!ctx.original) return [];

  const cacheMatches = await cacheMatchesForContext(supabase, ctx, limit);
  const strongCacheMatches = cacheMatches.filter((match) => match.score >= 0.4);
  if (strongCacheMatches.length) return strongCacheMatches;

  return scryfallMatchesForContext(supabase, ctx, limit);
}

async function resolveUnmatchedOne(supabase: SupabaseLike, ctx: LookupContext): Promise<ResolvedCardName> {
  const matches = await findCardNameMatches(supabase, ctx.original, 12);
  const best = matches[0];
  if (!best) {
    return { originalName: ctx.original, matchStatus: "notfound", confidence: 0 };
  }

  const confidence = Math.round(best.score * 100);
  return {
    originalName: ctx.original,
    matchStatus: confidence >= 95 ? "exact" : "fuzzy",
    suggestedName: best.name,
    confidence,
    scryfallData: best.scryfallData || { name: best.name },
  };
}

export async function resolveCardNamesForImport(
  supabase: SupabaseLike,
  rawNames: string[],
  maxNames = 1000,
): Promise<ResolvedCardName[]> {
  const contexts = rawNames.slice(0, maxNames).map(cardNameLookupContext);
  const allKeys = contexts.flatMap((ctx) => ctx.keys);
  const exactRows = await queryCacheExactRows(supabase, allKeys);
  const results: Array<ResolvedCardName | null> = contexts.map(() => null);
  const unresolved: Array<{ index: number; ctx: LookupContext }> = [];

  contexts.forEach((ctx, index) => {
    const exactKey = ctx.keys.find((key) => exactRows.has(key));
    const row = exactKey ? exactRows.get(exactKey) : null;
    if (row) {
      results[index] = resolvedFromRow(ctx, row, 100, "exact");
    } else {
      unresolved.push({ index, ctx });
    }
  });

  const concurrency = 5;
  let cursor = 0;
  async function worker() {
    while (cursor < unresolved.length) {
      const next = unresolved[cursor++];
      results[next.index] = await resolveUnmatchedOne(supabase, next.ctx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unresolved.length) }, () => worker()));

  return results.map((result, index) => {
    if (result) return result;
    return { originalName: contexts[index]?.original || "", matchStatus: "notfound", confidence: 0 };
  });
}

function sameStoredName(a: string, b: string): boolean {
  return String(a || "").trim() === String(b || "").trim();
}

async function suggestionListForName(
  supabase: SupabaseLike,
  originalName: string,
  preferred?: string,
): Promise<string[]> {
  const suggestions = new Set<string>();
  if (preferred && preferred.trim()) suggestions.add(preferred.trim());

  const matches = await findCardNameMatches(supabase, originalName, 10);
  for (const match of matches) {
    if (match.name.trim()) suggestions.add(match.name.trim());
  }

  return [...suggestions];
}

export async function buildStoredCardNameFixItems(
  supabase: SupabaseLike,
  records: StoredCardNameRecord[],
): Promise<StoredCardNameFixItem[]> {
  const cleanRecords = records
    .map((record) => ({ ...record, name: String(record.name || "").trim() }))
    .filter((record) => record.name);
  if (!cleanRecords.length) return [];

  const uniqueNames = [...new Set(cleanRecords.map((record) => record.name))];
  const resolvedByName = new Map<string, ResolvedCardName>();

  for (let i = 0; i < uniqueNames.length; i += 1000) {
    const chunk = uniqueNames.slice(i, i + 1000);
    const results = await resolveCardNamesForImport(supabase, chunk, 1000);
    results.forEach((result) => resolvedByName.set(result.originalName, result));
  }

  const suggestionsByName = new Map<string, string[]>();
  for (const name of uniqueNames) {
    const resolved = resolvedByName.get(name);
    const suggested = resolved?.suggestedName?.trim();
    if (!resolved || !suggested) continue;

    const needsFix = resolved.matchStatus === "fuzzy" || !sameStoredName(name, suggested);
    if (!needsFix) continue;

    const suggestions = await suggestionListForName(supabase, name, suggested);
    if (suggestions.length) suggestionsByName.set(name, suggestions);
  }

  const items: StoredCardNameFixItem[] = [];
  for (const record of cleanRecords) {
    const suggestions = suggestionsByName.get(record.name);
    if (!suggestions?.length) continue;
    items.push({
      id: record.id,
      name: record.name,
      originalName: record.name,
      qty: record.qty,
      suggestions,
    });
  }
  return items;
}
