/**
 * Deterministic Deck Plan / Synergy Graph Engine (V1).
 * Computes primary plan, role clusters, synergy chains, tensions, missing roles, win routes.
 * Used to ground chat AI deck analysis in structured facts.
 */

import type { DeckFacts } from "./deck-facts";
import type { SynergyDiagnostics } from "./synergy-diagnostics";
import { detectAntiSynergies } from "./antiSynergy";

export type RoleCluster = {
  role: "setup" | "enablers" | "payoffs" | "interaction" | "protection" | "card_flow" | "finishers" | "glue";
  cardNames: string[];
  count: number;
};

export type SynergyChain = {
  description: string;
  cards: string[];
  confidence: number;
};

export type TensionSignal = {
  description: string;
  category: string;
  confidence: number;
};

export type MissingRoleSignal = {
  role: string;
  description: string;
  severity: "high" | "medium" | "low";
};

export type WinRoute = {
  type: "combat" | "go_wide" | "engine" | "combo" | "drain" | "unknown";
  description: string;
  confidence: number;
};

export type DeckPlanProfile = {
  primaryPlan: { name: string; confidence: number };
  secondaryPlan: { name: string; confidence: number } | null;
  roleClusters: RoleCluster[];
  synergyChains: SynergyChain[];
  tensionSignals: TensionSignal[];
  missingRoles: MissingRoleSignal[];
  winRoutes: WinRoute[];
  overallConfidence: number;
};

const ROLE_TO_CLUSTER: Record<string, RoleCluster["role"]> = {
  ramp: "setup",
  land_ramp: "setup",
  mana_rock: "setup",
  mana_dork: "setup",
  graveyard_setup: "setup",
  sac_outlet: "enablers",
  token_producer: "enablers",
  recursion: "enablers",
  blink: "enablers",
  engine: "enablers",
  etb_enabler: "enablers",
  death_payoff: "payoffs",
  token_payoff: "payoffs",
  payoff: "payoffs",
  finisher: "finishers",
  counterspell: "interaction",
  spot_removal: "interaction",
  board_wipe: "interaction",
  graveyard_hate: "interaction",
  artifact_hate: "interaction",
  draw: "card_flow",
  impulse_draw: "card_flow",
  repeatable_draw: "card_flow",
  tutor: "card_flow",
};

const WIN_PATTERN_TO_ROUTE: Record<string, WinRoute["type"]> = {
  combat: "combat",
  drain: "drain",
  combo: "combo",
  mill: "engine",
};

export type DeckPlanProfileOptions = {
  rampCards?: string[];
  drawCards?: string[];
  removalCards?: string[];
};

/**
 * Build a structured deck plan profile from deck_facts and synergy_diagnostics.
 * Pass options.rampCards, options.drawCards, options.removalCards when available
 * (e.g. from DeckContextSummary) for richer role clusters.
 */
export function buildDeckPlanProfile(
  deckFacts: DeckFacts,
  synergyDiagnostics: SynergyDiagnostics,
  options?: DeckPlanProfileOptions
): DeckPlanProfile {
  const allCardNames = [
    ...synergyDiagnostics.core_cards,
    ...synergyDiagnostics.support_cards,
    ...synergyDiagnostics.peripheral_cards,
  ];

  const primary = deckFacts.archetype_candidates[0];
  const secondary = deckFacts.archetype_candidates[1];
  const primaryConf = primary?.score ?? 0;
  const secondaryConf = secondary?.score ?? 0;
  const hasCloseSecond = secondary && primary && primaryConf - secondaryConf < 0.2 && secondaryConf > 0.3;

  const primaryPlan = {
    name: primary?.name ?? "unknown",
    confidence: primaryConf,
  };
  const secondaryPlan = hasCloseSecond && secondary
    ? { name: secondary.name, confidence: secondaryConf }
    : null;

  const roleClusters = buildRoleClusters(deckFacts, synergyDiagnostics, options);
  const synergyChains = buildSynergyChains(deckFacts, synergyDiagnostics);
  const tensionSignals = buildTensionSignals(deckFacts, synergyDiagnostics, allCardNames);
  const missingRoles = buildMissingRoleSignals(deckFacts);
  const winRoutes = buildWinRoutes(deckFacts);

  const confidences = [primaryConf, ...synergyChains.map((c) => c.confidence), ...tensionSignals.map((t) => t.confidence)];
  const overallConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0.5;

  return {
    primaryPlan,
    secondaryPlan,
    roleClusters,
    synergyChains,
    tensionSignals,
    missingRoles,
    winRoutes,
    overallConfidence,
  };
}

