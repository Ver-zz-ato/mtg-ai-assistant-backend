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

/** Precise block taxonomy for V2 validation. */
export const BLOCK_NAMES = {
  RULES_FACTS_BLOCK: "RULES_FACTS_BLOCK",
  DECK_INTELLIGENCE_BLOCK: "DECK_INTELLIGENCE_BLOCK",
  COMMANDER_CONFIRMED_BLOCK: "COMMANDER_CONFIRMED_BLOCK",
  COMMANDER_CONFIRMATION_BLOCK: "COMMANDER_CONFIRMATION_BLOCK",
  COMMANDER_NEED_BLOCK: "COMMANDER_NEED_BLOCK",
  RECENT_CONVERSATION_BLOCK: "RECENT_CONVERSATION_BLOCK",
  THREAD_SUMMARY_BLOCK: "THREAD_SUMMARY_BLOCK",
} as const;

export type BlockDetectionContext = {
  shouldAskCommanderConfirmation?: boolean;
  askReason?: string | null;
  commanderStatus?: string;
  hasDeck?: boolean;
};

/** Detect which block names are present. Uses prompt + context for commander blocks. */
export function detectBlockNames(prompt: string, ctx?: BlockDetectionContext): string[] {
  const blocks: string[] = [];
  if (prompt.includes("=== RULES FACTS (AUTHORITATIVE")) blocks.push(BLOCK_NAMES.RULES_FACTS_BLOCK);
  if (prompt.includes("=== DECK INTELLIGENCE (AUTHORITATIVE")) blocks.push(BLOCK_NAMES.DECK_INTELLIGENCE_BLOCK);
  if (prompt.includes("Recent conversation") || prompt.includes("Recent conversation (last")) {
    blocks.push(BLOCK_NAMES.RECENT_CONVERSATION_BLOCK);
  }
  if (prompt.includes("Thread summary") || /thread\s+summary/i.test(prompt)) {
    blocks.push(BLOCK_NAMES.THREAD_SUMMARY_BLOCK);
  }
  if (ctx?.shouldAskCommanderConfirmation && ctx?.askReason === "confirm_inference") {
    blocks.push(BLOCK_NAMES.COMMANDER_CONFIRMATION_BLOCK);
  }
  if (ctx?.askReason === "need_commander" || (ctx?.askReason === "need_deck" && !ctx?.hasDeck)) {
    blocks.push(BLOCK_NAMES.COMMANDER_NEED_BLOCK);
  }
  if (prompt.includes("DECK CONTEXT (YOU ALREADY KNOW THIS") || /DECK CONTEXT.*DO NOT ASK/i.test(prompt)) {
    blocks.push(BLOCK_NAMES.COMMANDER_CONFIRMED_BLOCK);
  }
  if (
    prompt.includes("=== DECK INTELLIGENCE") &&
    (prompt.includes("- Commander:") || /Commander:\s*\S+/.test(prompt)) &&
    (ctx?.commanderStatus === "confirmed" || ctx?.commanderStatus === "corrected" || ctx?.commanderStatus === "inferred")
  ) {
    if (!blocks.includes(BLOCK_NAMES.COMMANDER_CONFIRMED_BLOCK) && !blocks.includes(BLOCK_NAMES.COMMANDER_CONFIRMATION_BLOCK)) {
      blocks.push(BLOCK_NAMES.COMMANDER_CONFIRMED_BLOCK);
    }
  }
  return blocks;
}
