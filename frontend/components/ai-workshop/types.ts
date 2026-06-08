import type { AiWorkshopBudgetSwapPair } from "@/lib/deck/ai-workshop-deck-text";
import type { CardChangeReasons } from "@/lib/deck/ai-workshop-helpers";

export type WorkshopBudgetSwapPair = AiWorkshopBudgetSwapPair & {
  priceFrom: number;
  priceTo: number;
  savings: number;
  rationale: string;
  confidence: number;
  currency: string;
};

export type WorkshopResultMeta = {
  plan?: string;
  whyText?: string;
  summary?: string;
  title?: string;
  previewFacts?: Record<string, unknown> | null;
  colors?: string[];
  warnings?: string[];
  changeReasons?: CardChangeReasons | null;
};

export type PendingWorkshopPreview = {
  mode?: "diff" | "budget_swaps";
  deckText: string;
  title?: string;
  summary?: string;
  plan?: string;
  whyText?: string;
  previewFacts?: Record<string, unknown> | null;
  colors?: string[];
  warnings?: string[];
  changeReasons?: CardChangeReasons | null;
  baseDeckText: string;
  commander: string;
  budgetSwaps?: WorkshopBudgetSwapPair[];
};

export type UndoSnapshot = {
  workingDeckText: string;
  deckTitle: string;
  deckCommander: string;
  resultMeta: WorkshopResultMeta | null;
  lastBaseDeckText: string | null;
};

export type PreviewDiffTab = "adds" | "cuts";
