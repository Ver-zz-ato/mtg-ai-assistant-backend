import type { SfCard } from "@/lib/deck/inference";
import { normalizeCardName } from "@/lib/deck/mtgValidators";

export type AnalyzeSuggestionSource = "ai" | "deterministic";
export type AnalyzeSuggestionConfidence = "high" | "medium" | "low";

export type AnalyzeAddCut = {
  card: string;
  reason: string;
  category?: string;
  confidence: AnalyzeSuggestionConfidence;
  source: AnalyzeSuggestionSource;
};

export type AnalyzeQuality = {
  suggestionSource: "ai" | "mixed" | "deterministic";
  warnings: string[];
};

export type CommanderComparisonMetric = {
  label: string;
  yours: number;
  average?: number;
  targetRange?: string;
  status: "low" | "healthy" | "high" | "unknown";
};

export type CommanderComparison = {
  commander: string;
  comparedDeckCount: number;
  metrics: CommanderComparisonMetric[];
  missingCommonCards: Array<{ card: string; inclusionPercent?: number; reason: string }>;
  unusualCards: Array<{ card: string; inclusionPercent?: number; reason: string; confidence: "medium" | "low" }>;
};

type DeckEntry = { name: string; count: number };
type Counts = { lands: number; ramp: number; draw: number; removal: number };
type SuggestionLike = { card?: string; reason?: string; category?: string; slotRole?: string };

type OutputFloorInput = {
  format: string;
  commander?: string | null;
  colors: string[];
  entries: DeckEntry[];
  byName: Map<string, SfCard>;
  counts: Counts;
  whatsGood: string[];
  quickFixes: string[];
  suggestions: SuggestionLike[];
  isProDepth: boolean;
  lockedNormalized?: Set<string>;
};

const COLOR_ORDER = ["W", "U", "B", "R", "G"];

function titleList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function cardForEntry(entry: DeckEntry, byName: Map<string, SfCard>): SfCard | null {
  return byName.get(entry.name.toLowerCase()) ?? null;
}

function firstBasicLand(colors: string[]): string {
  if (colors.includes("W")) return "Plains";
  if (colors.includes("U")) return "Island";
  if (colors.includes("B")) return "Swamp";
  if (colors.includes("R")) return "Mountain";
  if (colors.includes("G")) return "Forest";
  return "Wastes";
}

function addIfUnique(out: AnalyzeAddCut[], seen: Set<string>, item: AnalyzeAddCut): void {
  const key = normalizeCardName(item.card);
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push(item);
}

function roleTargets(format: string): Record<keyof Counts, { min: number; range: string }> {
  const isCommander = format === "Commander";
  return {
    lands: isCommander ? { min: 34, range: "36-38" } : { min: 22, range: "23-26" },
    ramp: isCommander ? { min: 8, range: "8-11" } : { min: 0, range: "0-4" },
    draw: isCommander ? { min: 8, range: "8-12" } : { min: 4, range: "4-8" },
    removal: isCommander ? { min: 6, range: "6-10" } : { min: 6, range: "6-10" },
  };
}

function buildIssueLines(format: string, counts: Counts, quickFixes: string[]): string[] {
  const targets = roleTargets(format);
  const out = [...quickFixes];
  if (counts.lands < targets.lands.min) out.push(`Land count is below the recommended ${targets.lands.range} range.`);
  if (format === "Commander" && counts.ramp < targets.ramp.min) out.push(`Ramp count is below the recommended ${targets.ramp.range} range.`);
  if (counts.draw < targets.draw.min) out.push(`Card draw is below the recommended ${targets.draw.range} range.`);
  if (counts.removal < targets.removal.min) out.push(`Interaction is below the recommended ${targets.removal.range} range.`);
  out.push("Prioritize changes that fix consistency before adding more flashy top-end cards.");
  out.push("Review flexible slots against the deck's main plan before making upgrades.");
  out.push(format === "Commander" ? "Make sure the commander has enough protection and setup to matter when cast." : "Keep the sideboard plan focused on the matchups this archetype expects to face.");
  return dedupeStrings(out).slice(0, 3);
}

function isAnalysisMetadataLine(line: string): boolean {
  const text = line.toLowerCase();
  return (
    /commander identity is set|format (is|was) detected|deck (was )?parsed|recommendations can stay focused/.test(text) ||
    /color identity|analysis metadata|enough structure to produce concrete/.test(text)
  );
}

