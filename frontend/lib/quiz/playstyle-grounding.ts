import type { PlaystyleTraits, AvoidItem } from "@/lib/quiz/quiz-data";

export type GroundedPlaystyleProfile = {
  dominantAxis: string;
  secondaryAxis: string;
  variancePreference: string;
  interactionProfile: string;
  gameLengthProfile: string;
  budgetProfile: string;
  archetypeFamily: string;
  antiArchetype: string | null;
  profileSummary: string;
  bullets: string[];
};

function topLabel(traits: PlaystyleTraits): string {
  const pairs: Array<[string, number]> = [
    ["control", traits.control],
    ["aggression", traits.aggression],
    ["combo", traits.comboAppetite],
    ["variance", traits.varianceTolerance],
    ["interaction", traits.interactionPref],
    ["game_length", traits.gameLengthPref],
  ];
  pairs.sort((a, b) => b[1] - a[1]);
  return pairs[0]?.[0] ?? "balanced";
}

function describeBand(value: number, low: string, mid: string, high: string): string {
  if (value >= 65) return high;
  if (value <= 35) return low;
  return mid;
}

export function buildGroundedPlaystyleProfile(input: {
  traits: PlaystyleTraits;
  topArchetypes: { label: string; matchPct: number }[];
  avoidList: AvoidItem[];
  profileLabel?: string;
  formatTitle: string;
}): GroundedPlaystyleProfile {
  const { traits, topArchetypes, avoidList, profileLabel, formatTitle } = input;
  const dominantAxis = topLabel(traits).replace(/_/g, " ");
  const secondaryAxis =
    traits.control >= 55 && traits.interactionPref >= 55
      ? "reactive play"
      : traits.aggression >= 55 && traits.gameLengthPref <= 45
        ? "fast pressure"
        : traits.comboAppetite >= 55
          ? "engine building"
          : "balanced decision making";
  const variancePreference = describeBand(
    traits.varianceTolerance,
    "prefers consistency",
    "accepts some variance",
    "embraces swingy lines",
  );
  const interactionProfile = describeBand(
    traits.interactionPref,
    "likes proactive goldfishing more than constant answers",
    "wants some interaction without being all-reactive",
    "values answering the table and fighting over key turns",
  );
  const gameLengthProfile = describeBand(
    traits.gameLengthPref,
    "prefers faster finishes",
    "likes medium-length games",
    "likes longer, decision-heavy games",
  );
  const budgetProfile = describeBand(
    traits.budgetElasticity,
    "budget-sensitive",
    "budget-aware but flexible",
    "comfortable stretching for stronger pieces",
  );
  const archetypeFamily = topArchetypes.slice(0, 2).map((entry) => entry.label).join(" / ") || `${formatTitle} value`;
  const antiArchetype = avoidList[0]?.label ?? null;
  const profileSummary = `${profileLabel || "This player"} leans ${dominantAxis}, values ${secondaryAxis}, ${variancePreference}, and tends toward ${archetypeFamily}.`;
  const bullets = [
    `Because ${dominantAxis} is a strong pull, decks should reward that lane early.`,
    `Because this profile ${interactionProfile}, the best lists should match that answer density.`,
    `Because this player ${gameLengthProfile}, tempo and curve should reflect that pacing.`,
    antiArchetype ? `Because they likely avoid ${antiArchetype.toLowerCase()}, steer away from that trap.` : "",
    `Because the budget profile is ${budgetProfile}, recommend pieces at the right spend level.`,
  ].filter(Boolean);

  return {
    dominantAxis,
    secondaryAxis,
    variancePreference,
    interactionProfile,
    gameLengthProfile,
    budgetProfile,
    archetypeFamily,
    antiArchetype,
    profileSummary,
    bullets,
  };
}
