/**
 * Format-aware runtime validator for MTG deck analysis recommendations.
 * Runs after model output, before returning to user.
 * Validates: ADD not in deck, CUT in deck, no invented cards, color identity (Commander),
 * copy limits (60-card), strictly-worse substitutions. Supports in-place repair.
 */

import {
  normalizeCardName,
  isWithinColorIdentity,
  userFormatToRecommendationAddCutSyntax,
  userFormatUsesCommanderColorIdentity,
} from "@/lib/deck/mtgValidators";

function norm(name: string): string {
  return normalizeCardName(name);
}

/** Norm used by scryfall cache for map keys (space preserved). */
function cacheNorm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type ValidateRecommendationsInput = {
  /** Parsed decklist: card names (and optionally counts for 60-card). */
  deckCards: Array<{ name: string; count?: number }>;
  /**
   * Legacy hint when `formatForLegality` is omitted (Commander / Modern / Pioneer).
   * Prefer `formatForLegality` for Standard, Pauper, Brawl, Legacy, etc.
   */
  formatKey?: "commander" | "modern" | "pioneer";
  /** Commander color identity (commander / brawl-style decks). */
  colorIdentity?: string[] | null;
  commanderName?: string | null;
  /** Raw LLM output text. */
  rawText: string;
  /** When true, never set needsRegeneration (used when validating regen response; max 1 retry). */
  isRegenPass?: boolean;
  /**
   * User / deck format for Scryfall legality, ban overlay, ADD/CUT syntax, and identity checks.
   * Takes precedence over `formatKey` when set (e.g. standard, pauper, brawl, legacy).
   */
  formatForLegality?: string | null;
  /**
   * Hermetic unit tests only: rows keyed by cacheNorm(card name), as returned from scryfall cache.
   * Production callers must not set this.
   */
  testCardDetailsMap?: Map<
    string,
    { color_identity?: string[]; legalities?: Record<string, string> }
  >;
  /**
   * When set, skip loading banned_cards.json; use normalized cache keys (see scryfall cache PK).
   * `new Set()` = no ban overlay; `null` treated as no overlay.
   */
  testLegalityBanNormSet?: Set<string> | null;
};

export type ValidationIssue = {
  kind: "add_already_in_deck" | "cut_not_in_deck" | "invented_card" | "off_color" | "illegal_format" | "over_copy_limit" | "strictly_worse";
  card?: string;
  pair?: string;
  message: string;
};

export type ValidateRecommendationsResult = {
  valid: boolean;
  repairedText: string;
  issues: ValidationIssue[];
  /** Count of upgrade blocks remaining after repair. */
  upgradeBlocksRemaining: number;
  /** If true, caller may consider re-running LLM with injected system message (e.g. when upgradesRemaining < 3). */
  needsRegeneration: boolean;
};

/** Optional list/bullet prefix: "1. ", "1) ", "• ", "- " (multiline ^ for full-text parse). */
const LIST_PREFIX = String.raw`^\s*(?:\d+[.)]\s*|[-•]\s*)?`;
const RE_ADD_COMMANDER = new RegExp(`${LIST_PREFIX}ADD\\s*\\[\\[([^\\]]+)\\]\\]`, "gim");
const RE_ADD_60 = new RegExp(`${LIST_PREFIX}ADD\\s*\\+\\d+\\s*\\[\\[([^\\]]+)\\]\\]`, "gim");
const RE_CUT = new RegExp(`${LIST_PREFIX}CUT\\s*\\[\\[([^\\]]+)\\]\\]`, "gim");
/** Commander bare-name: "ADD X / CUT Y", "1. ADD X / CUT Y", "• ADD X / CUT Y, Fixes P1" on one line */
const RE_ADD_CUT_BARE_COMMANDER = new RegExp(`${LIST_PREFIX}ADD\\s+([^/\\n\\[\\]]+?)\\s*\\/\\s*CUT\\s+([^\\n\\[\\]]+?)(?=,|\\s*$|\\s*\\n)`, "gim");

