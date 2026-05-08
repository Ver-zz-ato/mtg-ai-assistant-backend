// Shared deck inference functions for analyze and chat routes
import { isCommanderEligible } from "@/lib/deck/deck-enrichment";
import type { AnalyzeFormat } from "@/lib/deck/formatRules";
import { createClient } from "@/lib/supabase/server";
import { isStale } from "@/lib/server/scryfallTtl";
import {
  buildScryfallCacheRowFromApiCard,
  normalizeScryfallCacheName,
} from "@/lib/server/scryfallCacheRow";

// --- Minimal typed Scryfall card for our needs ---
export type SfCard = {
  name: string;
  type_line?: string;
  oracle_text?: string | null;
  color_identity?: string[]; // e.g. ["G","B"]
  cmc?: number;
  legalities?: Record<string, string>;
  mana_cost?: string; // e.g. "{1}{R}{G}"
  set?: string; // Set code e.g. "woe", "mkm"
  /** Oracle keywords (e.g. Flying). From cache or API when available. */
  keywords?: string[];
  /** Card colors (Scryfall `colors`), not the same as color_identity. */
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  is_land?: boolean;
  is_creature?: boolean;
  is_instant?: boolean;
  is_sorcery?: boolean;
  is_enchantment?: boolean;
  is_artifact?: boolean;
  is_planeswalker?: boolean;
};

/**
 * `scryfall_cache` / in-memory `byName` lookup key (oracle-card PK norm). Use for every map get/set here —
 * not `price_cache.card_name` (see `/api/price` — folds some apostrophe code points) and not
 * `canonicalize().canonicalName` (alias list / display-oriented).
 */
const norm = normalizeScryfallCacheName;

/** jsonb `legalities` from scryfall_cache or Scryfall API; `{}` when null/missing/invalid. */
function normalizeLegalities(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
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

/** Map Phase 2A / backfilled `scryfall_cache` columns onto optional `SfCard` fields (omit when absent). */
function mapScryfallCacheRowExtras(row: Record<string, unknown>): Partial<SfCard> {
  const out: Partial<SfCard> = {};
  const kw = coerceStringArray(row.keywords);
  const col = coerceStringArray(row.colors);
  if (kw) out.keywords = kw;
  if (col) out.colors = col;
  const p = optionalStat(row.power);
  const t = optionalStat(row.toughness);
  const l = optionalStat(row.loyalty);
  if (p !== undefined) out.power = p;
  if (t !== undefined) out.toughness = t;
  if (l !== undefined) out.loyalty = l;
  const land = optionalBool(row.is_land);
  const cre = optionalBool(row.is_creature);
  const ins = optionalBool(row.is_instant);
  const sor = optionalBool(row.is_sorcery);
  const enc = optionalBool(row.is_enchantment);
  const art = optionalBool(row.is_artifact);
  const pw = optionalBool(row.is_planeswalker);
  if (land !== undefined) out.is_land = land;
  if (cre !== undefined) out.is_creature = cre;
  if (ins !== undefined) out.is_instant = ins;
  if (sor !== undefined) out.is_sorcery = sor;
  if (enc !== undefined) out.is_enchantment = enc;
  if (art !== undefined) out.is_artifact = art;
  if (pw !== undefined) out.is_planeswalker = pw;
  return out;
}

/** Optional fields from Scryfall API card JSON (collection / named). */
function mapApiCardExtras(c: Record<string, unknown>): Partial<SfCard> {
  const out: Partial<SfCard> = {};
  const kw = coerceStringArray(c.keywords);
  const col = coerceStringArray(c.colors);
  if (kw) out.keywords = kw;
  if (col) out.colors = col;
  const front = c.card_faces && Array.isArray(c.card_faces) ? (c.card_faces as unknown[])[0] as Record<string, unknown> | undefined : undefined;
  const p = optionalStat(c.power ?? front?.power);
  const t = optionalStat(c.toughness ?? front?.toughness);
  const l = optionalStat(c.loyalty ?? front?.loyalty);
  if (p !== undefined) out.power = p;
  if (t !== undefined) out.toughness = t;
  if (l !== undefined) out.loyalty = l;
  return out;
}

/** Prefer backfilled `scryfall_cache` booleans; fall back to `type_line` substring checks. `typeLineLower` = (card.type_line||'').toLowerCase(). */
function sfIsLand(c: SfCard, typeLineLower: string): boolean {
  if (c.is_land === true) return true;
  if (c.is_land === false) return false;
  return /land/i.test(typeLineLower);
}

function sfIsCreature(c: SfCard, typeLineLower: string): boolean {
  if (c.is_creature === true) return true;
  if (c.is_creature === false) return false;
  return /creature/i.test(typeLineLower);
}

function sfIsInstant(c: SfCard, typeLineLower: string): boolean {
  if (c.is_instant === true) return true;
  if (c.is_instant === false) return false;
  return /instant/i.test(typeLineLower);
}

function sfIsPlaneswalker(c: SfCard, typeLineLower: string): boolean {
  if (c.is_planeswalker === true) return true;
  if (c.is_planeswalker === false) return false;
  return /planeswalker/i.test(typeLineLower);
}

const SC_CACHE_INFERENCE_SELECT =
  "name, type_line, oracle_text, color_identity, cmc, mana_cost, legalities, updated_at, keywords, colors, power, toughness, loyalty, is_land, is_creature, is_instant, is_sorcery, is_enchantment, is_artifact, is_planeswalker";

// Simple in-process cache (persists across hot reloads on server)
declare global {
  // eslint-disable-next-line no-var
  var __sfCacheInference: Map<string, SfCard> | undefined;
  // eslint-disable-next-line no-var
  var __inferenceCache: Map<string, { context: InferredDeckContext; timestamp: number }> | undefined;
}
const sfCache: Map<string, SfCard> = globalThis.__sfCacheInference ?? new Map();
globalThis.__sfCacheInference = sfCache;

// Cache for inference results (1 hour TTL)
const inferenceCache: Map<string, { context: InferredDeckContext; timestamp: number }> = 
  globalThis.__inferenceCache ?? new Map();
globalThis.__inferenceCache = inferenceCache;

const INFERENCE_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

function getInferenceCacheKey(
  deckText: string,
  commander: string | null,
  format: AnalyzeFormat,
  userMessage: string | undefined,
  plan: "Budget" | "Optimized" | undefined
): string {
  // Simple hash: JSON.stringify the key components
  // Normalize whitespace and sort for consistency
  const normalized = {
    deckText: deckText.trim().replace(/\s+/g, ' '),
    commander: commander || '',
    format,
    userMessage: userMessage?.trim() || '',
    plan: plan || 'Optimized',
  };
  return JSON.stringify(normalized);
}

function parseBudgetHints(userMessage: string | undefined): { perCard?: number; total?: number } {
  if (!userMessage) return {};

  const normalizeNumber = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const clean = value.replace(/[,$]/g, '');
    const parsed = parseFloat(clean);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const perCardPatterns = [
    /\b(?:under|below|less than)\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:per\s+card|each)\b/i,
    /\$?\s*(\d+(?:\.\d+)?)\s*(?:per\s+card|each)\b/i,
    /\bper[-\s]?card(?:\s+(?:cap|limit|budget))?\s*\$?\s*(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of perCardPatterns) {
    const match = userMessage.match(pattern);
    const num = normalizeNumber(match?.[1]);
    if (num !== undefined) {
      return { perCard: num };
    }
  }

  const totalPatterns = [
    /\b(?:under|below|less than)\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:total|overall|deck|budget)\b/i,
    /\b(?:budget|cap|limit)\s*(?:of|:)?\s*\$?\s*(\d+(?:\.\d+)?)/i,
    /\$?\s*(\d+(?:\.\d+)?)\s*(?:total|overall|budget)\b/i,
  ];

  for (const pattern of totalPatterns) {
    const match = userMessage.match(pattern);
    const num = normalizeNumber(match?.[1]);
    if (num !== undefined) {
      return { total: num };
    }
  }

  return {};
}

