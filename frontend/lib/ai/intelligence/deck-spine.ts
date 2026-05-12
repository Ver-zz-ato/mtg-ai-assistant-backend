import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import {
  detectProtectedRoleCards,
  formatProtectedRoleCardsForPrompt,
  type ProtectedRoleCard,
} from "@/lib/deck/protected-role-cards";
import { normalizeDeckNames, detectCombosSmart, type ComboHit, type ComboMissing } from "@/lib/combos/detect";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";

export type DeckSpine = {
  protectedCards: ProtectedRoleCard[];
  mustKeep: string[];
  important: string[];
  dangerousCuts: Array<{ name: string; reason: string }>;
  combosPresent: ComboHit[];
  combosMissing: ComboMissing[];
};

export async function buildDeckSpine(input: {
  deckText: string;
  commander?: string | null;
  maxProtectedCards?: number;
  maxCombos?: number;
}): Promise<DeckSpine> {
  const maxProtectedCards = input.maxProtectedCards ?? 12;
  const maxCombos = input.maxCombos ?? 4;
  const protectedCards = await detectProtectedRoleCards({
    deckText: input.deckText,
    commander: input.commander,
    limit: maxProtectedCards,
  });

  const names = normalizeDeckNames(input.deckText);
  let combosPresent: ComboHit[] = [];
  let combosMissing: ComboMissing[] = [];
  try {
    const details = await getDetailsForNamesCached(names);
    const detailObj: Record<string, { type_line?: string; oracle_text?: string | null; name?: string }> = {};
    details.forEach((value: any, key: string) => {
      detailObj[key] = {
        type_line: value?.type_line,
        oracle_text: value?.oracle_text,
        name: value?.name || key,
      };
    });
    const comboResult = detectCombosSmart(names, detailObj);
    combosPresent = comboResult.present.slice(0, maxCombos);
    combosMissing = comboResult.missing.slice(0, maxCombos);
  } catch {
    combosPresent = [];
    combosMissing = [];
  }

  const protectedByNorm = new Map(protectedCards.map((card) => [normalizeScryfallCacheName(card.name), card]));
  for (const combo of combosPresent) {
    for (const piece of combo.pieces || []) {
      const key = normalizeScryfallCacheName(piece);
      if (!protectedByNorm.has(key)) {
        protectedByNorm.set(key, {
          name: piece,
          category: "combo",
          reason: `part of detected combo: ${combo.name}`,
          confidence: "high",
        });
      }
    }
  }

  const mergedProtected = Array.from(protectedByNorm.values()).slice(0, maxProtectedCards);
  const mustKeep = mergedProtected
    .filter((card) => card.confidence === "high" || card.category === "commander" || card.category === "combo")
    .map((card) => card.name);
  const important = mergedProtected
    .filter((card) => !mustKeep.some((name) => normalizeScryfallCacheName(name) === normalizeScryfallCacheName(card.name)))
    .map((card) => card.name);
  const dangerousCuts = [
    ...mergedProtected
      .filter((card) => card.category === "combo" || card.category === "commander" || card.category === "engine")
      .map((card) => ({ name: card.name, reason: card.reason })),
    ...combosPresent.flatMap((combo) =>
      (combo.pieces || []).map((piece) => ({ name: piece, reason: `cutting this may break ${combo.name}` }))
    ),
  ].slice(0, maxProtectedCards);

  return {
    protectedCards: mergedProtected,
    mustKeep,
    important,
    dangerousCuts,
    combosPresent,
    combosMissing,
  };
}

export function formatDeckSpineForPrompt(spine: DeckSpine): string {
  const lines = [
    formatProtectedRoleCardsForPrompt(spine.protectedCards),
    spine.combosPresent.length
      ? [
          "COMBOS PRESENT:",
          ...spine.combosPresent.map((combo) => `- ${combo.name}: ${(combo.pieces || []).join(" + ")}${combo.note ? `; ${combo.note}` : ""}`),
        ].join("\n")
      : "",
    spine.combosMissing.length
      ? [
          "NEAR-MISS COMBOS:",
          ...spine.combosMissing.map((combo) => `- ${combo.name}: have ${(combo.have || []).join(" + ") || "some pieces"}; missing ${(combo.missing || []).join(" + ") || combo.suggest}`),
        ].join("\n")
      : "",
    spine.dangerousCuts.length
      ? [
          "DANGEROUS CUT WARNINGS:",
          "- Do not suggest cutting these casually. If the user asks to cut one, explain what breaks and offer a same-role replacement.",
          ...spine.dangerousCuts.slice(0, 10).map((card) => `- ${card.name}: ${card.reason}`),
        ].join("\n")
      : "",
  ].filter(Boolean);
  return lines.join("\n\n");
}
