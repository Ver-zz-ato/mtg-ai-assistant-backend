/**
 * Commander generate-from-collection: ownership modes, deck filtering, and qty normalization.
 */

import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { norm, totalDeckQty, trimDeckToMaxQty } from "@/lib/deck/generation-helpers";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";

export type CollectionOwnershipMode = "collection_only" | "mostly_collection" | "best_with_missing";

const OWNERSHIP_MODES = new Set<string>(["collection_only", "mostly_collection", "best_with_missing"]);
const DECK_SHAPE_MODES = new Set<string>(["full_deck", "core_shell", "staples_flex"]);

const BASIC_BY_COLOR: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

export function normalizeOwnershipToken(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isCollectionOwnershipMode(s: string | null | undefined): s is CollectionOwnershipMode {
  if (!s?.trim()) return false;
  return OWNERSHIP_MODES.has(normalizeOwnershipToken(s));
}

export function isDeckShapeBuildMode(s: string | null | undefined): boolean {
  if (!s?.trim()) return false;
  return DECK_SHAPE_MODES.has(normalizeOwnershipToken(s));
}

/** Prefer `collectionOwnershipMode`; legacy bodies may send ownership via `buildMode`. */
export function resolveCollectionOwnershipMode(body: Record<string, unknown>): CollectionOwnershipMode | null {
  const explicit =
    typeof body.collectionOwnershipMode === "string" ? body.collectionOwnershipMode : null;
  if (isCollectionOwnershipMode(explicit)) return normalizeOwnershipToken(explicit) as CollectionOwnershipMode;

  const legacyBuild =
    typeof body.buildMode === "string" ? body.buildMode : null;
  if (isCollectionOwnershipMode(legacyBuild)) return normalizeOwnershipToken(legacyBuild) as CollectionOwnershipMode;

  return null;
}

/** Deck-shape `buildMode` only — ownership tokens are excluded. */
export function resolveDeckShapeBuildMode(body: Record<string, unknown>): string | null {
  const raw = typeof body.buildMode === "string" ? body.buildMode.trim() : "";
  if (!raw) return null;
  if (isCollectionOwnershipMode(raw)) return null;
  return raw;
}

/** Mostly-owned mode: target share of deck slots from the user's list (by quantity). */
export const MOSTLY_COLLECTION_TARGET_OWNED_PERCENT = 75;
export const MOSTLY_COLLECTION_MAX_OFF_COLLECTION_SLOTS = 25;

/** Commander mana base targets (collection / quiz builds). */
export const COMMANDER_TARGET_LAND_SLOTS = 37;
export const COMMANDER_MAX_LAND_SLOTS = 40;
export const COMMANDER_MAX_LAND_SHARE = 0.45;

const BASIC_LAND_NAMES = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "snow-covered plains",
  "snow-covered island",
  "snow-covered swamp",
  "snow-covered mountain",
  "snow-covered forest",
]);

export function isBasicLandName(name: string): boolean {
  const n = cardOwnerNormKey(name);
  return BASIC_LAND_NAMES.has(n) || n.startsWith("snow-covered ");
}

export function collectionOwnershipPromptDirective(mode: CollectionOwnershipMode | null): string {
  if (!mode) return "";
  if (mode === "collection_only") {
    return [
      "COLLECTION OWNERSHIP (mandatory): collection_only",
      "Use ONLY cards from the user's owned collection list in this prompt. Do not include cards they do not own.",
      "Every line must be an exact card name from the owned list (including grouped basics). Do not add staples, fetches, or utility lands that are not listed.",
      "If the collection cannot support a full 100-card deck, still output the best possible list using only owned cards (basics only if listed).",
    ].join("\n");
  }
  if (mode === "mostly_collection") {
    return [
      "COLLECTION OWNERSHIP (mandatory): mostly_collection",
      `At least ${MOSTLY_COLLECTION_TARGET_OWNED_PERCENT} of the 100 card slots (count quantities) MUST be exact names from the owned collection list above.`,
      `Off-collection cards: at most ${MOSTLY_COLLECTION_MAX_OFF_COLLECTION_SLOTS} slots total, only when the owned list cannot fill a critical role (e.g. one extra removal).`,
      "Do not paste full staple packages (e.g. Mystic Remora, Eternal Witness, fetchlands, shocklands, triomes) unless that exact card appears in the owned list.",
      "Prioritize higher-quantity owned cards when choosing flex slots. Use owned basics for the mana base before inventing off-collection lands.",
      `Mana base: about ${COMMANDER_TARGET_LAND_SLOTS}–${COMMANDER_MAX_LAND_SLOTS} total lands (count quantities). Never pad the deck by dumping every owned basic into the list.`,
    ].join("\n");
  }
  return [
    "COLLECTION OWNERSHIP (mandatory): best_with_missing",
    "Optimize deck quality for the chosen power level. Prefer owned cards when roles are similar; off-collection upgrades are allowed.",
    "Aim for roughly 50%+ owned slots when the owned list has reasonable depth, but do not weaken the deck unnecessarily.",
  ].join("\n");
}