export async function fetchCard(name: string): Promise<SfCard | null> {
  const key = norm(name);
  
  // L1: Check in-memory cache first (fastest)
  if (sfCache.has(key)) return sfCache.get(key)!;

  // L2: Check database cache
  try {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from("scryfall_cache")
      .select(SC_CACHE_INFERENCE_SELECT)
      .eq("name", key)
      .limit(1);
    
    if (rows && rows.length > 0) {
      const row = rows[0] as Record<string, unknown>;
      // Check if cache is stale (30 days TTL)
      if (!isStale(row.updated_at as string | null | undefined)) {
        const card: SfCard = {
          name: String(row.name),
          type_line: (row.type_line as string | null) || undefined,
          oracle_text: (row.oracle_text as string | null) || null,
          color_identity: (row.color_identity || []) as string[],
          cmc: typeof row.cmc === "number" ? row.cmc : undefined,
          // Was incorrectly `{}` always; DB may have jsonb legalities from bulk/API upserts.
          legalities: normalizeLegalities(row.legalities),
          mana_cost: (row.mana_cost as string | null) || undefined,
          ...mapScryfallCacheRowExtras(row),
        };
        // Store in memory cache for next time
        sfCache.set(key, card);
        return card;
      }
    }
  } catch (error) {
    // If DB query fails, continue to API fetch
    console.warn('[inference] DB cache lookup failed:', error);
  }

  // L3: Fetch from Scryfall API
  type ScryfallNamed = {
    name: string;
    type_line?: string;
    oracle_text?: string | null;
    card_faces?: { oracle_text?: string | null }[];
    color_identity?: string[];
    cmc?: number;
    legalities?: Record<string, string>;
    mana_cost?: string;
  };

  try {
    const r = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
    );
    if (!r.ok) return null;
    const j = (await r.json()) as ScryfallNamed;
    const jrec = j as unknown as Record<string, unknown>;

    const card: SfCard = {
      name: j.name,
      type_line: j.type_line,
      oracle_text: j.oracle_text ?? j.card_faces?.[0]?.oracle_text ?? null,
      color_identity: j.color_identity ?? [],
      cmc: typeof j.cmc === "number" ? j.cmc : undefined,
      legalities: j.legalities ?? {},
      mana_cost: j.mana_cost ?? undefined,
      ...mapApiCardExtras(jrec),
    };
    
    // Store in memory cache
    sfCache.set(key, card);
    
    // Upsert to database cache
    try {
      const supabase = await createClient();
      const row = buildScryfallCacheRowFromApiCard(j as Record<string, unknown>, { source: "inference.fetchCard" });
      if (row) {
        await supabase.from("scryfall_cache").upsert(row, {
          onConflict: "name",
        });
      }
    } catch (error) {
      // If DB upsert fails, continue anyway (card is still in memory cache)
      console.warn('[inference] DB cache upsert failed:', error);
    }
    
    return card;
  } catch (error) {
    console.warn('[inference] Scryfall API fetch failed:', error);
    return null;
  }
}

/**
 * Batch fetch cards from Scryfall using the collection endpoint (up to 75 cards per batch).
 * Checks database cache first, then fetches missing cards from API.
 * Returns a Map of normalized name -> SfCard.
 */
