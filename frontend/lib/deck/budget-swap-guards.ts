import { canonicalize } from "@/lib/cards/canonicalize";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

function normalizedCardKey(name: string): string {
  return normalizeScryfallCacheName(canonicalize(name).canonicalName || name);
}

function isBasicLandName(name: string): boolean {
  return /^(plains|island|swamp|mountain|forest|wastes)$/i.test(name.trim());
}

function isCommanderLikeFormat(format: string): boolean {
  return format.toLowerCase().includes("commander") || format.toLowerCase().includes("edh");
}

export function isAiWorkshopBudgetSource(sourcePage: string | null): boolean {
  return sourcePage === "app_ai_workshop_budget" || sourcePage === "ai_workshop_budget";
}

export function isValidBudgetSwap(input: {
  from: string;
  to: string;
  priceFrom: number;
  priceTo: number;
  budget: number;
  deckNameKeys: Set<string>;
  format: string;
  allowReplacementAboveBudget?: boolean;
}): boolean {
  if (!(input.priceFrom > 0 && input.priceTo > 0)) return false;
  if (input.priceFrom <= input.budget) return false;
  if (input.priceTo >= input.priceFrom) return false;
  if (!input.allowReplacementAboveBudget && input.priceTo > input.budget) return false;
  const fromKey = normalizedCardKey(input.from);
  const toKey = normalizedCardKey(input.to);
  if (!toKey || fromKey === toKey) return false;
  if (isBasicLandName(input.from) || isBasicLandName(input.to)) return false;
  if (input.deckNameKeys.has(toKey)) return false;

  if (!isCommanderLikeFormat(input.format) && /^(evolving wilds|terramorphic expanse|fabled passage)$/i.test(input.to.trim())) {
    return false;
  }

  return true;
}