export function cardOwnerNormKey(name: string): string {
  return normalizeScryfallCacheName(name);
}

export function filterDeckToCollectionOwnership(
  cards: Array<{ name: string; qty: number }>,
  ownerNormKeys: Set<string>,
  mode: CollectionOwnershipMode | null,
  commanderName?: string | null
): { cards: Array<{ name: string; qty: number }>; removed: Array<{ name: string; qty: number }> } {
  if (!mode || mode !== "collection_only" || ownerNormKeys.size === 0) {
    return { cards, removed: [] };
  }
  const cmdKey = commanderName?.trim() ? cardOwnerNormKey(commanderName) : null;
  const removed: Array<{ name: string; qty: number }> = [];
  const kept: Array<{ name: string; qty: number }> = [];
  for (const c of cards) {
    const nk = cardOwnerNormKey(c.name);
    if (ownerNormKeys.has(nk) || (cmdKey && nk === cmdKey)) {
      kept.push(c);
    } else {
      removed.push({ name: c.name, qty: c.qty });
    }
  }
  return { cards: kept, removed };
}

function resolveDetailEntry<T>(details: Map<string, T>, name: string): T | undefined {
  const key = cardOwnerNormKey(name);
  const exact = details.get(key) ?? details.get(norm(name));
  if (exact) return exact;
  for (const [candidateKey, value] of details.entries()) {
    if (cardOwnerNormKey(candidateKey) === key || norm(candidateKey) === norm(name)) return value;
  }
  return undefined;
}

export function filterDeckToCommanderColorIdentity(
  cards: Array<{ name: string; qty: number }>,
  details: Map<string, Pick<SfCard, "color_identity">>,
  allowedColors: string[],
  options: {
    commanderName?: string | null;
    commanderKnown: boolean;
    keepUnknown?: boolean;
  }
): {
  cards: Array<{ name: string; qty: number }>;
  removed: Array<{ name: string; qty: number }>;
  skipped: boolean;
} {
  if (!options.commanderKnown) {
    return { cards, removed: [], skipped: true };
  }

  const cmdKey = options.commanderName?.trim() ? cardOwnerNormKey(options.commanderName) : null;
  const keepUnknown = options.keepUnknown ?? true;
  const kept: Array<{ name: string; qty: number }> = [];
  const removed: Array<{ name: string; qty: number }> = [];

  for (const card of cards) {
    const nk = cardOwnerNormKey(card.name);
    if (cmdKey && nk === cmdKey) {
      kept.push(card);
      continue;
    }

    const entry = resolveDetailEntry(details, card.name);
    if (!entry) {
      if (keepUnknown) kept.push(card);
      else removed.push(card);
      continue;
    }

    if (isWithinColorIdentity(entry as SfCard, allowedColors)) {
      kept.push(card);
    } else {
      removed.push(card);
    }
  }

  return { cards: kept, removed, skipped: false };
}

function ownedBasicsPool(
  colors: string[],
  ownerNormKeys: Set<string>
): string[] {
  const basics = colors
    .map((c) => BASIC_BY_COLOR[c.toUpperCase()])
    .filter((name): name is string => Boolean(name));
  const pool = basics.filter((b) => ownerNormKeys.has(cardOwnerNormKey(b)));
  if (ownerNormKeys.has(cardOwnerNormKey("Wastes"))) pool.push("Wastes");
  return pool;
}