export async function fetchCardsBatch(names: string[]): Promise<Map<string, SfCard>> {
  const result = new Map<string, SfCard>();
  if (names.length === 0) return result;
  
  const unique = Array.from(new Set(names.filter(Boolean)));
  const keys = unique.map(norm);
  
  // Check in-memory cache first
  const fromMemory: string[] = [];
  const toFetch: string[] = [];
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const originalName = unique[i];
    
    if (sfCache.has(key)) {
      result.set(key, sfCache.get(key)!);
    } else {
      toFetch.push(originalName);
    }
  }
  
  if (toFetch.length === 0) return result;
  
  // Check database cache for remaining cards
  const dbKeys = toFetch.map(norm);
  const fromDb: string[] = [];
  const toApi: string[] = [];
  
  try {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from("scryfall_cache")
      .select(SC_CACHE_INFERENCE_SELECT)
      .in("name", dbKeys);
    
    if (rows && rows.length > 0) {
      const staleRows: string[] = [];
      
      for (const row of rows) {
        const r = row as Record<string, unknown>;
        const key = String(r.name);
        if (!isStale(r.updated_at as string | null | undefined)) {
          const card: SfCard = {
            name: key,
            type_line: (r.type_line as string | null) || undefined,
            oracle_text: (r.oracle_text as string | null) || null,
            color_identity: (r.color_identity || []) as string[],
            cmc: typeof r.cmc === "number" ? r.cmc : undefined,
            legalities: normalizeLegalities(r.legalities),
            mana_cost: (r.mana_cost as string | null) || undefined,
            ...mapScryfallCacheRowExtras(r),
          };
          result.set(key, card);
          sfCache.set(key, card); // Store in memory too
          fromDb.push(key);
        } else {
          staleRows.push(key);
        }
      }
      
      // Add stale rows to API fetch list
      for (const key of staleRows) {
        const index = dbKeys.indexOf(key);
        if (index >= 0) {
          toApi.push(toFetch[index]);
        }
      }
      
      // Add cards not found in DB to API fetch list
      const foundKeys = new Set(rows.map(r => String((r as { name?: string }).name)));
      for (let i = 0; i < dbKeys.length; i++) {
        if (!foundKeys.has(dbKeys[i])) {
          toApi.push(toFetch[i]);
        }
      }
    } else {
      // No DB cache hits, fetch all from API
      toApi.push(...toFetch);
    }
  } catch (error) {
    // If DB query fails, fetch all from API
    console.warn('[inference] DB batch cache lookup failed:', error);
    toApi.push(...toFetch);
  }
  
  // Fetch remaining cards from Scryfall API in batches of 75
  if (toApi.length > 0) {
    const BATCH_SIZE = 75;
    for (let i = 0; i < toApi.length; i += BATCH_SIZE) {
      const batch = toApi.slice(i, i + BATCH_SIZE);
      const identifiers = batch.map(name => ({ name }));
      
      try {
        const r = await fetch("https://api.scryfall.com/cards/collection", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identifiers }),
        });
        
        if (!r.ok) {
          console.warn(`[inference] Scryfall batch fetch failed: ${r.status}`);
          continue;
        }
        
        const j = await r.json().catch(() => ({}));
        const dataRows: any[] = Array.isArray(j?.data) ? j.data : [];
        const notFoundRaw: unknown[] = Array.isArray(j?.not_found) ? j.not_found : [];
        const notFoundNameKeys = new Set<string>();
        for (const item of notFoundRaw) {
          if (
            item &&
            typeof item === "object" &&
            typeof (item as { name?: unknown }).name === "string"
          ) {
            const k = norm((item as { name: string }).name);
            if (k) notFoundNameKeys.add(k);
          }
        }

        // Pair each identifier with the next card in `data` (order matches request; not_found omits entries).
        const upsertRows: any[] = [];
        let dataIdx = 0;
        for (let bi = 0; bi < batch.length; bi++) {
          const requestedName = batch[bi];
          const reqKey = norm(requestedName);
          if (!reqKey) continue;
          if (notFoundNameKeys.has(reqKey)) continue;
          const c = dataRows[dataIdx++];
          if (!c) break;

          const canonicalKey = norm(c?.name || "");
          if (!canonicalKey) continue;

          const card: SfCard = {
            name: c.name,
            type_line: c.type_line,
            oracle_text: c.oracle_text ?? c.card_faces?.[0]?.oracle_text ?? null,
            color_identity: (c.color_identity || []) as string[],
            cmc: typeof c.cmc === "number" ? c.cmc : undefined,
            legalities: c.legalities || {},
            mana_cost: c.mana_cost,
            ...mapApiCardExtras(c as Record<string, unknown>),
          };

          result.set(canonicalKey, card);
          sfCache.set(canonicalKey, card);
          if (reqKey !== canonicalKey) {
            result.set(reqKey, card);
            sfCache.set(reqKey, card);
          }

          const built = buildScryfallCacheRowFromApiCard(c as Record<string, unknown>, {
            source: "inference.fetchCardsBatch",
          });
          if (built) upsertRows.push(built);
        }
        
        // Upsert to database cache
        if (upsertRows.length > 0) {
          try {
            const supabase = await createClient();
            await supabase.from("scryfall_cache").upsert(upsertRows, { onConflict: "name" });
          } catch (error) {
            console.warn('[inference] DB batch cache upsert failed:', error);
          }
        }
      } catch (error) {
        console.warn('[inference] Scryfall batch fetch error:', error);
      }
    }
  }
  
  return result;
}

export async function checkIfCommander(cardName: string): Promise<boolean> {
  try {
    const card = await fetchCard(cardName);
    if (!card) return false;
    return isCommanderEligible(card.type_line ?? undefined, card.oracle_text ?? undefined);
  } catch {
    return false;
  }
}

export type CardRole = 'commander' | 'ramp_fixing' | 'draw_advantage' | 'removal_interact' | 'wincon_payoff' | 'engine_enabler' | 'protection_recursion' | 'land';

export type CardRoleInfo = {
  name: string;
  roles: CardRole[];
  cmc: number;
  count: number;
};

export type InferredDeckContext = {
  commander: string | null;
  colors: string[];
  format: AnalyzeFormat;
  commanderProvidesRamp: boolean;
  landCount: number;
  existingRampCount: number; // Count of ramp pieces already in deck
  commanderOracleText?: string | null;
  partnerCommanders?: string[]; // Array of partner commander names if detected
  archetype?: 'token_sac' | 'aristocrats' | null;
  protectedRoles?: string[]; // Card names or roles that should not be cut
  powerLevel?: 'casual' | 'battlecruiser' | 'mid' | 'high' | 'cedh';
  isBudget?: boolean;
  plan?: 'Budget' | 'Optimized';
  budgetCapPerCard?: number;
  budgetTotalCap?: number;
  budgetCurrency?: 'USD' | 'EUR' | 'GBP';
  deckPriceEstimate?: number;
  budgetHeadroom?: number;
  userIntent?: string; // Extracted goal from user message
  curveAnalysis?: {
    averageCMC: number;
    highEndCount: number; // 6+ drops
    lowCurve: boolean; // avg <= 3
    tightManabase: boolean; // limited sources relative to pips
    buckets: { '0-1': number; '2': number; '3': number; '4': number; '5': number; '6+': number };
    gaps: number[]; // CMC values with 0 nonland cards (e.g., [2, 3] means no 2 or 3 drops)
    shape: 'aggressive' | 'midrange' | 'control' | 'battlecruiser' | 'combo' | 'uneven';
    warnings: string[]; // e.g., "No 2-drops in aggressive deck"
  };
  roleDistribution?: {
    byRole: Record<CardRole, number>; // Count per role
    cardRoles: CardRoleInfo[]; // Each card's roles
    redundancy: Record<string, number>; // Cards with similar roles
  };
  manabaseAnalysis?: {
    coloredPips: Record<string, number>; // W, U, B, R, G -> count
    doublePipWeight: Record<string, number>; // Weighted by double pips
    coloredSources: Record<string, number>; // W, U, B, R, G -> count
    ratio: Record<string, number>; // sources/pips ratio per color
    isAcceptable: boolean;
    variance: Record<string, number>; // Percentage variance from ideal
  };
};

