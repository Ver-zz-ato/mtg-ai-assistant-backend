/**
 * Deterministic deck profile builder for mulligan AI advice.
 * Uses name-based heuristics + scryfall_cache type_line for land detection.
 */

import type { ParsedCard } from "./parse-decklist";
import {
  getTypeLinesForNames,
  isLandFromLookup,
  colorsFromTypeLine,
  normalizeCardName,
} from "./card-types";

export type DeckProfile = {
  format: "commander";
  totalCards: number;
  landCount: number;
  landPercent: number;

  // Densities / counts
  fastManaCount: number;
  rampCount: number;
  tutorCount: number;
  drawEngineCount: number;
  interactionCount: number;
  protectionCount: number;

  // Curve-ish (best effort without oracle types)
  oneDropCount: number;
  twoDropCount: number;

  // Derived expectations
  velocityScore: number;
  archetype: "turbo_combo" | "combo_control" | "midrange_value" | "control" | "unknown";
  mulliganStyle: "aggressive" | "balanced" | "conservative";
  expectedTurn1: string[];
  expectedTurn2: string[];
  keepHeuristics: string[];
  notes: string[];
  commanderPlan?: "early_engine" | "late_engine" | "not_central" | "unknown";
  /** Set when landCount is suspiciously low (e.g. <20 for 99-card deck) due to cache misses */
  landDetectionIncomplete?: boolean;
};

export type HandFacts = {
  handLandCount: number;
  hasFastMana: boolean;
  hasRamp: boolean;
  hasTutor: boolean;
  hasDrawEngine: boolean;
  hasProtection: boolean;
  hasInteraction: boolean;
  colorsAvailable: string[];
};

// --- Curated lists (lowercase for matching) ---

const FAST_MANA = [
  "sol ring", "mana crypt", "mana vault", "lotus petal",
  "mox amber", "chrome mox", "mox diamond", "jeweled lotus", "grim monolith",
  "gemstone caverns", "ancient tomb", "city of traitors", "mox opal",
  "lion's eye diamond", "led ", "mox tantalite",
];

const TUTOR_PATTERNS = [
  "tutor", "demonic tutor", "vampiric tutor", "mystical tutor", "worldly tutor",
  "enlightened tutor", "idyllic tutor", "imperial seal", "gamble",
  "ranger-captain of eos", "ranger captain of eos", "imperial recruiter",
  "recruiter of the guard", "spellseeker", "trinket mage", "tribute mage",
  "fabricate", "whir of invention", "muddle the mixture", "merchant scroll",
  "personal tutor", "mystical tutor", "enlightened tutor", "worldly tutor",
  "green sun's zenith", "summoner's pact", "natural order", "survival of the fittest",
  "birthing pod", "profane tutor", "wishclaw talisman",
];

const DRAW_ENGINES = [
  "rhystic study", "mystic remora", "esper sentinel", "faerie mastermind",
  "consecrated sphinx", "sylvan library", "necropotence", "phyrexian arena",
  "dark confidant", "kami of the crescent moon",
];

const BURST_DRAW = [
  "windfall", "wheel of fortune", "reforge the soul", "echo of eons",
  "treasure cruise", "dig through time", "fact or fiction", "chart a course",
  "night's whisper", "read the bones", "sign in blood", "harmonize",
  "brainstorm", "ponder", "preordain", "opt", "serum visions",
];

const INTERACTION = [
  "force of will", "force of negation", "swan song", "flusterstorm",
  "pact of negation", "mana drain", "counterspell", "an offer you can't refuse",
  "mana tithe", "silence", "swords to plowshares", "path to exile",
  "nature's claim", "naturalize", "return to nature", "cyclonic rift",
  "snap", "snapcaster mage", "otawara", "otawara, soaring city",
  "assassin's trophy", "abrupt decay", "chaos warp", "generous gift",
  "beast within", "pongify", "rapid hybridization", "terminate",
  "dreadbore", "hero's downfall", "vindicate", "angrath's fury",
  "lightning bolt", "chain lightning", "fire // ice", "abrade",
];

const PROTECTION = [
  "slip out the back", "teferi's protection", "veil of summer",
  "heroic intervention", "boromir", "grand abolisher", "teferi, time raveler",
  "teferi time raveler", "lightning greaves", "swiftfoot boots",
  "deflecting swat", "fierce guardianship", "flusterstorm",
  "counterspell", "force of will", "force of negation", "pact of negation",
  "silence", "orim's chant",
];