function cardText(entry: DeckEntry, byName: Map<string, SfCard>): string {
  const card = cardForEntry(entry, byName);
  return `${entry.name} ${card?.type_line ?? ""} ${card?.oracle_text ?? ""}`.toLowerCase();
}

function hasSacrificeValuePlan(input: OutputFloorInput): boolean {
  const commanderText = input.commander?.toLowerCase() ?? "";
  if (/korvold|sacrifice|aristocrat|dies/.test(commanderText)) return true;
  let hits = 0;
  for (const entry of input.entries) {
    const text = cardText(entry, input.byName);
    if (/sacrifice|whenever .* dies|whenever .* is put into a graveyard|blood artist|aristocrat|zulaport|bastion of remembrance|pitiless plunderer|mayhem devil/.test(text)) {
      hits += 1;
    }
    if (hits >= 3) return true;
  }
  return false;
}

function buildStrengthLines(format: string, counts: Counts, whatsGood: string[], commander?: string | null): string[] {
  const targets = roleTargets(format);
  const out = whatsGood.filter((line) => !isAnalysisMetadataLine(line));
  if (counts.lands >= targets.lands.min) out.push("Mana base count is close enough to support normal opening hands.");
  if (counts.draw >= targets.draw.min) out.push("Card-flow package gives the deck ways to keep playing after the first wave.");
  if (counts.removal >= targets.removal.min) out.push("Interaction count gives you tools to answer opposing threats.");
  if (commander) out.push(`The commander plan is cohesive enough to build around ${commander}.`);
  out.push("The deck has a clear core plan, even if the support counts still need tuning.");
  return dedupeStrings(out).slice(0, 3);
}

function buildStrengthLinesForInput(input: OutputFloorInput): string[] {
  const sacrificePlan = hasSacrificeValuePlan(input);
  const base = buildStrengthLines(input.format, input.counts, input.whatsGood, input.commander);
  if (sacrificePlan) {
    return dedupeStrings([
      "The deck already has a clear sacrifice/value engine to build around.",
      ...base,
    ]).slice(0, 3);
  }
  return base;
}