export function detectFormat(
  totalCards: number,
  commander: string | null,
  format: AnalyzeFormat,
  userMessage?: string
): AnalyzeFormat {
  // Check user message for format hints first
  if (userMessage) {
    const msgLower = userMessage.toLowerCase();
    if (/\b(commander|edh)\b/i.test(msgLower)) return "Commander";
    if (/\bcedh\b/i.test(msgLower)) return "Commander";
    if (/\b(modern)\b/i.test(msgLower)) return "Modern";
    if (/\b(pioneer)\b/i.test(msgLower)) return "Pioneer";
    if (/\b(standard|std)\b/i.test(msgLower)) return "Standard";
    if (/\b(pauper)\b/i.test(msgLower)) return "Pauper";
  }

  // If format explicitly set, use it
  if (format) return format;

  // Commander name present → EDH
  if (commander) return "Commander";

  // 100-ish cards → EDH
  if (totalCards >= 95 && totalCards <= 105) return "Commander";

  // 60-card (±sideboard band) — ambiguous constructed
  if (totalCards >= 55 && totalCards <= 75) {
    return "Modern";
  }

  // Default to Commander for singleton/bigger decks
  return "Commander";
}

export function detectPowerLevel(
  userMessage: string | undefined,
  highEndCount: number,
  averageCMC: number
): 'casual' | 'battlecruiser' | 'mid' | 'high' | 'cedh' {
  if (userMessage) {
    const msgLower = userMessage.toLowerCase();
    if (/\bcedh\b/i.test(msgLower)) return 'cedh';
    if (/\b(high|optimized|competitive)\b/i.test(msgLower)) return 'high';
    if (/\b(battlecruiser|battle cruiser|big spells)\b/i.test(msgLower)) return 'battlecruiser';
    if (/\b(casual|fun|kitchen table)\b/i.test(msgLower)) return 'casual';
  }
  
  // Heuristic: tons of 6-7 drops → battlecruiser
  if (highEndCount >= 8 && averageCMC > 4.5) return 'battlecruiser';
  
  // Very low curve, efficient → might be high power
  if (averageCMC < 2.5 && highEndCount <= 2) return 'high';
  
  // Default
  return 'mid';
}

/**
 * Infer deck aim/strategy based on commander, cards, and archetype patterns
 * Returns a concise description of the deck's goal/strategy
 */
export async function inferDeckAim(
  commander: string | null,
  entries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>,
  archetype?: 'token_sac' | 'aristocrats' | null
): Promise<string | null> {
  // Check COMMANDER_PROFILES first for known commanders
  if (commander) {
    const { COMMANDER_PROFILES } = await import('./archetypes');
    const profile = COMMANDER_PROFILES[commander];
    if (profile?.archetypeHint) {
      return profile.archetypeHint;
    }
  }

  // Analyze card patterns to infer strategy (keys must match `fetchCardsBatch` / `norm(card.name)`)
  const cardNames = entries.map((e) => norm(e.name));
  const cardTexts = new Map<string, string>();
  
  // Collect oracle texts
  for (const { name } of entries) {
    const card = byName.get(norm(name));
    if (card?.oracle_text) {
      cardTexts.set(norm(name), card.oracle_text.toLowerCase());
    }
  }

  // Detect archetype patterns
  const patterns: string[] = [];
  
  // Token strategies
  const tokenCards = cardNames.filter(n => {
    const text = cardTexts.get(n) || '';
    return /create.*token|token.*creature|populate/i.test(text) ||
           /goblin|soldier|zombie|elf|angel|dragon.*token/i.test(n);
  });
  if (tokenCards.length >= 5) {
    const aristocratCards = cardNames.filter(n => {
      const text = cardTexts.get(n) || '';
      return /when.*dies|sacrifice.*creature|blood artist|zulaport|mayhem/i.test(text);
    });
    if (aristocratCards.length >= 3) {
      patterns.push('Token swarm with aristocrats payoffs');
    } else {
      patterns.push('Token generation and combat');
    }
  }

  // Planeswalker strategies
  const planeswalkerCount = entries.filter(e => {
    const card = byName.get(norm(e.name));
    if (!card) return false;
    const tl = (card.type_line || '').toLowerCase();
    return sfIsPlaneswalker(card, tl);
  }).length;
  if (planeswalkerCount >= 8) {
    const proliferateCards = cardNames.filter(n => {
      const text = cardTexts.get(n) || '';
      return /proliferate/i.test(text);
    });
    if (proliferateCards.length >= 3) {
      patterns.push('Planeswalker control with proliferate to reach ultimates');
    } else {
      patterns.push('Planeswalker value and control');
    }
  }

  // Graveyard/reanimator
  const reanimatorCards = cardNames.filter(n => {
    const text = cardTexts.get(n) || '';
    return /return.*from.*graveyard|reanimate|entomb|buried alive|reanimation/i.test(text);
  });
  if (reanimatorCards.length >= 4) {
    patterns.push('Reanimator strategy: cheat big creatures into play');
  }

  // Landfall
  const landfallCards = cardNames.filter(n => {
    const text = cardTexts.get(n) || '';
    return /landfall|when.*land.*enters/i.test(text);
  });
  if (landfallCards.length >= 5) {
    patterns.push('Landfall value engine');
  }

  // Combo
  const tutorCards = cardNames.filter(n => {
    const text = cardTexts.get(n) || '';
    return /search.*library|tutor|demonic tutor|vampiric tutor|enlightened tutor/i.test(text);
  });
  const comboPayoffs = cardNames.filter(n => {
    const text = cardTexts.get(n) || '';
    return /infinite|win.*game|you win|each opponent loses/i.test(text);
  });
  if (tutorCards.length >= 4 && comboPayoffs.length >= 2) {
    patterns.push('Combo deck: tutor for win conditions');
  }

  // Tribal
  const tribes = ['goblin', 'zombie', 'elf', 'angel', 'dragon', 'wizard', 'vampire', 'merfolk'];
  for (const tribe of tribes) {
    const tribeCards = cardNames.filter(n => 
      n.includes(tribe) || cardTexts.get(n)?.includes(tribe)
    );
    if (tribeCards.length >= 10) {
      patterns.push(`${tribe.charAt(0).toUpperCase() + tribe.slice(1)} tribal synergy`);
      break;
    }
  }

  // Voltron (equipment/auras)
  const equipmentCount = entries.filter(e => {
    const card = byName.get(norm(e.name));
    return card?.type_line?.toLowerCase().includes('equipment');
  }).length;
  const auraCount = entries.filter(e => {
    const card = byName.get(norm(e.name));
    return card?.type_line?.toLowerCase().includes('aura');
  }).length;
  if (equipmentCount >= 5 || auraCount >= 5) {
    patterns.push('Voltron: equip commander for commander damage wins');
  }

  // Control (counterspells and board wipes)
  const counterspells = cardNames.filter(n => {
    const text = cardTexts.get(n) || '';
    return /counter.*spell|counter target/i.test(text);
  }).length;
  const boardWipes = cardNames.filter(n => {
    const text = cardTexts.get(n) || '';
    return /destroy all|exile all|board wipe|wrath/i.test(text);
  }).length;
  if (counterspells >= 6 && boardWipes >= 3) {
    patterns.push('Control: counter threats and wipe boards');
  }

  // If we have patterns, return the most specific one
  if (patterns.length > 0) {
    // Prefer more specific patterns (longer descriptions)
    return patterns.sort((a, b) => b.length - a.length)[0];
  }

  // Fallback: generic description based on commander
  if (commander) {
    return `Commander-focused strategy built around ${commander}`;
  }

  return null;
}