/** Strip trailing " (anything)" for comparison with deck list. */
function baseCardName(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function parseAddNames(text: string, addCutSyntax: "commander" | "sixty"): string[] {
  const names: string[] = [];
  if (addCutSyntax === "commander") {
    const reBracket = new RegExp(RE_ADD_COMMANDER.source, RE_ADD_COMMANDER.flags);
    let m: RegExpExecArray | null;
    while ((m = reBracket.exec(text)) !== null) {
      const name = (m[1] || "").trim();
      if (name && !names.some((n) => norm(n) === norm(name))) names.push(name);
    }
    const reBare = new RegExp(RE_ADD_CUT_BARE_COMMANDER.source, RE_ADD_CUT_BARE_COMMANDER.flags);
    while ((m = reBare.exec(text)) !== null) {
      const name = baseCardName((m[1] || "").trim());
      if (name && !names.some((n) => norm(n) === norm(name))) names.push(name);
    }
  } else {
    const re = new RegExp(RE_ADD_60.source, RE_ADD_60.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = (m[1] || "").trim();
      if (name && !names.some((n) => norm(n) === norm(name))) names.push(name);
    }
  }
  return names;
}

function parseCutNames(text: string): string[] {
  const names: string[] = [];
  let m: RegExpExecArray | null;
  const regex = new RegExp(RE_CUT.source, RE_CUT.flags);
  while ((m = regex.exec(text)) !== null) {
    const name = (m[1] || "").trim();
    if (name && !names.some((n) => norm(n) === norm(name))) names.push(name);
  }
  return names;
}

/** Upgrade block: lines from ADD line to next ADD or end of block. Commander also matches bare "ADD X / CUT Y" on one line. Supports "1. ADD ...", "• ADD ...". */
function findUpgradeBlocks(
  text: string,
  addCutSyntax: "commander" | "sixty"
): Array<{ start: number; end: number; addCard: string; cutCard: string | null }> {
  const lines = text.split("\n");
  const blocks: Array<{ start: number; end: number; addCard: string; cutCard: string | null }> = [];
  const addReBracket = addCutSyntax === "commander"
    ? /(?:\d+[.)]\s*|[-•]\s*)?ADD\s*\[\[([^\]]+)\]\]/i
    : /(?:\d+[.)]\s*|[-•]\s*)?ADD\s*\+\d+\s*\[\[([^\]]+)\]\]/i;
  const addReBareCommander = /(?:\d+[.)]\s*|[-•]\s*)?ADD\s+([^/\n\[\]]+?)\s*\/\s*CUT\s+([^\n\[\]]+?)(?=,|\s*$|\s*\n)/i;
  const cutRe = /(?:\d+[.)]\s*|[-•]\s*)?CUT\s*\[\[([^\]]+)\]\]/i;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const addMatchBracket = line.match(addReBracket);
    const addMatchBare = addCutSyntax === "commander" ? line.match(addReBareCommander) : null;

    if (addMatchBracket) {
      const addCard = (addMatchBracket[1] || "").trim();
      let cutCard: string | null = null;
      let end = i + 1;
      while (end < lines.length && !lines[end].match(addReBracket) && !lines[end].match(addReBareCommander)) {
        const cutMatch = lines[end].match(cutRe);
        if (cutMatch) cutCard = (cutMatch[1] || "").trim();
        end++;
      }
      blocks.push({ start: i, end, addCard, cutCard });
      i = end;
    } else if (addMatchBare) {
      const addCard = baseCardName((addMatchBare[1] || "").trim());
      const cutCard = baseCardName((addMatchBare[2] || "").trim());
      blocks.push({ start: i, end: i + 1, addCard, cutCard: cutCard || null });
      i++;
    } else {
      i++;
    }
  }
  return blocks;
}

