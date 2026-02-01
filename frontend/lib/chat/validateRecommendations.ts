/**
 * Format-aware runtime validator for MTG deck analysis recommendations.
 * Runs after model output, before returning to user.
 * Validates: ADD not in deck, CUT in deck, no invented cards, color identity (Commander),
 * copy limits (60-card), strictly-worse substitutions. Supports in-place repair.
 */

import { normalizeCardName } from "@/lib/deck/mtgValidators";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";

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
  formatKey: "commander" | "modern" | "pioneer";
  /** Commander color identity (commander only). */
  colorIdentity?: string[] | null;
  commanderName?: string | null;
  /** Raw LLM output text. */
  rawText: string;
  /** When true, never set needsRegeneration (used when validating regen response; max 1 retry). */
  isRegenPass?: boolean;
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

function parseAddNames(text: string, formatKey: string): string[] {
  const names: string[] = [];
  if (formatKey === "commander") {
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
  formatKey: string
): Array<{ start: number; end: number; addCard: string; cutCard: string | null }> {
  const lines = text.split("\n");
  const blocks: Array<{ start: number; end: number; addCard: string; cutCard: string | null }> = [];
  const addReBracket = formatKey === "commander"
    ? /(?:\d+[.)]\s*|[-•]\s*)?ADD\s*\[\[([^\]]+)\]\]/i
    : /(?:\d+[.)]\s*|[-•]\s*)?ADD\s*\+\d+\s*\[\[([^\]]+)\]\]/i;
  const addReBareCommander = /(?:\d+[.)]\s*|[-•]\s*)?ADD\s+([^/\n\[\]]+?)\s*\/\s*CUT\s+([^\n\[\]]+?)(?=,|\s*$|\s*\n)/i;
  const cutRe = /(?:\d+[.)]\s*|[-•]\s*)?CUT\s*\[\[([^\]]+)\]\]/i;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const addMatchBracket = line.match(addReBracket);
    const addMatchBare = formatKey === "commander" ? line.match(addReBareCommander) : null;

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
 * Validate and repair LLM recommendation text. Does not re-run the model.
 */
export async function validateRecommendations(
  input: ValidateRecommendationsInput
): Promise<ValidateRecommendationsResult> {
  const { deckCards, formatKey, colorIdentity, commanderName, rawText } = input;
  const deckSet = new Set(deckCards.map((c) => norm(c.name)));
  /** For Commander: ADD checks use deck + commander; CUT checks use deck only (99). */
  const allPresentCards = new Set(deckSet);
  if (formatKey === "commander" && commanderName) {
    allPresentCards.add(norm(commanderName));
  }
  const deckCounts = new Map<string, number>();
  for (const c of deckCards) {
    const n = norm(c.name);
    deckCounts.set(n, (deckCounts.get(n) ?? 0) + (c.count ?? 1));
  }

  const allowedColors: string[] =
    (colorIdentity?.length ?? 0) > 0
      ? colorIdentity!
      : commanderName
        ? COMMANDER_COLOR_MAP[norm(commanderName).replace(/\s+/g, "")] ?? []
        : [];

  const addNames = parseAddNames(rawText, formatKey);
  const cutNames = parseCutNames(rawText);
  const issues: ValidationIssue[] = [];
  const blocks = findUpgradeBlocks(rawText, formatKey);
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
  let cardMap: Map<string, { color_identity?: string[] }> = new Map();
  if (addNames.length > 0) {
    const { getDetailsForNamesCached } = await import("@/lib/server/scryfallCache");
    cardMap = await getDetailsForNamesCached(addNames);
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

  // 4) Commander: ADD off-color or unknown identity (do not assume colorless when cache has no color_identity)
  if (formatKey === "commander" && allowedColors.length > 0) {
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
            issues.push({ kind: "off_color", card: b.addCard, message: `ADD ${b.addCard} is off-color for commander` });
            blocksToRemove.add(i);
          }
        } else {
          issues.push({
            kind: "off_color",
            card: b.addCard,
            message: `ADD ${b.addCard} has no color_identity in cache; removing for Commander`,
          });
          blocksToRemove.add(i);
        }
      }
    }
  }

  // 5) 60-card: over copy limit (ADD would exceed 4 copies) — we don't have full deck counts per card from suggestion; skip or warn only. We could remove if we know current count + 1 > 4. For now we only remove blocks that suggest >4 in the ADD line (e.g. ADD +4 X when X already has 4).
  if (formatKey !== "commander") {
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

/** Commander name (normalized, no spaces) -> color identity. */
const COMMANDER_COLOR_MAP: Record<string, string[]> = {
  muldrothathegravetide: ["U", "B", "G"],
  merenofclanneltoth: ["B", "G"],
  karadorghostchieftain: ["W", "B", "G"],
  sidisibroodtyrant: ["U", "B", "G"],
  chainerdementiamaster: ["B"],
  tasigurthegoldenfang: ["U", "B", "G"],
  themimeoplasm: ["U", "B", "G"],
  thescarabgod: ["U", "B"],
  jaradgolgarilichlord: ["B", "G"],
};