export function tagCardRoles(
  entries: Array<{ count: number; name: string }>,
  commander: string | null,
  byName: Map<string, SfCard>
): CardRoleInfo[] {
  const roleInfo: CardRoleInfo[] = [];
  
  for (const { name, count } of entries) {
    const c = byName.get(norm(name));
    if (!c) continue;
    
    const roles: CardRole[] = [];
    const typeLine = (c.type_line || '').toLowerCase();
    const oracleText = (c.oracle_text || '').toLowerCase();
    const cmc = c.cmc || 0;
    
    // Commander
    if (commander && norm(name) === norm(commander)) {
      roles.push('commander');
    }
    
    // Lands
    if (sfIsLand(c, typeLine)) {
      roles.push('land');
      if (/basic/i.test(typeLine)) {
        // Basic lands are also ramp/fixing
        roles.push('ramp_fixing');
      }
    }
    
    // Ramp/fixing
    if (
      /search your library for (a|up to .*?) (?:basic )?land/i.test(oracleText) ||
      /add \{[wubrg]\}/i.test(oracleText) ||
      /signet|talisman|sol ring|mana rock|mana dork/i.test(name.toLowerCase()) ||
      /ramp|mana/i.test(typeLine)
    ) {
      roles.push('ramp_fixing');
    }
    
    // Draw/advantage
    if (
      /draw a card|draw.*cards|scry|look at|reveal.*top/i.test(oracleText) ||
      /card advantage|draw|library/i.test(name.toLowerCase())
    ) {
      roles.push('draw_advantage');
    }
    
    // Removal/interaction
    if (
      /destroy target|exile target|counter target|remove target|bounce target/i.test(oracleText) ||
      /removal|removal|kill|destroy|exile/i.test(name.toLowerCase())
    ) {
      roles.push('removal_interact');
    }
    
    // Wincon/payoff
    if (
      /you win the game|players.*lose|deal.*damage to each opponent|mill.*library/i.test(oracleText) ||
      /win|payoff|finisher/i.test(name.toLowerCase()) ||
      (cmc >= 6 && (sfIsCreature(c, typeLine) || sfIsPlaneswalker(c, typeLine)))
    ) {
      roles.push('wincon_payoff');
    }
    
    // Engine/enabler
    if (
      /whenever|when.*enters|when.*dies|when.*attacks|trigger/i.test(oracleText) ||
      /engine|enabler|synergy|combo piece/i.test(name.toLowerCase())
    ) {
      roles.push('engine_enabler');
    }
    
    // Protection/recursion
    if (
      /hexproof|indestructible|protection|shroud|can't be|regenerate/i.test(oracleText) ||
      /return.*from (graveyard|exile)|regenerate|recur/i.test(oracleText) ||
      /protection|recursion|recur/i.test(name.toLowerCase())
    ) {
      roles.push('protection_recursion');
    }
    
    // If no roles assigned, skip (or assign generic role)
    if (roles.length > 0) {
      roleInfo.push({
        name,
        roles,
        cmc,
        count,
      });
    }
  }
  
  return roleInfo;
}

export function analyzeRedundancy(
  cardRoles: CardRoleInfo[]
): Record<string, number> {
  const redundancy: Record<string, number> = {};
  
  // Group cards by role combinations
  const roleGroups: Record<string, string[]> = {};
  
  for (const card of cardRoles) {
    const roleKey = card.roles.sort().join('|');
    if (!roleGroups[roleKey]) {
      roleGroups[roleKey] = [];
    }
    roleGroups[roleKey].push(card.name);
  }
  
  // Count how many cards share similar roles
  for (const [roleKey, cards] of Object.entries(roleGroups)) {
    if (cards.length > 1) {
      for (const cardName of cards) {
        redundancy[cardName] = cards.length;
      }
    }
  }
  
  return redundancy;
}

