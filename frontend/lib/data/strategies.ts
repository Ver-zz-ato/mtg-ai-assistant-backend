/**
 * Commander strategy definitions for discovery landing pages.
 * tagMatches maps to commander preferTags for overlap matching.
 */

export type StrategyDef = {
  slug: string;
  title: string;
  tagMatches: string[];
  intro: string;
};

export const STRATEGIES: StrategyDef[] = [
  {
    slug: "ramp",
    title: "Ramp",
    tagMatches: ["ramp", "lands"],
    intro: `Ramp strategies accelerate your mana to cast bigger spells sooner. Land ramp, mana rocks, and dorks get you ahead of the table. Commanders like Chulane, Aesi, and Omnath reward you for playing lands and creatures. Ramp decks tend to be proactive—you're building toward a dominant board rather than reacting.`,
  },
  {
    slug: "tokens",
    title: "Tokens",
    tagMatches: ["tokens"],
    intro: `Token strategies flood the board with creature tokens. Go wide for combat, sacrifice for value, or scale with anthem effects. Rhys, Krenko, and Edgar Markov are classic token commanders. Token decks reward redundancy and synergy—the more tokens you make, the better your payoffs.`,
  },
  {
    slug: "sacrifice",
    title: "Sacrifice",
    tagMatches: ["sacrifice"],
    intro: `Sacrifice decks use creatures as resources. Outlets convert creatures into card draw, mana, or damage. Korvold, Prossh, and Teysa Karlov turn sacrifice into value engines. The archetype is resilient to removal—your creatures dying often advances your plan.`,
  },
  {
    slug: "control",
    title: "Control",
    tagMatches: ["control"],
    intro: `Control strategies focus on answering threats and outlasting opponents. Counterspells, removal, and card advantage form the core. Teferi, Y'shtola, and similar commanders reward instant-speed interaction and resource management. Control decks win slowly but decisively.`,
  },
  {
    slug: "aggro",
    title: "Aggro",
    tagMatches: ["aggro"],
    intro: `Aggro decks apply pressure early and often. Low-curve creatures, haste, and combat tricks close games before opponents stabilize. Edgar Markov, Xenagos, and Isshin lead aggressive strategies. Aggro rewards tight curves and knowing when to commit or hold back.`,
  },
  {
    slug: "combo",
    title: "Combo",
    tagMatches: ["combo"],
    intro: `Combo decks win through specific card interactions. Two or more cards combine for infinite mana, damage, or value. Kenrith, Breya, and similar commanders enable or protect combo lines. Combo decks require knowing your lines and protecting key pieces.`,
  },
];

export function getStrategyBySlug(slug: string): StrategyDef | null {
  return STRATEGIES.find((s) => s.slug === slug) ?? null;
}

export function getAllStrategySlugs(): string[] {
  return STRATEGIES.map((s) => s.slug);
}