function addBasicsFromPool(
  cards: Array<{ name: string; qty: number }>,
  targetQty: number,
  pool: string[],
  maxQtyPerNormKey?: Map<string, number>
): Array<{ name: string; qty: number }> | null {
  const total = totalDeckQty(cards);
  const missing = targetQty - total;
  if (missing <= 0) return cards;
  if (pool.length === 0) return null;
  const out = cards.map((c) => ({ ...c }));
  let guard = 0;
  let stagnant = 0;
  while (totalDeckQty(out) < targetQty && guard < missing * Math.max(pool.length, 1) + 40) {
    guard += 1;
    const name = pool[guard % pool.length];
    const nk = cardOwnerNormKey(name);
    const cap = maxQtyPerNormKey?.get(nk);
    const existing = out.find((c) => norm(c.name) === norm(name));
    const current = existing?.qty ?? 0;
    if (cap != null && current >= cap) {
      stagnant += 1;
      if (stagnant >= pool.length) break;
      continue;
    }
    stagnant = 0;
    if (existing) existing.qty += 1;
    else out.push({ name, qty: 1 });
  }
  if (totalDeckQty(out) < targetQty) return null;
  return out;
}

function addBasicsToReachQty(
  cards: Array<{ name: string; qty: number }>,
  targetQty: number,
  colors: string[]
): Array<{ name: string; qty: number }> {
  const basics = colors.map((c) => BASIC_BY_COLOR[c.toUpperCase()]).filter(Boolean);
  const pool = basics.length > 0 ? basics : ["Wastes"];
  return addBasicsFromPool(cards, targetQty, pool) ?? cards;
}

export type NormalizeCommanderQtyResult =
  | { ok: true; cards: Array<{ name: string; qty: number }> }
  | { ok: false; code: "COLLECTION_NEEDS_LANDS"; error: string };

export function countBasicLandSlots(cards: Array<{ name: string; qty: number }>): number {
  let n = 0;
  for (const c of cards) {
    if (isBasicLandName(c.name)) n += Math.max(0, Number(c.qty) || 0);
  }
  return n;
}

/** Clamp each basic land row to at most the user's owned quantity. */
export function capBasicsToOwnedQuantity(
  cards: Array<{ name: string; qty: number }>,
  qtyByNormKey: Map<string, number>
): Array<{ name: string; qty: number }> {
  const out: Array<{ name: string; qty: number }> = [];
  for (const c of cards) {
    if (!isBasicLandName(c.name)) {
      out.push({ ...c });
      continue;
    }
    const nk = cardOwnerNormKey(c.name);
    const cap = qtyByNormKey.get(nk);
    const qty = cap != null ? Math.min(Math.max(1, c.qty), cap) : c.qty;
    if (qty > 0) out.push({ name: c.name, qty });
  }
  return out;
}

function trimBasicsToLandTarget(
  cards: Array<{ name: string; qty: number }>,
  targetLandSlots: number
): { cards: Array<{ name: string; qty: number }>; trimmed: number } {
  const working = cards.map((c) => ({ ...c }));
  let trimmed = 0;
  while (countBasicLandSlots(working) > targetLandSlots) {
    const basics = working
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => isBasicLandName(c.name) && c.qty > 0)
      .sort((a, b) => b.c.qty - a.c.qty);
    if (basics.length === 0) break;
    const victim = basics[0];
    victim.c.qty -= 1;
    trimmed += 1;
    if (victim.c.qty <= 0) working.splice(victim.idx, 1);
  }
  return { cards: working, trimmed };
}

function padWithOwnedNonbasics(
  cards: Array<{ name: string; qty: number }>,
  options: {
    ownerNormKeys: Set<string>;
    ownerNormToDisplay: Map<string, string>;
    qtyByNormKey: Map<string, number>;
    commanderName?: string | null;
    targetQty?: number;
  }
): Array<{ name: string; qty: number }> {
  const target = options.targetQty ?? 100;
  const cmdKey = options.commanderName?.trim() ? cardOwnerNormKey(options.commanderName) : null;
  const working = cards.map((c) => ({ ...c }));
  const inDeck = () => new Set(working.map((c) => cardOwnerNormKey(c.name)));

  const candidates: Array<{ nk: string; display: string; qty: number }> = [];
  for (const nk of options.ownerNormKeys) {
    if (nk === cmdKey) continue;
    const display = options.ownerNormToDisplay.get(nk);
    if (!display || isBasicLandName(display)) continue;
    candidates.push({ nk, display, qty: options.qtyByNormKey.get(nk) ?? 1 });
  }
  candidates.sort((a, b) => b.qty - a.qty);

  let guard = 0;
  while (totalDeckQty(working) < target && guard < candidates.length + 200) {
    guard += 1;
    const deckKeys = inDeck();
    const pick = candidates.find((c) => !deckKeys.has(c.nk));
    if (!pick) break;
    working.push({ name: pick.display, qty: 1 });
  }
  return working;
}