export function analyzeCurve(
  entries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>,
  manabaseAnalysis: InferredDeckContext['manabaseAnalysis']
): InferredDeckContext['curveAnalysis'] {
  let totalCMC = 0;
  let totalCards = 0;
  let highEndCount = 0;
  
  // Initialize buckets
  const buckets: { '0-1': number; '2': number; '3': number; '4': number; '5': number; '6+': number } = {
    '0-1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
    '6+': 0,
  };
  
  // Track individual CMC counts for gap detection
  const cmcCounts: Record<number, number> = {};
  
  // Track interaction count for shape detection
  let interactionCount = 0;
  
  for (const { name, count } of entries) {
    const c = byName.get(norm(name));
    if (!c) continue;
    
    const cmc = c.cmc || 0;
    const typeLine = (c.type_line || '').toLowerCase();
    const oracleText = (c.oracle_text || '').toLowerCase();
    
    // Skip lands from curve calculation
    if (sfIsLand(c, typeLine)) continue;
    
    totalCMC += cmc * count;
    totalCards += count;
    
    // Count by CMC for bucket and gap analysis
    cmcCounts[cmc] = (cmcCounts[cmc] || 0) + count;
    
    // Assign to buckets
    if (cmc <= 1) {
      buckets['0-1'] += count;
    } else if (cmc === 2) {
      buckets['2'] += count;
    } else if (cmc === 3) {
      buckets['3'] += count;
    } else if (cmc === 4) {
      buckets['4'] += count;
    } else if (cmc === 5) {
      buckets['5'] += count;
    } else {
      buckets['6+'] += count;
      highEndCount += count;
    }
    
    // Check for interaction (removal, counters)
    if (/destroy|exile|counter|return.*to.*hand|deal.*damage/i.test(oracleText) ||
        sfIsInstant(c, typeLine)) {
      interactionCount += count;
    }
  }
  
  const averageCMC = totalCards > 0 ? totalCMC / totalCards : 0;
  const lowCurve = averageCMC <= 3;
  
  // Detect gaps (CMC values 1-5 with 0 nonland cards)
  const gaps: number[] = [];
  for (let cmc = 1; cmc <= 5; cmc++) {
    if (!cmcCounts[cmc] || cmcCounts[cmc] === 0) {
      gaps.push(cmc);
    }
  }
  
  // Determine curve shape
  let shape: 'aggressive' | 'midrange' | 'control' | 'battlecruiser' | 'combo' | 'uneven' = 'midrange';
  
  // Aggressive: low average CMC, heavy on 1-3 drops
  if (averageCMC < 2.5 && buckets['0-1'] + buckets['2'] + buckets['3'] >= totalCards * 0.7) {
    shape = 'aggressive';
  }
  // Battlecruiser: high average CMC, lots of 5+ drops
  else if (averageCMC > 4.0 && buckets['5'] + buckets['6+'] >= totalCards * 0.3) {
    shape = 'battlecruiser';
  }
  // Control: higher CMC with heavy interaction
  else if (averageCMC > 3.2 && interactionCount >= totalCards * 0.25) {
    shape = 'control';
  }
  // Combo: typically lower curve with specific pieces (hard to detect without combo detection)
  // For now, detect as low curve with few creatures
  else if (averageCMC < 3.0 && buckets['0-1'] + buckets['2'] >= totalCards * 0.4) {
    // Could be combo or fast midrange - check for uneven distribution
    if (gaps.length >= 2 || (buckets['4'] === 0 && buckets['5'] > 0)) {
      shape = 'combo';
    }
  }
  // Uneven: significant gaps or unusual distribution
  else if (gaps.length >= 2 || (buckets['2'] === 0 && buckets['3'] === 0)) {
    shape = 'uneven';
  }
  
  // Generate warnings based on shape and distribution
  const warnings: string[] = [];
  
  // No 1-drops in aggressive deck
  if (shape === 'aggressive' && buckets['0-1'] < 4) {
    warnings.push('Few 1-drops for an aggressive curve - consider adding more early plays');
  }
  
  // No 2-drops is almost always a problem
  if (buckets['2'] < 3 && totalCards >= 30) {
    warnings.push('Very few 2-drops - this may lead to slow starts');
  }
  
  // Gap at 3 CMC
  if (buckets['3'] < 3 && shape !== 'aggressive' && totalCards >= 30) {
    warnings.push('Few 3-drops - consider adding midgame plays');
  }
  
  // Too many high-end cards
  if (buckets['6+'] > 10 && shape !== 'battlecruiser') {
    warnings.push('Many 6+ CMC cards - ensure you have enough ramp to cast them');
  }
  
  // Check for double-gap (e.g., no 2s AND no 3s)
  if (gaps.includes(2) && gaps.includes(3)) {
    warnings.push('Missing both 2 and 3-drops - curve may be inconsistent');
  }
  
  // Control deck with low interaction
  if (averageCMC > 3.5 && interactionCount < 8 && totalCards >= 30) {
    warnings.push('Higher curve deck with limited interaction - may be vulnerable to aggro');
  }
  
  // Check if manabase is tight (sources < pips * 0.9 for any color)
  let tightManabase = false;
  if (manabaseAnalysis) {
    for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
      if (manabaseAnalysis.coloredPips[color] > 0) {
        const ratio = manabaseAnalysis.ratio[color];
        if (ratio < 0.9) {
          tightManabase = true;
          break;
        }
      }
    }
  }
  
  return {
    averageCMC,
    highEndCount,
    lowCurve,
    tightManabase,
    buckets,
    gaps,
    shape,
    warnings,
  };
}

export async function detectPartnerCommanders(
  commanderName: string,
  entries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>
): Promise<string[] | null> {
  // Fetch the commander card to check for Partner
  let commanderCard: SfCard | undefined = byName.get(norm(commanderName));
  if (!commanderCard) {
    // If not in cache, try fetching
    const fetched = await fetchCard(commanderName);
    if (fetched) {
      commanderCard = fetched;
      byName.set(norm(fetched.name), fetched);
    }
  }
  
  if (!commanderCard) return null;
  
  const oracleText = (commanderCard.oracle_text || '').toLowerCase();
  
  // Check for Partner keyword
  const hasPartner = /partner\s+(?:with|—)/i.test(oracleText) || /partner\b/i.test(oracleText);
  if (!hasPartner) return null;
  
  // Search decklist for other legendary creatures with Partner
  const partners: string[] = [commanderCard.name];
  for (const { name } of entries) {
    if (norm(name) === norm(commanderName)) continue;
    
    let card: SfCard | undefined = byName.get(norm(name));
    if (!card) {
      const fetched = await fetchCard(name);
      if (fetched) {
        card = fetched;
        byName.set(norm(fetched.name), fetched);
      }
    }
    if (!card) continue;
    
    const cardTypeLine = (card.type_line || '').toLowerCase();
    const cardOracleText = (card.oracle_text || '').toLowerCase();
    
    // Check if it's a legendary creature with Partner
    const isLegendary = /legendary.*creature/i.test(cardTypeLine);
    const cardHasPartner = /partner\s+(?:with|—)/i.test(cardOracleText) || /partner\b/i.test(cardOracleText);
    
    if (isLegendary && cardHasPartner) {
      partners.push(card.name);
      if (partners.length >= 2) break; // Found both partners
    }
  }
  
  return partners.length >= 2 ? partners : null;
}

