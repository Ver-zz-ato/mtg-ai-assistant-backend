import type { CollectionOwnershipMode } from "@/lib/build/collectionPlaystylePayload";

export type ConstructedFormat = "Modern" | "Pioneer" | "Standard" | "Pauper";
export type CollectionBuildFormat = "Commander" | ConstructedFormat;
export type ConstructedDirection = "competitive" | "casual" | "budget" | "theme";
export type ConstructedOutputMode = "ideas" | "skeleton" | "full_deck";
export type ConstructedBudget = "budget" | "balanced" | "premium";
export type ConstructedPower = "casual" | "strong" | "competitive";
export type ConstructedColor = "W" | "U" | "B" | "R" | "G";

export type CollectionDeckIdea = {
  id: string;
  title: string;
  format: "modern" | "pioneer" | "standard" | "pauper";
  colors: string[];
  archetype: string;
  direction: string;
  ownedCoreCards: string[];
  missingKeyCards: string[];
  estimatedOwnedPercent: number | null;
  estimatedMissingCost: number | null;
  reason: string;
  warnings: string[];
};

export type CollectionDeckSkeleton = {
  title: string;
  format: "modern" | "pioneer" | "standard" | "pauper";
  colors: string[];
  archetype: string;
  gamePlan: string[];
  coreCards: Array<{ name: string; qty?: number; ownedQty?: number | null; role?: string }>;
  suggestedPackages: Array<{ title: string; cards: string[]; reason: string }>;
  flexSlots: string[];
  sideboardPlan: string[];
  missingHighlights: string[];
  warnings: string[];
};

export type CollectionConstructedMeta = {
  collectionSampleSize: number;
  notes?: string[];
};

export type ConstructedDeckResult = {
  ok: true;
  format: ConstructedFormat;
  title: string;
  colors: string[];
  archetype: string;
  deckText: string;
  mainboardCount: number;
  sideboardCount: number;
  estimatedPriceUsd: number;
  explanation: string[];
  metaScore: number;
  confidence: number;
  warnings: string[];
};

export const COLLECTION_FORMAT_OPTIONS: Array<{
  id: CollectionBuildFormat;
  label: string;
  sub: string;
}> = [
  { id: "Commander", label: "Commander", sub: "100-card singleton" },
  { id: "Modern", label: "Modern", sub: "Fast 60-card format" },
  { id: "Pioneer", label: "Pioneer", sub: "Non-rotating paper" },
  { id: "Standard", label: "Standard", sub: "Rotating constructed" },
  { id: "Pauper", label: "Pauper", sub: "Commons-only decks" },
];

export const CONSTRUCTED_DIRECTION_OPTIONS: Array<{
  id: ConstructedDirection;
  label: string;
  hint: string;
}> = [
  { id: "competitive", label: "Competitive", hint: "Tuned to win" },
  { id: "casual", label: "Casual", hint: "Fun and flexible" },
  { id: "budget", label: "Budget", hint: "Keep costs down" },
  { id: "theme", label: "Theme / archetype", hint: "Build around an idea" },
];

export const CONSTRUCTED_OUTPUT_OPTIONS: Array<{
  id: ConstructedOutputMode;
  label: string;
  hint: string;
}> = [
  { id: "ideas", label: "3 deck ideas", hint: "Compare directions before committing." },
  { id: "skeleton", label: "Deck skeleton", hint: "Core cards, packages, and sideboard plan." },
  { id: "full_deck", label: "Full deck", hint: "Complete mainboard and sideboard." },
];

export const CONSTRUCTED_COLOR_OPTIONS: Array<{ id: ConstructedColor; label: string }> = [
  { id: "W", label: "White" },
  { id: "U", label: "Blue" },
  { id: "B", label: "Black" },
  { id: "R", label: "Red" },
  { id: "G", label: "Green" },
];

export type ConstructedQuizOption = { label: string; value: string };
export type ConstructedQuizQuestion = {
  id: string;
  text: string;
  options: ConstructedQuizOption[];
};