function buildDeterministicAdds(input: OutputFloorInput, limit: number): AnalyzeAddCut[] {
  const isCommander = input.format === "Commander";
  const existing = new Set(input.entries.map((e) => normalizeCardName(e.name)));
  const targets = roleTargets(input.format);
  const out: AnalyzeAddCut[] = [];
  const seen = new Set<string>();
  const add = (card: string, reason: string, category: string, confidence: AnalyzeSuggestionConfidence = "medium") => {
    if (existing.has(normalizeCardName(card))) return;
    addIfUnique(out, seen, { card, reason, category, confidence, source: "deterministic" });
  };

  if (input.counts.lands < targets.lands.min) {
    add(
      isCommander ? "Command Tower" : firstBasicLand(input.colors),
      `Raises the mana count toward the ${targets.lands.range} ${input.format} range so the deck misses fewer early land drops.`,
      "mana",
      "high"
    );
  }

  if (isCommander && input.counts.ramp < targets.ramp.min) {
    add("Arcane Signet", `Adds reliable two-mana acceleration toward the ${targets.ramp.range} Commander ramp range.`, "ramp", "high");
    add("Fellwar Stone", "Adds another low-curve mana rock without asking the deck to change its plan.", "ramp");
  }

  if (input.counts.draw < targets.draw.min) {
    if (input.colors.includes("B")) add("Night's Whisper", `Cheap card draw helps move toward the ${targets.draw.range} draw range.`, "draw");
    if (input.colors.includes("G")) add("Harmonize", `Simple refill that helps the deck recover after spending its hand.`, "draw");
    if (input.colors.includes("U")) add(isCommander ? "Fact or Fiction" : "Consider", `Adds card selection so the deck finds lands, answers, or threats more reliably.`, "draw");
  }

  if (input.counts.removal < targets.removal.min) {
    if (input.colors.includes("B")) add("Go for the Throat", `Efficient spot removal helps move toward the ${targets.removal.range} interaction range.`, "removal");
    if (input.colors.includes("R")) add("Abrade", "Flexible removal answers small creatures or artifacts without being narrow.", "removal");
    if (input.colors.includes("W")) add(isCommander ? "Swords to Plowshares" : "Portable Hole", "Low-cost interaction helps you answer early threats on time.", "removal");
    if (input.colors.includes("G") && isCommander) add("Beast Within", "Broad interaction gives green decks a clean answer to problem permanents.", "removal");
    if (input.colors.includes("U")) add(isCommander ? "Counterspell" : "Make Disappear", "Stack interaction protects your plan and stops key opposing plays.", "removal");
  }

  if (isCommander) {
    if (input.colors.includes("G")) add("Tamiyo's Safekeeping", "Cheap protection helps keep your key engine or commander alive through removal.", "protection");
    add("Swiftfoot Boots", "Protects the commander and lets important creatures affect the game sooner.", "protection", "low");
    add("Wayfarer's Bauble", "Adds a low-cost ramp slot that helps the deck keep pace without changing its core plan.", "ramp", "low");
    add("Mind Stone", "Adds early mana and can cash itself in later when the deck needs another card.", "ramp", "low");
    add("War Room", "Utility land that turns stable mana into extra cards in longer Commander games.", "draw", "low");
  } else if (input.format === "Modern" && input.colors.includes("R")) {
    add("Lava Dart", "Cheap extra reach that fits low-curve red aggressive plans.", "burn", "low");
    add("Skewer the Critics", "Efficient damage spell that rewards the deck for consistently dealing early damage.", "burn", "low");
    add("Roiling Vortex", "Pressure piece that helps punish lifegain and slower decks.", "pressure", "low");
  } else if (input.format === "Pioneer" && input.colors.includes("B") && input.colors.includes("R")) {
    add("Unlicensed Hearse", "Graveyard pressure that also becomes a real threat in longer midrange games.", "sideboard", "low");
    add("Go Blank", "Hand and graveyard attack for matchups where Rakdos wants to trade resources.", "sideboard", "low");
    add("Sheoldred's Edict", "Flexible interaction that answers single large threats and planeswalkers cleanly.", "removal", "low");
  }

  add(isCommander ? "Skullclamp" : firstBasicLand(input.colors), "A low-cost consistency upgrade that helps convert spare resources into progress.", "consistency", "low");
  return out.slice(0, limit);
}

const CORE_CARD_NAME_PATTERNS = [
  /pitiless\s*plunderer/,
  /bastion\s*of\s*remembrance/,
  /blood\s*artist/,
  /zulaport\s*cutthroat/,
  /mayhem\s*devil/,
  /viscera\s*seer/,
  /skullclamp/,
  /reassembling\s*skeleton/,
  /squee,?\s*goblin\s*nabob/,
  /phyrexian\s*altar/,
  /ashnod'?s\s*altar/,
  /goblin\s*bombardment/,
];

function isLikelyCoreSynergyCard(entry: DeckEntry, input: OutputFloorInput): boolean {
  const key = normalizeCardName(entry.name);
  const rawName = entry.name.toLowerCase();
  if (CORE_CARD_NAME_PATTERNS.some((pattern) => pattern.test(key) || pattern.test(rawName))) return true;
  const text = cardText(entry, input.byName);
  const sacrificeDeck = hasSacrificeValuePlan(input);
  if (sacrificeDeck && /whenever .* dies|whenever .* is put into a graveyard|create .* treasure|sacrifice .* draw|each opponent loses/.test(text)) {
    return true;
  }
  if (/commander you control|your commander/.test(text)) return true;
  return false;
}