export function extractUserIntent(userMessage: string | undefined): string | undefined {
  if (!userMessage) return undefined;
  
  // Look for goal statements
  const goalPatterns = [
    /(?:this|my|the) (?:deck|list) (?:focuses?|is|aims?) (?:on|to) ([^.?!]+)/i,
    /(?:i want|goal|trying) (?:to|is) ([^.?!]+)/i,
    /(?:focus|theme|strategy) (?:is|:) ([^.?!]+)/i,
  ];
  
  for (const pattern of goalPatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

export function detectArchetype(
  entries: Array<{ count: number; name: string }>,
  commanderOracleText: string | null | undefined,
  byName: Map<string, SfCard>
): { archetype: 'token_sac' | 'aristocrats' | null; protectedRoles: string[] } {
  let tokenSacScore = 0;
  const protectedRoles: string[] = [];

  // Check commander for token/sac themes
  if (commanderOracleText) {
    const oracleLower = commanderOracleText.toLowerCase();
    if (/token|sacrifice|whenever.*dies|aristocrat/i.test(oracleLower)) {
      tokenSacScore += 3;
    }
  }

  // Scan decklist for patterns
  for (const { name, count } of entries) {
    const c = byName.get(norm(name));
    if (!c) continue;
    
    const oracleText = (c.oracle_text || '').toLowerCase();
    const typeLine = (c.type_line || '').toLowerCase();
    const cmc = c.cmc || 0;

    // Token producers
    if (/create.*token|create a 1\/1|create.*creature token/i.test(oracleText)) {
      tokenSacScore += 1;
      if (cmc <= 3) {
        protectedRoles.push(`${name} (low-CMC token producer)`);
      }
    }

    // After attacking create tokens
    if (/after attacking.*create|whenever.*attacks.*create.*token/i.test(oracleText)) {
      tokenSacScore += 1;
      protectedRoles.push(`${name} (attack token trigger)`);
    }

    // Sacrifice outlets
    if (/sacrifice.*creature|sacrifice.*as a cost/i.test(oracleText)) {
      tokenSacScore += 1;
      if (/tap|:.*sacrifice/i.test(oracleText)) {
        protectedRoles.push(`${name} (free/repeatable sacrifice outlet)`);
      } else {
        protectedRoles.push(`${name} (sacrifice outlet)`);
      }
    }

    // Death triggers
    if (/whenever.*creature.*dies|whenever.*dies.*you|death trigger/i.test(oracleText)) {
      tokenSacScore += 1;
      protectedRoles.push(`${name} (death-trigger payoff)`);
    }

    // Key 1-drops for aristocrats
    if (cmc === 1 && /token|sacrifice|whenever.*dies/i.test(oracleText)) {
      protectedRoles.push(`${name} (key 1-drop engine starter)`);
    }
  }

  const archetype = tokenSacScore >= 4 ? (tokenSacScore >= 6 ? 'aristocrats' : 'token_sac') : null;
  
  return { archetype, protectedRoles };
}

export function analyzeManabase(
  entries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>
): InferredDeckContext['manabaseAnalysis'] {
  const coloredPips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const doublePipWeight: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const coloredSources: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  // Extract mana pips from oracle text of non-land spells
  for (const { name, count } of entries) {
    const c = byName.get(norm(name));
    if (!c) continue;
    
    const typeLine = (c.type_line || '').toLowerCase();
    const oracleText = (c.oracle_text || '') + (c.type_line || '');
    
    // Skip lands
    if (sfIsLand(c, typeLine)) {
      // Count colored sources in lands
      const colors = c.color_identity || [];
      colors.forEach((color: string) => {
        const upper = color.toUpperCase();
        if (upper in coloredSources) {
          coloredSources[upper] += count;
        }
      });
      // Also check for basic lands
      if (/plains/i.test(name)) coloredSources.W += count;
      if (/island/i.test(name)) coloredSources.U += count;
      if (/swamp/i.test(name)) coloredSources.B += count;
      if (/mountain/i.test(name)) coloredSources.R += count;
      if (/forest/i.test(name)) coloredSources.G += count;
      continue;
    }

    // Count colored pips in mana costs
    const manaCost = c.mana_cost || '';
    
    // Count single color pips {W}, {U}, {B}, {R}, {G}
    const singlePipRe = /\{([WUBRG])\}/g;
    let match;
    const pipCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    
    while ((match = singlePipRe.exec(manaCost)) !== null) {
      const color = match[1].toUpperCase();
      if (color in pipCounts) {
        pipCounts[color] += 1;
      }
    }

    // Count hybrid pips {W/U}, {2/W}, etc. (count as 0.5 each)
    const hybridPipRe = /\{([WUBRG])\/([WUBRG])\}/g;
    while ((match = hybridPipRe.exec(manaCost)) !== null) {
      const color1 = match[1].toUpperCase();
      const color2 = match[2].toUpperCase();
      if (color1 in pipCounts) pipCounts[color1] += 0.5;
      if (color2 in pipCounts) pipCounts[color2] += 0.5;
    }
    
    // Add to totals and weight double pips
    for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
      const pips = pipCounts[color] * count;
      coloredPips[color] += pips;
      // Double-pip cards get extra weight (2x)
      if (pipCounts[color] >= 2) {
        doublePipWeight[color] += pips * 2;
      } else {
        doublePipWeight[color] += pips;
      }
    }
  }

  // Calculate ratios and variance
  const ratio: Record<string, number> = {};
  const variance: Record<string, number> = {};
  let allAcceptable = true;
  
  for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
    if (coloredPips[color] > 0) {
      const idealSources = coloredPips[color]; // 1:1 is ideal
      ratio[color] = coloredSources[color] / coloredPips[color];
      
      // Calculate variance percentage (how far from ideal)
      const diff = Math.abs(coloredSources[color] - idealSources);
      variance[color] = (diff / idealSources) * 100;
      
      // Consider acceptable if ratio is between 0.85 and 1.15 (10-15% variance)
      if (ratio[color] < 0.85 || ratio[color] > 1.15) {
        allAcceptable = false;
      }
    } else {
      ratio[color] = 0;
      variance[color] = 0;
    }
  }

  return {
    coloredPips,
    doublePipWeight,
    coloredSources,
    ratio,
    isAcceptable: allAcceptable,
    variance,
  };
}