/**
 * Post-process Commander lists from collection builds: cap owned basics, trim land stuffing, refill to 100.
 */
export function enforceCommanderCollectionManaBase(
  cards: Array<{ name: string; qty: number }>,
  options: {
    ownershipMode: CollectionOwnershipMode | null;
    ownerNormKeys: Set<string>;
    ownerNormToDisplay: Map<string, string>;
    qtyByNormKey: Map<string, number>;
    colors: string[];
    commanderName?: string | null;
    targetLandSlots?: number;
    maxLandSlots?: number;
  }
): { cards: Array<{ name: string; qty: number }>; landSlots: number; trimmedBasics: number } {
  const targetLand = options.targetLandSlots ?? COMMANDER_TARGET_LAND_SLOTS;
  const maxLand = options.maxLandSlots ?? COMMANDER_MAX_LAND_SLOTS;
  const shouldCap =
    options.ownerNormKeys.size > 0 &&
    (options.ownershipMode === "collection_only" ||
      options.ownershipMode === "mostly_collection");

  let working = shouldCap ? capBasicsToOwnedQuantity(cards, options.qtyByNormKey) : [...cards];

  let trimmedBasics = 0;
  const landBefore = countBasicLandSlots(working);
  if (landBefore > maxLand) {
    const trimmed = trimBasicsToLandTarget(working, targetLand);
    working = trimmed.cards;
    trimmedBasics += trimmed.trimmed;
  }

  if (shouldCap && totalDeckQty(working) < 100) {
    working = padWithOwnedNonbasics(working, {
      ownerNormKeys: options.ownerNormKeys,
      ownerNormToDisplay: options.ownerNormToDisplay,
      qtyByNormKey: options.qtyByNormKey,
      commanderName: options.commanderName,
      targetQty: 100,
    });
  }

  if (shouldCap && totalDeckQty(working) < 100) {
    const pool = ownedBasicsPool(options.colors, options.ownerNormKeys);
    const padded = addBasicsFromPool(working, 100, pool, options.qtyByNormKey);
    if (padded) working = padded;
  }

  if (countBasicLandSlots(working) > maxLand) {
    const trimmed = trimBasicsToLandTarget(working, targetLand);
    working = trimmed.cards;
    trimmedBasics += trimmed.trimmed;
  }

  if (totalDeckQty(working) > 100) {
    working = trimDeckToMaxQty(working, 100);
  }

  if (shouldCap && totalDeckQty(working) < 100) {
    working = padWithOwnedNonbasics(working, {
      ownerNormKeys: options.ownerNormKeys,
      ownerNormToDisplay: options.ownerNormToDisplay,
      qtyByNormKey: options.qtyByNormKey,
      commanderName: options.commanderName,
      targetQty: 100,
    });
    const pool = ownedBasicsPool(options.colors, options.ownerNormKeys);
    const padded = addBasicsFromPool(working, 100, pool, options.qtyByNormKey);
    if (padded && totalDeckQty(padded) >= totalDeckQty(working)) working = padded;
  }

  if (totalDeckQty(working) > 100) {
    working = trimDeckToMaxQty(working, 100);
  }

  return { cards: working, landSlots: countBasicLandSlots(working), trimmedBasics };
}

