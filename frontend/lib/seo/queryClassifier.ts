/**
 * Deterministic query classifier for SEO landing pages.
 * Classifies GSC queries into page templates and extracts entities.
 */

import { COMMANDERS, getCommanderSlugByName } from "@/lib/commanders";
import { ARCHETYPES } from "@/lib/data/archetypes";
import { STRATEGIES } from "@/lib/data/strategies";

export type ClassifierType =
  | "commander_mulligan"
  | "commander_budget"
  | "commander_cost"
  | "commander_best_cards"
  | "card_price"
  | "card_decks"
  | "archetype"
  | "strategy"
  | "tool_generic"
  | "guide_generic";

export type ClassifierResult = {
  type: ClassifierType;
  entities: {
    commanderSlug?: string;
    cardName?: string;
    cardSlug?: string;
    archetypeSlug?: string;
    strategySlug?: string;
  };
  primaryKeyword: string;
  normalizedQuery: string;
  confidence: "high" | "medium" | "low";
};

function norm(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCommanderInQuery(query: string): string | null {
  const q = norm(query);
  let best: { slug: string; len: number } | null = null;
  for (const c of COMMANDERS) {
    const fullName = norm(c.name.replace(/\s*\(.*?\)\s*$/, "").replace(/\s*\,.*$/, "").trim() || c.name);
    const shortName = norm(c.name.split(",")[0]?.trim() || c.name);
    const slug = c.slug;
    const slugAsWords = slug.replace(/-/g, " ");
    const matches =
      q.includes(norm(c.name.replace(/\s*\(.*?\)\s*$/, ""))) ||
      q.includes(slug) ||
      q.includes(slugAsWords) ||
      q.includes(shortName);
    if (matches) {
      const len = Math.max(fullName.length, shortName.length, slug.length);
      if (!best || len > best.len) best = { slug, len };
    }
  }
  return best?.slug ?? null;
}

function findCardInQuery(query: string, topCardNames: string[]): { name: string; slug: string } | null {
  const q = norm(query);
  function toSlug(n: string): string {
    return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  for (const name of topCardNames) {
    const nameNorm = norm(name);
    const slug = toSlug(name);
    if (q.includes(nameNorm) || q.includes(slug)) return { name, slug };
  }
  return null;
}

function findArchetypeInQuery(query: string): string | null {
  const q = norm(query);
  for (const a of ARCHETYPES) {
    if (q.includes(a.slug) || q.includes(norm(a.title))) return a.slug;
    for (const tag of a.tagMatches) {
      if (q.includes(tag.toLowerCase())) return a.slug;
    }
  }
  return null;
}

function findStrategyInQuery(query: string): string | null {
  const q = norm(query);
  for (const s of STRATEGIES) {
    if (q.includes(s.slug) || q.includes(norm(s.title))) return s.slug;
    for (const tag of s.tagMatches) {
      if (q.includes(tag.toLowerCase())) return s.slug;
    }
  }
  return null;
}

const TOOL_TERMS = [
  "probability",
  "hypergeometric",
  "mulligan calculator",
  "mulligan simulator",
  "deck cost calculator",
  "budget swap",
  "budget swaps",
  "cost to finish",
  "deck cost",
];

export function classifyQuery(
  query: string,
  options?: { topCardNames?: string[] }
): ClassifierResult | null {
  const raw = String(query ?? "").trim();
  if (!raw || raw.length > 300) return null;

  const normalized = norm(raw);
  const topCardNames = options?.topCardNames ?? [];

  const commanderSlug = findCommanderInQuery(raw);
  const cardMatch = findCardInQuery(raw, topCardNames);
  const archetypeSlug = findArchetypeInQuery(raw);
  const strategySlug = findStrategyInQuery(raw);

  const hasMulligan = /mulligan/i.test(raw);
  const hasBudget = /\b(budget|cheap|under|affordable)\b/i.test(raw);
  const hasCost = /\b(cost|price|how much)\b/i.test(raw);
  const hasBestCards = /\b(best cards|top cards)\b/i.test(raw);
  const hasPrice = /\bprice\b/i.test(raw);
  const hasDecks = /\bdeck/i.test(raw);
  const hasTool = TOOL_TERMS.some((t) => raw.toLowerCase().includes(t));

  // Commander + mulligan
  if (commanderSlug && hasMulligan) {
    return {
      type: "commander_mulligan",
      entities: { commanderSlug },
      primaryKeyword: raw,
      normalizedQuery: normalized,
      confidence: "high",
    };
  }

  // Commander + budget
  if (commanderSlug && hasBudget) {
    return {
      type: "commander_budget",
      entities: { commanderSlug },
      primaryKeyword: raw,
      normalizedQuery: normalized,
      confidence: "high",
    };
  }

  // Commander + cost
  if (commanderSlug && hasCost) {
    return {
      type: "commander_cost",
      entities: { commanderSlug },
      primaryKeyword: raw,
      normalizedQuery: normalized,
      confidence: "high",
    };
  }

  // Commander + best cards
  if (commanderSlug && hasBestCards) {
    return {
      type: "commander_best_cards",
      entities: { commanderSlug },
      primaryKeyword: raw,
      normalizedQuery: normalized,
      confidence: "high",
    };
  }

  // Card + price
  if (cardMatch && hasPrice) {
    return {
      type: "card_price",
      entities: { cardName: cardMatch.name, cardSlug: cardMatch.slug },
      primaryKeyword: raw,
      normalizedQuery: normalized,
      confidence: "high",
    };
  }

  // Card + decks
  if (cardMatch && hasDecks) {
    return {
      type: "card_decks",
      entities: { cardName: cardMatch.name, cardSlug: cardMatch.slug },
      primaryKeyword: raw,
      normalizedQuery: normalized,
      confidence: "high",
    };
  }

  // Archetype (standalone or with "commander", "decks", etc.)
  if (archetypeSlug) {
    return {
      type: "archetype",
      entities: { archetypeSlug },
      primaryKeyword: raw,
      normalizedQuery: normalized,
      confidence: "medium",
    };
  }

  // Strategy
  if (strategySlug) {
    return {
      type: "strategy",
      entities: { strategySlug },
      primaryKeyword: raw,
      normalizedQuery: normalized,
      confidence: "medium",
    };
  }

  // Tool generic
  if (hasTool) {
    return {
      type: "tool_generic",
      entities: {},
      primaryKeyword: raw,
      normalizedQuery: normalized,
      confidence: "medium",
    };
  }

  // Guide generic (catch-all for MTG/Commander queries)
  if (/\b(commander|edh|mtg|magic)\b/i.test(raw)) {
    return {
      type: "guide_generic",
      entities: {},
      primaryKeyword: raw,
      normalizedQuery: normalized,
      confidence: "low",
    };
  }

  return null;
}
