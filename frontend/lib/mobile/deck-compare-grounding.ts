import { parseDeckText } from "@/lib/deck/parseDeckText";
import { enrichDeck, isCommanderEligible } from "@/lib/deck/deck-enrichment";
import { tagCards, isLandForDeck } from "@/lib/deck/card-role-tags";
import { buildDeckFacts } from "@/lib/deck/deck-facts";
import { buildSynergyDiagnostics } from "@/lib/deck/synergy-diagnostics";
import { buildDeckPlanProfile } from "@/lib/deck/deck-plan-profile";
import { getServiceRoleClient } from "@/lib/server-supabase";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

type ComparedDeckBlock = {
  label: string;
  deckText: string;
  commanderHint: string | null;
};

export type CompareDeckIntelligenceProfile = {
  intent: string;
  secondaryIntent: string | null;
  powerScore: number;
  powerBand: "casual" | "focused" | "high" | "competitive";
  consistencyScore: number;
  tempoScore: number;
  interactionScore: number;
  resilienceScore: number;
  closingScore: number;
  manaQualityScore: number;
  synergyScore: number;
  commanderSynergyScore: number | null;
  estimatedPriceUsd: number | null;
  priceTier: "unknown" | "budget" | "moderate" | "premium" | "luxury";
  keyCards: string[];
  engineCards: string[];
  payoffCards: string[];
  premiumCards: string[];
  weakSignals: string[];
  matchupRead: string;
};

export type CompareDeckGrounding = {
  label: string;
  commander: string | null;
  format: string;
  cardCount: number;
  speedScore: number;
  speed: "fast" | "medium" | "slow";
  resilience: number;
  interactionDensity: number;
  drawDensity: number;
  rampDensity: number;
  finisherDensity: number;
  manaStability: number;
  archetypes: string[];
  intelligence: CompareDeckIntelligenceProfile;
  summary: string;
};

export type DeterministicComparisonMatrix = {
  fasterDeck: string;
  resilientDeck: string;
  lateGameDeck: string;
  recoveryDeck: string;
  explosiveDeck: string;
  interactionDeck: string;
  verdict: string;
};

const CONTESTED_WINNER = "Contested";

function cleanLine(line: string): string {
  return line.replace(/\r/g, "").trim();
}

function displayLabelFromHeader(header: string, index: number): string {
  const fallback = `Deck ${String.fromCharCode(65 + index)}`;
  const clean = cleanLine(header)
    .replace(/:$/, "")
    .replace(/^Deck [A-C]\s*[-:]\s*/i, "")
    .trim();
  if (!clean) return fallback;
  const titleWithCommander = clean.match(/^(.+?)\s+\([^)]+\)$/);
  return (titleWithCommander?.[1]?.trim() || clean) || fallback;
}

function commanderHintFromHeader(header: string): string | null {
  const clean = cleanLine(header).replace(/:$/, "").trim();
  const match = clean.match(/^.+?\s+\(([^)]+)\)$/);
  const value = match?.[1]?.trim();
  if (!value || /^no commander$/i.test(value)) return null;
  return value;
}

function normalizePriceName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackDeckEntries(raw: string): Array<{ name: string; qty: number }> {
  return String(raw || "")
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line && !/^(deck|sideboard|maybeboard|commander)\b[:\s]*/i.test(line))
    .map((line) => {
      const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      return {
        name: (match ? match[2] : line).trim(),
        qty: match ? Math.max(1, Number(match[1]) || 1) : 1,
      };
    })
    .filter((row) => row.name.length > 1);
}

function countTagged(tags: string[], wanted: string[]): boolean {
  return wanted.some((tag) => tags.includes(tag));
}

function isLikelyLandCard(card: { name?: string; type_line?: string; is_land?: boolean }): boolean {
  if (isLandForDeck(card as Parameters<typeof isLandForDeck>[0])) return true;
  const name = String(card.name || "").toLowerCase();
  return /^(plains|island|swamp|mountain|forest|wastes)$/.test(name);
}

