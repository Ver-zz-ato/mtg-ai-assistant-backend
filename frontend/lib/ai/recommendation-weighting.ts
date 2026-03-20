/**
 * Recommendation weighting / steering derived from deck semantic fingerprint.
 * Deterministic, no LLM. Influences suggestion priority via compact prompt block.
 * Fail-open: if profile generation fails, no steering applied.
 *
 * Kill-switch: DISABLE_DECK_RECOMMENDATION_WEIGHTING=1
 */

import type { DeckSemanticFingerprint } from "./deck-semantic-fingerprint";

const MEANINGFUL = 0.15;
const STRONG = 0.2;
const HIGH = 0.25;

export type RecommendationWeightProfile = {
  version: number;
  boosts: string[];
  suppressions: string[];
  avoidDefaultPackages: string[];
  archetypeHints: string[];
  reasoningNotes: string[];
};

function addUnique(arr: string[], item: string) {
  if (item && !arr.includes(item)) arr.push(item);
}

/**
 * Derive recommendation weight profile from fingerprint. Deterministic, no model call.
 */
export function deriveRecommendationWeightProfile(
  fp: DeckSemanticFingerprint | null | undefined
): RecommendationWeightProfile | null {
  if (!fp || fp.cardCountAnalyzed === 0) return null;

  const s = fp.signals;
  const boosts: string[] = [];
  const suppressions: string[] = [];
  const avoidDefaultPackages: string[] = [];
  const archetypeHints: string[] = [];
  const reasoningNotes: string[] = [];

  const reactiveShell = s.flash >= MEANINGFUL && s.opponentTurnPlay >= MEANINGFUL;
  const exileShell = s.exileCast >= MEANINGFUL || s.opponentCardsMatter >= MEANINGFUL;
  const goWideStrong = s.tokenGoWide >= STRONG && (s.overrunFinisher >= MEANINGFUL || s.overrunFinisher >= 0.08);
  const goWideModest = s.tokenGoWide >= MEANINGFUL && s.tokenGoWide < STRONG;
  const overrunWeak = s.overrunFinisher < MEANINGFUL;
  const sacrificeStrong = s.sacrifice >= STRONG;
  const sacrificeWeak = s.sacrifice < MEANINGFUL;
  const recursionStrong = s.graveyardRecursion >= STRONG;
  const tribalElfStrong = s.tribalElf >= STRONG;
  const tribalFaerieMeaningful = s.tribalFaerie >= MEANINGFUL;
  const interactionStrong = s.instantSpeedInteraction >= STRONG;

  const reactiveScore = s.flash + s.opponentTurnPlay + s.exileCast + s.opponentCardsMatter;
  const goWideScore = s.tokenGoWide + s.overrunFinisher;

  // A) REACTIVE FLASH SHELL
  if (reactiveShell) {
    addUnique(boosts, "reactive-flash");
    addUnique(boosts, "instant-speed-value");
    addUnique(boosts, "hold-up-interaction");
    addUnique(archetypeHints, "flash/instant-speed tempo");
    addUnique(reasoningNotes, "flash + opponent-turn signals present");
  }

  // B) OPPONENT-CARD / EXILE-CAST SHELL
  if (exileShell) {
    addUnique(boosts, "exile-cast-synergy");
    addUnique(boosts, "opponent-resource-leverage");
    addUnique(boosts, "value-control");
    addUnique(archetypeHints, "exile-matters / theft-value");
    addUnique(reasoningNotes, "exileCast or opponentCardsMatter meaningful");
  }

  // C) GO-WIDE / OVERRUN
  if (goWideStrong) {
    addUnique(boosts, "go-wide-overrun");
    addUnique(boosts, "board-scaling-payoffs");
    addUnique(archetypeHints, "token go-wide + overrun finisher");
  } else if (goWideModest && overrunWeak) {
    addUnique(suppressions, "generic-craterhoof-overrun-package");
    addUnique(reasoningNotes, "tokenGoWide modest, overrunFinisher weak — avoid default overrun package");
  }

  // D) ARISTOCRATS
  if (sacrificeStrong) {
    addUnique(boosts, "aristocrats-sac-payoffs");
    addUnique(archetypeHints, "sacrifice/aristocrats");
  } else if (sacrificeWeak) {
    addUnique(suppressions, "aristocrats-default");
    addUnique(reasoningNotes, "sacrifice weak — do not default to aristocrats package");
  }

  // E) GRAVEYARD
  if (recursionStrong) {
    addUnique(boosts, "recursion-value");
    addUnique(boosts, "graveyard-synergy");
    addUnique(archetypeHints, "graveyard recursion");
  }

  // F) TRIBAL — reactive elf vs elfball
  if (tribalElfStrong && reactiveScore > goWideScore) {
    addUnique(avoidDefaultPackages, "elfball-default");
    addUnique(archetypeHints, "reactive elf shell");
    addUnique(reasoningNotes, "elf tribal but reactive signals exceed go-wide — prefer reactive tribal");
  } else if (tribalElfStrong && goWideStrong) {
    addUnique(boosts, "tribal-go-wide");
    addUnique(archetypeHints, "elf go-wide");
  }
  if (tribalFaerieMeaningful && s.flash >= MEANINGFUL) {
    addUnique(boosts, "tempo-flash");
    addUnique(boosts, "reactive-tribal");
  }

  // G) INTERACTION
  if (interactionStrong) {
    addUnique(boosts, "stack-tempo-reactive");
    addUnique(suppressions, "slow-clunky-packages");
    addUnique(reasoningNotes, "instantSpeedInteraction strong — prefer hold-up play");
  }

  // Reactive shell: suppress generic go-wide if weak
  if (reactiveShell && goWideScore < reactiveScore * 0.6) {
    addUnique(suppressions, "generic-go-wide-overrun");
  }

  // Exile/theft shell: suppress unrelated tribal payoff packages
  if (exileShell && !goWideStrong) {
    addUnique(suppressions, "generic-tribal-payoff-unrelated-to-plan");
  }

  if (
    boosts.length === 0 &&
    suppressions.length === 0 &&
    avoidDefaultPackages.length === 0 &&
    archetypeHints.length === 0
  ) {
    return null;
  }

  return {
    version: 1,
    boosts,
    suppressions,
    avoidDefaultPackages,
    archetypeHints,
    reasoningNotes,
  };
}

/** Format steering block for prompt injection. Compact, advisory. */
export function formatSteeringBlockForPrompt(profile: RecommendationWeightProfile): string {
  const lines: string[] = ["RECOMMENDATION STEERING (advisory — refine ranking, do not override legality):"];
  if (profile.boosts.length > 0) {
    lines.push(`- prioritize: ${profile.boosts.join(", ")}`);
  }
  if (profile.suppressions.length > 0) {
    lines.push(`- deprioritize: ${profile.suppressions.join(", ")}`);
  }
  if (profile.avoidDefaultPackages.length > 0) {
    lines.push(`- avoid default packages: ${profile.avoidDefaultPackages.join(", ")}`);
  }
  if (profile.archetypeHints.length > 0) {
    lines.push(`- archetype hints: ${profile.archetypeHints.join("; ")}`);
  }
  if (profile.reasoningNotes.length > 0 && profile.reasoningNotes.length <= 2) {
    lines.push(`- note: ${profile.reasoningNotes.join("; ")}`);
  } else if (profile.reasoningNotes.length > 2) {
    lines.push(`- note: ${profile.reasoningNotes.slice(0, 2).join("; ")}`);
  }
  return lines.join("\n");
}
