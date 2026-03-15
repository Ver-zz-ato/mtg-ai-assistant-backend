/**
 * V3 Behavioral reasoning — deterministic rubric (no judge model).
 * Scores 0–5 per dimension; pass/warn/fail thresholds.
 */

import type { V3ScoreDimensions, V3ResultStatus } from "./types";

const PASS_THRESHOLD = 4;
const WARN_THRESHOLD = 3;

export type V3ScenarioDef = {
  userMessage: string;
  deckContext?: string;
  expectedTraits?: string[];
  forbiddenTraits?: string[];
};

const MIN_SUBSTANTIVE_LENGTH = 15;

export function scoreV3Response(
  outputText: string,
  scenario: V3ScenarioDef
): { score: V3ScoreDimensions; status: V3ResultStatus; hardFailures: Array<{ kind: string; message: string }>; softFailures: Array<{ kind: string; message: string }> } {
  const trimmed = (outputText ?? "").trim();
  const lower = trimmed.toLowerCase();
  const hardFailures: Array<{ kind: string; message: string }> = [];
  const softFailures: Array<{ kind: string; message: string }> = [];

  if (trimmed.length < MIN_SUBSTANTIVE_LENGTH) {
    hardFailures.push({ kind: "empty_response", message: "Model returned no substantive response." });
    return {
      score: { overall_score: 0 },
      status: "HARD_FAIL",
      hardFailures,
      softFailures,
    };
  }

  const nonAnswerPatterns = [
    "temporarily unavailable",
    "okay — noted",
    "how can i help you improve or analyze",
    "ask me mtg stuff",
  ];
  if (nonAnswerPatterns.some((p) => lower.includes(p))) {
    hardFailures.push({ kind: "non_answer", message: "Model returned a non-answer (fallback, redirect, or deck-ack only)." });
    return {
      score: { overall_score: 0 },
      status: "HARD_FAIL",
      hardFailures,
      softFailures,
    };
  }

  let rules = 5;
  let deck = 5;
  let cardRef = 5;
  let synergy = 5;
  let hallucination = 5;
  let obedience = 5;

  if (scenario.expectedTraits?.length) {
    for (const t of scenario.expectedTraits) {
      if (!lower.includes(t.toLowerCase())) {
        hardFailures.push({ kind: "missing_expected_trait", message: `Expected output to mention "${t}"` });
        rules = Math.min(rules, 2);
        obedience = Math.min(obedience, 2);
      }
    }
  }
  if (scenario.forbiddenTraits?.length) {
    for (const t of scenario.forbiddenTraits) {
      if (lower.includes(t.toLowerCase())) {
        hardFailures.push({ kind: "forbidden_trait", message: `Output must not contain "${t}"` });
        hallucination = Math.min(hallucination, 1);
      }
    }
  }

  if (scenario.deckContext && (scenario.deckContext === "multani_mono_green" || scenario.deckContext.includes("deck"))) {
    if (trimmed.length < 50) {
      softFailures.push({ kind: "too_short", message: "Deck-specific answer should be substantive" });
      deck = Math.min(deck, 3);
    }
  }

  const overall = Math.round((rules + deck + cardRef + synergy + hallucination + obedience) / 6);
  const score: V3ScoreDimensions = {
    rules_correctness: rules,
    deck_specificity: deck,
    card_reference_accuracy: cardRef,
    synergy_reasoning: synergy,
    hallucination_avoidance: hallucination,
    prompt_obedience: obedience,
    overall_score: overall,
  };
  const status: V3ResultStatus =
    hardFailures.length > 0 ? "HARD_FAIL" : overall >= PASS_THRESHOLD ? "PASS" : overall >= WARN_THRESHOLD ? "WARN" : "FAIL";
  return { score, status, hardFailures, softFailures };
}