const RAMP_DORKS_ROCKS = [
  "sol ring", "arcane signet", "mind stone", "thought vessel", "fellwar stone",
  "llanowar elves", "elves of deep shadow", "birds of paradise", "arbor elf",
  "elvish mystic", "fyndhorn elves", "avacyn's pilgrim", "noble hierarch",
  "signet", "talisman", "mana crypt", "mana vault", "grim monolith",
  "rampant growth", "cultivate", "kodama's reach", "farseek", "nature's lore",
  "three visits", "chromatic lantern", "commander's sphere", "fellwar stone",
  "dark ritual", "cabal ritual", "lotus petal", "simian spirit guide",
  "elvish spirit guide",
];

const ONE_DROPS = [
  "llanowar elves", "elvish mystic", "fyndhorn elves", "birds of paradise",
  "arbor elf", "avacyn's pilgrim", "noble hierarch", "deathrite shaman",
  "delver of secrets", "mother of runes", "giver of runes", "serra ascendant",
  "sol ring", "lotus petal", "chrome mox", "mox opal", "mox diamond",
  "brainstorm", "ponder", "preordain", "opt", "serum visions",
  "thoughtseize", "inquisition of kozilek", "vampiric tutor",
  "path to exile", "swords to plowshares", "lightning bolt",
  "mana crypt", "mox amber", "jeweled lotus",
];

const TWO_DROPS = [
  "arcane signet", "mind stone", "signet", "talisman", "fellwar stone",
  "rampant growth", "farseek", "nature's lore", "three visits",
  "dark confidant", "mystic remora", "rhystic study", "esper sentinel",
  "counterspell", "mana leak", "remand", "negate", "swan song",
  "cyclonic rift", "nature's claim", "abrupt decay",
];

function nameMatches(name: string, list: string[]): boolean {
  const n = name.toLowerCase().trim();
  return list.some((k) => n.includes(k) || n === k);
}

function nameMatchesPattern(name: string, patterns: string[]): boolean {
  const n = name.toLowerCase().trim();
  return patterns.some((p) => n.includes(p) || n === p);
}

function isLand(name: string): boolean {
  const n = name.toLowerCase().trim();
  return (
    /\bland\b|island|mountain|forest|plains|swamp|dual|fetch|shock|triome|pathway|basic\s+land/i.test(n) ||
    n.endsWith(" island") ||
    n.endsWith(" mountain") ||
    n.endsWith(" forest") ||
    n.endsWith(" plains") ||
    n.endsWith(" swamp")
  );
}

