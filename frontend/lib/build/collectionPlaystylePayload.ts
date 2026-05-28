/**
 * Playstyle quiz → POST /api/deck/generate-from-collection (website + collection modal).
 */

import type { PlaystyleTraits } from "@/lib/quiz/quiz-data";

export type CollectionOwnershipMode = "collection_only" | "mostly_collection" | "best_with_missing";

export function quizBudgetToApiBudget(budgetAnswer: string | undefined): string {
  switch (budgetAnswer) {
    case "spend":
      return "High";
    case "budget":
    case "own":
      return "Budget";
    case "proxy":
      return "Moderate";
    default:
      return "Moderate";
  }
}

/** Map website quiz trait scores to API powerLevel presets. */
export function quizTraitsToApiPower(traits: PlaystyleTraits): string {
  if (traits.comboAppetite > 70 && traits.varianceTolerance > 60) {
    return "Optimized";
  }
  if (traits.aggression > 65 || traits.comboAppetite > 60) {
    return "Focused";
  }
  if (traits.control > 60 || traits.gameLengthPref > 60) {
    return "Mid";
  }
  if (traits.budgetElasticity < 35) {
    return "Casual";
  }
  return "Mid";
}

export function buildCollectionPlaystyleLine(opts: {
  profileLabel: string;
  quizAnswers?: Record<string, string>;
  vibe?: string;
}): string {
  const tokens = opts.quizAnswers ? Object.values(opts.quizAnswers).filter(Boolean) : [];
  const vibe = opts.vibe?.trim() || opts.profileLabel;
  const pieces = [
    `Playstyle vibe: ${vibe}.`,
    opts.profileLabel ? `Quiz profile: ${opts.profileLabel}.` : null,
    tokens.length ? `Quiz answers: ${tokens.join(", ")}.` : null,
  ].filter(Boolean) as string[];
  return pieces.join(" ");
}

export type GenerateFromCollectionBody = {
  collectionId: string;
  commander?: string;
  playstyle?: string;
  powerLevel: string;
  budget: string;
  format: string;
  generationIntent?: string;
  collectionOwnershipMode?: CollectionOwnershipMode;
};

export function buildGenerateFromCollectionBody(opts: {
  collectionId: string;
  commander?: string;
  profileLabel: string;
  quizAnswers?: Record<string, string>;
  powerLevel?: string;
  budget?: string;
  fromQuiz: boolean;
  collectionOwnershipMode?: CollectionOwnershipMode;
  playstyleVibe?: string;
}): GenerateFromCollectionBody {
  const answers = opts.quizAnswers ?? {};
  return {
    collectionId: opts.collectionId,
    commander: opts.commander?.trim() || undefined,
    playstyle: buildCollectionPlaystyleLine({
      profileLabel: opts.profileLabel,
      quizAnswers: opts.fromQuiz ? answers : undefined,
      vibe: opts.playstyleVibe ?? opts.profileLabel,
    }),
    powerLevel: opts.powerLevel ?? "Casual",
    budget: opts.budget ?? "Moderate",
    format: "Commander",
    generationIntent: opts.fromQuiz ? "quiz_build" : "collection_build",
    collectionOwnershipMode: opts.collectionOwnershipMode ?? "mostly_collection",
  };
}

export const COLLECTION_BUILD_QUIZ_HANDOFF_KEY = "manatap:collection-build-quiz-handoff";

export type CollectionBuildQuizHandoff = {
  profileLabel: string;
  answers: Record<string, string>;
  selectedCommander?: string;
};

export function saveCollectionBuildQuizHandoff(handoff: CollectionBuildQuizHandoff): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(COLLECTION_BUILD_QUIZ_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // ignore quota / private mode
  }
}

export function loadCollectionBuildQuizHandoff(): CollectionBuildQuizHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(COLLECTION_BUILD_QUIZ_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CollectionBuildQuizHandoff;
    if (!parsed?.profileLabel || typeof parsed.answers !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCollectionBuildQuizHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(COLLECTION_BUILD_QUIZ_HANDOFF_KEY);
  } catch {
    // ignore
  }
}