/** Jaccard similarity on unique card names (0–100). */
export function deckUniqueNameJaccardPercent(
  a: Array<{ name: string; qty: number }>,
  b: Array<{ name: string; qty: number }>
): number {
  const setA = new Set(a.map((c) => cardOwnerNormKey(c.name)));
  const setB = new Set(b.map((c) => cardOwnerNormKey(c.name)));
  let inter = 0;
  for (const k of setA) if (setB.has(k)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union ? Math.round((inter / union) * 100) : 0;
}

/**
 * When mostly_collection is land-heavy but already hits owned %, swap basics for owned nonbasics.
 */
export function rebalanceLandHeavyMostlyCollectionDeck(
  cards: Array<{ name: string; qty: number }>,
  options: {
    ownerNormKeys: Set<string>;
    ownerNormToDisplay: Map<string, string>;
    qtyByNormKey: Map<string, number>;
    commanderName?: string | null;
    maxLandShare?: number;
    targetLandSlots?: number;
    maxSwaps?: number;
  }
): { cards: Array<{ name: string; qty: number }>; swaps: number } {
  const maxShare = options.maxLandShare ?? COMMANDER_MAX_LAND_SHARE;
  const targetLand = options.targetLandSlots ?? COMMANDER_TARGET_LAND_SLOTS;
  const maxSwaps = options.maxSwaps ?? 40;
  const cmdKey = options.commanderName?.trim() ? cardOwnerNormKey(options.commanderName) : null;

  const working = cards.map((c) => ({ name: c.name, qty: Math.max(1, Number(c.qty) || 1) }));
  let swaps = 0;

  const deckNormKeys = () => new Set(working.map((c) => cardOwnerNormKey(c.name)));

  for (let round = 0; round < maxSwaps; round++) {
    const { deckSlots } = ownedSlotStats(working, options.ownerNormKeys, options.commanderName);
    const landSlots = countBasicLandSlots(working);
    if (deckSlots === 0) break;
    const landShare = landSlots / deckSlots;
    if (landShare <= maxShare && landSlots <= COMMANDER_MAX_LAND_SLOTS) break;

    const basics = working
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => isBasicLandName(c.name) && c.qty > 0)
      .sort((a, b) => b.c.qty - a.c.qty);
    if (basics.length === 0 || landSlots <= targetLand) break;

    const inDeck = deckNormKeys();
    const candidates: Array<{ nk: string; display: string; qty: number }> = [];
    for (const nk of options.ownerNormKeys) {
      if (nk === cmdKey) continue;
      const display = options.ownerNormToDisplay.get(nk);
      if (!display || isBasicLandName(display)) continue;
      candidates.push({ nk, display, qty: options.qtyByNormKey.get(nk) ?? 1 });
    }
    candidates.sort((a, b) => {
      const aIn = inDeck.has(a.nk) ? 1 : 0;
      const bIn = inDeck.has(b.nk) ? 1 : 0;
      if (aIn !== bIn) return aIn - bIn;
      return b.qty - a.qty;
    });

    const pick = candidates.find((c) => !inDeck.has(c.nk)) ?? candidates[0];
    if (!pick) break;

    const victim = basics[0];
    victim.c.qty -= 1;
    if (victim.c.qty <= 0) working.splice(victim.idx, 1);

    const addIdx = working.findIndex((c) => cardOwnerNormKey(c.name) === pick.nk);
    if (addIdx >= 0) working[addIdx].qty += 1;
    else working.push({ name: pick.display, qty: 1 });
    swaps += 1;
  }

  return { cards: working, swaps };
}

