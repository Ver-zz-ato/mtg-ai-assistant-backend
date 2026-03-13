/**
 * Test Suite V2 — prompt block assembly for scenario runs.
 * Mirrors stream route / integration test logic for deterministic evaluation.
 */

import { detectRulesLegalityIntent, extractCardNamesFromMessage, getRulesFactBundle } from "@/lib/deck/rules-facts";
import { formatForLLM, formatDeckPlanProfileForLLM, formatRulesFactsForLLM } from "@/lib/deck/intelligence-formatter";
import { buildDeckPlanProfile } from "@/lib/deck/deck-plan-profile";
import type { RulesFactBundle } from "@/lib/deck/rules-facts";
import type { DeckContextSummary } from "@/lib/deck/deck-context-summary";
import type { ActiveDeckContext } from "@/lib/chat/active-deck-context";

export type AssembleInputs = {
  text: string;
  activeDeckContext: ActiveDeckContext;
  v2Summary: DeckContextSummary | null;
  selectedTier: "micro" | "standard" | "full";
  streamThreadHistory: Array<{ role: string; content?: string }>;
  rulesBundleOverride?: RulesFactBundle | null;
};

/** Assemble intelligence blocks; returns full prompt section. */
export async function assembleIntelligenceBlocks(inputs: AssembleInputs): Promise<string> {
  const { text, activeDeckContext, v2Summary, selectedTier, rulesBundleOverride } = inputs;
  let sys = "";

  if (selectedTier !== "micro") {
    if (detectRulesLegalityIntent(text)) {
      const rulesCommander = activeDeckContext.commanderName ?? v2Summary?.commander ?? null;
      const rulesCards = extractCardNamesFromMessage(text);
      if (rulesCommander || rulesCards.length) {
        let bundle: RulesFactBundle;
        if (rulesBundleOverride) {
          bundle = rulesBundleOverride;
        } else {
          try {
            bundle = await getRulesFactBundle(rulesCommander, rulesCards.length ? rulesCards : undefined);
          } catch {
            bundle = (await import("./fixtures")).MOCK_RULES_BUNDLE_MULTANI;
          }
        }
        const rulesProse = formatRulesFactsForLLM(bundle);
        sys += `\n\n=== RULES FACTS (AUTHORITATIVE - DO NOT CONTRADICT) ===\n${rulesProse}\n`;
      }
    }
  }

  if (selectedTier === "full" && v2Summary?.deck_facts && v2Summary?.synergy_diagnostics) {
    const commanderForFacts = activeDeckContext.userJustCorrectedCommander
      ? activeDeckContext.commanderName
      : undefined;
    const deckFactsProse = formatForLLM(
      v2Summary.deck_facts,
      v2Summary.synergy_diagnostics,
      commanderForFacts ?? undefined
    );
    sys += `\n\n=== DECK INTELLIGENCE (AUTHORITATIVE - DO NOT CONTRADICT) ===\n${deckFactsProse}\n`;
    const deckPlanOptions = {
      rampCards: v2Summary.ramp_cards ?? [],
      drawCards: v2Summary.draw_cards ?? [],
      removalCards: v2Summary.removal_cards ?? [],
    };
    const deckPlanProfile = buildDeckPlanProfile(
      v2Summary.deck_facts,
      v2Summary.synergy_diagnostics,
      deckPlanOptions
    );
    const deckPlanProse = formatDeckPlanProfileForLLM(deckPlanProfile);
    sys += `\n${deckPlanProse}\n`;
  }

  return sys;
}

/** Detect which block names are present in assembled prompt. */
export function detectBlockNames(prompt: string): string[] {
  const blocks: string[] = [];
  if (prompt.includes("RULES FACTS")) blocks.push("RULES FACTS");
  if (prompt.includes("DECK INTELLIGENCE")) blocks.push("DECK INTELLIGENCE");
  if (prompt.includes("DECK CONTEXT") || prompt.includes("Commander:") || prompt.includes("- Commander:")) {
    blocks.push("Commander");
  }
  if (prompt.includes("is this correct?") || prompt.includes("I believe your commander is")) {
    blocks.push("ask-confirmation");
  }
  return blocks;
}
