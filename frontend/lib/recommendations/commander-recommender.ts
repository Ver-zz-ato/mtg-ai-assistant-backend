import type { SupabaseClient } from "@supabase/supabase-js";
import { bannedDataToMaps, getBannedCards, type BannedCardsData } from "@/lib/data/get-banned-cards";
import { isCommanderEligible, postgrestCommanderEligibleCatalogOr } from "@/lib/deck/deck-enrichment";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { aiRerankRecommendations, buildRecommendationIntent, rankGroundedCandidates } from "@/lib/recommendations/recommendation-pipeline";
import { type TagProfile } from "@/lib/recommendations/tag-grounding";

export const CARD_TAG_RULE_VERSION = 2;
export const CARD_TAG_RULE_SOURCE = "rules_v2";

type NullableString = string | null | undefined;

export type ScryfallTagSourceRow = {
  name: string;
  printed_name?: NullableString;
  type_line?: NullableString;
  oracle_text?: NullableString;
  keywords?: string[] | null;
  mana_cost?: NullableString;
  cmc?: number | null;
  color_identity?: string[] | null;
  colors?: string[] | null;
  legalities?: Record<string, string> | null;
  is_land?: boolean | null;
  is_creature?: boolean | null;
  is_instant?: boolean | null;
  is_sorcery?: boolean | null;
  is_artifact?: boolean | null;
  is_enchantment?: boolean | null;
  is_planeswalker?: boolean | null;
  small?: NullableString;
  normal?: NullableString;
  art_crop?: NullableString;
};

export type CardTagCacheRow = {
  name: string;
  gameplay_tags: string[];
  theme_tags: string[];
  archetype_tags: string[];
  commander_tags: string[];
  commander_eligible: boolean;
  commander_power_band: "casual" | "focused" | "optimized";
  commander_budget_band: "budget" | "moderate" | "high";
  commander_complexity: "low" | "medium" | "high";
  commander_interaction: "low" | "medium" | "high";
  popularity_score: number;
  tag_version: number;
  source: string;
  updated_at: string;
};

type RecommendationCandidate = ScryfallTagSourceRow & CardTagCacheRow;

export type CommanderRecommendationRequest = {
  format?: string;
  profileLabel?: string;
  profileDescription?: string;
  answers?: Record<string, string>;
  traits?: {
    control?: number;
    aggression?: number;
    comboAppetite?: number;
    varianceTolerance?: number;
    interactionPref?: number;
    gameLengthPref?: number;
    budgetElasticity?: number;
  };
  powerLevel?: string;
  budget?: string;
  vibe?: string;
  limit?: number;
  selectedCommander?: string;
  recommendedCommanders?: string[];
};

export type CommanderRecommendation = {
  name: string;
  description: string;
  archetype: string;
  fitReason: string;
  matchScore?: number;
  imageUri?: string;
  colorIdentity?: string[];
};

type CommanderBuildOptions = {
  userId?: string | null;
  isPro?: boolean;
  isGuest?: boolean;
};

type CommanderPreference = {
  desiredThemeTags: Set<string>;
  desiredGameplayTags: Set<string>;
  desiredArchetypes: Set<string>;
  desiredCommanderTags: Set<string>;
  desiredPowerBand: "casual" | "focused" | "optimized";
  desiredBudgetBand: "budget" | "moderate" | "high";
  desiredComplexity: "low" | "medium" | "high";
  desiredInteraction: "low" | "medium" | "high";
  seedNames: string[];
};