export async function inferDeckContext(
  deckText: string,
  userMessage: string | undefined,
  entries: Array<{ count: number; name: string }>,
  format: AnalyzeFormat,
  reqCommander: string | null,
  selectedColors: string[],
  byName: Map<string, SfCard>,
  options: { plan?: "Budget" | "Optimized"; currency?: "USD" | "EUR" | "GBP" } = {}
): Promise<InferredDeckContext> {
  // Check cache first
  const planMode = options.plan ?? "Optimized";
  const cacheKey = getInferenceCacheKey(deckText, reqCommander, format, userMessage, planMode);
  const cached = inferenceCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < INFERENCE_CACHE_TTL) {
    // Cache hit - return cached result
    return cached.context;
  }
  
  // Cache miss or expired - compute new result
  const context: InferredDeckContext = {
    commander: null,
    colors: [],
    format,
    commanderProvidesRamp: false,
    landCount: 0,
    existingRampCount: 0,
  };
  context.plan = planMode;
  context.budgetCurrency = options.currency ?? 'USD';

  // Count lands
  for (const { name, count } of entries) {
    const c = byName.get(norm(name));
    if (!c) continue;
    const t = (c.type_line || "").toLowerCase();
    if (sfIsLand(c, t)) context.landCount += count;
  }

  // Try to detect commander (Commander / EDH only; never treat a 60-card list as having a "commander")
  let detectedCommander: string | null = format === "Commander" ? reqCommander : null;

  if (format === "Commander") {
    if (!detectedCommander && userMessage) {
      const commanderMatch = userMessage.match(/my commander (?:is|:)\s*([^.?!]+)/i);
      if (commanderMatch) {
        detectedCommander = commanderMatch[1].trim();
      }
    }

    if (!detectedCommander && entries.length > 0) {
      const firstCard = entries[0].name;
      const isCommander = await checkIfCommander(firstCard);
      if (isCommander) {
        detectedCommander = firstCard;
      }
    }
  }

  // If we have a commander, fetch its data
  if (format === "Commander" && detectedCommander) {
    const commanderCard = await fetchCard(detectedCommander);
    if (commanderCard) {
      context.commander = commanderCard.name;
      context.colors = (commanderCard.color_identity || []).map(c => c.toUpperCase());
      context.commanderOracleText = commanderCard.oracle_text;

      // Check if commander provides ramp
      const oracleText = (commanderCard.oracle_text || '').toLowerCase();
      if (
        /search your library for (a|up to .*?) (?:basic )?land/i.test(oracleText) ||
        /create.*treasure/i.test(oracleText) ||
        /you may play an additional land/i.test(oracleText) ||
        /add \{[wubrg]\}/i.test(oracleText)
      ) {
        context.commanderProvidesRamp = true;
      }
      
      // Detect partner commanders
      const partners = await detectPartnerCommanders(commanderCard.name, entries, byName);
      if (partners && partners.length >= 2) {
        context.partnerCommanders = partners;
        // Combine colors from both partners
        const allColors = new Set<string>(context.colors);
        for (const partnerName of partners) {
          if (partnerName === commanderCard.name) continue;
          const partnerCard = byName.get(norm(partnerName)) || await fetchCard(partnerName);
          if (partnerCard && partnerCard.color_identity) {
            partnerCard.color_identity.forEach(c => allColors.add(c.toUpperCase()));
          }
        }
        context.colors = Array.from(allColors);
        
        // Combine oracle texts for both partners
        const partnerTexts: string[] = [commanderCard.oracle_text || ''];
        for (const partnerName of partners) {
          if (partnerName === commanderCard.name) continue;
          const partnerCard = byName.get(norm(partnerName)) || await fetchCard(partnerName);
          if (partnerCard && partnerCard.oracle_text) {
            partnerTexts.push(partnerCard.oracle_text);
          }
        }
        context.commanderOracleText = partnerTexts.join('\n\n');
      }
    }
  }

  // Use selectedColors if provided (from UI presets)
  if (selectedColors.length > 0) {
    context.colors = selectedColors.map(c => c.toUpperCase());
  }

  // If still no colors, infer from all non-basic cards (including Scryfall lookups as needed)
  if (context.colors.length === 0) {
    const colorSet = new Set<string>();
    for (const { name } of entries) {
      const key = norm(name);
      let c = byName.get(key);
      if (!c) {
        // Attempt to fetch missing card data so color identity isn't empty
        try {
          const fetched = await fetchCard(name);
          if (fetched) {
            c = fetched;
            byName.set(norm(fetched.name), fetched);
          }
        } catch {
          // Ignore fetch errors; we'll fall back to colorless if everything fails
        }
      }
      if (!c) continue;
      const ci = c.color_identity || [];
      if (ci.length > 0) {
        ci.forEach((col) => colorSet.add(col.toUpperCase()));
      }
    }
    if (colorSet.size > 0) {
      context.colors = Array.from(colorSet);
    }
  }

  // Final safety net: treat completely unknown decks as colorless-only
  if (context.colors.length === 0) {
    context.colors = ['C'];
  }

  // Parse user message for color hints (overrides if found)
  if (userMessage) {
    const msgLower = userMessage.toLowerCase();
    const colorWords: Record<string, string[]> = {
      gruul: ['R', 'G'],
      simic: ['G', 'U'],
      mardu: ['R', 'W', 'B'],
      azorius: ['W', 'U'],
      dimir: ['U', 'B'],
      rakdos: ['B', 'R'],
      selesnya: ['G', 'W'],
      orzhov: ['W', 'B'],
      izzet: ['U', 'R'],
      golgari: ['B', 'G'],
      boros: ['R', 'W'],
    };
    
    for (const [key, colors] of Object.entries(colorWords)) {
      if (new RegExp(`\\b${key}\\b`).test(msgLower)) {
        context.colors = colors;
        break;
      }
    }
  }

  // Detect format
  const totalCards = entries.reduce((sum, e) => sum + e.count, 0);
  context.format = detectFormat(totalCards, context.commander, format, userMessage);

  // Analyze manabase (needed for curve analysis)
  context.manabaseAnalysis = analyzeManabase(entries, byName);

  // Analyze curve
  context.curveAnalysis = analyzeCurve(entries, byName, context.manabaseAnalysis);

  // Detect power level
  context.powerLevel = detectPowerLevel(
    userMessage,
    context.curveAnalysis?.highEndCount || 0,
    context.curveAnalysis?.averageCMC || 0
  );

  // Detect budget intent
  const budgetHints = parseBudgetHints(userMessage);
  const messageSignalsBudget = userMessage ? /\b(budget|cheap|affordable|low cost)\b/i.test(userMessage) : false;
  context.isBudget = planMode === 'Budget' || messageSignalsBudget || Boolean(budgetHints.perCard || budgetHints.total);
  if (budgetHints.perCard !== undefined) {
    context.budgetCapPerCard = budgetHints.perCard;
  }
  if (budgetHints.total !== undefined) {
    context.budgetTotalCap = budgetHints.total;
  }
  if (context.isBudget && context.budgetCapPerCard === undefined) {
    context.budgetCapPerCard = planMode === 'Budget' ? 8 : 10;
  }

  // Extract user intent/goal
  context.userIntent = extractUserIntent(userMessage);

  // Tag card roles
  const cardRoles = tagCardRoles(entries, context.commander, byName);
  
  // Calculate role distribution
  const byRole: Record<CardRole, number> = {
    commander: 0,
    ramp_fixing: 0,
    draw_advantage: 0,
    removal_interact: 0,
    wincon_payoff: 0,
    engine_enabler: 0,
    protection_recursion: 0,
    land: 0,
  };
  
  for (const card of cardRoles) {
    for (const role of card.roles) {
      byRole[role] += card.count;
    }
  }
  
  // Analyze redundancy
  const redundancy = analyzeRedundancy(cardRoles);
  
  context.roleDistribution = {
    byRole,
    cardRoles,
    redundancy,
  };

  // Count existing ramp pieces
  context.existingRampCount = byRole.ramp_fixing || 0;

  // Detect archetype and protected roles (after role tagging)
  const { archetype, protectedRoles } = detectArchetype(entries, context.commanderOracleText, byName);
  context.archetype = archetype;
  context.protectedRoles = protectedRoles;

  // Store in cache
  inferenceCache.set(cacheKey, { context, timestamp: now });
  
  // Clean up old cache entries (keep only last 100 entries)
  if (inferenceCache.size > 100) {
    const entries = Array.from(inferenceCache.entries());
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp); // Sort by timestamp desc
    inferenceCache.clear();
    entries.slice(0, 100).forEach(([key, value]) => {
      inferenceCache.set(key, value);
    });
  }

  return context;
}