const BASE_CONSTRUCTED_QUIZ: ConstructedQuizQuestion[] = [
  {
    id: "pace",
    text: "How do you want the deck to win?",
    options: [
      { label: "Win early with pressure", value: "aggro" },
      { label: "Control the game and win late", value: "control" },
      { label: "Set up one explosive combo finish", value: "combo" },
      { label: "Outvalue opponents over time", value: "value" },
    ],
  },
  {
    id: "budget",
    text: "What's your budget posture?",
    options: [
      { label: "Budget-friendly", value: "budget" },
      { label: "Balanced upgrades", value: "mid" },
      { label: "No limits", value: "premium" },
    ],
  },
  {
    id: "interaction",
    text: "How interactive should it be?",
    options: [
      { label: "Mostly proactive", value: "solo" },
      { label: "Some interaction is healthy", value: "moderate" },
      { label: "Answer everything", value: "heavy" },
      { label: "High-variance table swings", value: "chaos" },
    ],
  },
  {
    id: "complexity",
    text: "How complex should the turns be?",
    options: [
      { label: "Simple and direct", value: "simple" },
      { label: "Medium decisions", value: "medium" },
      { label: "Complex decision trees", value: "complex" },
    ],
  },
  {
    id: "theme",
    text: "What kind of shell sounds best?",
    options: [
      { label: "Creature pressure", value: "creatures" },
      { label: "Spellslinger", value: "spells" },
      { label: "Go-wide tokens", value: "tokens" },
      { label: "Graveyard value", value: "graveyard" },
      { label: "Artifacts", value: "artifacts" },
      { label: "Enchantments", value: "enchantments" },
    ],
  },
  {
    id: "avoid",
    text: "What should the builder avoid?",
    options: [
      { label: "Long combo turns", value: "combo" },
      { label: "Pure draw-go control", value: "draw_go" },
      { label: "Creature combat as the only plan", value: "creature_combat" },
      { label: "Greedy mana or fragile setups", value: "mana_greed" },
      { label: "Expensive staple piles", value: "expensive_staples" },
    ],
  },
];

const FORMAT_METAGAME_QUESTION: Record<ConstructedFormat, ConstructedQuizQuestion> = {
  Modern: {
    id: "metagame",
    text: "How should this handle Modern's speed?",
    options: [
      { label: "Meta-safe against fast decks", value: "meta_safe" },
      { label: "Known shell with my twist", value: "proven_twist" },
      { label: "Rogue, but with real interaction", value: "rogue_coherent" },
    ],
  },
  Pioneer: {
    id: "metagame",
    text: "How close to Pioneer staples should this be?",
    options: [
      { label: "Proven and tournament-safe", value: "meta_safe" },
      { label: "Recognisable shell with my twist", value: "proven_twist" },
      { label: "Rogue, but still a real deck", value: "rogue_coherent" },
    ],
  },
  Standard: {
    id: "metagame",
    text: "How should this fit current Standard?",
    options: [
      { label: "Current-meta and stable", value: "meta_safe" },
      { label: "Known shell with my twist", value: "proven_twist" },
      { label: "Fresh brew, but rotation-safe", value: "rogue_coherent" },
    ],
  },
  Pauper: {
    id: "metagame",
    text: "How should this use Pauper's commons pool?",
    options: [
      { label: "Established commons shell", value: "meta_safe" },
      { label: "Known archetype with my twist", value: "proven_twist" },
      { label: "Rogue commons, still coherent", value: "rogue_coherent" },
    ],
  },
};

export function isConstructedFormat(format: CollectionBuildFormat): format is ConstructedFormat {
  return format !== "Commander";
}

export function getConstructedQuizQuestions(format: ConstructedFormat): ConstructedQuizQuestion[] {
  return [...BASE_CONSTRUCTED_QUIZ, FORMAT_METAGAME_QUESTION[format]];
}

export function toConstructedBudget(budget: string): ConstructedBudget {
  if (budget === "Budget") return "budget";
  if (budget === "High") return "premium";
  return "balanced";
}

export function toConstructedPower(powerLevel: string): ConstructedPower {
  if (powerLevel === "Competitive" || powerLevel === "Optimized") return "competitive";
  if (powerLevel === "Focused") return "strong";
  return "casual";
}

