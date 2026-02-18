/**
 * Deterministic hand pre-score for mulligan advice.
 * Anchors the LLM to policy; reduces over-aggressive mulligans for balanced decks.
 */

import type { DeckProfile } from "./deck-profile";
import type { HandFacts } from "./deck-profile";

export type HandEval = {
  score: number; // -10..+10
  tags: string[];
  keepBias: "KEEP" | "NEUTRAL" | "MULLIGAN";
};

export function evaluateHandDeterministically(args: {
  profile: DeckProfile;
  handFacts: HandFacts;
  hand: string[];
  playDraw: "play" | "draw";
  mulliganCount: number;
}): HandEval {
  const { profile, handFacts, mulliganCount } = args;
  const { handLandCount, hasFastMana, hasRamp, hasDrawEngine, hasInteraction, hasProtection } =
    handFacts;
  const hasAccel = hasFastMana || hasRamp;
  const tags: string[] = [];
  let score = 0;

  // Land count
  if (handLandCount === 0) {
    score -= 10;
    tags.push("0 lands");
  } else if (handLandCount === 1) {
    if (mulliganCount >= 3) {
      score -= 3;
      tags.push("1 land (mulligan fatigue)");
    } else {
      score -= 6;
      tags.push("1 land");
    }
  } else if (handLandCount === 2) {
    if (profile.mulliganStyle === "aggressive") {
      score -= 4;
      tags.push("2 lands (aggressive deck)");
    } else if (profile.mulliganStyle === "conservative") {
      score += 0;
      tags.push("2 lands (conservative)");
    } else {
      score -= 2;
      tags.push("2 lands");
    }
  } else if (handLandCount === 3) {
    score += 2;
    tags.push("3 lands");
  } else if (handLandCount >= 4) {
    score += 1;
    tags.push(`${handLandCount} lands`);
  }

  // Acceleration
  if (hasFastMana) {
    score += 2;
    tags.push("has fast mana");
  }
  if (hasRamp) {
    score += 2;
    tags.push("has ramp");
  }

  // Engine/draw
  if (hasDrawEngine) {
    score += 2;
    tags.push("has draw engine");
  }

  // Interaction/protection
  if (hasInteraction) {
    score += 1;
    tags.push("has interaction");
  }
  if (hasProtection) {
    score += 1;
    tags.push("has protection");
  }

  // Commander plan adjustment (softer for balanced decks)
  const earlyEngineStrong =
    profile.mulliganStyle === "aggressive" || profile.velocityScore >= 7;
  if (profile.commanderPlan === "early_engine") {
    if (handLandCount >= 3 && hasAccel) {
      score += 1;
      tags.push("early_engine: stable mana + accel (soft KEEP bias)");
    } else if (earlyEngineStrong && !hasAccel) {
      score -= 2;
      tags.push("early_engine aggressive: no accel");
    }
    // else: no penalty for balanced decks
  }

  // Mulligan fatigue
  if (mulliganCount >= 3 && handLandCount >= 2) {
    score += 1;
    tags.push("mulligan fatigue +1");
  }

  // Clamp score
  score = Math.max(-10, Math.min(10, score));

  // Convert to keepBias
  let keepBias: HandEval["keepBias"] = "NEUTRAL";
  if (score >= 2) keepBias = "KEEP";
  else if (score <= -2) keepBias = "MULLIGAN";

  return { score, tags, keepBias };
}
