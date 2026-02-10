/**
 * DeckContextSummary for LLM Cost Architecture v2 (Phase A).
 * Builds a compact JSON summary for chat/analyze so we send summary + last N messages
 * instead of full decklist + long history. Includes card_names so the model does not
 * suggest cards already in the deck.
 */

import { parseDeckText } from "@/lib/deck/parseDeckText";
import { normalizeCardName } from "@/lib/deck/mtgValidators";
import { hashStringSync } from "@/lib/guest-tracking";
import { fetchCardsBatch, type SfCard } from "@/lib/deck/inference";

export type DeckContextSummary = {
  deck_hash: string;
  format: "Commander" | "Modern" | "Pioneer";
  commander: string | null;
  colors: string[];
  land_count: number;
  curve_histogram: number[]; // [0-1, 2, 3, 4, 5+] CMC buckets
  ramp: number;
  removal: number;
  draw: number;
  board_wipes: number;
  wincons: number;
  archetype_tags: string[];
  warning_flags: string[];
  card_names: string[];
  card_count: number;
  last_updated: string;
};

export type BuildSummaryOptions = {
  format?: "Commander" | "Modern" | "Pioneer";
  commander?: string | null;
  colors?: string[];
};

/**
 * Canonical deck text for hashing: parse into {count, name}, normalize names,
 * aggregate by name, sort by normalized name, then re-render. This avoids
 * headings/commander blocks/annotations affecting the hash and makes
 * "same deck different order" produce the same hash.
 */
function canonicalDeckTextForHash(deckText: string): string {
  const entries = parseDeckText(deckText);
  if (entries.length === 0) return "";

  const byNorm = new Map<string, { qty: number; displayName: string }>();
  for (const { name, qty } of entries) {
    const norm = normalizeCardName(name);
    if (!norm) continue;
    const existing = byNorm.get(norm);
    if (existing) {
      existing.qty += qty;
    } else {
      byNorm.set(norm, { qty, displayName: name.trim().replace(/\s+/g, " ") });
    }
  }

  const sorted = Array.from(byNorm.entries()).sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([norm, v]) => `${v.qty} ${norm}`).join("\n");
}

/**
 * Stable hash for a decklist. Same cards (any order) => same hash.
 * Do not sort raw lines; parse → canonicalize names → sort by name → hash.
 */
export function deckHash(deckText: string): string {
  const canonical = canonicalDeckTextForHash(deckText);
  return hashStringSync(canonical || "empty");
}

const landRe = /land/i;
const drawRe = /draw a card|scry [1-9]|investigate/i;
const rampRe = /add \{[wubrg]\}|search your library for (a|up to .*?) land/i;
const killRe = /destroy target|exile target|counter target|fight target|deal .* damage to any target/i;
const wipeRe = /destroy all|exile all|each (creature|permanent)|board wipe|wrath/i;

function tally(
  entries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>
): { lands: number; ramp: number; draw: number; removal: number; wipes: number; curve: number[] } {
  let lands = 0;
  let ramp = 0;
  let draw = 0;
  let removal = 0;
  let wipes = 0;
  const curve = [0, 0, 0, 0, 0];

  for (const { name, count } of entries) {
    const card = byName.get(name.toLowerCase());
    const typeLine = card?.type_line ?? "";
    const oracle = card?.oracle_text ?? "";

    if (landRe.test(typeLine)) lands += count;
    if (drawRe.test(oracle)) draw += count;
    if (rampRe.test(oracle) || /signet|talisman|sol ring/i.test(name)) ramp += count;
    if (killRe.test(oracle)) removal += count;
    if (wipeRe.test(oracle)) wipes += count;

    const cmc = typeof card?.cmc === "number" ? card.cmc : undefined;
    if (typeof cmc === "number") {
      if (cmc <= 1) curve[0] += count;
      else if (cmc <= 2) curve[1] += count;
      else if (cmc <= 3) curve[2] += count;
      else if (cmc <= 4) curve[3] += count;
      else curve[4] += count;
    }
  }

  return { lands, ramp, draw, removal, wipes, curve };
}

function inferWarningFlags(
  format: "Commander" | "Modern" | "Pioneer",
  totalCards: number,
  lands: number,
  ramp: number,
  draw: number,
  removal: number
): string[] {
  const flags: string[] = [];
  const landRatio = totalCards > 0 ? lands / totalCards : 0;
  const wantLands = format === "Commander" ? 35 : 24;
  const wantRamp = format === "Commander" ? 8 : 4;
  const wantDraw = 8;
  const wantRemoval = 8;

  if (format === "Commander" && totalCards < 98) flags.push("deck_too_small");
  if (totalCards > 0 && landRatio < 0.3) flags.push("mana_low");
  if (lands > 0 && landRatio > 0.45) flags.push("mana_high");
  if (ramp < wantRamp && format === "Commander") flags.push("ramp_low");
  if (draw < 6) flags.push("draw_low");
  if (removal < 5) flags.push("removal_low");

  return flags;
}

