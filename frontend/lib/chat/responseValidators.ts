/**
 * Response validators: remove in-deck ADDs (hard) and strict-downgrade swaps (soft).
 * Use after validateAddSuggestions (off-color + already-in-deck).
 */

import { normalizeCardName } from "@/lib/deck/mtgValidators";

function norm(name: string): string {
  return normalizeCardName(name);
}

const RE_ADD_COMMANDER = /ADD\s*\[\[([^\]]+)\]\]/gi;
const RE_ADD_60 = /ADD\s*\+\d+\s*\[\[([^\]]+)\]\]/gi;

/**
 * Extract ADD card names from text (normalized for comparison).
 */
export function extractAddCards(text: string, formatKey: string): string[] {
  const re = formatKey === "commander" ? RE_ADD_COMMANDER : RE_ADD_60;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  const regex = new RegExp(re.source, re.flags);
  while ((m = regex.exec(text)) !== null) {
    const name = (m[1] || "").trim();
    if (name && !names.some((n) => norm(n) === norm(name))) names.push(name);
  }
  return names;
}

/**
 * Find upgrade blocks: each block starts with a line matching ADD [[...]] and runs until the next ADD line or next numbered "N." upgrade.
 */
function findUpgradeBlocks(text: string, formatKey: string): Array<{ start: number; end: number; addCard: string }> {
  const lines = text.split("\n");
  const blocks: Array<{ start: number; end: number; addCard: string }> = [];
  const addRe = formatKey === "commander" ? /ADD\s*\[\[([^\]]+)\]\]/i : /ADD\s*\+\d+\s*\[\[([^\]]+)\]\]/i;

  let i = 0;
  while (i < lines.length) {
    const addMatch = lines[i].match(addRe);
    if (addMatch) {
      const addCard = (addMatch[1] || "").trim();
      let end = i + 1;
      while (end < lines.length && !lines[end].match(addRe)) end++;
      blocks.push({ start: i, end, addCard });
      i = end;
    } else {
      i++;
    }
  }
  return blocks;
}

/**
 * Remove upgrade blocks where the ADD card is already in the deck. HARD rule.
 */
export function removeInDeckAdds(
  text: string,
  deckCards: Array<{ name: string }>
): { repairedText: string; removedInDeck: string[] } {
  const deckSet = new Set(deckCards.map((c) => norm(c.name)));
  const formatKey = "commander";
  const lines = text.split("\n");
  const blocks = findUpgradeBlocks(text, formatKey);
  const toRemove = new Set<number>();
  const removedInDeck: string[] = [];

  for (const b of blocks) {
    if (deckSet.has(norm(b.addCard))) {
      for (let i = b.start; i < b.end; i++) toRemove.add(i);
      removedInDeck.push(b.addCard);
    }
  }

  const repairedLines = lines.filter((_, i) => !toRemove.has(i));
  return { repairedText: repairedLines.join("\n"), removedInDeck };
}

/** Known strict downgrades: ADD card is strictly worse than CUT card. (addNorm, cutNorm) = remove block. */
const STRICT_DOWNGRADES: Array<{ addNorm: string; cutNorm: string }> = [
  { addNorm: "murder", cutNorm: "putrefy" },
  { addNorm: "doomblade", cutNorm: "goforthethroat" },
  { addNorm: "terror", cutNorm: "putrefy" },
];

/**
 * Remove upgrade blocks that are strict downgrades (e.g. ADD Murder / CUT Putrefy). SOFT rule.
 */
export async function removeStrictDowngradeSwaps(text: string): Promise<{ repairedText: string; removedDowngrades: string[] }> {
  const formatKey = "commander";
  const lines = text.split("\n");
  const blocks = findUpgradeBlocks(text, formatKey);
  const toRemove = new Set<number>();
  const removedDowngrades: string[] = [];
  const cutRe = /CUT\s*\[\[([^\]]+)\]\]/i;

  for (const b of blocks) {
    let cutCard: string | null = null;
    for (let i = b.start; i < b.end; i++) {
      const m = lines[i].match(cutRe);
      if (m) {
        cutCard = (m[1] || "").trim();
        break;
      }
    }
    if (!cutCard) continue;
    const addNorm = norm(b.addCard);
    const cutNorm = norm(cutCard);
    const isDowngrade = STRICT_DOWNGRADES.some((d) => d.addNorm === addNorm && d.cutNorm === cutNorm);
    if (isDowngrade) {
      for (let i = b.start; i < b.end; i++) toRemove.add(i);
      removedDowngrades.push(`${b.addCard} / ${cutCard}`);
    }
  }

  const repairedLines = lines.filter((_, i) => !toRemove.has(i));
  return { repairedText: repairedLines.join("\n"), removedDowngrades };
}

export type ApplyValidatorsOptions = {
  deckCards: Array<{ name: string }>;
  formatKey: string;
};

export type ApplyValidatorsResult = {
  repairedText: string;
  removedInDeck: string[];
  removedDowngrades: string[];
};

/**
 * Run removeInDeckAdds then removeStrictDowngradeSwaps. Use after validateAddSuggestions.
 */
export async function applyValidators(
  text: string,
  options: ApplyValidatorsOptions
): Promise<ApplyValidatorsResult> {
  const { deckCards, formatKey } = options;
  const { repairedText: afterInDeck, removedInDeck } = removeInDeckAdds(text, deckCards);
  const { repairedText: repairedText, removedDowngrades } = await removeStrictDowngradeSwaps(afterInDeck);
  return { repairedText, removedInDeck, removedDowngrades };
}