export function buildDeckProfile(
  cards: ParsedCard[],
  commander?: string | null
): DeckProfile {
  let landCount = 0;
  let fastManaCount = 0;
  let rampCount = 0;
  let tutorCount = 0;
  let drawEngineCount = 0;
  let interactionCount = 0;
  let protectionCount = 0;
  let oneDropCount = 0;
  let twoDropCount = 0;

  const totalCards = cards.reduce((s, c) => s + c.count, 0);

  for (const { name, count } of cards) {
    const n = name.toLowerCase().trim();
    if (isLand(name)) {
      landCount += count;
      continue;
    }
    if (nameMatches(name, FAST_MANA)) fastManaCount += count;
    if (nameMatchesPattern(name, TUTOR_PATTERNS)) tutorCount += count;
    if (nameMatches(name, DRAW_ENGINES)) drawEngineCount += count;
    if (nameMatches(name, BURST_DRAW)) drawEngineCount += count; // count burst as engine
    if (nameMatches(name, INTERACTION)) interactionCount += count;
    if (nameMatches(name, PROTECTION)) protectionCount += count;
    if (nameMatches(name, RAMP_DORKS_ROCKS)) rampCount += count;
    if (nameMatches(name, ONE_DROPS)) oneDropCount += count;
    if (nameMatches(name, TWO_DROPS)) twoDropCount += count;
  }

  const landPercent = totalCards > 0 ? Math.round((landCount / totalCards) * 100) : 0;

  // Velocity score (0..10)
  let velocityScore = 0;
  if (fastManaCount >= 5) velocityScore += 3;
  if (tutorCount >= 6) velocityScore += 2;
  if (oneDropCount + twoDropCount >= 25) velocityScore += 2;
  if (drawEngineCount >= 4) velocityScore += 2;
  if (interactionCount >= 8) velocityScore += 1;
  velocityScore = Math.max(0, Math.min(10, velocityScore));

  // Archetype classifier
  let archetype: DeckProfile["archetype"] = "unknown";
  if (velocityScore >= 7 && tutorCount >= 4) {
    archetype = interactionCount >= 6 ? "combo_control" : "turbo_combo";
  } else if (drawEngineCount >= 5 && interactionCount >= 8 && tutorCount < 4) {
    archetype = "control";
  } else if (
    (drawEngineCount >= 3 && drawEngineCount <= 8) &&
    (rampCount >= 6 && rampCount <= 14)
  ) {
    archetype = "midrange_value";
  }

  // Mulligan style
  let mulliganStyle: DeckProfile["mulliganStyle"] = "balanced";
  if (archetype === "turbo_combo") mulliganStyle = "aggressive";
  else if (archetype === "combo_control") mulliganStyle = "balanced";
  else if (archetype === "midrange_value") mulliganStyle = "balanced";
  else if (archetype === "control") mulliganStyle = "conservative";

  // Expected turns (best-effort)
  const expectedTurn1: string[] = [];
  if (fastManaCount >= 3) expectedTurn1.push("fast mana");
  if (rampCount >= 6) expectedTurn1.push("mana dork");
  if (drawEngineCount >= 3) expectedTurn1.push("cantrip");
  if (interactionCount >= 6) expectedTurn1.push("interaction");
  if (expectedTurn1.length === 0) expectedTurn1.push("land drop");

  const expectedTurn2: string[] = [];
  if (drawEngineCount >= 4) expectedTurn2.push("engine");
  if (tutorCount >= 4) expectedTurn2.push("tutor");
  expectedTurn2.push("commander");
  if (protectionCount >= 3 || interactionCount >= 6) expectedTurn2.push("hold up protection");
  if (expectedTurn2.length === 1) expectedTurn2.push("ramp or value");

  // Keep heuristics (short, deck-specific)
  const keepHeuristics: string[] = [];
  if (mulliganStyle === "aggressive") {
    keepHeuristics.push("Hands without early acceleration (fast mana or dork) are below average.");
    if (tutorCount >= 4) keepHeuristics.push("Prefer at least one tutor or combo piece.");
  } else if (mulliganStyle === "balanced") {
    keepHeuristics.push("Prefer 2–3 lands + one accelerator + one engine/interaction.");
    if (drawEngineCount >= 4) keepHeuristics.push("Engine or draw in opener helps consistency.");
  } else {
    keepHeuristics.push("Prefer stable mana and at least one draw/interaction piece.");
    if (interactionCount >= 8) keepHeuristics.push("Interaction density matters for control.");
  }
  if (landPercent < 34 && archetype !== "control") {
    keepHeuristics.push(`Deck runs ${landPercent}% lands; prioritize land-heavy openers.`);
  }
  if (keepHeuristics.length === 0) keepHeuristics.push("Balance lands, ramp, and action.");

  // Commander-dependency meta lever: early_engine vs late_engine vs not_central
  let commanderPlan: DeckProfile["commanderPlan"] = "unknown";
  if (commander && commander.trim()) {
    const expectsCommanderT2 = expectedTurn2.includes("commander");
    const commanderCentric = rampCount >= 8 && tutorCount >= 4;
    if (expectsCommanderT2 || (commanderCentric && velocityScore >= 6)) {
      commanderPlan = "early_engine";
    } else if (rampCount >= 6 && drawEngineCount >= 4) {
      commanderPlan = "late_engine";
    } else if (rampCount < 5 && tutorCount < 3) {
      commanderPlan = "not_central";
    }
  }
  if (commanderPlan !== "unknown") {
    const earlyEngineStrong = mulliganStyle === "aggressive" || velocityScore >= 7;
    keepHeuristics.push(
      commanderPlan === "early_engine"
        ? earlyEngineStrong
          ? "Enable commander by T2/T3; hands that can't deploy commander early are below average."
          : "Prefer enabling commander early; however stable mana + acceleration is still a keep in balanced builds."
        : commanderPlan === "late_engine"
          ? "Commander is a value engine; prefer mana + draw to reach it."
          : "Commander is not central; evaluate hand on its own merits."
    );
  }

  const notes: string[] = [];
  notes.push(`${landPercent}% lands (${landCount})`);
  notes.push(`fastMana=${fastManaCount} ramp=${rampCount} tutors=${tutorCount}`);
  notes.push(`drawEngines=${drawEngineCount} interaction=${interactionCount} protection=${protectionCount}`);
  notes.push(`velocity=${velocityScore} archetype=${archetype} style=${mulliganStyle}`);
  if (commanderPlan) notes.push(`commanderPlan=${commanderPlan}`);

  return {
    format: "commander",
    totalCards,
    landCount,
    landPercent,
    fastManaCount,
    rampCount,
    tutorCount,
    drawEngineCount,
    interactionCount,
    protectionCount,
    oneDropCount,
    twoDropCount,
    velocityScore,
    archetype,
    mulliganStyle,
    expectedTurn1,
    expectedTurn2,
    keepHeuristics,
    notes,
    commanderPlan,
  };
}

