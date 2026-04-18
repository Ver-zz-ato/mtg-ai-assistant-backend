/**
 * Lightweight deck signals for mobile roast prompts — name-based heuristics only.
 * The model still validates against the full list; these nudge it toward concrete stats.
 */

export type RoastDeckSignals = {
  totalCards: number;
  landSlots: number;
  nonlandSlots: number;
  rampSlots: number;
  boardWipeSlots: number;
  cardDrawSlots: number;
  finisherSlots: number;
  greedyLandSlots: number;
  basicLandSlots: number;
  blockForPrompt: string;
};

function nk(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\s+/g, " ");
}

function cardQty(c: { name: string; qty: number }): number {
  const q = Number(c.qty);
  return Number.isFinite(q) && q > 0 ? q : 0;
}

const BASIC_LAND = /^(snow-covered )?(plains|island|swamp|mountain|forest|wastes)$/i;

const FETCH_OR_SHOCK = new Set(
  [
    "arid mesa",
    "bloodstained mire",
    "flooded strand",
    "marsh flats",
    "misty rainforest",
    "polluted delta",
    "scalding tarn",
    "verdant catacombs",
    "windswept heath",
    "wooded foothills",
    "prismatic vista",
    "steam vents",
    "watery grave",
    "blood crypt",
    "stomping ground",
    "temple garden",
    "hallowed fountain",
    "godless shrine",
    "sacred foundry",
    "breeding pool",
    "overgrown tomb",
  ].map(nk)
);

const KNOWN_LANDS = new Set(
  [
    "command tower",
    "path of ancestry",
    "exotic orchard",
    "mana confluence",
    "city of brass",
    "reflecting pool",
    "tarnished citadel",
    "ancient tomb",
    "gaea's cradle",
    "serra's sanctum",
    "boseiju, who endures",
    "otawara, soaring city",
    "reliquary tower",
    "rogue's passage",
    "strip mine",
    "wasteland",
    "ghost quarter",
    "field of the dead",
    "cabal coffers",
    "urborg, tomb of yawgmoth",
    "nykthos, shrine to nyx",
    "maze of ith",
    "kor haven",
    "vault of champions",
    "undergrowth stadium",
    "training center",
    "rejuvenating springs",
    "spectator seating",
    "luxury suite",
    "riverglide pathway",
    "branchloft pathway",
    "cragcrown pathway",
    "barkchannel pathway",
    "brightclimb pathway",
    "clearwater pathway",
    "needleverge pathway",
    "darkbore pathway",
    "blightstep pathway",
    "evolving wilds",
    "terramorphic expanse",
    "fabled passage",
    "myriad landscape",
    "bojuka bog",
    "scavenger grounds",
    "war room",
    "castle garenbrig",
    "castle vantress",
    "castle locthwain",
    "castle ardenvale",
    "emergence zone",
  ].map((s) => nk(s.split("//")[0].trim()))
);

const TRIOME = / triome$/i;

const RAMP = new Set(
  [
    "sol ring",
    "arcane signet",
    "mana crypt",
    "mana vault",
    "grim monolith",
    "basalt monolith",
    "fellwar stone",
    "mind stone",
    "thought vessel",
    "talisman of dominance",
    "talisman of impulse",
    "talisman of hierarchy",
    "talisman of indulgence",
    "talisman of progress",
    "talisman of unity",
    "talisman of resilience",
    "talisman of curiosity",
    "boros signet",
    "azorius signet",
    "izzet signet",
    "simic signet",
    "selesnya signet",
    "golgari signet",
    "rakdos signet",
    "gruul signet",
    "orzhov signet",
    "dimir signet",
    "cultivate",
    "kodama's reach",
    "rampant growth",
    "nature's lore",
    "three visits",
    "farseek",
    "skyshroud claim",
    "birds of paradise",
    "llanowar elves",
    "elvish mystic",
    "fyndhorn elves",
    "arbor elf",
    "deathrite shaman",
    "smothering tithe",
    "dockside extortionist",
    "sakura-tribe elder",
    "springbloom druid",
    "wood elves",
    "farhaven elf",
    "exploration",
    "burgeoning",
    "azusa, lost but seeking",
    "dryad of the ilysian grove",
    "jeweled lotus",
    "lotus petal",
    "chrome mox",
    "mox diamond",
    "mox opal",
    "springleaf drum",
  ].map(nk)
);

const WIPES = new Set(
  [
    "wrath of god",
    "damnation",
    "blasphemous act",
    "toxic deluge",
    "austere command",
    "merciless eviction",
    "ruinous ultimatum",
    "farewell",
    "supreme verdict",
    "cyclonic rift",
    "living death",
    "patriarch's bidding",
    "sunfall",
    "vanquish the horde",
    "chain reaction",
    "starstorm",
    "subterranean tremors",
    "fire covenant",
    "crux of fate",
    "bane of progress",
  ].map(nk)
);

