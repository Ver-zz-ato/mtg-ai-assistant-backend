/**
 * AI Test V3 — shared types for model-backed (V3/V4) and regression (V5) runs.
 */

export type V3ResultStatus = "PASS" | "WARN" | "FAIL" | "HARD_FAIL";

export type V3ScoreDimensions = {
  rules_correctness?: number;
  deck_specificity?: number;
  card_reference_accuracy?: number;
  synergy_reasoning?: number;
  hallucination_avoidance?: number;
  prompt_obedience?: number;
  overall_score?: number;
};

export type V4ScoreDimensions = {
  hallucination_resistance?: number;
  contradiction_resistance?: number;
  uncertainty_honesty?: number;
  rules_grounding?: number;
  deck_context_discipline?: number;
  overall_score?: number;
};

export type V3RunResult = {
  scenarioId: string;
  scenarioKey: string;
  status: V3ResultStatus;
  score: V3ScoreDimensions;
  hardFailures: Array<{ kind: string; message: string }>;
  softFailures: Array<{ kind: string; message: string }>;
  promptExcerpt?: string;
  outputText?: string;
  debug?: Record<string, unknown>;
};

export type V4RunResult = {
  scenarioId: string;
  scenarioKey: string;
  status: V3ResultStatus;
  score: V4ScoreDimensions;
  hardFailures: Array<{ kind: string; message: string }>;
  softFailures: Array<{ kind: string; message: string }>;
  promptExcerpt?: string;
  outputText?: string;
  debug?: Record<string, unknown>;
};