function cardTextSignals(card: { oracle_text?: string; type_line?: string; mana_cost?: string }): {
  ramp: boolean;
  draw: boolean;
  interaction: boolean;
  finisher: boolean;
} {
  const name = String((card as { name?: string }).name || "").toLowerCase();
  const text = `${String(card.oracle_text || "")} ${String(card.type_line || "")} ${String(card.mana_cost || "")} ${name}`.toLowerCase();
  return {
    ramp: /\badd \{[wubrgc]\}|\bsearch your library for (?:a|up to .*?) land\b|\bcreate (?:a|two|three|\w+) treasure token\b|\byou may play an additional land\b|\b(rampant growth|cultivate|kodama's reach|sol ring|arcane signet|signet|talisman|farseek|birds of paradise)\b/i.test(text),
    draw: /\bdraw (?:a|two|three|\w+) card\b|\bwhenever .* draw a card\b|\bat the beginning of .* draw\b|\binvestigate\b|\b(brainstorm|ponder|preordain|opt|rhystic study|mystic remora|the great henge)\b/i.test(text),
    interaction: /\bcounter target\b|\bdestroy target\b|\bexile target\b|\breturn target .* to .* hand\b|\bdeals? \d+ damage to target\b|\ball creatures get -\d|\b(counterspell|swords to plowshares|path to exile|beast within|chaos warp|cyclonic rift|farewell|vandalblast|lightning bolt)\b/i.test(text),
    finisher: /\bdouble strike\b|\bextra combat\b|\bcreatures you control get \+\d\/\+\d\b|\byou win the game\b|\bfor each creature you control\b|\bwhenever .* attacks\b|\b(craterhoof behemoth|thassa's oracle|exsanguinate|torment of hailfire|approach of the second sun|laboratory maniac)\b/i.test(text),
  };
}

function inferArchetypesFromTags(tagged: ReturnType<typeof tagCards>): string[] {
  const counts = new Map<string, number>();
  for (const card of tagged) {
    for (const tag of card.tags.map((entry) => entry.tag)) {
      if (!["tokens", "graveyard", "artifacts", "enchantments", "spellslinger", "blink", "landfall", "tribal", "lifegain", "sacrifice", "reanimator"].includes(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + (card.qty || 1));
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([tag]) => tag);
}

async function loadCompareEnrichedEntries(
  entries: Array<{ name: string; qty: number }>,
): Promise<Array<{ name: string; qty: number; type_line?: string; oracle_text?: string; color_identity?: string[]; cmc?: number; mana_cost?: string; legalities?: Record<string, string>; colors?: string[]; keywords?: string[]; is_land?: boolean; is_creature?: boolean; commander_eligible?: boolean }>> {
  const admin = getServiceRoleClient();
  const names = [...new Set(entries.map((row) => normalizeScryfallCacheName(row.name)).filter(Boolean))];
  if (admin && names.length) {
    const { data } = await admin
      .from("scryfall_cache")
      .select("name, type_line, oracle_text, color_identity, cmc, mana_cost, legalities, colors, keywords, is_land, is_creature")
      .in("name", names);
    const byName = new Map<string, any>();
    for (const row of data ?? []) byName.set(normalizeScryfallCacheName(String((row as any).name || "")), row);
    return entries.map((entry) => {
      const row = byName.get(normalizeScryfallCacheName(entry.name));
      return row
        ? {
            name: entry.name,
            qty: entry.qty,
            type_line: row.type_line ?? undefined,
            oracle_text: row.oracle_text ?? undefined,
            color_identity: Array.isArray(row.color_identity) ? row.color_identity : [],
            cmc: typeof row.cmc === "number" ? row.cmc : undefined,
            mana_cost: row.mana_cost ?? undefined,
            legalities: row.legalities ?? {},
            colors: Array.isArray(row.colors) ? row.colors : [],
            keywords: Array.isArray(row.keywords) ? row.keywords : [],
            commander_eligible: isCommanderEligible(row.type_line ?? undefined, row.oracle_text ?? undefined),
            ...(typeof row.is_land === "boolean" ? { is_land: row.is_land } : {}),
            ...(typeof row.is_creature === "boolean" ? { is_creature: row.is_creature } : {}),
          }
        : { name: entry.name, qty: entry.qty };
    });
  }
  const enriched = await enrichDeck(entries, {
    format: "Commander",
    commander: null,
  }).catch(() => []);
  return enriched.length ? enriched : entries.map((entry) => ({ name: entry.name, qty: entry.qty }));
}

async function loadPriceMap(entries: Array<{ name: string; qty: number }>): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const admin = getServiceRoleClient();
  if (!admin || entries.length === 0) return out;
  const keys = [...new Set(entries.map((entry) => normalizePriceName(entry.name)).filter(Boolean))];
  for (let i = 0; i < keys.length; i += 100) {
    const slice = keys.slice(i, i + 100);
    const { data } = await admin.from("price_cache").select("card_name, usd_price").in("card_name", slice);
    for (const row of data ?? []) {
      const name = String((row as { card_name?: string }).card_name || "");
      const usd = Number((row as { usd_price?: number | string | null }).usd_price ?? 0);
      if (name && Number.isFinite(usd) && usd > 0) out.set(name, usd);
    }
  }
  return out;
}

export function splitComparedDeckBlocks(raw: string): ComparedDeckBlock[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  const sections = text.split(/(?=^Deck [A-C][^\n]*:)/gim).map((chunk) => chunk.trim()).filter(Boolean);
  if (sections.length >= 2) {
    return sections.map((section, index) => {
      const lines = section.split(/\n/);
      const header = cleanLine(lines[0] || "") || `Deck ${String.fromCharCode(65 + index)}`;
      const deckText = lines.slice(1).join("\n").trim();
      return {
        label: displayLabelFromHeader(header, index),
        deckText,
        commanderHint: commanderHintFromHeader(header),
      };
    }).filter((entry) => entry.deckText.length > 0);
  }

  const dashedSections = text.split(/^\s*---\s*$/gm).map((chunk) => chunk.trim()).filter(Boolean);
  if (dashedSections.length >= 2) {
    return dashedSections.map((section, index) => {
      const lines = section.split(/\n/);
      const firstLine = cleanLine(lines[0] || "");
      const headerMatch = firstLine.match(/^(.+?):\s*$/);
      const label = headerMatch ? displayLabelFromHeader(headerMatch[1] || "", index) : `Deck ${String.fromCharCode(65 + index)}`;
      const deckText = lines.slice(headerMatch ? 1 : 0).join("\n").trim();
      return {
        label,
        deckText,
        commanderHint: headerMatch ? commanderHintFromHeader(headerMatch[1] || "") : null,
      };
    }).filter((entry) => entry.deckText.length > 0);
  }

  return [{ label: "Deck A", deckText: text, commanderHint: null }];
}

function scoreBand(value: number, low: number, high: number): "fast" | "medium" | "slow" {
  if (value <= low) return "fast";
  if (value >= high) return "slow";
  return "medium";
}

function winnerByNumber(
  entries: CompareDeckGrounding[],
  pick: (deck: CompareDeckGrounding) => number,
  direction: "max" | "min" = "max",
  minGap = 1,
): string {
  if (!entries.length) return CONTESTED_WINNER;
  const sorted = [...entries].sort((a, b) => {
    const av = pick(a);
    const bv = pick(b);
    if (av === bv) return a.label.localeCompare(b.label);
    if (direction === "max") return bv - av;
    return av - bv;
  });
  const first = sorted[0];
  const second = sorted[1];
  if (!first) return CONTESTED_WINNER;
  if (!second) return first.label;
  const gap = Math.abs(pick(first) - pick(second));
  return gap >= minGap ? first.label : CONTESTED_WINNER;
}

function buildGroundedVerdict(fasterDeck: string, lateGameDeck: string): string {
  if (fasterDeck === CONTESTED_WINNER && lateGameDeck === CONTESTED_WINNER) {
    return "No deck has a clean deterministic edge; the best pick depends on matchup speed, table context, and pilot comfort.";
  }
  if (fasterDeck === CONTESTED_WINNER) {
    return `${lateGameDeck} has the clearest long-game edge, while fast-game pressure is contested.`;
  }
  if (lateGameDeck === CONTESTED_WINNER) {
    return `${fasterDeck} has the clearest fast-game edge, while the long game is contested.`;
  }
  if (fasterDeck === lateGameDeck) {
    return `${fasterDeck} has the strongest combined fast-game and long-game read from the submitted lists.`;
  }
  return `${fasterDeck} looks quicker, while ${lateGameDeck} has the stronger long-game plan.`;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function densityScore(count: number, total: number, targetPct: number): number {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return clampScore((pct / targetPct) * 100);
}

function isFastManaCard(card: { name: string; oracle_text?: string; mana_cost?: string; cmc?: number; type_line?: string }): boolean {
  const name = card.name.toLowerCase();
  const text = `${card.oracle_text || ""} ${card.type_line || ""}`.toLowerCase();
  if (/\b(sol ring|mana crypt|mana vault|mox diamond|chrome mox|mox opal|jeweled lotus|lion's eye diamond|lotus petal)\b/i.test(name)) {
    return true;
  }
  const cmc = Number(card.cmc ?? 99);
  return cmc <= 1 && /\badd (?:one|two|three|\{[wubrgc]\})/i.test(text) && /artifact/i.test(text);
}

function isFreeOrCheapInteraction(card: { oracle_text?: string; mana_cost?: string; cmc?: number }): boolean {
  const text = String(card.oracle_text || "").toLowerCase();
  const cmc = Number(card.cmc ?? 99);
  return cmc <= 2 && /\bcounter target|destroy target|exile target|return target|deals? \d+ damage to target/i.test(text);
}

function priceTier(total: number | null): CompareDeckIntelligenceProfile["priceTier"] {
  if (total == null || total <= 0) return "unknown";
  if (total < 120) return "budget";
  if (total < 350) return "moderate";
  if (total < 900) return "premium";
  return "luxury";
}

function powerBand(score: number): CompareDeckIntelligenceProfile["powerBand"] {
  if (score >= 78) return "competitive";
  if (score >= 62) return "high";
  if (score >= 42) return "focused";
  return "casual";
}

function uniqueNames(cards: string[], max: number): string[] {
  return [...new Set(cards.filter(Boolean))].slice(0, max);
}

function topPricedCards(
  entries: Array<{ name: string; qty: number }>,
  priceByKey: Map<string, number>,
): string[] {
  return entries
    .map((entry) => ({
      name: entry.name,
      price: priceByKey.get(normalizePriceName(entry.name)) ?? 0,
    }))
    .filter((entry) => entry.price >= 15)
    .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((entry) => `${entry.name} ($${entry.price.toFixed(0)})`);
}

function buildIntelligenceProfile(args: {
  label: string;
  commander: string | null;
  entries: Array<{ name: string; qty: number }>;
  tagged: ReturnType<typeof tagCards>;
  facts: ReturnType<typeof buildDeckFacts>;
  priceByKey: Map<string, number>;
}): CompareDeckIntelligenceProfile {
  const { commander, entries, tagged, facts, priceByKey } = args;
  const nonlands = tagged.filter((card) => !isLikelyLandCard(card));
  const totalNonLand = Math.max(1, nonlands.reduce((sum, card) => sum + (card.qty || 0), 0));
  const synergy = buildSynergyDiagnostics(tagged, commander, facts);
  const plan = buildDeckPlanProfile(facts, synergy);
  const signalRampCards = nonlands.filter((card) => cardTextSignals(card).ramp).map((card) => card.name);
  const signalDrawCards = nonlands.filter((card) => cardTextSignals(card).draw).map((card) => card.name);
  const signalInteractionCards = nonlands.filter((card) => cardTextSignals(card).interaction).map((card) => card.name);
  const signalFinisherCards = nonlands.filter((card) => cardTextSignals(card).finisher).map((card) => card.name);

  const fastMana = nonlands.filter(isFastManaCard).length;
  const tutors = facts.role_counts.tutor ?? 0;
  const comboPieces = facts.role_counts.combo_piece ?? 0;
  const cheapInteraction = Math.max(nonlands.filter(isFreeOrCheapInteraction).length, signalInteractionCards.length);
  const rampCount = Math.max(facts.ramp_count, signalRampCards.length);
  const drawCount = Math.max(facts.draw_count, signalDrawCards.length);
  const interactionCount = Math.max(facts.interaction_count, signalInteractionCards.length);
  const finisherCount = Math.max(facts.role_counts.finisher ?? 0, signalFinisherCards.length);
  const lowCurveCards = (facts.curve_histogram[0] ?? 0) + (facts.curve_histogram[1] ?? 0);
  const highCurveCards = facts.curve_histogram[4] ?? 0;

  const totalPrice = entries.reduce((sum, entry) => {
    const price = priceByKey.get(normalizePriceName(entry.name));
    return price != null ? sum + price * (entry.qty || 1) : sum;
  }, 0);
  const pricedCount = entries.filter((entry) => priceByKey.has(normalizePriceName(entry.name))).length;
  const estimatedPriceUsd = pricedCount >= Math.max(10, entries.length * 0.35) ? Number(totalPrice.toFixed(2)) : null;

  const tempoScore = clampScore(
    35 +
      lowCurveCards * 1.2 +
      fastMana * 7 +
      rampCount * 1.4 -
      highCurveCards * 1.1 -
      Math.max(0, facts.avg_cmc - 3) * 8,
  );
  const interactionScore = densityScore(interactionCount + cheapInteraction, totalNonLand, 18);
  const cardFlowScore = densityScore(drawCount + tutors, totalNonLand, 18);
  const consistencyScore = clampScore(
    cardFlowScore * 0.42 +
      densityScore(tutors, totalNonLand, 5) * 0.18 +
      tempoScore * 0.18 +
      Math.max(0, 100 - Math.abs(facts.land_count - (facts.format === "Commander" ? 37 : 24)) * 5) * 0.22,
  );
  const resilienceScore = clampScore(
    cardFlowScore * 0.35 +
      interactionScore * 0.25 +
      densityScore(facts.role_counts.recursion ?? 0, totalNonLand, 6) * 0.2 +
      densityScore(facts.role_counts.protection ?? 0, totalNonLand, 5) * 0.2,
  );
  const closingScore = clampScore(
    densityScore(finisherCount, totalNonLand, 8) * 0.45 +
      densityScore(comboPieces, totalNonLand, 5) * 0.25 +
      densityScore(facts.role_counts.payoff ?? 0, totalNonLand, 10) * 0.2 +
      tempoScore * 0.1,
  );
  const manaQualityScore = clampScore(
    45 +
      rampCount * 3 +
      (facts.role_counts.fixing ?? 0) * 2 -
      facts.off_color_cards.length * 12 -
      facts.banned_cards.length * 20 -
      Math.abs(facts.land_count - (facts.format === "Commander" ? 37 : 24)) * 2,
  );
  const synergyScore = clampScore(
    plan.overallConfidence * 45 +
      Math.min(30, synergy.core_cards.length * 1.2) +
      Math.min(25, synergy.primary_engine_cards.length + synergy.primary_payoff_cards.length),
  );
  const commanderCard = commander
    ? tagged.find((card) => card.name.toLowerCase() === commander.toLowerCase())
    : null;
  const commanderTags = new Set(commanderCard?.tags.map((entry) => entry.tag) ?? []);
  const deckTagCounts = new Map<string, number>();
  for (const card of nonlands) {
    for (const { tag } of card.tags) deckTagCounts.set(tag, (deckTagCounts.get(tag) ?? 0) + (card.qty || 1));
  }
  const commanderOverlap = [...commanderTags].reduce((sum, tag) => sum + Math.min(deckTagCounts.get(tag) ?? 0, 12), 0);
  const commanderSynergyScore = commander
    ? clampScore(35 + commanderOverlap * 4 + (plan.primaryPlan.confidence || 0) * 25)
    : null;
  const powerScore = clampScore(
    tempoScore * 0.2 +
      consistencyScore * 0.2 +
      interactionScore * 0.16 +
      closingScore * 0.2 +
      manaQualityScore * 0.12 +
      Math.min(100, fastMana * 16 + tutors * 4 + comboPieces * 5) * 0.12,
  );

  const weakSignals = uniqueNames(
    [
      ...synergy.missing_support,
      ...synergy.tension_flags,
      facts.uncertainty_flags.includes("ambiguous_archetype") ? "Primary plan is ambiguous" : "",
      manaQualityScore < 45 ? "Mana base looks unstable" : "",
      consistencyScore < 45 ? "Consistency tools look light" : "",
      interactionScore < 40 ? "Interaction density is low" : "",
      closingScore < 40 ? "Closing plan may be underpowered" : "",
    ],
    5,
  );

  const intent = plan.primaryPlan.name !== "unknown"
    ? plan.primaryPlan.name
    : facts.curve_profile !== "unknown"
      ? facts.curve_profile
      : "midrange";

  return {
    intent,
    secondaryIntent: plan.secondaryPlan?.name ?? null,
    powerScore,
    powerBand: powerBand(powerScore),
    consistencyScore,
    tempoScore,
    interactionScore,
    resilienceScore,
    closingScore,
    manaQualityScore,
    synergyScore,
    commanderSynergyScore,
    estimatedPriceUsd,
    priceTier: priceTier(estimatedPriceUsd),
    keyCards: uniqueNames([...synergy.core_cards, ...synergy.primary_engine_cards, ...synergy.primary_payoff_cards, ...signalRampCards, ...signalDrawCards, ...signalInteractionCards, ...signalFinisherCards], 8),
    engineCards: uniqueNames([...synergy.primary_engine_cards, ...signalRampCards, ...signalDrawCards], 5),
    payoffCards: uniqueNames([...synergy.primary_payoff_cards, ...signalFinisherCards], 5),
    premiumCards: topPricedCards(entries, priceByKey),
    weakSignals,
    matchupRead: `${intent} ${powerBand(powerScore)} shell: tempo ${tempoScore}, consistency ${consistencyScore}, interaction ${interactionScore}, closing ${closingScore}.`,
  };
}

export async function buildDeckCompareGrounding(
  decksRaw: string,
  formatLabel: string,
): Promise<{ decks: CompareDeckGrounding[]; matrix: DeterministicComparisonMatrix }> {
  const blocks = splitComparedDeckBlocks(decksRaw).slice(0, 3);
  const decks: CompareDeckGrounding[] = [];

  for (const [index, block] of blocks.entries()) {
    const parsed = parseDeckText(block.deckText);
    const entries = parsed.length >= 20 ? parsed : fallbackDeckEntries(block.deckText);
    const entryRows = entries.map((row) => ({ name: row.name, qty: row.qty }));
    const [enriched, priceByKey] = await Promise.all([
      loadCompareEnrichedEntries(entryRows),
      loadPriceMap(entryRows).catch(() => new Map<string, number>()),
    ]);
    const tagged = tagCards(enriched);
    const commander = block.commanderHint ?? enriched.find((card) => card.commander_eligible)?.name ?? null;
    const facts = buildDeckFacts(tagged, {
      format: (formatLabel as "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper") || "Commander",
      commander,
    });
    const totalCards = Math.max(1, entries.reduce((sum, row) => sum + (row.qty || 0), 0));
    const lands = facts.land_count ?? tagged.filter((card) => card.is_land).reduce((sum, card) => sum + (card.qty || 0), 0);
    const uniqueNonLandCards = tagged.filter((card) => !isLikelyLandCard(card));
    const totalNonLand = Math.max(1, uniqueNonLandCards.length);
    const ramp = uniqueNonLandCards.filter((card) => {
      const tags = card.tags.map((entry) => entry.tag);
      const signals = cardTextSignals(card);
      return signals.ramp || countTagged(tags, ["ramp_land", "mana_rock", "ramp_rocks"]);
    }).length;
    const draw = uniqueNonLandCards.filter((card) => {
      const tags = card.tags.map((entry) => entry.tag);
      const signals = cardTextSignals(card);
      return signals.draw || countTagged(tags, ["card_draw", "repeatable_draw", "draw_repeatable", "draw_burst"]);
    }).length;
    const removal = uniqueNonLandCards.filter((card) => {
      const tags = card.tags.map((entry) => entry.tag);
      const signals = cardTextSignals(card);
      return signals.interaction || countTagged(tags, ["interaction", "spot_removal", "board_wipe", "counterspell", "removal_single", "removal_boardwipe"]);
    }).length;
    const wincons = uniqueNonLandCards.filter((card) => {
      const tags = card.tags.map((entry) => entry.tag);
      const signals = cardTextSignals(card);
      return signals.finisher || countTagged(tags, ["finisher"]);
    }).length;
    const curveTop = facts.curve_histogram?.[4] ?? 0;
    const speedScore = ((facts.curve_histogram?.[0] ?? 0) + (facts.curve_histogram?.[1] ?? 0) + ramp) - curveTop;
    const resilience = draw + Math.max(0, removal - 2) + Math.max(0, wincons - 1);
    const manaStability = lands + ramp;
    const archetypes = facts.archetype_candidates.length
      ? facts.archetype_candidates.slice(0, 2).map((entry) => entry.name)
      : inferArchetypesFromTags(tagged);
    const intelligence = buildIntelligenceProfile({
      label: block.label || `Deck ${String.fromCharCode(65 + index)}`,
      commander,
      entries: entryRows,
      tagged,
      facts,
      priceByKey,
    });

    decks.push({
      label: block.label || `Deck ${String.fromCharCode(65 + index)}`,
      commander,
      format: formatLabel,
      cardCount: totalCards,
      speedScore,
      speed: scoreBand(speedScore, 10, 18),
      resilience,
      interactionDensity: Math.round((removal / totalNonLand) * 100),
      drawDensity: Math.round((draw / totalNonLand) * 100),
      rampDensity: Math.round((ramp / totalNonLand) * 100),
      finisherDensity: Math.round((wincons / totalNonLand) * 100),
      manaStability,
      archetypes,
      intelligence,
      summary: [
        `${intelligence.intent}${intelligence.secondaryIntent ? `/${intelligence.secondaryIntent}` : ""}`,
        `${intelligence.powerBand} power ${intelligence.powerScore}`,
        `tempo ${intelligence.tempoScore}`,
        `consistency ${intelligence.consistencyScore}`,
        `interaction ${intelligence.interactionScore}`,
        `closing ${intelligence.closingScore}`,
        intelligence.estimatedPriceUsd != null ? `price $${Math.round(intelligence.estimatedPriceUsd)}` : "",
      ].filter(Boolean).join(" | "),
    });
  }

  const fasterDeck = winnerByNumber(decks, (deck) => deck.intelligence.tempoScore, "max", 6);
  const resilientDeck = winnerByNumber(decks, (deck) => deck.intelligence.resilienceScore, "max", 6);
  const lateGameDeck = winnerByNumber(decks, (deck) => deck.intelligence.resilienceScore + deck.intelligence.closingScore, "max", 10);
  const recoveryDeck = winnerByNumber(decks, (deck) => deck.intelligence.consistencyScore + deck.intelligence.resilienceScore, "max", 10);
  const explosiveDeck = winnerByNumber(decks, (deck) => deck.intelligence.closingScore + deck.intelligence.tempoScore, "max", 10);
  const interactionDeck = winnerByNumber(decks, (deck) => deck.intelligence.interactionScore, "max", 6);

  const matrix: DeterministicComparisonMatrix = {
    fasterDeck,
    resilientDeck,
    lateGameDeck,
    recoveryDeck,
    explosiveDeck,
    interactionDeck,
    verdict: buildGroundedVerdict(fasterDeck, lateGameDeck),
  };

  return { decks, matrix };
}