function buildRoleClusters(
  deckFacts: DeckFacts,
  synergyDiagnostics: SynergyDiagnostics,
  options?: DeckPlanProfileOptions
): RoleCluster[] {
  const roles: RoleCluster["role"][] = ["setup", "enablers", "payoffs", "interaction", "card_flow", "finishers", "glue"];
  const clusters: RoleCluster[] = [];

  const engineCards = new Set(synergyDiagnostics.primary_engine_cards);
  const payoffCards = new Set(synergyDiagnostics.primary_payoff_cards);

  const setupCards: string[] = [];
  const enablerCards: string[] = [...synergyDiagnostics.primary_engine_cards];
  const payoffList: string[] = [...synergyDiagnostics.primary_payoff_cards];
  const interactionCards: string[] = [];
  const cardFlowCards: string[] = [];
  const finisherCards: string[] = [];
  const glueCards: string[] = [];

  for (const [tag, count] of Object.entries(deckFacts.role_counts)) {
    const clusterRole = ROLE_TO_CLUSTER[tag];
    if (clusterRole === "setup") {
      const cards = getCardsForTag(deckFacts, synergyDiagnostics, tag, options);
      setupCards.push(...cards.filter((c) => !setupCards.includes(c)));
    } else if (clusterRole === "interaction") {
      const cards = getCardsForTag(deckFacts, synergyDiagnostics, tag, options);
      interactionCards.push(...cards.filter((c) => !interactionCards.includes(c)));
    } else if (clusterRole === "card_flow") {
      const cards = getCardsForTag(deckFacts, synergyDiagnostics, tag, options);
      cardFlowCards.push(...cards.filter((c) => !cardFlowCards.includes(c)));
    } else if (clusterRole === "finishers") {
      const cards = getCardsForTag(deckFacts, synergyDiagnostics, tag, options);
      finisherCards.push(...cards.filter((c) => !finisherCards.includes(c)));
    }
  }

  if (deckFacts.ramp_count > 0) {
    const rampTags = ["ramp", "land_ramp", "mana_rock", "mana_dork"];
    for (const tag of rampTags) {
      const cards = getCardsForTag(deckFacts, synergyDiagnostics, tag, options);
      cards.forEach((c) => { if (!setupCards.includes(c)) setupCards.push(c); });
    }
  }

  const allAssigned = new Set([...setupCards, ...enablerCards, ...payoffList, ...interactionCards, ...cardFlowCards, ...finisherCards]);
  const peripheral = synergyDiagnostics.peripheral_cards.filter((c) => !allAssigned.has(c));
  glueCards.push(...peripheral.slice(0, 15));

  if (setupCards.length) clusters.push({ role: "setup", cardNames: setupCards, count: setupCards.length });
  if (enablerCards.length) clusters.push({ role: "enablers", cardNames: enablerCards, count: enablerCards.length });
  if (payoffList.length) clusters.push({ role: "payoffs", cardNames: payoffList, count: payoffList.length });
  if (interactionCards.length) clusters.push({ role: "interaction", cardNames: interactionCards, count: interactionCards.length });
  if (cardFlowCards.length) clusters.push({ role: "card_flow", cardNames: cardFlowCards, count: cardFlowCards.length });
  if (finisherCards.length) clusters.push({ role: "finishers", cardNames: finisherCards, count: finisherCards.length });
  if (glueCards.length) clusters.push({ role: "glue", cardNames: glueCards, count: glueCards.length });

  return clusters;
}

function getCardsForTag(
  deckFacts: DeckFacts,
  synergyDiagnostics: SynergyDiagnostics,
  tag: string,
  options?: DeckPlanProfileOptions
): string[] {
  if (tag === "ramp" && options?.rampCards?.length) return options.rampCards;
  if (tag === "land_ramp" && options?.rampCards?.length) return options.rampCards;
  if (tag === "mana_rock" || tag === "mana_dork") return [];
  if (tag === "draw" && options?.drawCards?.length) return options.drawCards;
  if (tag === "spot_removal" && options?.removalCards?.length) return options.removalCards;
  if (tag === "board_wipe" || tag === "graveyard_hate" || tag === "artifact_hate") return [];
  if (tag === "finisher" || tag === "payoff") {
    return synergyDiagnostics.primary_payoff_cards.slice(0, 6);
  }
  const clusters = synergyDiagnostics.top_synergy_clusters;
  for (const cluster of clusters) {
    if (cluster.length >= 3) return cluster;
  }
  return [];
}

