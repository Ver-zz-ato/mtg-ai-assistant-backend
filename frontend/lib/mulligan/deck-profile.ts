/**
 * Deterministic deck profile builder for mulligan AI advice.
 * Uses name-based heuristics only (no DB, no LLM).
 */

import type { ParsedCard } from "./parse-decklist";

export type DeckProfile = {
  format: "commander";
  totalCards: number;
  landCount: number;
  rampCount: number;
  drawCount: number;
  removalCount: number;
  protectionCount: number;
  avgCmc?: number | null;
  commander?: string | null;
  archetypeHints: string[];
  earlyGamePriorities: string[];
  notes: string[];
};

const RAMP_NAMES = [
  "sol ring", "arcane signet", "mind stone", "thought vessel", "fellwar stone",
  "rampant growth", "cultivate", "kodama's reach", "farseek", "nature's lore",
  "three visits", "llanowar elves", "elves of deep shadow", "birds of paradise",
  "arbor elf", "elvish mystic", "fyndhorn elves", "avacyn's pilgrim",
  "signet", "talisman", "mana crypt", "mana vault", "grim monolith",
  "chromatic lantern", "commander's sphere",
];

const DRAW_NAMES = [
  "rhystic study", "mystic remora", "brainstorm", "ponder", "preordain",
  "serum visions", "opt", "chart a course", "treasure cruise", "dig through time",
  "windfall", "wheel of fortune", "reforge the soul", "echo of eons",
  "sylvan library", "necropotence", "phyrexian arena", "dark confidant",
  "harmonize", "night's whisper", "read the bones", "sign in blood",
  "fact or fiction", "treasure cruise", "dig through time",
];

const REMOVAL_NAMES = [
  "swords to plowshares", "path to exile", "pongify", "rapid hybridization",
  "beast within", "chaos warp", "generous gift", "counterspell",
  "mana drain", "force of will", "force of negation", "swan song",
  "nature's claim", "naturalize", "return to nature", "cyclonic rift",
  "terminate", "dreadbore", "hero's downfall", "assassin's trophy",
  "abrupt decay", "vindicate", "angrath's fury",
];

const PROTECTION_NAMES = [
  "swan song", "flusterstorm", "veil of summer", "heroic intervention",
  "lightning greaves", "swiftfoot boots", "teferi's protection",
  "counterspell", "force of will", "force of negation", "pact of negation",
];

function nameMatches(name: string, list: string[]): boolean {
  const n = name.toLowerCase().trim();
  return list.some((k) => n.includes(k) || k.includes(n));
}

export function buildDeckProfile(
  cards: ParsedCard[],
  commander?: string | null
): DeckProfile {
  let landCount = 0;
  let rampCount = 0;
  let drawCount = 0;
  let removalCount = 0;
  let protectionCount = 0;
  const totalCards = cards.reduce((s, c) => s + c.count, 0);

  for (const { name, count } of cards) {
    const n = name.toLowerCase();
    if (/\bland\b|island|mountain|forest|plains|swamp|dual|fetch|shock|triome|pathway|basic\s+land/i.test(n)) {
      landCount += count;
    }
    if (nameMatches(name, RAMP_NAMES)) rampCount += count;
    if (nameMatches(name, DRAW_NAMES)) drawCount += count;
    if (nameMatches(name, REMOVAL_NAMES)) removalCount += count;
    if (nameMatches(name, PROTECTION_NAMES)) protectionCount += count;
  }

  const archetypeHints: string[] = [];
  if (rampCount >= 12) archetypeHints.push("ramp-heavy");
  if (drawCount >= 10) archetypeHints.push("draw-heavy");
  if (removalCount >= 10) archetypeHints.push("interaction-heavy");
  if (protectionCount >= 5) archetypeHints.push("protection");
  if (landCount >= 38) archetypeHints.push("lands-matter");
  if (rampCount >= 8 && drawCount >= 8) archetypeHints.push("value-engine");

  const earlyGamePriorities: string[] = [];
  if (landCount < 33) earlyGamePriorities.push("prioritize lands");
  if (rampCount >= 8) earlyGamePriorities.push("prioritize early ramp");
  if (protectionCount >= 4) earlyGamePriorities.push("prioritize protection");
  if (drawCount >= 8) earlyGamePriorities.push("prioritize card draw");
  if (earlyGamePriorities.length === 0) earlyGamePriorities.push("balanced curve");

  const notes: string[] = [];
  if (totalCards > 0) {
    const landPct = ((landCount / totalCards) * 100).toFixed(0);
    notes.push(`${landPct}% lands`);
    notes.push(`${rampCount} ramp, ${drawCount} draw, ${removalCount} removal`);
  }

  return {
    format: "commander",
    totalCards,
    landCount,
    rampCount,
    drawCount,
    removalCount,
    protectionCount,
    avgCmc: null,
    commander: commander || null,
    archetypeHints,
    earlyGamePriorities,
    notes,
  };
}