const THEME_PATTERNS: Array<[string, RegExp]> = [
  ["tokens", /\b(create|created|creating).{0,48}\btoken\b|\bpopulate\b|\bamass\b|\bincubate\b/i],
  ["graveyard", /\bmill\b|\bsurveil\b|\bfrom your graveyard\b|\bcast .* from your graveyard\b|\breturn target .* from your graveyard\b|\bwhenever .* leaves your graveyard\b/i],
  ["sacrifice", /\bsacrifice\b|\bdies\b|\bwhen(?:ever)? .* dies\b/i],
  ["artifacts", /\bartifact creature\b|\bartifact spell\b|\bartifacts? you control\b|\bwhenever .* artifact\b/i],
  ["enchantments", /\benchantment spell\b|\benchantments? you control\b|\baura\b|\bconstellation\b|\bwhenever .* enchantment\b/i],
  ["spellslinger", /\bwhenever you cast (?:an )?instant or sorcery\b|\binstant and sorcery spells you cast\b|\bcopy target spell\b|\bstorm\b/i],
  ["lands", /\blandfall\b|\badditional land\b|\bsearch your library for a land\b|\bwhenever a land enters\b/i],
  ["lifegain", /\bgain(?:ed)? life\b|\blife total\b|\bwhenever you gain life\b/i],
  ["blink", /\bexile\b.{0,50}\breturn\b.{0,50}\bto the battlefield\b|\bblink\b/i],
  ["etb", /\benters the battlefield\b|\bwhenever .* enters the battlefield\b/i],
  ["death_triggers", /\bwhen(?:ever)? .* dies\b|\bleaves the battlefield\b/i],
  ["treasure", /\btreasure token\b|\btreasures? you control\b/i],
  ["clues", /\bclue token\b|\bclues? you control\b/i],
  ["food", /\bfood token\b|\bfoods? you control\b/i],
  ["blood", /\bblood token\b|\bblood tokens? you control\b/i],
  ["energy", /\bget \w+ ?\{e\}\b|\benergy counter\b/i],
  ["proliferate", /\bproliferate\b/i],
  ["counters_plus1", /\+\d\/\+\d counter\b|\b\+1\/\+1 counter\b/i],
  ["poison", /\bpoison counter\b|\btoxic \d\b/i],
  ["infect", /\binfect\b/i],
  ["landfall", /\blandfall\b|\bwhenever a land enters the battlefield\b/i],
  ["discard", /\bdiscards? (?:a|one|two|\w+) card\b|\bwhenever .* discard\b/i],
  ["wheel", /\beach player discards (?:their|his or her) hand\b|\bthen draws that many cards\b/i],
  ["theft", /\bgain control of target\b|\bcast .* from an opponent'?s\b/i],
  ["extra_turns", /\btake an extra turn\b/i],
  ["extra_combat", /\badditional combat phase\b|\buntap all attacking creatures\b/i],
  ["burn", /\bdeals? \d+ damage to any target\b|\bdeals? damage to each opponent\b/i],
  ["lifedrain", /\beach opponent loses\b|\btarget opponent loses\b|\byou gain that much life\b/i],
  ["reanimator", /\breturn target creature card from your graveyard to the battlefield\b|\bput target creature card from a graveyard onto the battlefield\b/i],
  ["self_mill", /\bmill \d+\b|\bput the top .* of your library into your graveyard\b/i],
  ["storm", /\bstorm\b|\bcopy it for each spell cast before it\b/i],
  ["equipment", /\bequipment\b|\bequip \{/i],
  ["auras", /\baura\b|\benchant creature\b|\benchant permanent\b/i],
  ["vehicles", /\bvehicle\b|\bcrew \d\b/i],
  ["legendary_matters", /\blegendary spells?\b|\blegendary permanent\b|\bhistoric\b/i],
  ["dragons", /\bdragon\b/i],
  ["elves", /\belf\b|\belves\b/i],
  ["zombies", /\bzombie\b/i],
  ["goblins", /\bgoblin\b/i],
  ["vampires", /\bvampire\b/i],
];

const GAMEPLAY_PATTERNS: Array<[string, RegExp]> = [
  ["ramp", /\badd \{|\bsearch your library for .* land\b|\btreasure token\b|\bextra mana\b/i],
  ["card_draw", /\bdraw a card\b|\bdraw cards\b|\bwhenever .* draw\b/i],
  ["interaction", /\bcounter target\b|\bexile target\b|\bdestroy target\b|\bfight target\b|\bopponent sacrifices\b/i],
  ["removal", /\bdestroy target\b|\bexile target\b|\breturn target .* to .* hand\b/i],
  ["recursion", /\breturn target .* from your graveyard\b|\breanimate\b|\bcast .* from your graveyard\b|\bplay .* from your graveyard\b/i],
  ["protection", /\bhexproof\b|\bindestructible\b|\bprotection from\b|\bward\b/i],
  ["payoff", /\bwhenever\b|\bat the beginning of\b|\bfor each\b/i],
  ["engine", /\bwhenever\b.{0,60}\byou\b|\bat the beginning of each\b/i],
  ["enabler", /\byou may play\b|\byou may cast\b|\badditional land\b|\bcreatures? you control have\b/i],
  ["finisher", /\bwin the game\b|\bdouble strike\b|\boverrun\b|\bcombat damage to a player\b|\bextra combat phase\b/i],
  ["support", /\bsearch your library\b|\blook at the top\b|\bscry\b|\bsurveil\b/i],
  ["removal_single", /\bdestroy target\b|\bexile target\b|\breturn target .* to .* hand\b|\bfight target\b/i],
  ["removal_boardwipe", /\bdestroy all\b|\bexile all\b|\beach creature gets -\d\/-\d\b|\ball creatures get -\d\/-\d\b/i],
  ["ramp_land", /\bsearch your library for (?:a|up to .*?) land\b|\bput (?:a|those) land cards? onto the battlefield\b/i],
  ["ramp_rocks", /\badd \{\w\}\b|\btreasure token\b|\bartifact\b.{0,30}\badd \{/i],
  ["draw_repeatable", /\bwhenever .* draw\b|\bat the beginning of your .* draw\b|\bwhenever you .* draw a card\b/i],
  ["draw_burst", /\bdraw (?:two|three|four|five|\w+) cards\b|\beach player draws\b/i],
  ["protection_self", /\bhexproof\b|\bward\b|\bcan't be the target\b/i],
  ["protection_team", /\bcreatures you control have hexproof\b|\bcreatures you control gain indestructible\b/i],
  ["tutor", /\bsearch your library for\b/i],
];

const ARCHETYPE_PATTERNS: Array<[string, RegExp]> = [
  ["aggro", /\bhaste\b|\bmenace\b|\bdouble strike\b|\bcombat damage\b|\battacking\b/i],
  ["control", /\bcounter target\b|\btap target\b|\bcan't\b|\bskip\b|\bopponents can't\b/i],
  ["combo", /\binfinite\b|\buntap\b|\bcopy that spell\b|\bspells? you cast cost\b|\bcast .* from your graveyard\b/i],
  ["value", /\bdraw a card\b|\breturn target\b|\bcreate .* token\b|\bwhenever you\b|\bat the beginning of your\b/i],
  ["politics", /\bmonarch\b|\beach player\b|\btarget opponent chooses\b|\bvote\b/i],
  ["chaos", /\brandom\b|\bflip a coin\b|\bchaos\b/i],
  ["midrange", /\btrample\b|\bflying\b|\bward\b|\bdeathtouch\b/i],
];

const COMMANDER_PATTERNS: Array<[string, RegExp]> = [
  ["go_wide", /\bcreate .* token\b|\bpopulate\b|\bfor each creature you control\b/i],
  ["aristocrats", /\bsacrifice\b|\bdies\b|\bdeath trigger\b/i],
  ["superfriends", /\bplaneswalker\b|\bproliferate\b/i],
  ["tempo", /\bninjutsu\b|\bflash\b|\breturn target .* to .* hand\b/i],
  ["group_hug", /\beach player draws\b|\beach player may\b|\beach player adds\b/i],
  ["stax_like", /\bcan't untap\b|\bspells cost\b|\bplayers can't\b/i],
  ["big_mana", /\badd \{|\bdouble the amount of mana\b|\bseven or more mana\b/i],
  ["spell_combo", /\bcopy target spell\b|\bwhenever you cast an instant or sorcery\b/i],
  ["build_around_commander", /\bother creatures you control\b|\bwhenever you cast\b|\bwhenever another\b|\bspells you cast\b/i],
  ["goodstuff_commander", /\bdraw a card\b|\badd \{|\bsearch your library\b|\breturn target\b/i],
  ["linear_commander", /\bdragons?\b|\belves?\b|\bzombies?\b|\bgoblins?\b|\bvampires?\b|\bartifacts? you control\b|\benchantments? you control\b/i],
  ["open_ended_commander", /\bwhenever you cast a spell\b|\bwhenever one or more\b|\bonce each turn\b/i],
  ["tribal_commander", /\bdragons?\b|\belves?\b|\bzombies?\b|\bgoblins?\b|\bvampires?\b/i],
  ["combo_commander", /\bcopy target spell\b|\buntap\b|\bspells? you cast cost\b/i],
  ["control_commander", /\bcounter target\b|\bopponents can't\b|\btap target\b|\bdetain\b/i],
];

const VIBE_KEYWORDS: Record<string, string[]> = {
  tokens: ["tokens", "go_wide"],
  graveyard: ["graveyard", "recursion", "aristocrats"],
  artifacts: ["artifacts"],
  dragons: ["dragons", "tribal"],
  lifegain: ["lifegain"],
  sacrifice: ["sacrifice", "aristocrats"],
  spellslinger: ["spellslinger", "spell_combo"],
  enchantments: ["enchantments"],
  lands: ["lands", "big_mana"],
  tribal: ["tribal", "dragons", "elves", "zombies", "goblins", "vampires"],
  blink: ["blink", "etb", "value"],
  counters: ["counters_plus1", "proliferate", "midrange"],
  treasure: ["treasure", "ramp", "big_mana"],
  poison: ["poison", "infect", "aggro"],
  discard: ["discard", "wheel", "control"],
  reanimator: ["reanimator", "graveyard", "recursion"],
  aristocrats: ["sacrifice", "aristocrats", "death_triggers"],
  burn: ["burn", "aggro"],
  equipment: ["equipment", "aggro"],
  legends: ["legendary_matters", "value"],
};

const THEME_ALIASES: Record<string, string> = {
  spells: "spellslinger",
  spell: "spellslinger",
  reanimator: "graveyard",
  lands: "landfall",
  lifegain: "lifegain",
  counters: "counters_plus1",
};

const GENERIC_THEME_TAGS = new Set(["legendary_matters"]);
const GENERIC_COMMANDER_TAGS = new Set([
  "build_around_commander",
  "goodstuff_commander",
  "linear_commander",
  "open_ended_commander",
]);

const THEME_GATE_PATTERNS: Record<string, RegExp> = {
  tokens: /\bcreature token\b|\bcreate .* token\b|\bpopulate\b|\bamass\b|\bincubate\b/i,
  graveyard: /\bgraveyard\b|\breturn target .* from your graveyard\b|\bcast .* from your graveyard\b|\bmill\b|\bsurveil\b/i,
  spellslinger: /\binstant or sorcery\b|\bcopy target spell\b|\binstant and sorcery spells you cast\b|\bwhenever you cast (?:an )?instant or sorcery\b|\bstorm\b/i,
  tribal: /\bdragon\b|\belf\b|\bzombie\b|\bgoblin\b|\bvampire\b/i,
  enchantments: /\benchantment\b|\baura\b|\bconstellation\b/i,
  artifacts: /\bartifact\b|\btreasure token\b|\bclue token\b|\bfood token\b|\bblood token\b/i,
  blink: /\bexile\b.{0,50}\breturn\b.{0,50}\bto the battlefield\b|\benters the battlefield\b/i,
};

const TOKEN_PAYOFF_PATTERN = /\bcreatures? you control\b|\bfor each creature you control\b|\battacking creatures?\b|\bother tokens? you control\b/i;
const TREASURE_ONLY_PATTERN = /\btreasure token\b|\bclue token\b|\bfood token\b|\bblood token\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildThemeHaystack(candidate: RecommendationCandidate): string {
  const selfNames = [String(candidate.printed_name || ""), String(candidate.name || "")]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  let oracle = normalizeText(candidate.oracle_text);
  for (const selfName of selfNames) {
    oracle = oracle.replace(new RegExp(`\\b${escapeRegExp(selfName)}\\b`, "gi"), "this card");
  }
  const typeLine = normalizeText(candidate.type_line);
  return `${oracle} ${typeLine}`;
}

function uniqueSorted(items: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(items).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function normalizeBannedCardsData(value: unknown): BannedCardsData | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<BannedCardsData>;
  if (!Array.isArray(source.Commander) || !Array.isArray(source.Modern)) return null;
  return {
    Commander: Array.isArray(source.Commander) ? source.Commander : [],
    Modern: Array.isArray(source.Modern) ? source.Modern : [],
    Pioneer: Array.isArray(source.Pioneer) ? source.Pioneer : [],
    Standard: Array.isArray(source.Standard) ? source.Standard : [],
    Pauper: Array.isArray(source.Pauper) ? source.Pauper : [],
    Brawl: Array.isArray(source.Brawl) ? source.Brawl : [],
  };
}

async function getBannedCardsForRecommendations(admin: SupabaseClient): Promise<BannedCardsData> {
  try {
    const { data, error } = await admin.from("app_config").select("value").eq("key", "banned_cards").maybeSingle();
    if (error) throw new Error(error.message);
    const normalized = normalizeBannedCardsData(data?.value);
    if (normalized) return normalized;
  } catch {}
  return getBannedCards();
}

function toDisplayName(name: string): string {
  const minorWords = new Set(["a", "an", "and", "at", "for", "from", "in", "of", "on", "the", "to", "with"]);
  const capitalizeToken = (token: string, force: boolean): string => {
    const lower = token.toLowerCase();
    if (!force && minorWords.has(lower)) return lower;
    return lower.replace(/(^|['-])([a-z])/g, (_match, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
  };

  return String(name || "")
    .split(" // ")
    .map((face) =>
      face
        .split(/\s+/)
        .filter(Boolean)
        .map((token, index) => capitalizeToken(token, index === 0))
        .join(" "),
    )
    .join(" // ");
}

function normalizeText(input: NullableString): string {
  return String(input ?? "").toLowerCase();
}

function lowerArray(values: string[] | null | undefined): string[] {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.toLowerCase())
    : [];
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
}

function hasTag(tags: Iterable<string>, tag: string): boolean {
  return Array.from(tags).includes(tag);
}

function addIf(set: Set<string>, condition: boolean, tag: string): void {
  if (condition) set.add(tag);
}

function sharesAny(tags: string[], desired: Set<string>): boolean {
  return tags.some((tag) => desired.has(tag));
}

function preferenceToProfile(pref: CommanderPreference): TagProfile {
  const topThemeTags = uniqueSorted(Array.from(pref.desiredThemeTags));
  const topGameplayTags = uniqueSorted(Array.from(pref.desiredGameplayTags));
  const topArchetypeTags = uniqueSorted(Array.from(pref.desiredArchetypes));
  const topCommanderTags = uniqueSorted(Array.from(pref.desiredCommanderTags));
  return {
    topThemeTags,
    topGameplayTags,
    topArchetypeTags,
    topCommanderTags,
    colorIdentity: [],
    profileSummary: [
      topThemeTags.length ? `themes: ${topThemeTags.join(", ")}` : "",
      topGameplayTags.length ? `roles: ${topGameplayTags.join(", ")}` : "",
      topArchetypeTags.length ? `plan: ${topArchetypeTags.join(", ")}` : "",
    ].filter(Boolean).join(" | "),
    counts: {
      theme: new Map(topThemeTags.map((tag) => [tag, 1])),
      gameplay: new Map(topGameplayTags.map((tag) => [tag, 1])),
      archetype: new Map(topArchetypeTags.map((tag) => [tag, 1])),
      commander: new Map(topCommanderTags.map((tag) => [tag, 1])),
    },
  };
}

export function deriveCardTagCacheRow(row: ScryfallTagSourceRow): CardTagCacheRow {
  const typeLine = normalizeText(row.type_line);
  const oracleText = normalizeText(row.oracle_text);
  const keywords = lowerArray(row.keywords);
  const colors = lowerArray(row.colors);
  const colorIdentity = lowerArray(row.color_identity);
  const joined = [typeLine, oracleText, keywords.join(" "), colors.join(" "), colorIdentity.join(" ")].join(" ");

  const themeTags = new Set<string>();
  for (const [tag, pattern] of THEME_PATTERNS) {
    if (pattern.test(joined)) themeTags.add(tag);
  }
  if (["dragons", "elves", "zombies", "goblins", "vampires"].some((tag) => themeTags.has(tag))) {
    themeTags.add("tribal");
  }
  addIf(themeTags, row.is_artifact === true && /\blegendary\b/i.test(typeLine), "artifacts");
  addIf(themeTags, row.is_enchantment === true, "enchantments");
  addIf(themeTags, row.is_planeswalker === true, "superfriends");
  addIf(themeTags, /\bvehicle\b/i.test(typeLine), "vehicles");
  addIf(themeTags, /\bequipment\b/i.test(typeLine), "equipment");
  addIf(themeTags, /\baura\b/i.test(typeLine), "auras");
  addIf(themeTags, /\blegendary\b/i.test(typeLine), "legendary_matters");
  addIf(themeTags, hasTag(themeTags, "reanimator"), "graveyard");
  addIf(themeTags, hasTag(themeTags, "self_mill"), "graveyard");
  addIf(themeTags, hasTag(themeTags, "blink"), "etb");
  addIf(themeTags, hasTag(themeTags, "treasure"), "artifacts");
  addIf(themeTags, hasTag(themeTags, "clues"), "artifacts");
  addIf(themeTags, hasTag(themeTags, "food"), "artifacts");
  addIf(themeTags, hasTag(themeTags, "blood"), "artifacts");

  const gameplayTags = new Set<string>();
  for (const [tag, pattern] of GAMEPLAY_PATTERNS) {
    if (pattern.test(joined)) gameplayTags.add(tag);
  }
  addIf(gameplayTags, hasTag(themeTags, "treasure"), "ramp");
  addIf(gameplayTags, hasTag(themeTags, "landfall") || hasTag(themeTags, "lands"), "ramp_land");
  addIf(gameplayTags, hasTag(themeTags, "artifacts"), "ramp_rocks");
  addIf(gameplayTags, hasTag(themeTags, "etb") || hasTag(themeTags, "blink"), "engine");
  addIf(gameplayTags, hasTag(themeTags, "death_triggers"), "payoff");
  addIf(gameplayTags, hasTag(themeTags, "reanimator"), "recursion");
  addIf(gameplayTags, hasTag(themeTags, "burn"), "finisher");
  addIf(gameplayTags, hasTag(themeTags, "wheel"), "draw_burst");
  addIf(gameplayTags, hasTag(themeTags, "sacrifice"), "enabler");
  addIf(gameplayTags, /\bat the beginning of each end step\b|\bonce each turn\b/i.test(joined), "engine");

  const archetypeTags = new Set<string>();
  for (const [tag, pattern] of ARCHETYPE_PATTERNS) {
    if (pattern.test(joined)) archetypeTags.add(tag);
  }
  if (themeTags.has("tokens") || themeTags.has("tribal")) archetypeTags.add("aggro");
  if (themeTags.has("graveyard") || gameplayTags.has("card_draw")) archetypeTags.add("value");
  if (themeTags.has("spellslinger")) archetypeTags.add("combo");
  if (themeTags.has("blink") || themeTags.has("etb")) archetypeTags.add("value");
  if (themeTags.has("discard") || themeTags.has("theft") || gameplayTags.has("removal_boardwipe")) archetypeTags.add("control");
  if (themeTags.has("burn") || themeTags.has("extra_combat") || themeTags.has("equipment")) archetypeTags.add("aggro");
  if (themeTags.has("storm") || themeTags.has("extra_turns")) archetypeTags.add("combo");
  if (themeTags.has("proliferate") || themeTags.has("counters_plus1")) archetypeTags.add("midrange");
  if (themeTags.has("wheel")) archetypeTags.add("chaos");

  const commanderTags = new Set<string>();
  for (const [tag, pattern] of COMMANDER_PATTERNS) {
    if (pattern.test(joined)) commanderTags.add(tag);
  }
  if (themeTags.has("tokens")) commanderTags.add("go_wide");
  if (themeTags.has("graveyard") || themeTags.has("sacrifice")) commanderTags.add("aristocrats");
  if (themeTags.has("spellslinger")) commanderTags.add("spell_combo");
  if (gameplayTags.has("ramp") || themeTags.has("lands")) commanderTags.add("big_mana");
  if (themeTags.has("tribal")) commanderTags.add("tribal_commander");
  if (archetypeTags.has("combo")) commanderTags.add("combo_commander");
  if (archetypeTags.has("control")) commanderTags.add("control_commander");
  if (gameplayTags.has("engine") || gameplayTags.has("payoff")) commanderTags.add("build_around_commander");
  if (gameplayTags.has("card_draw") && gameplayTags.has("ramp")) commanderTags.add("goodstuff_commander");
  if (themeTags.has("tokens") || themeTags.has("tribal") || themeTags.has("artifacts") || themeTags.has("enchantments")) {
    commanderTags.add("linear_commander");
  }
  if (gameplayTags.has("support") || gameplayTags.has("enabler")) commanderTags.add("open_ended_commander");

  const commanderEligible = isCommanderEligible(row.type_line ?? undefined, row.oracle_text ?? undefined);

  const interactionScore =
    countMatches(joined, [/\bcounter target\b/i, /\bdestroy target\b/i, /\bexile target\b/i, /\bopponents can't\b/i, /\bdestroy all\b/i]) +
    (gameplayTags.has("removal_single") ? 1 : 0) +
    (gameplayTags.has("removal_boardwipe") ? 2 : 0) +
    (keywords.includes("flash") ? 1 : 0);
  const complexityScore =
    countMatches(joined, [/\bsearch your library\b/i, /\bchoose\b/i, /\bwhenever\b/i, /\bcopy\b/i, /\bonce each turn\b/i]) +
    (commanderTags.has("superfriends") ? 2 : 0) +
    (commanderTags.has("spell_combo") ? 2 : 0) +
    (themeTags.has("storm") ? 2 : 0);
  const powerScore =
    (archetypeTags.has("combo") ? 2 : 0) +
    (commanderTags.has("stax_like") ? 2 : 0) +
    (gameplayTags.has("interaction") ? 1 : 0) +
    (gameplayTags.has("ramp") ? 1 : 0) +
    (colorIdentity.length >= 4 ? 1 : 0) +
    (gameplayTags.has("tutor") ? 1 : 0) +
    (themeTags.has("extra_turns") ? 1 : 0);
  const budgetScore =
    (colorIdentity.length >= 4 ? 2 : 0) +
    (commanderTags.has("superfriends") ? 2 : 0) +
    (commanderTags.has("spell_combo") ? 1 : 0) +
    (themeTags.has("dragons") ? 1 : 0) +
    (themeTags.has("vehicles") ? 1 : 0) +
    (themeTags.has("equipment") ? 1 : 0);

  const popularityScore = Number(
    Math.max(
      0.05,
      Math.min(
        0.99,
        0.25 +
          (colorIdentity.length * 0.08) +
          (themeTags.size * 0.03) +
          (gameplayTags.has("card_draw") ? 0.08 : 0) +
          (themeTags.has("tribal") ? 0.06 : 0) +
          (themeTags.has("treasure") ? 0.04 : 0) +
          (commanderEligible ? 0.12 : 0),
      ),
    ).toFixed(3),
  );

  return {
    name: row.name,
    gameplay_tags: uniqueSorted(gameplayTags),
    theme_tags: uniqueSorted(themeTags),
    archetype_tags: uniqueSorted(archetypeTags),
    commander_tags: uniqueSorted(commanderTags),
    commander_eligible: commanderEligible,
    commander_power_band: powerScore >= 4 ? "optimized" : powerScore >= 2 ? "focused" : "casual",
    commander_budget_band: budgetScore >= 4 ? "high" : budgetScore >= 2 ? "moderate" : "budget",
    commander_complexity: complexityScore >= 5 ? "high" : complexityScore >= 3 ? "medium" : "low",
    commander_interaction: interactionScore >= 4 ? "high" : interactionScore >= 2 ? "medium" : "low",
    popularity_score: popularityScore,
    tag_version: CARD_TAG_RULE_VERSION,
    source: CARD_TAG_RULE_SOURCE,
    updated_at: new Date().toISOString(),
  };
}

function toPowerBand(value: NullableString): CommanderPreference["desiredPowerBand"] {
  const raw = normalizeText(value);
  if (raw.includes("competitive") || raw.includes("optimized")) return "optimized";
  if (raw.includes("focused") || raw.includes("mid")) return "focused";
  return "casual";
}

function toBudgetBand(value: NullableString): CommanderPreference["desiredBudgetBand"] {
  const raw = normalizeText(value);
  if (raw.includes("high") || raw.includes("premium") || raw.includes("no limit")) return "high";
  if (raw.includes("moderate") || raw.includes("mid")) return "moderate";
  return "budget";
}

function toComplexityBand(value: NullableString): CommanderPreference["desiredComplexity"] {
  const raw = normalizeText(value);
  if (raw.includes("complex")) return "high";
  if (raw.includes("medium")) return "medium";
  return "low";
}

function toInteractionBand(value: NullableString): CommanderPreference["desiredInteraction"] {
  const raw = normalizeText(value);
  if (raw.includes("heavy") || raw.includes("answer everything")) return "high";
  if (raw.includes("moderate") || raw.includes("some")) return "medium";
  return "low";
}

export function buildCommanderPreference(input: CommanderRecommendationRequest): CommanderPreference {
  const desiredThemeTags = new Set<string>();
  const desiredGameplayTags = new Set<string>();
  const desiredArchetypes = new Set<string>();
  const desiredCommanderTags = new Set<string>();

  const answers = input.answers ?? {};
  const rawThemeAnswer = normalizeText(answers.theme);
  const themeAnswer = THEME_ALIASES[rawThemeAnswer] ?? rawThemeAnswer;
  if (themeAnswer) desiredThemeTags.add(themeAnswer);
  if (themeAnswer === "tokens") desiredCommanderTags.add("go_wide");
  if (themeAnswer === "tokens") desiredArchetypes.add("aggro");
  if (themeAnswer === "tokens") desiredGameplayTags.add("payoff");
  if (themeAnswer === "graveyard") {
    desiredGameplayTags.add("recursion");
    desiredArchetypes.add("value");
  }
  if (themeAnswer === "artifacts") {
    desiredGameplayTags.add("engine");
    desiredArchetypes.add("value");
  }
  if (themeAnswer === "enchantments") {
    desiredArchetypes.add("control");
    desiredArchetypes.add("value");
  }
  if (themeAnswer === "spellslinger") {
    desiredCommanderTags.add("spell_combo");
    desiredArchetypes.add("combo");
    desiredGameplayTags.add("card_draw");
    desiredGameplayTags.add("engine");
  }
  if (themeAnswer === "tribal") {
    desiredThemeTags.add("tribal");
    desiredArchetypes.add("aggro");
  }
  if (themeAnswer === "landfall") {
    desiredCommanderTags.add("big_mana");
  }
  if (themeAnswer === "lifegain") desiredThemeTags.add("lifedrain");

  const pace = normalizeText(answers.pace);
  if (pace === "aggro") desiredArchetypes.add("aggro");
  if (pace === "control") desiredArchetypes.add("control");
  if (pace === "combo") desiredArchetypes.add("combo");
  if (pace === "value") desiredArchetypes.add("value");

  const interaction = normalizeText(answers.interaction);
  if (interaction === "heavy") desiredGameplayTags.add("interaction");
  if (interaction === "chaos") desiredArchetypes.add("chaos");
  if (interaction === "moderate") desiredArchetypes.add("midrange");

  const complexity = normalizeText(answers.complexity);
  if (complexity.includes("simple")) {
    desiredCommanderTags.add("linear_commander");
  }
  if (complexity.includes("complex")) {
    desiredGameplayTags.add("engine");
  }

  const vibe = normalizeText(input.vibe ?? input.profileDescription);
  for (const [needle, mappedTags] of Object.entries(VIBE_KEYWORDS)) {
    if (!vibe.includes(needle)) continue;
    for (const tag of mappedTags) {
      if (
        ["go_wide", "aristocrats", "spell_combo", "big_mana", "build_around_commander", "linear_commander", "open_ended_commander"].includes(tag)
      ) desiredCommanderTags.add(tag);
      else if (["aggro", "control", "combo", "value", "politics", "chaos", "midrange"].includes(tag)) desiredArchetypes.add(tag);
      else if (
        ["ramp", "interaction", "recursion", "engine", "payoff", "enabler", "finisher", "support", "card_draw", "draw_burst"].includes(tag)
      ) desiredGameplayTags.add(tag);
      else desiredThemeTags.add(tag);
    }
  }

  const traits = input.traits ?? {};
  if ((traits.aggression ?? 50) >= 60) desiredArchetypes.add("aggro");
  if ((traits.control ?? 50) >= 60) desiredArchetypes.add("control");
  if ((traits.comboAppetite ?? 50) >= 60) {
    desiredArchetypes.add("combo");
    desiredCommanderTags.add("spell_combo");
  }
  if ((traits.interactionPref ?? 50) >= 60) desiredGameplayTags.add("interaction");
  if ((traits.gameLengthPref ?? 50) >= 58) desiredArchetypes.add("value");
  if ((traits.budgetElasticity ?? 50) <= 40) desiredGameplayTags.add("ramp");

  const seedNames = uniqueSorted([...(input.recommendedCommanders ?? []), input.selectedCommander ?? ""]);

  return {
    desiredThemeTags,
    desiredGameplayTags,
    desiredArchetypes,
    desiredCommanderTags,
    desiredPowerBand: toPowerBand(input.powerLevel),
    desiredBudgetBand: toBudgetBand(input.budget ?? answers.budget),
    desiredComplexity: toComplexityBand(answers.complexity),
    desiredInteraction: toInteractionBand(answers.interaction),
    seedNames,
  };
}

function scoreTagMatches(candidateTags: string[], desired: Set<string>, weight: number): number {
  if (!candidateTags.length || desired.size === 0) return 0;
  return candidateTags.reduce((score, tag) => score + (desired.has(tag) ? weight : 0), 0);
}

function scoreArchetypeMismatch(candidateTags: string[], desired: Set<string>): number {
  if (desired.size === 0 || candidateTags.length === 0) return 0;
  if (sharesAny(candidateTags, desired)) return 0;
  if (desired.has("value") && candidateTags.includes("aggro")) return -10;
  if (desired.has("control") && candidateTags.includes("aggro")) return -8;
  if (desired.has("combo") && candidateTags.includes("midrange")) return -6;
  if (desired.has("aggro") && candidateTags.includes("control")) return -6;
  return -4;
}

function scoreBandMatch<T extends string>(actual: T, desired: T, exactWeight: number): number {
  return actual === desired ? exactWeight : 0;
}

function humanizeTag(tag: string): string {
  switch (tag) {
    case "go_wide":
      return "go-wide";
    case "spell_combo":
      return "spell-combo";
    case "big_mana":
      return "big mana";
    case "card_draw":
      return "card draw";
    case "death_triggers":
      return "death triggers";
    case "counters_plus1":
      return "+1/+1 counters";
    case "legendary_matters":
      return "legendary-matters";
    default:
      return tag.replace(/_/g, " ");
  }
}

function preferredThemeTag(candidate: RecommendationCandidate): string | undefined {
  return candidate.theme_tags.find((tag) => !GENERIC_THEME_TAGS.has(tag)) ?? candidate.theme_tags[0];
}

function preferredCommanderTag(candidate: RecommendationCandidate): string | undefined {
  return candidate.commander_tags.find((tag) => !GENERIC_COMMANDER_TAGS.has(tag)) ?? candidate.commander_tags[0];
}

function themeGateSatisfied(candidate: RecommendationCandidate, desiredTheme: string): boolean {
  const haystack = buildThemeHaystack(candidate);
  const hasCreatureTokenEvidence = /\bcreature token\b|\bcreate .* creature token\b|\bpopulate\b|\bamass\b|\bincubate\b/i.test(haystack);
  const hasTokenPayoff = TOKEN_PAYOFF_PATTERN.test(haystack) && (candidate.commander_tags.includes("go_wide") || candidate.gameplay_tags.includes("payoff"));
  const isTreasureOnly = TREASURE_ONLY_PATTERN.test(haystack) && !hasCreatureTokenEvidence;
  const hasGraveyardEvidence = THEME_GATE_PATTERNS.graveyard.test(haystack);
  const hasSpellslingerEvidence = /\binstant or sorcery\b|\bcopy target spell\b|\binstant and sorcery spells you cast\b|\bwhenever you cast (?:an )?instant or sorcery\b|\bstorm\b/i.test(haystack);

  switch (desiredTheme) {
    case "tokens":
      return !isTreasureOnly && (hasCreatureTokenEvidence || hasTokenPayoff || (candidate.theme_tags.includes("tokens") && candidate.commander_tags.includes("go_wide")));
    case "graveyard":
    case "reanimator":
      return hasGraveyardEvidence && (candidate.theme_tags.includes("graveyard") || candidate.theme_tags.includes("reanimator") || candidate.theme_tags.includes("self_mill") || candidate.gameplay_tags.includes("recursion"));
    case "spellslinger":
      return hasSpellslingerEvidence && (candidate.theme_tags.includes("spellslinger") || candidate.commander_tags.includes("spell_combo") || candidate.gameplay_tags.includes("card_draw"));
    case "tribal":
      return candidate.theme_tags.includes("tribal") || candidate.commander_tags.includes("tribal_commander") || THEME_GATE_PATTERNS.tribal.test(haystack);
    case "enchantments":
      return candidate.theme_tags.includes("enchantments") || THEME_GATE_PATTERNS.enchantments.test(haystack);
    case "artifacts":
      return candidate.theme_tags.includes("artifacts") || THEME_GATE_PATTERNS.artifacts.test(haystack);
    case "blink":
      return candidate.theme_tags.includes("blink") || candidate.theme_tags.includes("etb") || THEME_GATE_PATTERNS.blink.test(haystack);
    default:
      return true;
  }
}

function archetypeLabel(candidate: RecommendationCandidate): string {
  return candidate.archetype_tags[0] || candidate.theme_tags[0] || candidate.commander_tags[0] || "Commander";
}

function descriptionLabel(candidate: RecommendationCandidate): string {
  const primaryTheme = preferredThemeTag(candidate);
  const primaryCommanderTag = preferredCommanderTag(candidate);
  if (primaryTheme && primaryCommanderTag) return `${primaryTheme} ${primaryCommanderTag}`.replace(/_/g, " ");
  if (primaryTheme) return `${primaryTheme} build`;
  if (primaryCommanderTag) return `${primaryCommanderTag.replace(/_/g, " ")} plan`;
  return "versatile game plan";
}

function buildFitReason(candidate: RecommendationCandidate, pref: CommanderPreference): string {
  const matchedTheme = candidate.theme_tags.find((tag) => pref.desiredThemeTags.has(tag));
  const matchedArchetype = candidate.archetype_tags.find((tag) => pref.desiredArchetypes.has(tag));
  const matchedGameplay = candidate.gameplay_tags.find((tag) => pref.desiredGameplayTags.has(tag));
  const matchedCommanderTag = candidate.commander_tags.find((tag) => pref.desiredCommanderTags.has(tag) && !GENERIC_COMMANDER_TAGS.has(tag));
  const theme = humanizeTag(matchedTheme ?? preferredThemeTag(candidate) ?? "");
  const gameplay = humanizeTag(matchedGameplay ?? candidate.gameplay_tags[0] ?? "");
  const commanderTag = humanizeTag(matchedCommanderTag ?? preferredCommanderTag(candidate) ?? "");
  const archetype = humanizeTag(matchedArchetype ?? candidate.archetype_tags[0] ?? "");

  if (matchedTheme === "spellslinger") {
    if (candidate.commander_tags.includes("spell_combo")) return `Actually rewards instant-and-sorcery play instead of generic value lines.`;
    if (candidate.gameplay_tags.includes("card_draw")) return `Keeps spellslinger turns flowing with real card-draw velocity.`;
    return `Leans into spellslinger sequencing without drifting into random midrange.`;
  }
  if (matchedTheme === "tokens") {
    if (candidate.gameplay_tags.includes("payoff")) return `Pays off token boards instead of just making extra material.`;
    if (candidate.gameplay_tags.includes("ramp")) return `Turns token starts into a wider board without stalling on mana.`;
    if (candidate.commander_tags.includes("go_wide")) return `Turns token starts into a real go-wide kill plan.`;
    return `Supports a token-heavy table presence without going off-theme.`;
  }
  if (matchedTheme === "graveyard") {
    if (candidate.gameplay_tags.includes("recursion")) return `Keeps the graveyard plan live with real recursion, not just filler text.`;
    if (candidate.commander_tags.includes("aristocrats")) return `Connects graveyard value with sacrifice payoffs cleanly.`;
    return `Uses the graveyard as a real engine instead of a side note.`;
  }
  if (matchedTheme && matchedGameplay) {
    return `Matches ${humanizeTag(matchedTheme)} and backs it up with ${humanizeTag(matchedGameplay)}.`;
  }
  if (matchedTheme && matchedCommanderTag) {
    return `Leans hard into ${humanizeTag(matchedTheme)} through a ${humanizeTag(matchedCommanderTag)} shell.`;
  }
  if (matchedTheme && matchedArchetype) {
    return `Blends ${humanizeTag(matchedTheme)} with a cleaner ${humanizeTag(matchedArchetype)} game plan.`;
  }
  if (matchedTheme) return `Stays on-theme for ${humanizeTag(matchedTheme)} without asking for a full rebuild.`;
  if (matchedCommanderTag) return `Adds a ${commanderTag} angle while keeping the plan coherent.`;
  if (matchedGameplay) return `Fits because it gives you more ${gameplay} in the spots that matter.`;
  if (matchedArchetype) return `Good fit if you want a more reliable ${archetype} shell.`;
  return `Broad ${archetypeLabel(candidate)} option with ${descriptionLabel(candidate)} support.`;
}

function buildFallbackVariantReason(candidate: RecommendationCandidate): string[] {
  const theme = humanizeTag(preferredThemeTag(candidate) ?? candidate.theme_tags[0] ?? "theme");
  const gameplay = humanizeTag(candidate.gameplay_tags[0] ?? "engine");
  const archetype = humanizeTag(candidate.archetype_tags[0] ?? "plan");
  const commanderTag = humanizeTag(preferredCommanderTag(candidate) ?? candidate.commander_tags[0] ?? "commander");
  return [
    `Keeps the ${theme} plan grounded through ${gameplay}.`,
    `Offers a ${archetype} angle without dropping the ${theme} core.`,
    `Adds a ${commanderTag} shell while staying close to the deck's main plan.`,
  ];
}

function dedupeFitReasons(rows: Array<{ candidate: RecommendationCandidate; fitReason: string }>): Array<{ candidate: RecommendationCandidate; fitReason: string }> {
  const seen = new Set<string>();
  return rows.map((row) => {
    const normalized = row.fitReason.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      for (const variant of buildFallbackVariantReason(row.candidate)) {
        const key = variant.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          return { ...row, fitReason: variant };
        }
      }
    }
    seen.add(normalized);
    return row;
  });
}

function colorIdentityBucket(colors: string[] | null | undefined): string {
  const list = lowerArray(colors);
  return list.length ? list.join("") : "colorless";
}

function diversifyRecommendations(
  ranked: Array<{ candidate: RecommendationCandidate; score: number }>,
  limit: number,
): Array<{ candidate: RecommendationCandidate; score: number }> {
  const out: Array<{ candidate: RecommendationCandidate; score: number }> = [];
  const seenStrategyBuckets = new Set<string>();
  const seenColorBuckets = new Map<string, number>();

  for (const row of ranked) {
    const strategyBucket = [
      row.candidate.archetype_tags[0] ?? "none",
      row.candidate.theme_tags[0] ?? "none",
      row.candidate.commander_tags[0] ?? "none",
    ].join("|");
    const colorBucket = colorIdentityBucket(row.candidate.color_identity);
    const colorCount = seenColorBuckets.get(colorBucket) ?? 0;
    const shouldSkipForDiversity = seenStrategyBuckets.has(strategyBucket) && colorCount >= 1 && out.length < limit * 2;
    if (shouldSkipForDiversity) continue;
    out.push(row);
    seenStrategyBuckets.add(strategyBucket);
    seenColorBuckets.set(colorBucket, colorCount + 1);
    if (out.length >= limit) break;
  }

  if (out.length >= limit) return out;
  for (const row of ranked) {
    if (out.some((existing) => existing.candidate.name === row.candidate.name)) continue;
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

function scoreCandidate(candidate: RecommendationCandidate, pref: CommanderPreference): number {
  let score = 0;
  const oracle = normalizeText(candidate.oracle_text);
  const typeLine = normalizeText(candidate.type_line);
  const haystack = buildThemeHaystack(candidate);
  const hasCreatureTokenEvidence = THEME_GATE_PATTERNS.tokens.test(haystack);
  const hasGraveyardEvidence = THEME_GATE_PATTERNS.graveyard.test(haystack);
  const hasSpellslingerEvidence = /\binstant or sorcery\b|\bcopy target spell\b|\binstant and sorcery spells you cast\b|\bwhenever you cast (?:an )?instant or sorcery\b|\bstorm\b/i.test(haystack);
  const themeMatchCount = candidate.theme_tags.filter((tag) => pref.desiredThemeTags.has(tag)).length;
  const gameplayMatchCount = candidate.gameplay_tags.filter((tag) => pref.desiredGameplayTags.has(tag)).length;
  const archetypeMatchCount = candidate.archetype_tags.filter((tag) => pref.desiredArchetypes.has(tag)).length;
  const commanderMatchCount = candidate.commander_tags.filter((tag) => pref.desiredCommanderTags.has(tag)).length;
  score += scoreTagMatches(candidate.theme_tags, pref.desiredThemeTags, 18);
  score += scoreTagMatches(candidate.gameplay_tags, pref.desiredGameplayTags, 12);
  score += scoreTagMatches(candidate.archetype_tags, pref.desiredArchetypes, 14);
  score += scoreTagMatches(candidate.commander_tags, pref.desiredCommanderTags, 14);
  score += scoreBandMatch(candidate.commander_power_band, pref.desiredPowerBand, 8);
  score += scoreBandMatch(candidate.commander_budget_band, pref.desiredBudgetBand, 8);
  score += scoreBandMatch(candidate.commander_complexity, pref.desiredComplexity, 6);
  score += scoreBandMatch(candidate.commander_interaction, pref.desiredInteraction, 6);
  score += scoreArchetypeMismatch(candidate.archetype_tags, pref.desiredArchetypes);
  if (pref.desiredThemeTags.has("graveyard") && candidate.gameplay_tags.includes("recursion")) score += 10;
  if (pref.desiredThemeTags.has("tokens") && candidate.commander_tags.includes("go_wide")) score += 10;
  if (pref.desiredThemeTags.has("spellslinger") && candidate.commander_tags.includes("spell_combo")) score += 8;
  if (pref.desiredThemeTags.has("enchantments") && candidate.theme_tags.includes("enchantments")) score += 8;
  if (pref.desiredThemeTags.has("artifacts") && candidate.theme_tags.includes("artifacts")) score += 8;
  if (pref.desiredThemeTags.has("blink") && candidate.theme_tags.includes("etb")) score += 8;
  if (pref.desiredThemeTags.has("reanimator") && candidate.gameplay_tags.includes("recursion")) score += 8;
  if (pref.desiredThemeTags.has("treasure") && candidate.gameplay_tags.includes("ramp")) score += 6;
  if (pref.desiredThemeTags.has("equipment") && candidate.archetype_tags.includes("aggro")) score += 6;
  if (pref.desiredCommanderTags.has("linear_commander") && candidate.commander_tags.includes("linear_commander")) score += 2;
  if (pref.desiredCommanderTags.has("open_ended_commander") && candidate.commander_tags.includes("open_ended_commander")) score += 1;
  if (pref.seedNames.includes(candidate.name)) score += 10;
  if (pref.desiredThemeTags.size > 0 && themeMatchCount === 0) score -= 18;
  if (pref.desiredGameplayTags.size > 0 && gameplayMatchCount === 0) score -= 8;
  if (pref.desiredArchetypes.size > 0 && archetypeMatchCount === 0) score -= 8;
  if (pref.desiredCommanderTags.size > 0 && commanderMatchCount === 0) score -= 6;
  if (themeMatchCount > 0) score += 10;
  if (themeMatchCount > 1) score += 8;
  if (gameplayMatchCount > 0) score += 4;
  if (archetypeMatchCount > 0) score += 4;
  if (pref.desiredThemeTags.has("tokens") && !candidate.theme_tags.includes("tokens") && !candidate.commander_tags.includes("go_wide")) score -= 16;
  if (pref.desiredThemeTags.has("graveyard") && !candidate.theme_tags.includes("graveyard") && !candidate.gameplay_tags.includes("recursion")) score -= 18;
  if (pref.desiredThemeTags.has("spellslinger") && !candidate.theme_tags.includes("spellslinger") && !candidate.commander_tags.includes("spell_combo")) score -= 18;
  if (pref.desiredThemeTags.has("tribal") && !candidate.theme_tags.includes("tribal") && !candidate.commander_tags.includes("tribal_commander")) score -= 16;
  if (pref.desiredThemeTags.has("enchantments") && !candidate.theme_tags.includes("enchantments")) score -= 14;
  if (pref.desiredThemeTags.has("artifacts") && !candidate.theme_tags.includes("artifacts")) score -= 14;
  for (const desiredTheme of pref.desiredThemeTags) {
    if (!themeGateSatisfied(candidate, desiredTheme)) score -= 32;
  }
  if (pref.desiredThemeTags.has("tokens")) {
    if (hasCreatureTokenEvidence) score += 24;
    if (!hasCreatureTokenEvidence && /\btreasure token\b|\bclue token\b|\bfood token\b|\bblood token\b/i.test(oracle)) score -= 28;
  }
  if (pref.desiredThemeTags.has("graveyard")) {
    if (hasGraveyardEvidence) score += 18;
    if (!hasGraveyardEvidence && candidate.commander_tags.includes("aristocrats")) score -= 12;
  }
  if (pref.desiredThemeTags.has("spellslinger")) {
    if (hasSpellslingerEvidence) score += 28;
    if (/\bdraw a card\b|\bdraw cards\b|\bcopy\b/i.test(oracle)) score += 6;
    if (!hasSpellslingerEvidence) score -= 32;
  }
  if (pref.desiredThemeTags.has("artifacts") && (/\bartifact\b/i.test(oracle) || /\bartifact\b/i.test(typeLine))) score += 14;
  if (pref.desiredThemeTags.has("enchantments") && (/\benchantment\b/i.test(oracle) || /\benchantment\b/i.test(typeLine) || /\baura\b/i.test(typeLine))) score += 14;
  if (pref.desiredThemeTags.has("tribal") && /\bdragon\b|\belf\b|\bzombie\b|\bgoblin\b|\bvampire\b/i.test(`${oracle} ${typeLine}`)) score += 18;
  if (pref.desiredThemeTags.has("spellslinger") && candidate.commander_tags.includes("spell_combo")) score += 10;
  if (pref.desiredThemeTags.has("tokens") && candidate.gameplay_tags.includes("payoff")) score += 8;
  if (pref.desiredThemeTags.has("graveyard") && candidate.theme_tags.includes("self_mill")) score += 6;
  score += Math.round((candidate.popularity_score ?? 0) * 6);
  return score;
}

export async function fetchScryfallTagSourceRows(
  admin: SupabaseClient,
  options?: { names?: string[]; fromNameExclusive?: string | null; limit?: number },
): Promise<ScryfallTagSourceRow[]> {
  let query = admin
    .from("scryfall_cache")
    .select(
      "name, printed_name, type_line, oracle_text, keywords, mana_cost, cmc, color_identity, colors, legalities, is_land, is_creature, is_instant, is_sorcery, is_artifact, is_enchantment, is_planeswalker, small, normal, art_crop",
    )
    .order("name", { ascending: true });

  if (options?.names?.length) query = query.in("name", uniqueSorted(options.names));
  if (!options?.names?.length) query = query.limit(Math.max(1, Math.min(options?.limit ?? 500, 1000)));
  if (options?.fromNameExclusive) query = query.gt("name", options.fromNameExclusive);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ScryfallTagSourceRow[];
}

export async function upsertCardTagCacheRows(admin: SupabaseClient, rows: CardTagCacheRow[]): Promise<number> {
  if (!rows.length) return 0;
  const { error, count } = await admin.from("card_tag_cache").upsert(rows, {
    onConflict: "name",
    ignoreDuplicates: false,
  });
  if (error) throw new Error(error.message);
  return count ?? rows.length;
}

export async function retagCardsByNames(admin: SupabaseClient, names: string[]): Promise<number> {
  const rows = await fetchScryfallTagSourceRows(admin, { names });
  const derived = rows.map(deriveCardTagCacheRow);
  return upsertCardTagCacheRows(admin, derived);
}

export async function buildCommanderRecommendations(
  admin: SupabaseClient,
  input: CommanderRecommendationRequest,
  options?: CommanderBuildOptions,
): Promise<CommanderRecommendation[]> {
  const limit = Math.max(6, Math.min(input.limit ?? 6, 12));
  const bannedMaps = bannedDataToMaps(await getBannedCardsForRecommendations(admin));
  const bannedCommanderMap = bannedMaps.Commander ?? {};

  const { data: tagRows, error: tagError } = await admin
    .from("card_tag_cache")
    .select(
      "name, gameplay_tags, theme_tags, archetype_tags, commander_tags, commander_eligible, commander_power_band, commander_budget_band, commander_complexity, commander_interaction, popularity_score, tag_version, source, updated_at",
    )
    .eq("commander_eligible", true)
    .eq("tag_version", CARD_TAG_RULE_VERSION)
    .limit(5000);
  if (tagError) throw new Error(tagError.message);

  const { data: cacheRows, error: cacheError } = await admin
    .from("scryfall_cache")
    .select(
      "name, printed_name, type_line, oracle_text, color_identity, colors, legalities, is_land, is_creature, is_instant, is_sorcery, is_artifact, is_enchantment, is_planeswalker, small, normal, art_crop",
    )
    .or(postgrestCommanderEligibleCatalogOr())
    .limit(5000);
  if (cacheError) throw new Error(cacheError.message);

  const { data: commanderRows } = await admin
    .from("decks")
    .select("commander")
    .not("commander", "is", null)
    .limit(12000);
  const commanderUsage = new Map<string, number>();
  for (const row of (commanderRows ?? []) as Array<{ commander?: string | null }>) {
    const name = normalizeScryfallCacheName(String(row.commander || ""));
    if (!name) continue;
    commanderUsage.set(name, (commanderUsage.get(name) ?? 0) + 1);
  }

  const cacheByName = new Map<string, ScryfallTagSourceRow>();
  for (const row of (cacheRows ?? []) as ScryfallTagSourceRow[]) cacheByName.set(row.name, row);

  const candidates: RecommendationCandidate[] = [];
  for (const tagRow of (tagRows ?? []) as CardTagCacheRow[]) {
    const sourceRow = cacheByName.get(tagRow.name);
    if (!sourceRow) continue;
    if (!isCommanderEligible(sourceRow.type_line ?? undefined, sourceRow.oracle_text ?? undefined)) continue;
    if ((sourceRow.legalities?.commander ?? "").toLowerCase() !== "legal") continue;
    if (bannedCommanderMap[tagRow.name]) continue;
    const usageCount = commanderUsage.get(tagRow.name) ?? 0;
    if (usageCount <= 0 && (tagRow.popularity_score ?? 0) < 0.72) continue;
    candidates.push({ ...sourceRow, ...tagRow });
  }

  const pref = buildCommanderPreference(input);
  const ranked = candidates
    .map((candidate) => {
      const usageCount = commanderUsage.get(candidate.name) ?? 0;
      const usageScore = Math.min(28, Math.round(Math.log10(usageCount + 1) * 18));
      return { candidate, score: scoreCandidate(candidate, pref) + usageScore };
    })
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));

  const diversified = diversifyRecommendations(ranked.slice(0, 40), limit);
  const strictThemeRows =
    pref.desiredThemeTags.size > 0
      ? ranked.filter(({ candidate }) => Array.from(pref.desiredThemeTags).every((theme) => themeGateSatisfied(candidate, theme))).slice(0, 40)
      : [];
  const deterministicPool =
    strictThemeRows.length > 0
      ? [
          ...strictThemeRows,
          ...ranked.filter(({ candidate }) => !strictThemeRows.some((strictRow) => strictRow.candidate.name === candidate.name)),
        ].slice(0, 40)
      : ranked.slice(0, 40);
  const deterministicRows = diversifyRecommendations(deterministicPool, limit).slice(0, limit);
  let finalRows = deterministicRows;

  const profile = preferenceToProfile(pref);
  const intent = buildRecommendationIntent({
    routeKind: "commander",
    routeLabel: "commander_recommendations",
    formatLabel: String(input.format || "Commander"),
    profile,
    selectionCount: limit,
    isGuest: options?.isGuest,
    isPro: options?.isPro,
    userId: options?.userId ?? null,
    queryText: input.vibe ?? input.profileDescription ?? null,
    budgetBand: pref.desiredBudgetBand,
    powerBand: pref.desiredPowerBand,
  });
  const rerankable = rankGroundedCandidates(
    deterministicPool.map((row) => ({ ...row.candidate })) as any,
    profile,
    intent,
  ).slice(0, 40);
  const reranked = await aiRerankRecommendations({
    candidates: rerankable,
    intent,
    userId: options?.userId ?? null,
    isPro: options?.isPro,
  }).catch(() => null);

  if (reranked?.picks?.length) {
    const rowByDisplayName = new Map<string, typeof deterministicRows[number]>();
    for (const row of ranked) {
      rowByDisplayName.set(String(row.candidate.printed_name || "").trim() || toDisplayName(row.candidate.name), row);
    }
    const pickedRows = reranked.picks
      .map((pick) => {
        const row = rowByDisplayName.get(pick.name);
        if (!row) return null;
        return {
          ...row,
          candidate: {
            ...row.candidate,
            printed_name: pick.name,
            oracle_text: row.candidate.oracle_text,
          },
          rerankReason: pick.reason,
        };
      })
      .filter(Boolean) as Array<typeof ranked[number] & { candidate: RecommendationCandidate; rerankReason: string }>;
    if (pickedRows.length >= Math.min(4, limit)) {
      finalRows = pickedRows.map(({ candidate, score, rerankReason }) => ({ candidate, score, rerankReason })) as any;
    }
  }

  const finalized = dedupeFitReasons(
    finalRows.map(({ candidate, score, rerankReason }: any) => ({
      candidate,
      fitReason: rerankReason || candidate.rerankReason || buildFitReason(candidate, pref),
      matchScore: score,
    })),
  );

  return finalized.map(({ candidate, fitReason, matchScore }: any) => ({
    name: String(candidate.printed_name || "").trim() || toDisplayName(candidate.name),
    description: descriptionLabel(candidate),
    archetype: archetypeLabel(candidate).replace(/_/g, " "),
    fitReason,
    matchScore,
    imageUri: candidate.art_crop ?? candidate.normal ?? candidate.small ?? undefined,
    colorIdentity: candidate.color_identity ?? [],
  }));
}