function resolveRecommendationFormat(input: ValidateRecommendationsInput): {
  formatDisplay: string;
  addCutSyntax: "commander" | "sixty";
  usesCommanderColorIdentity: boolean;
} {
  const legacyKey = input.formatKey ?? "commander";
  const fallbackFromLegacy =
    legacyKey === "modern" ? "Modern" : legacyKey === "pioneer" ? "Pioneer" : "Commander";
  const raw = (input.formatForLegality || "").trim();
  const legalitySource = raw || fallbackFromLegacy;
  const formatDisplay =
    legalitySource.charAt(0).toUpperCase() + legalitySource.slice(1).toLowerCase();
  return {
    formatDisplay,
    addCutSyntax: userFormatToRecommendationAddCutSyntax(legalitySource),
    usesCommanderColorIdentity: userFormatUsesCommanderColorIdentity(legalitySource),
  };
}

/** Strictly worse: ADD is strictly worse than CUT. (addNorm, cutNorm) -> remove block. Extensible per format. */
const STRICTLY_WORSE: Array<{ addNorm: string; cutNorm: string }> = [
  { addNorm: "murder", cutNorm: "putrefy" },
  { addNorm: "doomblade", cutNorm: "goforthethroat" },
  { addNorm: "terror", cutNorm: "putrefy" },
  { addNorm: "cancel", cutNorm: "counterspell" },
  { addNorm: "cancel", cutNorm: "arcanedenial" },
  { addNorm: "divination", cutNorm: "expressiveiteration" },
  { addNorm: "divination", cutNorm: "memorydeluge" },
  { addNorm: "divination", cutNorm: "nightswhisper" },
  { addNorm: "shock", cutNorm: "lightningbolt" },
  { addNorm: "naturalize", cutNorm: "natureclaim" },
  { addNorm: "naturalize", cutNorm: "return tonature" },
];

const MAX_COPIES_60 = 4;
const MIN_UPGRADES_FOR_REGENERATION = 3;

/** Fixed repair system message for single retry when needsRegeneration is true. */
export const REPAIR_SYSTEM_MESSAGE =
  "Previous suggestions included invalid, duplicate, or illegal cards. Regenerate recommendations using only legal, non-duplicate cards for this format. Preserve the original structure and tone; only repair the invalid recommendations.";

/**
 * Check if validation issues are serious enough to auto-escalate for human review.
 * Escalate if: any hallucination (invented card), OR >= 2 serious issues.
 */
export function shouldAutoEscalate(issues: ValidationIssue[]): boolean {
  // Hallucination (invented card) is always serious
  const hasHallucination = issues.some(i => i.kind === 'invented_card');
  if (hasHallucination) return true;
  
  // Count serious issues (off_color, illegal_format)
  const seriousIssues = issues.filter(i => 
    i.kind === 'off_color' || 
    i.kind === 'illegal_format' ||
    i.kind === 'invented_card'
  );
  
  return seriousIssues.length >= 2;
}

/**
 * Format validation issues as a user-visible warning message.
 * Only includes issues worth surfacing (invented cards, off-color, format illegal).
 */