/**
 * Async deck profile with type_line–based land detection (scryfall_cache).
 * Use this for admin advice route. Falls back to name heuristics when type_line missing.
 */
export async function buildDeckProfileWithTypes(
  cards: ParsedCard[],
  commander?: string | null
): Promise<DeckProfile> {
  const totalCards = cards.reduce((s, c) => s + c.count, 0);
  const allNames = Array.from(new Set(cards.map((c) => c.name)));
  const typeMap = await getTypeLinesForNames(allNames);

  let landCount = 0;
  let fastManaCount = 0;
  let rampCount = 0;
  let tutorCount = 0;
  let drawEngineCount = 0;
  let interactionCount = 0;
  let protectionCount = 0;
  let oneDropCount = 0;
  let twoDropCount = 0;

  for (const { name, count } of cards) {
    const n = normalizeCardName(name);
    const typeLine = typeMap.get(n) ?? null;
    const isLandCard =
      isLandFromLookup(typeLine, n) || isLand(name); // fallback to name heuristic

    if (isLandCard) {
      landCount += count;
      continue;
    }
    if (nameMatches(name, FAST_MANA)) fastManaCount += count;
    if (nameMatchesPattern(name, TUTOR_PATTERNS)) tutorCount += count;
    if (nameMatches(name, DRAW_ENGINES)) drawEngineCount += count;
    if (nameMatches(name, BURST_DRAW)) drawEngineCount += count;
    if (nameMatches(name, INTERACTION)) interactionCount += count;
    if (nameMatches(name, PROTECTION)) protectionCount += count;
    if (nameMatches(name, RAMP_DORKS_ROCKS)) rampCount += count;
    if (nameMatches(name, ONE_DROPS)) oneDropCount += count;
    if (nameMatches(name, TWO_DROPS)) twoDropCount += count;
  }

  const landPercent = totalCards > 0 ? Math.round((landCount / totalCards) * 100) : 0;
  const landDetectionIncomplete =
    totalCards >= 90 && landCount < 20;

  // Velocity score (0..10)
  let velocityScore = 0;
  if (fastManaCount >= 5) velocityScore += 3;
  if (tutorCount >= 6) velocityScore += 2;
  if (oneDropCount + twoDropCount >= 25) velocityScore += 2;
  if (drawEngineCount >= 4) velocityScore += 2;
  if (interactionCount >= 8) velocityScore += 1;
  velocityScore = Math.max(0, Math.min(10, velocityScore));

  let archetype: DeckProfile["archetype"] = "unknown";
  if (velocityScore >= 7 && tutorCount >= 4) {
    archetype = interactionCount >= 6 ? "combo_control" : "turbo_combo";
  } else if (drawEngineCount >= 5 && interactionCount >= 8 && tutorCount < 4) {
    archetype = "control";
  } else if (
    drawEngineCount >= 3 &&
    drawEngineCount <= 8 &&
    rampCount >= 6 &&
    rampCount <= 14
  ) {
    archetype = "midrange_value";
  }

  let mulliganStyle: DeckProfile["mulliganStyle"] = "balanced";
  if (archetype === "turbo_combo") mulliganStyle = "aggressive";
  else if (archetype === "combo_control") mulliganStyle = "balanced";
  else if (archetype === "midrange_value") mulliganStyle = "balanced";
  else if (archetype === "control") mulliganStyle = "conservative";

  const expectedTurn1: string[] = [];
  if (fastManaCount >= 3) expectedTurn1.push("fast mana");
  if (rampCount >= 6) expectedTurn1.push("mana dork");
  if (drawEngineCount >= 3) expectedTurn1.push("cantrip");
  if (interactionCount >= 6) expectedTurn1.push("interaction");
  if (expectedTurn1.length === 0) expectedTurn1.push("land drop");

  const expectedTurn2: string[] = [];
  if (drawEngineCount >= 4) expectedTurn2.push("engine");
  if (tutorCount >= 4) expectedTurn2.push("tutor");
  expectedTurn2.push("commander");
  if (protectionCount >= 3 || interactionCount >= 6) expectedTurn2.push("hold up protection");
  if (expectedTurn2.length === 1) expectedTurn2.push("ramp or value");

  const keepHeuristics: string[] = [];
  if (mulliganStyle === "aggressive") {
    keepHeuristics.push("Hands without early acceleration (fast mana or dork) are below average.");
    if (tutorCount >= 4) keepHeuristics.push("Prefer at least one tutor or combo piece.");
  } else if (mulliganStyle === "balanced") {
    keepHeuristics.push("Prefer 2–3 lands + one accelerator + one engine/interaction.");
    if (drawEngineCount >= 4) keepHeuristics.push("Engine or draw in opener helps consistency.");
  } else {
    keepHeuristics.push("Prefer stable mana and at least one draw/interaction piece.");
    if (interactionCount >= 8) keepHeuristics.push("Interaction density matters for control.");
  }
  if (landPercent < 34 && archetype !== "control") {
    keepHeuristics.push(`Deck runs ${landPercent}% lands; prioritize land-heavy openers.`);
  }
  if (keepHeuristics.length === 0) keepHeuristics.push("Balance lands, ramp, and action.");

  let commanderPlan: DeckProfile["commanderPlan"] = "unknown";
  if (commander && commander.trim()) {
    const expectsCommanderT2 = expectedTurn2.includes("commander");
    const commanderCentric = rampCount >= 8 && tutorCount >= 4;
    if (expectsCommanderT2 || (commanderCentric && velocityScore >= 6)) {
      commanderPlan = "early_engine";
    } else if (rampCount >= 6 && drawEngineCount >= 4) {
      commanderPlan = "late_engine";
    } else if (rampCount < 5 && tutorCount < 3) {
      commanderPlan = "not_central";
    }
  }
  if (commanderPlan !== "unknown") {
    const earlyEngineStrong = mulliganStyle === "aggressive" || velocityScore >= 7;
    keepHeuristics.push(
      commanderPlan === "early_engine"
        ? earlyEngineStrong
          ? "Enable commander by T2/T3; hands that can't deploy commander early are below average."
          : "Prefer enabling commander early; however stable mana + acceleration is still a keep in balanced builds."
        : commanderPlan === "late_engine"
          ? "Commander is a value engine; prefer mana + draw to reach it."
          : "Commander is not central; evaluate hand on its own merits."
    );
  }

  const notes: string[] = [];
  notes.push(`${landPercent}% lands (${landCount})`);
  if (landDetectionIncomplete) {
    notes.push("Land detection incomplete: some cards missing type_line in cache.");
  }
  notes.push(`fastMana=${fastManaCount} ramp=${rampCount} tutors=${tutorCount}`);
  notes.push(`drawEngines=${drawEngineCount} interaction=${interactionCount} protection=${protectionCount}`);
  notes.push(`velocity=${velocityScore} archetype=${archetype} style=${mulliganStyle}`);
  if (commanderPlan) notes.push(`commanderPlan=${commanderPlan}`);

  return {
    format: "commander",
    totalCards,
    landCount,
    landPercent,
    fastManaCount,
    rampCount,
    tutorCount,
    drawEngineCount,
    interactionCount,
    protectionCount,
    oneDropCount,
    twoDropCount,
    velocityScore,
    archetype,
    mulliganStyle,
    expectedTurn1,
    expectedTurn2,
    keepHeuristics,
    notes,
    commanderPlan,
    landDetectionIncomplete: landDetectionIncomplete || undefined,
  };
}

