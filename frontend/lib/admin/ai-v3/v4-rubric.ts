/**
 * V4 Adversarial hallucination — deterministic rubric (no judge model).
 */

import type { V4ScoreDimensions, V3ResultStatus } from "./types";

const PASS_THRESHOLD = 4;
const WARN_THRESHOLD = 3;

export type V4ScenarioDef = {
  userMessage: string;
  deckContext?: string;
  expectedTraits?: string[];
  forbiddenTraits?: string[];
};

export function scoreV4Response(
  outputText: string,
  scenario: V4ScenarioDef
): { score: V4ScoreDimensions; status: V3ResultStatus; hardFailures: Array<{ kind: string; message: string }>; softFailures: Array<{ kind: string; message: string }> } {
  const lower = outputText.toLowerCase();
  const hardFailures: Array<{ kind: string; message: string }> = [];
  const softFailures: Array<{ kind: string; message: string }> = [];
  let hallucinationResist = 5;
  let contradictionResist = 5;
  let uncertaintyHonesty = 5;
  let rulesGrounding = 5;
  let deckDiscipline = 5;

  if (scenario.expectedTraits?.length) {
    for (const t of scenario.expectedTraits) {
      if (!lower.includes(t.toLowerCase())) {
        hardFailures.push({ kind: "missing_expected", message: `Expected "${t}"` });
        uncertaintyHonesty = Math.min(uncertaintyHonesty, 2);
      }
    }
  }
  if (scenario.forbiddenTraits?.length) {
    for (const t of scenario.forbiddenTraits) {
      if (lower.includes(t.toLowerCase())) {
        hardFailures.push({ kind: "forbidden_present", message: `Must not say "${t}"` });
        hallucinationResist = Math.min(hallucinationResist, 1);
      }
    }
  }

  const overall = Math.round((hallucinationResist + contradictionResist + uncertaintyHonesty + rulesGrounding + deckDiscipline) / 5);
  const score: V4ScoreDimensions = {
    hallucination_resistance: hallucinationResist,
    contradiction_resistance: contradictionResist,
    uncertainty_honesty: uncertaintyHonesty,
    rules_grounding: rulesGrounding,
    deck_context_discipline: deckDiscipline,
    overall_score: overall,
  };
  const status: V3ResultStatus =
    hardFailures.length > 0 ? "HARD_FAIL" : overall >= PASS_THRESHOLD ? "PASS" : overall >= WARN_THRESHOLD ? "WARN" : "FAIL";
  return { score, status, hardFailures, softFailures };
}