export function formatValidationWarning(issues: ValidationIssue[]): string | null {
  // Filter to user-facing issues (not internal like already_in_deck, not_in_deck)
  const userFacingIssues = issues.filter(i => 
    i.kind === 'invented_card' || 
    i.kind === 'off_color' || 
    i.kind === 'illegal_format' ||
    i.kind === 'over_copy_limit'
  );
  
  if (userFacingIssues.length === 0) return null;
  
  // Group by type
  const inventedCards = userFacingIssues.filter(i => i.kind === 'invented_card').map(i => i.card).filter(Boolean);
  const offColorCards = userFacingIssues.filter(i => i.kind === 'off_color').map(i => i.card).filter(Boolean);
  const illegalFormatCards = userFacingIssues.filter(i => i.kind === 'illegal_format').map(i => i.card).filter(Boolean);
  const overLimitCards = userFacingIssues.filter(i => i.kind === 'over_copy_limit').map(i => i.card).filter(Boolean);
  
  const parts: string[] = [];
  
  if (inventedCards.length > 0) {
    parts.push(`couldn't verify: ${inventedCards.slice(0, 3).join(', ')}${inventedCards.length > 3 ? ` (+${inventedCards.length - 3} more)` : ''}`);
  }
  
  if (offColorCards.length > 0) {
    parts.push(`off-color for your commander: ${offColorCards.slice(0, 3).join(', ')}${offColorCards.length > 3 ? ` (+${offColorCards.length - 3} more)` : ''}`);
  }

  if (illegalFormatCards.length > 0) {
    parts.push(`not legal in this format: ${illegalFormatCards.slice(0, 3).join(', ')}${illegalFormatCards.length > 3 ? ` (+${illegalFormatCards.length - 3} more)` : ''}`);
  }
  
  if (overLimitCards.length > 0) {
    parts.push(`would exceed copy limit: ${overLimitCards.slice(0, 3).join(', ')}`);
  }
  
  if (parts.length === 0) return null;
  
  return `\n\n_Note: I removed some suggestions that ${parts.join('; ')}._`;
}

/**
 * Fetch commander color identity dynamically from Scryfall cache.
 * Returns empty array if not found.
 */
async function fetchCommanderColorIdentity(commanderName: string): Promise<string[]> {
  try {
    const { getDetailsForNamesCached } = await import("@/lib/server/scryfallCache");
    const cardMap = await getDetailsForNamesCached([commanderName]);
    
    // Try exact match first
    const key = cacheNorm(commanderName);
    let entry = cardMap.get(key);
    
    // Try finding by normalized key if not found
    if (!entry) {
      for (const [k, v] of cardMap.entries()) {
        if (cacheNorm(k) === key || norm(k) === norm(commanderName)) {
          entry = v;
          break;
        }
      }
    }
    
    if (entry?.color_identity?.length) {
      return entry.color_identity.map((c: string) => c.toUpperCase());
    }
    
    return [];
  } catch (err) {
    console.warn("[validateRecommendations] Failed to fetch commander color identity:", err);
    return [];
  }
}

/**
 * Validate and repair LLM recommendation text. Does not re-run the model.
 */
