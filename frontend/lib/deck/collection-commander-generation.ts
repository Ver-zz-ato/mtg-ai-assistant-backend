/**
 * Commander generate-from-collection: ownership modes, deck filtering, and qty normalization.
 */

import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { norm, totalDeckQty, trimDeckToMaxQty } from "@/lib/deck/generation-helpers";

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

export function collectionOwnershipPromptDirective(mode: CollectionOwnershipMode | null): string {
  if (!mode) return "";
  if (mode === "collection_only") {
    return [
      "COLLECTION OWNERSHIP (mandatory): collection_only",
      "Use ONLY cards from the user's owned collection list in this prompt. Do not include cards they do not own.",
      "If the collection cannot support a full 100-card deck, still output the best possible list using only owned cards (basics only if listed).",
    ].join("\n");
  }
  if (mode === "mostly_collection") {
    return [
      "COLLECTION OWNERSHIP (mandatory): mostly_collection",
      "Build primarily from the owned collection list. You may add a small number of off-collection staples only when essential for a coherent Commander deck.",
    ].join("\n");
  }
  return [
    "COLLECTION OWNERSHIP (mandatory): best_with_missing",
    "Optimize deck quality for the chosen power level. Prefer owned cards when roles are similar; off-collection upgrades are allowed.",
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
  pool: string[]
): Array<{ name: string; qty: number }> | null {
  const total = totalDeckQty(cards);
  const missing = targetQty - total;
  if (missing <= 0) return cards;
  if (pool.length === 0) return null;
  const out = [...cards];
  for (let i = 0; i < missing; i++) {
    const name = pool[i % pool.length];
    const existing = out.find((c) => norm(c.name) === norm(name));
    if (existing) existing.qty += 1;
    else out.push({ name, qty: 1 });
  }
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

export function normalizeCommanderDeckQtyForCollection(
  cards: Array<{ name: string; qty: number }>,
  colors: string[],
  options: {
    ownershipMode: CollectionOwnershipMode | null;
    ownerNormKeys: Set<string>;
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

  if (options.ownershipMode === "collection_only" && options.ownerNormKeys.size > 0) {
    const pool = ownedBasicsPool(colors, options.ownerNormKeys);
    const padded = addBasicsFromPool(working, 100, pool);
    if (!padded || totalDeckQty(padded) < 100) {
      return {
        ok: false,
        code: "COLLECTION_NEEDS_LANDS",
        error:
          "Your collection does not have enough basic lands (or total cards) to complete a 100-card Commander deck in “Only owned cards” mode. Add more lands to your collection, or try “Mostly from collection”.",
      };
    }
    return { ok: true, cards: padded };
  }

  working = addBasicsToReachQty(working, 100, colors);
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
};

export function computeCollectionFitSummary(
  cards: Array<{ name: string; qty: number }>,
  ownerNormKeys: Set<string>,
  options: {
    ownershipMode: CollectionOwnershipMode | null;
    collectionTotalCards: number;
    promptSampleSize: number;
    commanderName?: string | null;
    maxMissingNames?: number;
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

  const cap = options.maxMissingNames ?? 16;
  const missingSlots = Math.max(0, deckSlots - ownedSlots);
  const ownedPercent = deckSlots > 0 ? Math.round((ownedSlots / deckSlots) * 100) : 0;

  return {
    ownershipMode: options.ownershipMode,
    collectionTotalCards: options.collectionTotalCards,
    promptSampleSize: options.promptSampleSize,
    deckSlots,
    ownedSlots,
    missingSlots,
    ownedPercent,
    missingCardNames: missingNames.slice(0, cap),
  };
}