export function normalizeCommanderDeckQtyForCollection(
  cards: Array<{ name: string; qty: number }>,
  colors: string[],
  options: {
    ownershipMode: CollectionOwnershipMode | null;
    ownerNormKeys: Set<string>;
    qtyByNormKey?: Map<string, number>;
  }
): NormalizeCommanderQtyResult {
  let working = [...cards];
  const total = totalDeckQty(working);
  if (total > 100) {
    return { ok: true, cards: trimDeckToMaxQty(working, 100) };
  }
  if (total === 100) {
    return { ok: true, cards: working };
  }

  const preferOwnedBasics =
    options.ownerNormKeys.size > 0 &&
    (options.ownershipMode === "collection_only" || options.ownershipMode === "mostly_collection");

  if (preferOwnedBasics && totalDeckQty(working) < 100) {
    const pool = ownedBasicsPool(colors, options.ownerNormKeys);
    const paddedOwned = addBasicsFromPool(working, 100, pool, options.qtyByNormKey);
    if (paddedOwned && totalDeckQty(paddedOwned) === 100) {
      const landSlots = countBasicLandSlots(paddedOwned);
      if (landSlots <= COMMANDER_MAX_LAND_SLOTS) {
        return { ok: true, cards: paddedOwned };
      }
      working = paddedOwned;
    }
    if (options.ownershipMode === "collection_only") {
      return {
        ok: false,
        code: "COLLECTION_NEEDS_LANDS",
        error:
          "Your collection does not have enough basic lands (or total cards) to complete a 100-card Commander deck in “Only owned cards” mode. Add more lands to your collection, or try “Mostly from collection”.",
      };
    }
    working = paddedOwned ?? working;
  }

  if (totalDeckQty(working) < 100) {
    working = addBasicsToReachQty(working, 100, colors);
  }

  if (options.qtyByNormKey && options.qtyByNormKey.size > 0 && preferOwnedBasics) {
    working = capBasicsToOwnedQuantity(working, options.qtyByNormKey);
    if (countBasicLandSlots(working) > COMMANDER_MAX_LAND_SLOTS) {
      working = trimBasicsToLandTarget(working, COMMANDER_TARGET_LAND_SLOTS).cards;
    }
    if (totalDeckQty(working) < 100) {
      const pool = ownedBasicsPool(colors, options.ownerNormKeys);
      const padded = addBasicsFromPool(working, 100, pool, options.qtyByNormKey);
      if (padded) working = padded;
    }
  }

  if (totalDeckQty(working) > 100) {
    working = trimDeckToMaxQty(working, 100);
  }

  return { ok: true, cards: working };
}

export type CollectionFitSummary = {
  ownershipMode: CollectionOwnershipMode | null;
  collectionTotalCards: number;
  promptSampleSize: number;
  deckSlots: number;
  ownedSlots: number;
  missingSlots: number;
  ownedPercent: number;
  missingCardNames: string[];
  /** True when `missingCardNames` is capped; use `missingUniqueCount` for full count. */
  missingNamesTruncated?: boolean;
  missingUniqueCount?: number;
  /** Set when mostly_collection finished below target owned %. */
  ownershipNote?: string;
  rebalanceSwaps?: number;
};

export function ownedSlotStats(
  cards: Array<{ name: string; qty: number }>,
  ownerNormKeys: Set<string>,
  commanderName?: string | null
): { deckSlots: number; ownedSlots: number } {
  const cmdKey = commanderName?.trim() ? cardOwnerNormKey(commanderName) : null;
  let deckSlots = 0;
  let ownedSlots = 0;
  for (const c of cards) {
    const q = Math.max(0, Number(c.qty) || 0);
    if (q <= 0) continue;
    deckSlots += q;
    const nk = cardOwnerNormKey(c.name);
    if (ownerNormKeys.has(nk) || (cmdKey !== null && nk === cmdKey)) ownedSlots += q;
  }
  return { deckSlots, ownedSlots };
}

/**
 * Swap off-collection slots for owned cards (mostly_collection) until owned % meets target or swaps exhaust.
 */