function buildSynergyChains(
  deckFacts: DeckFacts,
  synergyDiagnostics: SynergyDiagnostics
): SynergyChain[] {
  const chains: SynergyChain[] = [];
  const engines = synergyDiagnostics.primary_engine_cards.slice(0, 3);
  const payoffs = synergyDiagnostics.primary_payoff_cards.slice(0, 3);

  if (engines.length >= 1 && payoffs.length >= 1) {
    const topArchetype = deckFacts.archetype_candidates[0]?.name ?? "midrange";
    chains.push({
      description: `${engines[0]} enables ${payoffs[0]}, supporting ${topArchetype} plan`,
      cards: [engines[0], payoffs[0]],
      confidence: deckFacts.archetype_candidates[0]?.score ?? 0.5,
    });
  }
  if (engines.length >= 2 && payoffs.length >= 2) {
    chains.push({
      description: `${engines[1]} works with payoff cards like ${payoffs.slice(0, 2).join(", ")}`,
      cards: [engines[1], ...payoffs.slice(0, 2)],
      confidence: 0.6,
    });
  }
  const topCluster = synergyDiagnostics.top_synergy_clusters[0];
  if (topCluster && topCluster.length >= 3) {
    chains.push({
      description: `Synergy cluster: ${topCluster.slice(0, 3).join(" → ")}`,
      cards: topCluster.slice(0, 4),
      confidence: 0.7,
    });
  }
  return chains.slice(0, 3);
}

function buildTensionSignals(
  deckFacts: DeckFacts,
  synergyDiagnostics: SynergyDiagnostics,
  cardNames: string[]
): TensionSignal[] {
  const signals: TensionSignal[] = [];

  for (const t of synergyDiagnostics.tension_flags) {
    signals.push({ description: t, category: "curve_ramp", confidence: 0.8 });
  }
  for (const m of synergyDiagnostics.missing_support) {
    signals.push({ description: m, category: "missing_support", confidence: 0.85 });
  }

  const antiSynergies = detectAntiSynergies(cardNames, deckFacts.commander);
  for (const a of antiSynergies.slice(0, 3)) {
    signals.push({
      description: a.description,
      category: a.category,
      confidence: a.severity === "severe" ? 0.9 : a.severity === "moderate" ? 0.8 : 0.7,
    });
  }
  return signals;
}

function buildMissingRoleSignals(deckFacts: DeckFacts): MissingRoleSignal[] {
  const signals: MissingRoleSignal[] = [];
  const fmt = deckFacts.format;

  if (deckFacts.interaction_count < 5 && deckFacts.nonland_count > 30) {
    signals.push({
      role: "interaction",
      description: "Low interaction count for format",
      severity: deckFacts.interaction_count < 3 ? "high" : "medium",
    });
  }
  if (deckFacts.draw_count < 6 && deckFacts.nonland_count > 40) {
    signals.push({
      role: "draw",
      description: "Limited card draw",
      severity: deckFacts.draw_count < 4 ? "high" : "medium",
    });
  }
  if (fmt === "Commander" && deckFacts.ramp_count < 6 && deckFacts.avg_cmc > 3.5) {
    signals.push({
      role: "ramp",
      description: "High curve with limited ramp",
      severity: "high",
    });
  }
  const recursion = deckFacts.role_counts["recursion"] ?? 0;
  const gySetup = deckFacts.role_counts["graveyard_setup"] ?? 0;
  if (recursion >= 3 && gySetup < 2) {
    signals.push({
      role: "graveyard_setup",
      description: "Recursion present but limited graveyard setup",
      severity: "medium",
    });
  }
  return signals;
}

function buildWinRoutes(deckFacts: DeckFacts): WinRoute[] {
  const routes: WinRoute[] = [];
  const winPatterns = deckFacts.win_pattern_candidates;

  for (const wp of winPatterns.slice(0, 3)) {
    const type = WIN_PATTERN_TO_ROUTE[wp.name] ?? "unknown";
    const desc = type === "combat" ? "Combat damage / board dominance" :
      type === "drain" ? "Lifedrain / incremental damage" :
      type === "combo" ? "Combo finish" :
      type === "engine" ? "Value engine into inevitability" :
      "Win via " + wp.name;
    routes.push({
      type,
      description: desc,
      confidence: wp.score,
    });
  }
  if (routes.length === 0) {
    routes.push({
      type: "unknown",
      description: "Primary win route unclear from role tags",
      confidence: 0.3,
    });
  }
  return routes;
}