const ALL_COLOR_LANDS = [
  "command tower", "city of brass", "mana confluence", "forbidden orchard",
  "exotic orchard", "reflecting pool",
];

/** Compute deterministic facts about the hand (for prompt anchoring + post-check) */
export function computeHandFacts(hand: string[]): HandFacts {
  let handLandCount = 0;
  let hasFastMana = false;
  let hasRamp = false;
  let hasTutor = false;
  let hasDrawEngine = false;
  let hasProtection = false;
  let hasInteraction = false;
  const colorSet = new Set<string>();

  for (const name of hand) {
    const n = name.toLowerCase().trim();
    if (isLand(name)) {
      handLandCount++;
      if (nameMatches(name, ALL_COLOR_LANDS)) {
        colorSet.add("W");
        colorSet.add("U");
        colorSet.add("B");
        colorSet.add("R");
        colorSet.add("G");
      } else {
        if (n.includes("island") || n.includes("blue")) colorSet.add("U");
        if (n.includes("mountain") || n.includes("red")) colorSet.add("R");
        if (n.includes("forest") || n.includes("green")) colorSet.add("G");
        if (n.includes("plains") || n.includes("white")) colorSet.add("W");
        if (n.includes("swamp") || n.includes("black")) colorSet.add("B");
        if (/\bdual\b|fetch|shock|triome|pathway|bond\s*land|slow\s*land|fast\s*land|check\s*land|pain\s*land/i.test(n)) {
          colorSet.add("W");
          colorSet.add("U");
          colorSet.add("B");
          colorSet.add("R");
          colorSet.add("G");
        }
      }
      continue;
    }
    if (nameMatches(name, FAST_MANA)) hasFastMana = true;
    if (nameMatches(name, RAMP_DORKS_ROCKS)) hasRamp = true;
    if (nameMatchesPattern(name, TUTOR_PATTERNS)) hasTutor = true;
    if (nameMatches(name, DRAW_ENGINES) || nameMatches(name, BURST_DRAW)) hasDrawEngine = true;
    if (nameMatches(name, PROTECTION)) hasProtection = true;
    if (nameMatches(name, INTERACTION)) hasInteraction = true;
  }

  return {
    handLandCount,
    hasFastMana,
    hasRamp,
    hasTutor,
    hasDrawEngine,
    hasProtection,
    hasInteraction,
    colorsAvailable: Array.from(colorSet).sort(),
  };
}

