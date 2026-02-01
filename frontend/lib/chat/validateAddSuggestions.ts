/**
 * Runtime validation of ADD suggestions in AI output.
 * Strips or repairs invalid ADDs: off-color (Commander identity), already-in-deck.
 */

import { normalizeCardName } from "@/lib/deck/mtgValidators";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";

function norm(name: string): string {
  return normalizeCardName(name);
}

/** Commander name (normalized) -> allowed color identity for validation when deck context has no colorIdentity. */
const COMMANDER_COLOR_MAP: Record<string, string[]> = {
  "muldrothathegravetide": ["U", "B", "G"],
  "merenofclanneltoth": ["B", "G"],
  "karadorghostchieftain": ["W", "B", "G"],
  "sidisibroodtyrant": ["U", "B", "G"],
  "chainerdementiamaster": ["B"],
  "tasigurthegoldenfang": ["U", "B", "G"],
  "themimeoplasm": ["U", "B", "G"],
  "thescarabgod": ["U", "B"],
  "jaradgolgarilichlord": ["B", "G"],
};

export type ValidateAddOptions = {
  deckCards: Array<{ name: string }>;
  colorIdentity: string[] | null;
  commanderName?: string | null;
  formatKey: string;
};

export type ValidateAddResult = {
  valid: boolean;
  invalidAdds: string[];
  repairedText: string;
};

/** Commander: ADD [[X]] or ADD [[X]] / CUT [[Y]]. 60-card: ADD +N [[X]]. */
const RE_ADD_COMMANDER = /ADD\s*\[\[([^\]]+)\]\]/gi;
const RE_ADD_60 = /ADD\s*\+\d+\s*\[\[([^\]]+)\]\]/gi;

/**
 * Parse all ADD card names from text (Commander and 60-card patterns).
 */
export function parseAddCardNames(text: string, formatKey: string): string[] {
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
 * Validate ADD suggestions and return repaired text (invalid ADD lines removed).
 * Uses scryfall cache for color_identity when needed.
 */
export async function validateAddSuggestions(
  fullText: string,
  options: ValidateAddOptions
): Promise<ValidateAddResult> {
  const { deckCards, colorIdentity, commanderName, formatKey } = options;
  const deckSet = new Set(deckCards.map((c) => norm(c.name)));
  const allowedColors: string[] =
    (colorIdentity?.length ?? 0) > 0
      ? colorIdentity!
      : commanderName
        ? COMMANDER_COLOR_MAP[norm(commanderName).replace(/\s+/g, "")] ?? []
        : [];

  const addNames = parseAddCardNames(fullText, formatKey);
  if (addNames.length === 0)
    return { valid: true, invalidAdds: [], repairedText: fullText };

  const { getDetailsForNamesCached } = await import("@/lib/server/scryfallCache");
  const cardMap = await getDetailsForNamesCached(addNames);
  const invalidAdds: string[] = [];

  function findCard(name: string): { color_identity?: string[] } | undefined {
    const n = norm(name);
    const entry = cardMap.get(name) ?? cardMap.get(n);
    if (entry) return entry;
    for (const [k, v] of cardMap) {
      if (norm(k).replace(/\s+/g, "") === n) return v;
    }
    return undefined;
  }

  for (const name of addNames) {
    const n = norm(name);
    if (deckSet.has(n)) {
      invalidAdds.push(name);
      continue;
    }
    if (formatKey === "commander" && allowedColors.length > 0) {
      const card = findCard(name);
      if (card?.color_identity?.length) {
        const ok = isWithinColorIdentity(
          { color_identity: card.color_identity } as any,
          allowedColors
        );
        if (!ok) invalidAdds.push(name);
      }
    }
  }

  if (invalidAdds.length === 0)
    return { valid: true, invalidAdds: [], repairedText: fullText };

  const invalidSet = new Set(invalidAdds.map((a) => norm(a)));
  const lines = fullText.split("\n");
  const repairedLines: string[] = [];
  for (const line of lines) {
    const commanderMatch = line.match(/ADD\s*\[\[([^\]]+)\]\]/i);
    const sixtyMatch = line.match(/ADD\s*\+\d+\s*\[\[([^\]]+)\]\]/i);
    const match = formatKey === "commander" ? commanderMatch : sixtyMatch ?? commanderMatch;
    if (match) {
      const cardName = (match[1] || "").trim();
      if (invalidSet.has(norm(cardName))) continue;
    }
    repairedLines.push(line);
  }
  const repairedText = repairedLines.join("\n");
  return { valid: false, invalidAdds, repairedText };
}