/**
 * Build DeckContextSummary from deck text. Fetches card data for tally/curve.
 * Includes card_names (unique, canonical) and card_count so the model can avoid suggesting existing cards.
 */
export async function buildDeckContextSummary(
  deckText: string,
  options: BuildSummaryOptions = {}
): Promise<DeckContextSummary> {
  const format = options.format ?? "Commander";
  const entries = parseDeckText(deckText).map((e) => ({ name: e.name, count: e.qty }));
  const uniqueNames = Array.from(new Set(entries.map((e) => e.name))).filter(Boolean);
  const byName = await fetchCardsBatch(uniqueNames);

  const { lands, ramp, draw, removal, wipes, curve } = tally(entries, byName);
  const totalCards = entries.reduce((s, e) => s + e.count, 0);

  const cardNames = Array.from(new Set(entries.map((e) => e.name.trim().replace(/\s+/g, " "))));
  const hash = deckHash(deckText);
  const warningFlags = inferWarningFlags(format, totalCards, lands, ramp, draw, removal);

  const archetypeTags: string[] = [];
  const commander = options.commander ?? null;
  if (commander) {
    const c = commander.toLowerCase();
    if (/token|go-wide|army/i.test(c)) archetypeTags.push("tokens");
    if (/sac|aristocrat|sacrifice/i.test(c)) archetypeTags.push("aristocrats");
    if (/reanimat|graveyard|dredge|muldrotha|meren/i.test(c)) archetypeTags.push("reanimator");
    if (/landfall|land matter|gitrog/i.test(c)) archetypeTags.push("lands");
    if (/spell|storm|kess/i.test(c)) archetypeTags.push("spellslinger");
  }

  return {
    deck_hash: hash,
    format,
    commander: commander ?? null,
    colors: options.colors ?? [],
    land_count: lands,
    curve_histogram: curve,
    ramp,
    removal,
    draw,
    board_wipes: wipes,
    wincons: 0,
    archetype_tags: archetypeTags.length ? archetypeTags : ["unknown"],
    warning_flags: warningFlags,
    card_names: cardNames,
    card_count: totalCards,
    last_updated: new Date().toISOString(),
  };
}

/**
 * Estimate token count for the summary (for ai_usage.summary_tokens_estimate).
 */
export function estimateSummaryTokens(summary: DeckContextSummary): number {
  const s = JSON.stringify(summary);
  return Math.ceil(s.length / 4);
}

// --- Paste decklist cache (LRU + TTL). Best-effort only. ---
// In serverless (e.g. Vercel), in-memory cache does not persist across cold starts or instances.
// Still useful for bursts and retries within the same instance. For stronger caching, Phase B could add KV (e.g. Upstash).

const PASTE_CACHE_MAX = 500;
const PASTE_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

type CacheEntry = { summary: DeckContextSummary; ts: number };

const pasteCache = new Map<string, CacheEntry>();
const pasteCacheOrder: string[] = [];

function evictPasteCache(): void {
  const now = Date.now();
  while (pasteCacheOrder.length > 0 && pasteCache.size >= PASTE_CACHE_MAX) {
    const key = pasteCacheOrder.shift();
    if (key) pasteCache.delete(key);
  }
  for (const [key, entry] of Array.from(pasteCache.entries())) {
    if (now - entry.ts > PASTE_CACHE_TTL_MS) {
      pasteCache.delete(key);
      const i = pasteCacheOrder.indexOf(key);
      if (i >= 0) pasteCacheOrder.splice(i, 1);
    }
  }
}

export function getPasteSummary(hash: string): DeckContextSummary | null {
  evictPasteCache();
  const entry = pasteCache.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.ts > PASTE_CACHE_TTL_MS) {
    pasteCache.delete(hash);
    const i = pasteCacheOrder.indexOf(hash);
    if (i >= 0) pasteCacheOrder.splice(i, 1);
    return null;
  }
  const i = pasteCacheOrder.indexOf(hash);
  if (i >= 0) pasteCacheOrder.splice(i, 1);
  pasteCacheOrder.push(hash);
  return entry.summary;
}

export function setPasteSummary(hash: string, summary: DeckContextSummary): void {
  evictPasteCache();
  pasteCache.set(hash, { summary, ts: Date.now() });
  const i = pasteCacheOrder.indexOf(hash);
  if (i >= 0) pasteCacheOrder.splice(i, 1);
  pasteCacheOrder.push(hash);
}