/**
 * Async hand facts with type_line–based land detection and colors.
 * Use for admin advice route.
 */
export async function computeHandFactsWithTypes(hand: string[]): Promise<HandFacts> {
  const typeMap = await getTypeLinesForNames(hand);

  let handLandCount = 0;
  let hasFastMana = false;
  let hasRamp = false;
  let hasTutor = false;
  let hasDrawEngine = false;
  let hasProtection = false;
  let hasInteraction = false;
  const colorSet = new Set<string>();

  for (const name of hand) {
    const n = normalizeCardName(name);
    const typeLine = typeMap.get(n) ?? null;
    const isLandCard = isLandFromLookup(typeLine, n) || isLand(name);

    if (isLandCard) {
      handLandCount++;
      const colors = colorsFromTypeLine(typeLine, n);
      if (colors.size >= 5) {
        colorSet.add("W");
        colorSet.add("U");
        colorSet.add("B");
        colorSet.add("R");
        colorSet.add("G");
      } else if (nameMatches(name, ALL_COLOR_LANDS)) {
        colorSet.add("W");
        colorSet.add("U");
        colorSet.add("B");
        colorSet.add("R");
        colorSet.add("G");
      } else {
        for (const c of colors) colorSet.add(c);
        if (colors.size === 0) {
          if (n.includes("island") || n.includes("blue")) colorSet.add("U");
          if (n.includes("mountain") || n.includes("red")) colorSet.add("R");
          if (n.includes("forest") || n.includes("green")) colorSet.add("G");
          if (n.includes("plains") || n.includes("white")) colorSet.add("W");
          if (n.includes("swamp") || n.includes("black")) colorSet.add("B");
          if (/\bdual\b|fetch|shock|triome|pathway|bond\s*land|slow\s*land|fast\s*land|check\s*land|pain\s*land/i.test(n)) {
            colorSet.add("W");
            colorSet.add("U");
            colorSet.add("B");
            colorSet.add("R");
            colorSet.add("G");
          }
        }
      }
      continue;
    }
    if (nameMatches(name, FAST_MANA)) hasFastMana = true;
    if (nameMatches(name, RAMP_DORKS_ROCKS)) hasRamp = true;
    if (nameMatchesPattern(name, TUTOR_PATTERNS)) hasTutor = true;
    if (nameMatches(name, DRAW_ENGINES) || nameMatches(name, BURST_DRAW)) hasDrawEngine = true;
    if (nameMatches(name, PROTECTION)) hasProtection = true;
    if (nameMatches(name, INTERACTION)) hasInteraction = true;
  }

  return {
    handLandCount,
    hasFastMana,
    hasRamp,
    hasTutor,
    hasDrawEngine,
    hasProtection,
    hasInteraction,
    colorsAvailable: Array.from(colorSet).sort(),
  };
}
