/**
 * Deterministic module detection for 3-layer prompt composition.
 * Uses cached oracle_text / type_line only (no live Scryfall).
 */

export type ModuleFlags = {
  cascade: boolean;
  aristocrats: boolean;
  landfall: boolean;
  spellslinger: boolean;
  graveyard: boolean;
};

export type CachedCard = { type_line?: string; oracle_text?: string };

// Thresholds (tuneable constants)
const CASCADE_MIN_COUNT = 5;
const SPELLSLINGER_MIN_INSTANTS_SORCERIES = 18;
const LANDFALL_PAYOFF_MIN = 3;
const LANDFALL_EXTRA_LAND_MIN = 3;
const ARISTOCRATS_SAC_OUTLET_MIN = 3;
const ARISTOCRATS_DEATH_PAYOFF_MIN = 3;
const GRAVEYARD_RECURSION_MIN = 6;

const GRAVEYARD_COMMANDER_NAMES = new Set([
  "muldrotha, the gravetide",
  "meren of clan nel toth",
  "karador, ghost chieftain",
  "sidisi, brood tyrant",
  "chainer, dementia master",
  "tasigur, the golden fang",
  "mimeoplasm, the sedimentor",
  "the scarab god",
  "jarad, golgari lich lord",
]);

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function hasCascade(oracleText: string): boolean {
  return /cascade/i.test(oracleText || "");
}

function isInstantOrSorcery(typeLine: string): boolean {
  const t = (typeLine || "").toLowerCase();
  return t.includes("instant") || t.includes("sorcery");
}

function isLandfallPayoff(oracleText: string): boolean {
  const o = (oracleText || "").toLowerCase();
  return /landfall/i.test(o) || /whenever a land enters the battlefield/i.test(o);
}

function isExtraLandDrop(oracleText: string): boolean {
  return /you may play an additional land/i.test((oracleText || "").toLowerCase());
}

/** Repeatable sac outlet: "sacrifice a", "sacrifice another", "sacrifice this" (ability, not cost). Scores higher. */
function isRepeatableSacOutlet(oracleText: string): boolean {
  const o = (oracleText || "").toLowerCase();
  if (/as an additional cost to cast/i.test(o)) return false;
  return (
    /sacrifice (a|another|one|target) /i.test(o) ||
    /sacrifice this /i.test(o) ||
    /: sacrifice /i.test(o)
  );
}

/** Sac outlet including "as an additional cost" (counts but scores lower for aristocrats). */
function isSacOutlet(oracleText: string): boolean {
  const o = (oracleText || "").toLowerCase();
  return (
    /sacrifice (a|another|one|target|this) /i.test(o) ||
    /: sacrifice /i.test(o) ||
    /as an additional cost to cast.*sacrifice/i.test(o)
  );
}

function isDeathPayoff(oracleText: string): boolean {
  const o = (oracleText || "").toLowerCase();
  return /whenever .+ dies/i.test(o) || /when .+ dies/i.test(o) || /, dies[,.]/i.test(o);
}

function isRecursionOrSelfMill(oracleText: string): boolean {
  const o = (oracleText || "").toLowerCase();
  return (
    /mill/i.test(o) ||
    /return target .* from (your )?graveyard/i.test(o) ||
    /from (your )?graveyard/i.test(o) ||
    /reanimate/i.test(o) ||
    /dredge/i.test(o)
  );
}

function hasStorm(oracleText: string): boolean {
  return /storm/i.test(oracleText || "");
}

/**
 * Detect which optional modules apply to the deck using cached card data only.
 * Returns flags and list of module keys attached (for admin preview).
 */
export function detectModules(
  deckCards: { name: string; count?: number }[],
  cachedCardDataByName: Map<string, CachedCard>,
  commanderName?: string | null
): { flags: ModuleFlags; modulesAttached: string[] } {
  const flags: ModuleFlags = {
    cascade: false,
    aristocrats: false,
    landfall: false,
    spellslinger: false,
    graveyard: false,
  };

  let cascadeCount = 0;
  let instantsSorceriesCount = 0;
  let landfallPayoffCount = 0;
  let extraLandDropCount = 0;
  let sacOutletScore = 0; // repeatable count * 2 + cost-only count
  let deathPayoffCount = 0;
  let recursionCount = 0;
  let hasStormPayoff = false;

  const seenNames = new Set<string>();
  for (const entry of deckCards) {
    const name = norm(entry.name);
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const card = cachedCardDataByName.get(name);
    const oracle = card?.oracle_text ?? "";
    const typeLine = card?.type_line ?? "";

    if (hasCascade(oracle)) cascadeCount++;
    if (isInstantOrSorcery(typeLine)) instantsSorceriesCount++;
    if (hasStormPayoff || hasStorm(oracle)) hasStormPayoff = true;
    if (isLandfallPayoff(oracle)) landfallPayoffCount++;
    if (isExtraLandDrop(oracle)) extraLandDropCount++;
    if (isRepeatableSacOutlet(oracle)) sacOutletScore += 2;
    else if (isSacOutlet(oracle)) sacOutletScore += 1;
    if (isDeathPayoff(oracle)) deathPayoffCount++;
    if (isRecursionOrSelfMill(oracle)) recursionCount++;
  }

  // Commander has cascade
  if (commanderName) {
    const cmdNorm = norm(commanderName);
    const cmdCard = cachedCardDataByName.get(cmdNorm);
    if (cmdCard && hasCascade(cmdCard.oracle_text ?? "")) cascadeCount = Math.max(cascadeCount, CASCADE_MIN_COUNT);
    if (GRAVEYARD_COMMANDER_NAMES.has(cmdNorm)) flags.graveyard = true;
  }

  if (cascadeCount >= CASCADE_MIN_COUNT) flags.cascade = true;
  if (instantsSorceriesCount >= SPELLSLINGER_MIN_INSTANTS_SORCERIES || hasStormPayoff) flags.spellslinger = true;
  if (landfallPayoffCount >= LANDFALL_PAYOFF_MIN || extraLandDropCount >= LANDFALL_EXTRA_LAND_MIN) flags.landfall = true;
  if (sacOutletScore >= ARISTOCRATS_SAC_OUTLET_MIN && deathPayoffCount >= ARISTOCRATS_DEATH_PAYOFF_MIN) flags.aristocrats = true;
  if (recursionCount >= GRAVEYARD_RECURSION_MIN) flags.graveyard = true;

  const modulesAttached: string[] = [];
  if (flags.cascade) modulesAttached.push("MODULE_CASCADE");
  if (flags.aristocrats) modulesAttached.push("MODULE_ARISTOCRATS");
  if (flags.landfall) modulesAttached.push("MODULE_LANDFALL");
  if (flags.spellslinger) modulesAttached.push("MODULE_SPELLSLINGER_STORM");
  if (flags.graveyard) modulesAttached.push("MODULE_GRAVEYARD_RECURSION");

  return { flags, modulesAttached };
}