const DRAW = new Set(
  [
    "rhystic study",
    "mystic remora",
    "consecrated sphinx",
    "necropotence",
    "phyrexian arena",
    "sylvan library",
    "esper sentinel",
    "beast whisperer",
    "guardian project",
    "kindred discovery",
    "greater good",
    "mind's eye",
    "howling mine",
    "blue sun's zenith",
    "pull from tomorrow",
    "finale of revelation",
    "night's whisper",
    "read the bones",
    "sign in blood",
    "painful truths",
    "fact or fiction",
    "memory deluge",
    "treasure cruise",
    "dig through time",
    "ponder",
    "preordain",
    "brainstorm",
    "faithless looting",
  ].map(nk)
);

const FINISHERS = new Set(
  [
    "craterhoof behemoth",
    "triumph of the hordes",
    "thassa's oracle",
    "jace, wielder of mysteries",
    "laboratory maniac",
    "approach of the second sun",
    "torment of hailfire",
    "exsanguinate",
    "debt to the deathless",
    "aetherflux reservoir",
    "revel in riches",
    "aggravated assault",
    "kiki-jiki, mirror breaker",
    "zealous conscripts",
    "walking ballista",
    "underworld breach",
    "demonic consultation",
    "tainted pact",
    "food chain",
    "the first sliver",
  ].map(nk)
);

const GREEDY_LANDS = new Set(
  [
    "mana confluence",
    "city of brass",
    "tarnished citadel",
    "ancient tomb",
    "reflecting pool",
    "exotic orchard",
    "command tower",
    "gaea's cradle",
    "serra's sanctum",
    "boseiju, who endures",
    "otawara, soaring city",
    "jeweled lotus",
  ].map(nk)
);

function isBasicLandName(name: string): boolean {
  return BASIC_LAND.test(nk(name));
}

function isLikelyLand(name: string): boolean {
  const n = nk(name);
  const baseName = n.split("//")[0].trim();
  if (BASIC_LAND.test(baseName)) return true;
  if (KNOWN_LANDS.has(baseName)) return true;
  if (FETCH_OR_SHOCK.has(baseName)) return true;
  if (TRIOME.test(baseName)) return true;
  return false;
}

function inSet(name: string, set: Set<string>): boolean {
  return set.has(nk(name).split("//")[0].trim());
}

export function computeRoastDeckSignals(cards: Array<{ name: string; qty: number }>): RoastDeckSignals {
  let landSlots = 0;
  let basicLandSlots = 0;
  let greedyLandSlots = 0;
  let rampSlots = 0;
  let boardWipeSlots = 0;
  let cardDrawSlots = 0;
  let finisherSlots = 0;
  let totalCards = 0;

  for (const c of cards) {
    const q = cardQty(c);
    if (q <= 0) continue;
    totalCards += q;
    const name = c.name;
    if (isLikelyLand(name)) {
      landSlots += q;
      if (isBasicLandName(name)) basicLandSlots += q;
      const base = nk(name).split("//")[0].trim();
      if (GREEDY_LANDS.has(base) || TRIOME.test(base) || FETCH_OR_SHOCK.has(base)) {
        greedyLandSlots += q;
      }
      continue;
    }
    if (inSet(name, RAMP)) rampSlots += q;
    if (inSet(name, WIPES)) boardWipeSlots += q;
    if (inSet(name, DRAW)) cardDrawSlots += q;
    if (inSet(name, FINISHERS)) finisherSlots += q;
  }

  const nonlandSlots = Math.max(0, totalCards - landSlots);

  const blockForPrompt = [
    `Heuristic stats from CARD NAMES (cross-check the decklist; fix if a card is miscounted):`,
    `• Lands ≈ ${landSlots} slots (${basicLandSlots} basics) · nonlands ≈ ${nonlandSlots}`,
    `• Ramp (name hits) ≈ ${rampSlots} · Board wipes ≈ ${boardWipeSlots} · Draw / card advantage ≈ ${cardDrawSlots} · Finishers (name hits) ≈ ${finisherSlots}`,
    `• Greedy mana density (triomes, shocks, fetches, fast rainbow lands) ≈ ${greedyLandSlots} land slots vs ${basicLandSlots} basics — call out greed if that ratio is silly.`,
    `• In biggest_issues or card_callouts, cite at least TWO of: land count, ramp, wipes, draw, curve feel, greedy inclusions, missing closers — use these numbers when they help.`,
  ].join("\n");

  return {
    totalCards,
    landSlots,
    nonlandSlots,
    rampSlots,
    boardWipeSlots,
    cardDrawSlots,
    finisherSlots,
    greedyLandSlots,
    basicLandSlots,
    blockForPrompt,
  };
}

export const ROAST_COMEDY_ANGLE_POOL = [
  "Open with a fake one-line \"Gatherer review\" star rating (then undercut it in the same sentence).",
  "Include exactly one clause written like a phone notification from the deck.",
  "One biggest_issues title should feel like clickbait — but the body must be accurate.",
  "One beat: a single specific FNM table moment (one short clause only).",
  "One card_callout line styled like a sarcastic loading-screen tip.",
  "One metaphor from sports commentary — one sentence max.",
  "One line as fake patch notes: \"Patch 1.0: nerf your mana.\" style (deck-specific).",
] as const;