export async function validateRecommendations(
  input: ValidateRecommendationsInput
): Promise<ValidateRecommendationsResult> {
  const { deckCards, colorIdentity, commanderName, rawText } = input;
  const { formatDisplay, addCutSyntax, usesCommanderColorIdentity } = resolveRecommendationFormat(input);
  const deckSet = new Set(deckCards.map((c) => norm(c.name)));
  /** Commander / Brawl: ADD checks use deck + commander; CUT checks use deck only (mainboard). */
  const allPresentCards = new Set(deckSet);
  if (usesCommanderColorIdentity && commanderName) {
    allPresentCards.add(norm(commanderName));
  }
  const deckCounts = new Map<string, number>();
  for (const c of deckCards) {
    const n = norm(c.name);
    deckCounts.set(n, (deckCounts.get(n) ?? 0) + (c.count ?? 1));
  }

  // Determine allowed colors: use provided colorIdentity, or dynamically fetch from commander
  let allowedColors: string[] = [];
  if (colorIdentity?.length) {
    allowedColors = colorIdentity.map((c) => c.toUpperCase());
  } else if (usesCommanderColorIdentity && commanderName) {
    // Dynamically fetch commander's color identity from Scryfall cache
    allowedColors = await fetchCommanderColorIdentity(commanderName);
    if (allowedColors.length > 0) {
      console.log(`[validateRecommendations] Fetched color identity for ${commanderName}: ${allowedColors.join(",")}`);
    } else {
      console.warn(`[validateRecommendations] Could not determine color identity for commander: ${commanderName}`);
    }
  }

  const addNames = parseAddNames(rawText, addCutSyntax);
  const cutNames = parseCutNames(rawText);
  const issues: ValidationIssue[] = [];
  const blocks = findUpgradeBlocks(rawText, addCutSyntax);
  const blocksToRemove = new Set<number>();

  // 1) ADD already in deck (or commander)
  const alreadyInDeckCards: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (allPresentCards.has(norm(b.addCard))) {
      alreadyInDeckCards.push(b.addCard);
      issues.push({ kind: "add_already_in_deck", card: b.addCard, message: `ADD ${b.addCard} is already in the deck` });
      blocksToRemove.add(i);
    }
  }
  if (alreadyInDeckCards.length > 0) {
    console.warn("[validateRecommendations] Stripped ADD-already-in-deck blocks:", alreadyInDeckCards);
  }

  // 2) CUT not in deck
  for (let i = 0; i < blocks.length; i++) {
    if (blocksToRemove.has(i)) continue;
    const b = blocks[i];
    if (b.cutCard && !deckSet.has(norm(b.cutCard))) {
      issues.push({ kind: "cut_not_in_deck", card: b.cutCard, message: `CUT ${b.cutCard} is not in the deck` });
      blocksToRemove.add(i);
    }
  }

  // 3) Invented cards (ADD not in Scryfall cache)
  let cardMap: Map<string, { color_identity?: string[]; legalities?: Record<string, string> }> = new Map();
  if (addNames.length > 0) {
    if (input.testCardDetailsMap) {
      cardMap = input.testCardDetailsMap;
    } else {
      const { getDetailsForNamesCached } = await import("@/lib/server/scryfallCache");
      cardMap = await getDetailsForNamesCached(addNames);
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    if (blocksToRemove.has(i)) continue;
    const b = blocks[i];
    const key = cacheNorm(b.addCard);
    const altKey = norm(b.addCard);
    const found =
      cardMap.has(key) ||
      Array.from(cardMap.keys()).some((k) => cacheNorm(k) === key || norm(k) === altKey);
    if (!found) {
      issues.push({
        kind: "invented_card",
        card: b.addCard,
        message: `ADD ${b.addCard} not found (invalid or invented)`,
      });
      blocksToRemove.add(i);
    }
  }

  // 3b) Format legality + ban overlay (shared recommendation-legality)
  let banNormSet: Set<string> | null = null;
  try {
    const { evaluateCardRecommendationLegality } = await import("@/lib/deck/recommendation-legality");
    if (input.testLegalityBanNormSet !== undefined) {
      banNormSet =
        input.testLegalityBanNormSet && input.testLegalityBanNormSet.size > 0
          ? input.testLegalityBanNormSet
          : null;
    } else {
      const { getBannedCards, bannedDataToMaps } = await import("@/lib/data/get-banned-cards");
      const { userFormatToBannedDataKey } = await import("@/lib/deck/mtgValidators");
      const { normalizeScryfallCacheName } = await import("@/lib/server/scryfallCacheRow");
      const maps = bannedDataToMaps(await getBannedCards());
      const bk = userFormatToBannedDataKey(formatDisplay);
      const bannedMap = bk ? maps[bk] : undefined;
      banNormSet = new Set<string>();
      if (bannedMap) {
        for (const n of Object.keys(bannedMap)) {
          banNormSet.add(normalizeScryfallCacheName(n));
        }
      }
      if (banNormSet.size === 0) banNormSet = null;
    }

    for (let i = 0; i < blocks.length; i++) {
      if (blocksToRemove.has(i)) continue;
      const b = blocks[i];
      const key = cacheNorm(b.addCard);
      const entry =
        cardMap.get(key) ??
        Array.from(cardMap.entries()).find(([k]) => cacheNorm(k) === key)?.[1];
      const { allowed, reason } = evaluateCardRecommendationLegality(
        entry as { legalities?: Record<string, string> | null } | undefined,
        key,
        formatDisplay,
        banNormSet
      );
      if (!allowed) {
        issues.push({
          kind: "illegal_format",
          card: b.addCard,
          message: `ADD ${b.addCard} is not legal in ${formatDisplay} (${reason ?? "unknown"})`,
        });
        blocksToRemove.add(i);
      }
    }
  } catch (legErr) {
    console.warn("[validateRecommendations] Legality overlay failed:", legErr);
  }

  // 4) Commander / Brawl: ADD off-color or unknown identity (do not assume colorless when cache has no color_identity)
  if (usesCommanderColorIdentity && allowedColors.length > 0) {
    for (let i = 0; i < blocks.length; i++) {
      if (blocksToRemove.has(i)) continue;
      const b = blocks[i];
      const key = cacheNorm(b.addCard);
      const entry = cardMap.get(key) ?? Array.from(cardMap.entries()).find(([k]) => cacheNorm(k) === key)?.[1];
      if (entry) {
        if (entry.color_identity?.length) {
          const ok = isWithinColorIdentity(
            { color_identity: entry.color_identity } as any,
            allowedColors
          );
          if (!ok) {
            issues.push({
              kind: "off_color",
              card: b.addCard,
              message: `ADD ${b.addCard} is off-color for this deck's identity`,
            });
            blocksToRemove.add(i);
          }
        } else {
          issues.push({
            kind: "off_color",
            card: b.addCard,
            message: `ADD ${b.addCard} has no color_identity in cache; removing for identity-checked format`,
          });
          blocksToRemove.add(i);
        }
      }
    }
  }

  // 5) 60-card-style formats: over copy limit (ADD would exceed 4 copies) — we don't have full deck counts per card from suggestion; skip or warn only. We could remove if we know current count + 1 > 4. For now we only remove blocks that suggest >4 in the ADD line (e.g. ADD +4 X when X already has 4).
  if (addCutSyntax === "sixty") {
    const addPlusRe = /ADD\s*\+(\d+)\s*\[\[([^\]]+)\]\]/i;
    for (let i = 0; i < blocks.length; i++) {
      if (blocksToRemove.has(i)) continue;
      const line = rawText.split("\n")[blocks[i].start];
      const m = line?.match(addPlusRe);
      if (m) {
        const copies = parseInt(m[1], 10);
        const name = (m[2] || "").trim();
        const inDeck = deckCounts.get(norm(name)) ?? 0;
        if (inDeck + copies > MAX_COPIES_60) {
          issues.push({ kind: "over_copy_limit", card: name, message: `ADD ${name} would exceed ${MAX_COPIES_60} copies` });
          blocksToRemove.add(i);
        }
      }
    }
  }

  // 6) Strictly worse substitutions
  for (let i = 0; i < blocks.length; i++) {
    if (blocksToRemove.has(i)) continue;
    const b = blocks[i];
    if (!b.cutCard) continue;
    const addNorm = norm(b.addCard);
    const cutNorm = norm(b.cutCard);
    const isWorse = STRICTLY_WORSE.some((w) => w.addNorm === addNorm && w.cutNorm === cutNorm);
    if (isWorse) {
      issues.push({
        kind: "strictly_worse",
        pair: `${b.addCard} / ${b.cutCard}`,
        message: `ADD ${b.addCard} is strictly worse than CUT ${b.cutCard}`,
      });
      blocksToRemove.add(i);
    }
  }

  // Build repaired text by dropping removed blocks
  const lines = rawText.split("\n");
  const dropLines = new Set<number>();
  for (let i = 0; i < blocks.length; i++) {
    if (blocksToRemove.has(i)) {
      for (let j = blocks[i].start; j < blocks[i].end; j++) dropLines.add(j);
    }
  }
  const repairedLines = lines.filter((_, idx) => !dropLines.has(idx));
  const repairedText = repairedLines.join("\n");
  const upgradeBlocksRemaining = blocks.length - blocksToRemove.size;
  const needsRegeneration =
    !input.isRegenPass &&
    upgradeBlocksRemaining < MIN_UPGRADES_FOR_REGENERATION &&
    blocks.length > 0;

  return {
    valid: issues.length === 0,
    repairedText,
    issues,
    upgradeBlocksRemaining,
    needsRegeneration,
  };
}

