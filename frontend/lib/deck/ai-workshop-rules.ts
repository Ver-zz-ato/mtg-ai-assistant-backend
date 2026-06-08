import { parseDeckText, parseDeckTextWithZones } from "./parseDeckText";

export const AI_WORKSHOP_MAX_CHANGE_OPTIONS = ["Up to 10 swaps", "Up to 20 swaps", "Big rebuild"] as const;

export type AiWorkshopMaxChanges = (typeof AI_WORKSHOP_MAX_CHANGE_OPTIONS)[number];

export const POWER_LEVELS = ["Casual", "Mid", "Focused", "Optimized", "Competitive"] as const;
export const BUDGET_LEVELS = ["Budget", "Moderate", "High"] as const;

export type PowerLevel = (typeof POWER_LEVELS)[number];
export type BudgetLevel = (typeof BUDGET_LEVELS)[number];

export function getAiDeckHalfwayMinimumCards(format: string): number {
  return String(format || "").trim().toLowerCase() === "commander" ? 50 : 30;
}

export function isAiDeckBelowHalfway(cardCount: number, format: string): boolean {
  return cardCount > 0 && cardCount < getAiDeckHalfwayMinimumCards(format);
}

export function countAiDeckCardsFromText(deckText: string, format: string): number {
  const text = String(deckText || "").trim();
  if (!text) return 0;
  if (String(format || "").trim().toLowerCase() === "commander") {
    return parseDeckText(text).reduce((sum, row) => sum + Math.max(1, Number(row.qty) || 1), 0);
  }
  return parseDeckTextWithZones(text).reduce((sum, row) => {
    const zone = String(row.zone || "mainboard").toLowerCase();
    if (zone === "sideboard") return sum;
    return sum + Math.max(1, Number(row.qty) || 1);
  }, 0);
}

export function getAiWorkshopActionApplyLabel(actionId: string): string {
  switch (actionId) {
    case "mana":
      return "Fix mana base";
    case "curve":
      return "Fix curve";
    case "interaction":
      return "Fix interaction";
    case "budget":
      return "Fix budget";
    case "optimized":
      return "Fix power";
    case "casual":
      return "Fix power";
    case "legality":
      return "Fix legality";
    case "general":
    default:
      return "Fix deck";
  }
}

export function getAiWorkshopSubTargetOptions(actionId: string): string[] {
  switch (actionId) {
    case "general":
      return ["Cohesion", "Redundancy", "Low-impact cuts"];
    case "mana":
      return ["Land count", "Fixing", "Ramp mix"];
    case "curve":
      return ["Early game", "Top-end trim", "Average CMC"];
    case "interaction":
      return ["Spot removal", "Board wipes", "Stack interaction"];
    case "budget":
      return ["Mana base first", "Expensive staples", "Whole list"];
    case "optimized":
      return ["Consistency", "Speed", "Resilience"];
    case "casual":
      return ["Softer win lines", "More table-friendly", "Less oppressive interaction"];
    case "legality":
      return ["Color identity", "Banned cards", "Deck structure"];
    default:
      return [];
  }
}

export function buildMaxChangesConstraint(maxChanges: AiWorkshopMaxChanges): string {
  if (maxChanges === "Up to 10 swaps") {
    return "Keep this a light-touch pass. Aim for roughly 10 card swaps or fewer unless legality makes more changes mandatory.";
  }
  if (maxChanges === "Up to 20 swaps") {
    return "Keep this to a moderate pass. Aim for roughly 20 card swaps or fewer unless legality makes more changes mandatory.";
  }
  return "A bigger rebuild is allowed here if needed, as long as the deck identity still makes sense.";
}

export function toMaxChangesLimit(maxChanges: AiWorkshopMaxChanges): number | null {
  if (maxChanges === "Up to 10 swaps") return 10;
  if (maxChanges === "Up to 20 swaps") return 20;
  return null;
}

export function budgetLevelToSwapThreshold(level: BudgetLevel): number {
  if (level === "Budget") return 5;
  if (level === "Moderate") return 10;
  return 20;
}

export function getTargetCountForFormat(format: string): number {
  return String(format || "").trim().toLowerCase() === "commander" ? 100 : 60;
}
