/**
 * Deterministic hand tags for mulligan evaluation.
 * Grounded in handFacts + hand names + profile. No guessing.
 */

import type { HandFacts } from "./deck-profile";
import type { DeckProfile } from "./deck-profile";

// Minimal lists for tag computation (must match deck-profile semantics)
const ONE_DROPS = [
  "llanowar elves", "elvish mystic", "fyndhorn elves", "birds of paradise",
  "arbor elf", "avacyn's pilgrim", "noble hierarch", "sol ring", "lotus petal",
  "chrome mox", "mox opal", "mox diamond", "mana crypt", "mox amber", "jeweled lotus",
];
const TURN2_ENGINES = [
  "rhystic study", "mystic remora", "esper sentinel", "sylvan library",
  "dark confidant", "kami of the crescent moon",
];
const PROTECTION_SILENCE = [
  "teferi's protection", "veil of summer", "heroic intervention", "grand abolisher",
  "silence", "orim's chant", "deflecting swat", "fierce guardianship",
];

function nameMatches(name: string, list: string[]): boolean {
  const n = name.toLowerCase().trim();
  return list.some((k) => n.includes(k) || n === k);
}

export type HandTags = {
  hasTurn1Play: boolean;
  hasTurn2Engine: boolean;
  hasProtectionOrSilenceEffect: boolean;
  hasTutorButNoPlan: boolean;
  isColorScrewed: boolean;
  isFloodRisk: boolean;
  isStallRisk: boolean;
};

/** Infer required colors: 2+ if deck is 3c+, else 1. Unknown => don't over-penalize. */
function inferRequiredColors(profile: DeckProfile, commanderName?: string | null): number | null {
  // If we have commander color identity from a known source, use it
  if (commanderName) {
    const slug = commanderName.toLowerCase().replace(/[^a-z0-9]/g, "");
    // Common 3+ color commanders
    if (["kinnan", "tymna", "thrasios", "kenrith", "jodah", "sliver", "ur-dragon", "omnath"].some((s) => slug.includes(s))) {
      return 3;
    }
    if (["tatyova", "grandarbiter", "teferi", "derevi", "korvold", "chulane"].some((s) => slug.includes(s))) {
      return 2;
    }
  }
  // Approximate from land percent and deck size: 3c+ decks typically have 35%+ multicolor
  if (profile.landPercent >= 38 && profile.totalCards >= 95) return 2;
  return 1;
}

export function computeHandTags(
  hand: string[],
  handFacts: HandFacts,
  profile: DeckProfile,
  commanderName?: string | null
): HandTags {
  const { handLandCount, hasFastMana, hasRamp, hasTutor, hasDrawEngine } = handFacts;
  const hasAccel = hasFastMana || hasRamp;

  const hasOneDrop = hand.some((c) => nameMatches(c, ONE_DROPS));
  const hasTurn1Play = handLandCount >= 1 && (hasFastMana || (hasRamp && hasOneDrop));
  const hasTurn2Engine = handFacts.hasDrawEngine && hand.some((c) => nameMatches(c, TURN2_ENGINES));
  const hasProtectionOrSilenceEffect =
    handFacts.hasProtection || hand.some((c) => nameMatches(c, PROTECTION_SILENCE));
  const hasTutorButNoPlan = hasTutor && !hasAccel && !hasDrawEngine;
  const requiredColors = inferRequiredColors(profile, commanderName);
  const isColorScrewed =
    handLandCount >= 2 &&
    requiredColors != null &&
    handFacts.colorsAvailable.length < requiredColors;
  const isFloodRisk = handLandCount >= 5;
  const isStallRisk = handLandCount <= 2 && !hasAccel;

  return {
    hasTurn1Play,
    hasTurn2Engine,
    hasProtectionOrSilenceEffect,
    hasTutorButNoPlan,
    isColorScrewed,
    isFloodRisk,
    isStallRisk,
  };
}
