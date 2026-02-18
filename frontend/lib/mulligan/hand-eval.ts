/**
 * Deterministic hand evaluation for mulligan gating.
 * Produces score, keepBias, confidence, reasons, warnings, uncertaintyReasons.
 * Only skip LLM when confidence >= 85, keepBias != NEUTRAL, and uncertaintyReasons empty.
 */

import type { DeckProfile } from "./deck-profile";
import type { HandFacts } from "./deck-profile";
import { computeHandTags, type HandTags } from "./hand-tags";

export type DeterministicEval = {
  score: number; // -10..+10
  keepBias: "KEEP" | "MULLIGAN" | "NEUTRAL";
  confidence: number; // 0..100
  reasons: string[]; // 2..5 grounded reasons
  warnings: string[]; // 0..3
  uncertaintyReasons: string[]; // 0..5
};

export function evaluateHandDeterministically(args: {
  profile: DeckProfile;
  handFacts: HandFacts;
  hand: string[];
  playDraw: "play" | "draw";
  mulliganCount: number;
  commanderName?: string | null;
}): DeterministicEval {
  const { profile, handFacts, mulliganCount, commanderName } = args;
  const { handLandCount, hasFastMana, hasRamp, hasDrawEngine, hasInteraction, hasProtection } =
    handFacts;
  const hasAccel = hasFastMana || hasRamp;

  const handTags = computeHandTags(args.hand, handFacts, profile, commanderName);

  const reasons: string[] = [];
  const warnings: string[] = [];
  const uncertaintyReasons: string[] = [];
  let score = 0;

  // --- Land count ---
  if (handLandCount === 0) {
    score -= 10;
    reasons.push("0 lands; cannot cast spells.");
  } else if (handLandCount === 1) {
    if (mulliganCount >= 3) {
      score -= 3;
      reasons.push("1 land with mulligan fatigue; marginal.");
    } else {
      score -= 6;
      reasons.push("1 land; high risk of mana screw.");
    }
  } else if (handLandCount === 2) {
    if (profile.mulliganStyle === "aggressive") {
      score -= 4;
      reasons.push("2 lands; aggressive deck wants more acceleration.");
    } else if (profile.mulliganStyle === "conservative") {
      score += 0;
      reasons.push("2 lands; conservative deck can sometimes keep.");
    } else {
      score -= 2;
      reasons.push("2 lands; below ideal for balanced deck.");
    }
  } else if (handLandCount === 3) {
    score += 2;
    reasons.push("3 lands; stable mana base.");
  } else if (handLandCount >= 4) {
    score += 1;
    reasons.push(`${handLandCount} lands; adequate but flood risk.`);
  }

  // --- Acceleration ---
  if (hasFastMana) {
    score += 2;
    reasons.push("Has fast mana; enables explosive start.");
  }
  if (hasRamp) {
    score += 2;
    reasons.push("Has ramp; accelerates mana development.");
  }

  // --- Engine/draw ---
  if (hasDrawEngine) {
    score += 2;
    reasons.push("Has draw engine; improves consistency.");
  }

  // --- Interaction/protection ---
  if (hasInteraction) {
    score += 1;
    reasons.push("Has interaction; can answer threats.");
  }
  if (hasProtection) {
    score += 1;
    reasons.push("Has protection; shields key plays.");
  }

  // --- Commander plan ---
  const earlyEngineStrong =
    profile.mulliganStyle === "aggressive" || profile.velocityScore >= 7;
  if (profile.commanderPlan === "early_engine") {
    if (handLandCount >= 3 && hasAccel) {
      score += 1;
      reasons.push("Stable mana + accel; enables early commander.");
    } else if (earlyEngineStrong && !hasAccel) {
      score -= 2;
      reasons.push("Early-engine deck; hand lacks acceleration.");
    }
  }

  // --- Mulligan fatigue ---
  if (mulliganCount >= 3 && handLandCount >= 2) {
    score += 1;
    reasons.push("Mulligan fatigue; prefer keeping playable hand.");
  }

  // --- Hand tag adjustments ---
  if (handTags.hasTurn1Play) score += 1;
  if (handTags.hasTurn2Engine) score += 1;
  if (handTags.isFloodRisk) {
    score -= 1;
    warnings.push("5+ lands; flood risk.");
  }
  if (handTags.isStallRisk) {
    score -= 2;
    reasons.push("2 or fewer lands with no acceleration; stall risk.");
  }
  if (handTags.isColorScrewed) {
    score -= 3;
    reasons.push("Color screw; lands don't support deck colors.");
  }

  // Clamp score
  score = Math.max(-10, Math.min(10, score));

  // --- KeepBias ---
  let keepBias: DeterministicEval["keepBias"] = "NEUTRAL";
  if (score >= 2) keepBias = "KEEP";
  else if (score <= -2) keepBias = "MULLIGAN";

  // --- Uncertainty reasons (lower confidence, force AI) ---
  if (profile.archetype === "unknown") {
    uncertaintyReasons.push("Deck archetype unknown; intent unclear.");
  }
  if (profile.commanderPlan === "unknown" && commanderName) {
    uncertaintyReasons.push("Commander plan unknown; keep/mull depends on deck intent.");
  }
  if (profile.landDetectionIncomplete) {
    uncertaintyReasons.push("Land detection incomplete; some cards missing type_line.");
  }
  if (handTags.hasTutorButNoPlan) {
    uncertaintyReasons.push("Tutor present but no ramp/engine; line selection needs AI.");
  }
  if (handLandCount === 1 && (hasFastMana || handFacts.hasTutor)) {
    uncertaintyReasons.push("1 land with fast mana or tutor; depends on deck velocity and pod.");
  }
  if (handTags.isColorScrewed && handFacts.colorsAvailable.length >= 1) {
    uncertaintyReasons.push("Possible color screw; exact requirements uncertain.");
  }

  // --- Confidence ---
  let confidence = 60 + Math.abs(score) * 5;
  confidence = Math.max(55, Math.min(95, confidence));
  if (keepBias === "NEUTRAL") confidence = Math.min(confidence, 80);
  for (const _ of uncertaintyReasons) {
    confidence -= 10;
  }
  if (uncertaintyReasons.length > 0) confidence = Math.min(confidence, 75);
  confidence = Math.max(0, Math.min(100, confidence));

  // Trim reasons to 2-5
  const trimmedReasons = reasons.slice(0, 5);
  if (trimmedReasons.length < 2) {
    trimmedReasons.push("Hand evaluated relative to deck profile.");
  }

  return {
    score,
    keepBias,
    confidence,
    reasons: trimmedReasons,
    warnings: warnings.slice(0, 3),
    uncertaintyReasons: uncertaintyReasons.slice(0, 5),
  };
}