export function deriveConstructedDirectionFromQuizAnswers(
  answers: Record<string, string>
): ConstructedDirection {
  if (answers.budget === "budget") return "budget";
  if (answers.metagame === "meta_safe" || answers.complexity === "complex") return "competitive";
  if (answers.pace === "aggro" || answers.interaction === "chaos") return "casual";
  return "theme";
}

export function deriveConstructedPowerFromQuizAnswers(answers: Record<string, string>): string {
  if (answers.pace === "combo" && answers.budget === "premium" && answers.complexity === "complex") {
    return "Competitive";
  }
  if (
    (answers.pace === "combo" && answers.complexity === "complex") ||
    (answers.interaction === "heavy" && answers.budget === "premium") ||
    (answers.interaction === "chaos" && answers.complexity === "complex")
  ) {
    return "Optimized";
  }
  if (answers.pace === "control" || answers.interaction === "heavy" || answers.complexity === "complex") {
    return "Focused";
  }
  if (answers.budget === "budget" || answers.complexity === "simple") {
    return "Casual";
  }
  return "Mid";
}

export function deriveConstructedBudgetFromQuizAnswers(answers: Record<string, string>): string {
  if (answers.budget === "budget") return "Budget";
  if (answers.budget === "premium") return "High";
  return "Moderate";
}

export function deriveConstructedProfileLabel(answers: Record<string, string>): string {
  if (answers.pace === "control") return "Calculated Control";
  if (answers.pace === "combo") return "Combo Master";
  if (answers.pace === "aggro") return "Aggressive Tempo";
  if (answers.theme === "graveyard") return "Graveyard Value";
  if (answers.theme === "spells") return "Spellslinger";
  if (answers.theme === "tokens") return "Go-Wide Pressure";
  if (answers.interaction === "heavy") return "Interactive Midrange";
  return "Value Engine";
}

export function deriveConstructedArchetypeFromQuizAnswers(
  format: ConstructedFormat,
  answers: Record<string, string>
): string {
  const pace = answers.pace;
  const theme = answers.theme;
  if (theme === "spells") return `${format} spells`;
  if (theme === "tokens") return `${format} tokens`;
  if (theme === "graveyard") return `${format} graveyard`;
  if (theme === "artifacts") return `${format} artifacts`;
  if (theme === "enchantments") return `${format} enchantments`;
  if (pace === "aggro") return `${format} aggro`;
  if (pace === "control") return `${format} control`;
  if (pace === "combo") return `${format} combo`;
  return `${format} midrange`;
}

export function buildConstructedNotes(opts: {
  buildMode: CollectionOwnershipMode;
  direction: ConstructedDirection;
  quizProfile?: string | null;
  quizAnswers?: Record<string, string>;
  include?: string;
  avoid?: string;
  notes?: string;
}): string | undefined {
  const tokens = opts.quizAnswers ? Object.values(opts.quizAnswers).filter(Boolean) : [];
  const parts = [
    `Collection build mode: ${opts.buildMode}.`,
    `Play direction: ${opts.direction}.`,
    opts.quizProfile ? `Quiz profile: ${opts.quizProfile}.` : null,
    tokens.length ? `Quiz answers: ${tokens.join(", ")}.` : null,
    opts.include?.trim() ? `Prefer including: ${opts.include.trim()}` : null,
    opts.avoid?.trim() ? `Avoid: ${opts.avoid.trim()}` : null,
    opts.notes?.trim() ? `Notes: ${opts.notes.trim()}` : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join("\n\n") : undefined;
}

export function ideaSlugToConstructedFormat(slug: CollectionDeckIdea["format"]): ConstructedFormat {
  const map: Record<CollectionDeckIdea["format"], ConstructedFormat> = {
    modern: "Modern",
    pioneer: "Pioneer",
    standard: "Standard",
    pauper: "Pauper",
  };
  return map[slug];
}

export function skeletonSlugToConstructedFormat(slug: CollectionDeckSkeleton["format"]): ConstructedFormat {
  return ideaSlugToConstructedFormat(slug);
}