function buildDeterministicCuts(input: OutputFloorInput, limit: number, avoidCards: Set<string>): AnalyzeAddCut[] {
  const commanderNorm = input.commander ? normalizeCardName(input.commander) : "";
  const locked = input.lockedNormalized ?? new Set<string>();
  const candidates = input.entries
    .filter((entry) => {
      const key = normalizeCardName(entry.name);
      if (!key || key === commanderNorm || locked.has(key) || avoidCards.has(key)) return false;
      if (isLikelyCoreSynergyCard(entry, input)) return false;
      const card = cardForEntry(entry, input.byName);
      const typeLine = String(card?.type_line ?? "").toLowerCase();
      return !typeLine.includes("basic land");
    })
    .map((entry) => {
      const card = cardForEntry(entry, input.byName);
      const typeLine = String(card?.type_line ?? "").toLowerCase();
      const oracle = String(card?.oracle_text ?? "").toLowerCase();
      const cmc = typeof card?.cmc === "number" ? card.cmc : 0;
      let score = cmc;
      if (typeLine.includes("land")) score -= 5;
      if (cmc >= 6) score += 4;
      if (isLikelyCoreSynergyCard(entry, input)) score -= 8;
      if (/draw a card|destroy|exile|counter target|add \{|search your library/.test(oracle)) score -= 2;
      if (/enters tapped|can't attack|doesn't untap|at the beginning of your upkeep/.test(oracle)) score += 1;
      return { entry, cmc, typeLine, score };
    })
    .sort((a, b) => b.score - a.score || b.cmc - a.cmc || a.entry.name.localeCompare(b.entry.name));

  const out: AnalyzeAddCut[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    const category = item.cmc >= 6 ? "curve" : item.typeLine.includes("land") ? "mana" : "flex slot";
    const manaValueLabel = item.cmc > 0 ? `${item.cmc}-mana` : "lower-impact";
    const roleLabel = item.typeLine.includes("planeswalker")
      ? "value piece"
      : item.typeLine.includes("creature")
        ? "creature slot"
        : item.typeLine.includes("artifact")
          ? "artifact slot"
          : item.typeLine.includes("enchantment")
            ? "enchantment slot"
            : "flex slot";
    const reason =
      item.cmc >= 6
        ? `${manaValueLabel} ${roleLabel} that competes with setup, interaction, or protection turns. Review if you need a lower-curve upgrade slot.`
        : `Flexible ${roleLabel} that is less tied to the main plan than protected engine pieces. Review this slot if you need room for the higher-priority adds.`;
    addIfUnique(out, seen, {
      card: item.entry.name,
      reason,
      category,
      confidence: item.cmc >= 6 && item.score >= 8 ? "medium" : "low",
      source: "deterministic",
    });
    if (out.length >= limit) break;
  }
  return out;
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = String(item ?? "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function enforceDeckAnalysisOutputFloor(input: OutputFloorInput): {
  issues: string[];
  strengths: string[];
  recommendations: string[];
  suggestedAdds: AnalyzeAddCut[];
  suggestedCuts: AnalyzeAddCut[];
  suggestions: SuggestionLike[];
  analysisQuality: AnalyzeQuality;
} {
  const limit = input.isProDepth ? 12 : 3;
  const existingAdds: AnalyzeAddCut[] = [];
  const seenAdds = new Set<string>();
  for (const suggestion of input.suggestions) {
    const card = typeof suggestion.card === "string" ? suggestion.card.trim() : "";
    if (!card || normalizeCardName(card) === "na") continue;
    addIfUnique(existingAdds, seenAdds, {
      card,
      reason: suggestion.reason?.trim() || "Recommended by the AI analysis for this deck's current needs.",
      category: suggestion.category || suggestion.slotRole || "upgrade",
      confidence: "medium",
      source: "ai",
    });
  }

  const deterministicAdds = buildDeterministicAdds(input, limit);
  const suggestedAdds = [...existingAdds];
  for (const item of deterministicAdds) {
    addIfUnique(suggestedAdds, seenAdds, item);
    if (suggestedAdds.length >= limit) break;
  }

  const avoidCutCards = new Set(suggestedAdds.map((item) => normalizeCardName(item.card)));
  const deterministicCuts = buildDeterministicCuts(input, limit, avoidCutCards);
  const issues = buildIssueLines(input.format, input.counts, input.quickFixes);
  const strengths = buildStrengthLinesForInput(input);
  const recommendations = dedupeStrings([
    ...input.quickFixes,
    ...suggestedAdds.slice(0, 3).map((item) => `Add ${item.card}: ${item.reason}`),
  ]).slice(0, 3);

  const suggestionSource =
    existingAdds.length === 0 ? "deterministic" : deterministicAdds.length > 0 || deterministicCuts.length > 0 ? "mixed" : "ai";
  const warnings =
    suggestionSource === "deterministic"
      ? ["AI card suggestions were unavailable, so ManaTap used deterministic deck metrics for this recommendation set."]
      : suggestionSource === "mixed"
        ? ["Some recommendations were filled from deterministic deck metrics to guarantee an actionable report."]
        : [];

  return {
    issues,
    strengths,
    recommendations,
    suggestedAdds: suggestedAdds.slice(0, limit),
    suggestedCuts: deterministicCuts.slice(0, limit),
    suggestions:
      input.suggestions.filter((s) => s.card && normalizeCardName(s.card) !== "na").length > 0
        ? input.suggestions.filter((s) => s.card && normalizeCardName(s.card) !== "na")
        : suggestedAdds.slice(0, 3).map((item) => ({
            card: item.card,
            reason: item.reason,
            category: item.category,
            slotRole: item.category,
          })),
    analysisQuality: { suggestionSource, warnings },
  };
}

export async function buildCommanderComparisonFromAggregates(args: {
  supabase: { from: (table: string) => any };
  format: string;
  commander?: string | null;
  entries: DeckEntry[];
  counts: Counts;
  colors: string[];
}): Promise<CommanderComparison | null> {
  if (args.format !== "Commander" || !args.commander?.trim()) return null;
  const { getCommanderSlugByName } = await import("@/lib/commanders");
  const { toCommanderSlug } = await import("@/lib/commander-slugs");
  const slug = getCommanderSlugByName(args.commander) ?? toCommanderSlug(args.commander);
  if (!slug) return null;
  const { data, error } = await args.supabase
    .from("commander_aggregates")
    .select("top_cards, deck_count")
    .eq("commander_slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const deckCount = Number(data.deck_count) || 0;
  if (deckCount < 50) return null;
  const topCards = Array.isArray(data.top_cards)
    ? (data.top_cards as Array<{ cardName?: string; card?: string; count?: number; percent?: number }>)
    : [];
  const deckNames = new Set(args.entries.map((entry) => normalizeCardName(entry.name)));
  const commanderKey = normalizeCardName(args.commander);
  const topSet = new Set(topCards.map((row) => normalizeCardName(row.cardName ?? row.card ?? "")));
  const missingCommonCards = topCards
    .flatMap((row) => {
      const card = String(row.cardName ?? row.card ?? "").trim();
      const storedPercent = Number(row.percent);
      const storedCount = Number(row.count);
      const inclusionPercent = Number.isFinite(storedPercent)
        ? storedPercent
        : Number.isFinite(storedCount) && deckCount > 0
          ? (storedCount / deckCount) * 100
          : undefined;
      if (!card) return [];
      const key = normalizeCardName(card);
      if (!key || deckNames.has(key) || key === commanderKey) return [];
      return [
        {
          card,
          ...(typeof inclusionPercent === "number" ? { inclusionPercent } : {}),
          reason:
            typeof inclusionPercent === "number"
              ? `${card} appears in ${Math.round(inclusionPercent)}% of ManaTap community ${args.commander} decks.`
              : `${card} is one of the common ManaTap community cards for ${args.commander}.`,
        },
      ];
    })
    .slice(0, 5);
  const unusualCards = args.entries
    .filter((entry) => {
      const key = normalizeCardName(entry.name);
      if (!key || key === commanderKey || topSet.has(key)) return false;
      return !/plains|island|swamp|mountain|forest|wastes/.test(key);
    })
    .slice(0, 5)
    .map((entry) => ({
      card: entry.name,
      reason: `${entry.name} is not among the most common cards in this commander's ManaTap public-deck sample.`,
      confidence: "low" as const,
    }));

  const targets = roleTargets("Commander");
  const statusFor = (value: number, min: number, high?: number): "low" | "healthy" | "high" => {
    if (value < min) return "low";
    if (high != null && value > high) return "high";
    return "healthy";
  };
  return {
    commander: args.commander,
    comparedDeckCount: deckCount,
    metrics: [
      { label: "Lands", yours: args.counts.lands, targetRange: targets.lands.range, status: statusFor(args.counts.lands, 34, 42) },
      { label: "Ramp", yours: args.counts.ramp, targetRange: targets.ramp.range, status: statusFor(args.counts.ramp, 8, 14) },
      { label: "Draw", yours: args.counts.draw, targetRange: targets.draw.range, status: statusFor(args.counts.draw, 8, 15) },
      { label: "Removal", yours: args.counts.removal, targetRange: targets.removal.range, status: statusFor(args.counts.removal, 6, 13) },
    ],
    missingCommonCards,
    unusualCards,
  };
}