export function rebalanceMostlyCollectionDeck(
  cards: Array<{ name: string; qty: number }>,
  options: {
    ownerNormKeys: Set<string>;
    ownerNormToDisplay: Map<string, string>;
    qtyByNormKey: Map<string, number>;
    commanderName?: string | null;
    targetOwnedPercent?: number;
    maxSwaps?: number;
  }
): { cards: Array<{ name: string; qty: number }>; swaps: number } {
  const target = options.targetOwnedPercent ?? MOSTLY_COLLECTION_TARGET_OWNED_PERCENT;
  const maxSwaps = options.maxSwaps ?? 40;
  const cmdKey = options.commanderName?.trim() ? cardOwnerNormKey(options.commanderName) : null;

  const working = cards.map((c) => ({ name: c.name, qty: Math.max(1, Number(c.qty) || 1) }));
  let swaps = 0;

  const deckNormKeys = () => {
    const s = new Set<string>();
    for (const c of working) s.add(cardOwnerNormKey(c.name));
    return s;
  };

  const findRow = (nk: string) => working.findIndex((c) => cardOwnerNormKey(c.name) === nk);

  for (let round = 0; round < maxSwaps; round++) {
    const { deckSlots, ownedSlots } = ownedSlotStats(working, options.ownerNormKeys, options.commanderName);
    if (deckSlots === 0) break;
    const ownedPercent = Math.round((ownedSlots / deckSlots) * 100);
    if (ownedPercent >= target) break;

    const inDeck = deckNormKeys();

    const offCollectionRows = working
      .map((c, idx) => ({ c, idx, nk: cardOwnerNormKey(c.name) }))
      .filter(({ nk }) => !options.ownerNormKeys.has(nk) && nk !== cmdKey)
      .sort((a, b) => {
        const aBasic = isBasicLandName(a.c.name) ? 0 : 1;
        const bBasic = isBasicLandName(b.c.name) ? 0 : 1;
        if (aBasic !== bBasic) return aBasic - bBasic;
        return b.c.qty - a.c.qty;
      });

    if (offCollectionRows.length === 0) break;

    const candidates: Array<{ nk: string; display: string; qty: number; isLand: boolean }> = [];
    for (const nk of options.ownerNormKeys) {
      if (nk === cmdKey) continue;
      const display = options.ownerNormToDisplay.get(nk);
      if (!display) continue;
      const qty = options.qtyByNormKey.get(nk) ?? 1;
      candidates.push({ nk, display, qty, isLand: isBasicLandName(display) });
    }
    candidates.sort((a, b) => {
      const aIn = inDeck.has(a.nk) ? 1 : 0;
      const bIn = inDeck.has(b.nk) ? 1 : 0;
      if (aIn !== bIn) return aIn - bIn;
      if (a.isLand !== b.isLand) return a.isLand ? 1 : -1;
      return b.qty - a.qty;
    });

    const victim = offCollectionRows[0];
    const pick = candidates.find((c) => !inDeck.has(c.nk)) ?? candidates.find((c) => inDeck.has(c.nk));
    if (!pick) break;

    victim.c.qty -= 1;
    if (victim.c.qty <= 0) working.splice(victim.idx, 1);

    const addIdx = findRow(pick.nk);
    if (addIdx >= 0) {
      working[addIdx].qty += 1;
    } else {
      working.push({ name: pick.display, qty: 1 });
    }
    swaps += 1;
  }

  return { cards: working, swaps };
}

export function computeCollectionFitSummary(
  cards: Array<{ name: string; qty: number }>,
  ownerNormKeys: Set<string>,
  options: {
    ownershipMode: CollectionOwnershipMode | null;
    collectionTotalCards: number;
    promptSampleSize: number;
    commanderName?: string | null;
    maxMissingNames?: number;
    rebalanceSwaps?: number;
  }
): CollectionFitSummary {
  const cmdKey = options.commanderName?.trim() ? cardOwnerNormKey(options.commanderName) : null;
  let deckSlots = 0;
  let ownedSlots = 0;
  const missingNames: string[] = [];
  const missingSeen = new Set<string>();

  for (const c of cards) {
    const q = Math.max(0, Number(c.qty) || 0);
    if (q <= 0) continue;
    deckSlots += q;
    const nk = cardOwnerNormKey(c.name);
    const owned = ownerNormKeys.has(nk) || (cmdKey !== null && nk === cmdKey);
    if (owned) {
      ownedSlots += q;
    } else if (!missingSeen.has(nk)) {
      missingSeen.add(nk);
      missingNames.push(c.name);
    }
  }

  const cap = options.maxMissingNames ?? 40;
  const missingSlots = Math.max(0, deckSlots - ownedSlots);
  const ownedPercent = deckSlots > 0 ? Math.round((ownedSlots / deckSlots) * 100) : 0;
  const missingUniqueCount = missingNames.length;

  let ownershipNote: string | undefined;
  if (
    options.ownershipMode === "mostly_collection" &&
    ownedPercent < MOSTLY_COLLECTION_TARGET_OWNED_PERCENT &&
    ownerNormKeys.size > 0
  ) {
    ownershipNote = `This list is ${ownedPercent}% from your collection (target ${MOSTLY_COLLECTION_TARGET_OWNED_PERCENT}%+). Consider “Only owned” or add more on-theme cards to your collection.`;
  }

  return {
    ownershipMode: options.ownershipMode,
    collectionTotalCards: options.collectionTotalCards,
    promptSampleSize: options.promptSampleSize,
    deckSlots,
    ownedSlots,
    missingSlots,
    ownedPercent,
    missingCardNames: missingNames.slice(0, cap),
    missingNamesTruncated: missingUniqueCount > cap,
    missingUniqueCount,
    ownershipNote,
    rebalanceSwaps: options.rebalanceSwaps,
  };
}
