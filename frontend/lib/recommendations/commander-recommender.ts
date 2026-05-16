import type { SupabaseClient } from "@supabase/supabase-js";
import { bannedDataToMaps, getBannedCards } from "@/lib/data/get-banned-cards";
import { isCommanderEligible, postgrestCommanderEligibleCatalogOr } from "@/lib/deck/deck-enrichment";

export const CARD_TAG_RULE_VERSION = 1;
export const CARD_TAG_RULE_SOURCE = "rules_v1";

type NullableString = string | null | undefined;

export type ScryfallTagSourceRow = {
  name: string;
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
  ["graveyard", /\bgraveyard\b|\bmill\b|\bsurveil\b|\bfrom your graveyard\b/i],
  ["sacrifice", /\bsacrifice\b|\bdies\b|\bwhen(?:ever)? .* dies\b/i],
  ["artifacts", /\bartifact\b/i],
  ["enchantments", /\benchantment\b|\baura\b|\bconstellation\b/i],
  ["spellslinger", /\binstant\b|\bsorcery\b|\bwhenever you cast (?:an )?instant or sorcery\b|\bspells? you cast\b/i],
  ["lands", /\blandfall\b|\badditional land\b|\bsearch your library for a land\b|\bwhenever a land enters\b/i],
  ["lifegain", /\bgain(?:ed)? life\b|\blife total\b|\bwhenever you gain life\b/i],
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
  ["recursion", /\breturn target .* from your graveyard\b|\breanimate\b|\bfrom your graveyard\b/i],
  ["protection", /\bhexproof\b|\bindestructible\b|\bprotection from\b|\bward\b/i],
  ["payoff", /\bwhenever\b|\bat the beginning of\b|\bfor each\b/i],
  ["engine", /\bwhenever\b.{0,60}\byou\b|\bat the beginning of each\b/i],
];

const ARCHETYPE_PATTERNS: Array<[string, RegExp]> = [
  ["aggro", /\bhaste\b|\bmenace\b|\bdouble strike\b|\bcombat damage\b|\battacking\b/i],
  ["control", /\bcounter target\b|\btap target\b|\bcan't\b|\bskip\b|\bopponents can't\b/i],
  ["combo", /\binfinite\b|\buntap\b|\bcopy that spell\b|\bwhenever you cast\b/i],
  ["value", /\bdraw a card\b|\breturn target\b|\bcreate .* token\b|\bwhenever\b/i],
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
};

function uniqueSorted(items: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(items).filter(Boolean))).sort((a, b) => a.localeCompare(b));
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

function stringIncludesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
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

  const gameplayTags = new Set<string>();
  for (const [tag, pattern] of GAMEPLAY_PATTERNS) {
    if (pattern.test(joined)) gameplayTags.add(tag);
  }

  const archetypeTags = new Set<string>();
  for (const [tag, pattern] of ARCHETYPE_PATTERNS) {
    if (pattern.test(joined)) archetypeTags.add(tag);
  }
  if (themeTags.has("tokens") || themeTags.has("tribal")) archetypeTags.add("aggro");
  if (themeTags.has("graveyard") || gameplayTags.has("card_draw")) archetypeTags.add("value");
  if (themeTags.has("spellslinger")) archetypeTags.add("combo");

  const commanderTags = new Set<string>();
  for (const [tag, pattern] of COMMANDER_PATTERNS) {
    if (pattern.test(joined)) commanderTags.add(tag);
  }
  if (themeTags.has("tokens")) commanderTags.add("go_wide");
  if (themeTags.has("graveyard") || themeTags.has("sacrifice")) commanderTags.add("aristocrats");
  if (themeTags.has("spellslinger")) commanderTags.add("spell_combo");
  if (gameplayTags.has("ramp") || themeTags.has("lands")) commanderTags.add("big_mana");

  const commanderEligible = isCommanderEligible(row.type_line ?? undefined, row.oracle_text ?? undefined);

  const interactionScore =
    countMatches(joined, [/\bcounter target\b/i, /\bdestroy target\b/i, /\bexile target\b/i, /\bopponents can't\b/i]) +
    (keywords.includes("flash") ? 1 : 0);
  const complexityScore =
    countMatches(joined, [/\bsearch your library\b/i, /\bchoose\b/i, /\bwhenever\b/i, /\bcopy\b/i]) +
    (commanderTags.has("superfriends") ? 2 : 0) +
    (commanderTags.has("spell_combo") ? 2 : 0);
  const powerScore =
    (archetypeTags.has("combo") ? 2 : 0) +
    (commanderTags.has("stax_like") ? 2 : 0) +
    (gameplayTags.has("interaction") ? 1 : 0) +
    (gameplayTags.has("ramp") ? 1 : 0) +
    (colorIdentity.length >= 4 ? 1 : 0);
  const budgetScore =
    (colorIdentity.length >= 4 ? 2 : 0) +
    (commanderTags.has("superfriends") ? 2 : 0) +
    (commanderTags.has("spell_combo") ? 1 : 0) +
    (themeTags.has("dragons") ? 1 : 0);

  const popularityScore = Number(
    Math.max(
      0.05,
      Math.min(
        0.99,
        0.25 +
          (colorIdentity.length * 0.08) +
          (themeTags.size * 0.03) +
          (gameplayTags.has("card_draw") ? 0.08 : 0) +
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
  const themeAnswer = normalizeText(answers.theme);
  if (themeAnswer) desiredThemeTags.add(themeAnswer);
  if (themeAnswer === "tokens") desiredCommanderTags.add("go_wide");
  if (themeAnswer === "graveyard") desiredCommanderTags.add("aristocrats");
  if (themeAnswer === "artifacts") desiredGameplayTags.add("engine");
  if (themeAnswer === "enchantments") desiredArchetypes.add("control");
  if (themeAnswer === "spells") desiredThemeTags.add("spellslinger");
  if (themeAnswer === "tribal") desiredThemeTags.add("tribal");

  const pace = normalizeText(answers.pace);
  if (pace === "aggro") desiredArchetypes.add("aggro");
  if (pace === "control") desiredArchetypes.add("control");
  if (pace === "combo") desiredArchetypes.add("combo");
  if (pace === "value") desiredArchetypes.add("value");

  const interaction = normalizeText(answers.interaction);
  if (interaction === "heavy") desiredGameplayTags.add("interaction");
  if (interaction === "chaos") desiredArchetypes.add("chaos");
  if (interaction === "moderate") desiredArchetypes.add("midrange");

  const vibe = normalizeText(input.vibe ?? input.profileDescription);
  for (const [needle, mappedTags] of Object.entries(VIBE_KEYWORDS)) {
    if (!vibe.includes(needle)) continue;
    for (const tag of mappedTags) {
      if (["go_wide", "aristocrats", "spell_combo", "big_mana"].includes(tag)) desiredCommanderTags.add(tag);
      else if (["aggro", "control", "combo", "value", "politics", "chaos", "midrange"].includes(tag)) desiredArchetypes.add(tag);
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

function scoreBandMatch<T extends string>(actual: T, desired: T, exactWeight: number): number {
  return actual === desired ? exactWeight : 0;
}

function archetypeLabel(candidate: RecommendationCandidate): string {
  return candidate.archetype_tags[0] || candidate.theme_tags[0] || candidate.commander_tags[0] || "Commander";
}

function descriptionLabel(candidate: RecommendationCandidate): string {
  const primaryTheme = candidate.theme_tags[0];
  const primaryCommanderTag = candidate.commander_tags[0];
  if (primaryTheme && primaryCommanderTag) return `${primaryTheme} ${primaryCommanderTag}`.replace(/_/g, " ");
  if (primaryTheme) return `${primaryTheme} build`;
  if (primaryCommanderTag) return `${primaryCommanderTag.replace(/_/g, " ")} plan`;
  return "versatile game plan";
}

function buildFitReason(candidate: RecommendationCandidate, pref: CommanderPreference): string {
  const matchedTheme = candidate.theme_tags.find((tag) => pref.desiredThemeTags.has(tag));
  if (matchedTheme) return `Leans into ${matchedTheme.replace(/_/g, " ")} with a ${archetypeLabel(candidate)} shell.`;
  const matchedCommanderTag = candidate.commander_tags.find((tag) => pref.desiredCommanderTags.has(tag));
  if (matchedCommanderTag) return `Strong ${matchedCommanderTag.replace(/_/g, " ")} commander with ${candidate.commander_interaction} interaction.`;
  const matchedGameplay = candidate.gameplay_tags.find((tag) => pref.desiredGameplayTags.has(tag));
  if (matchedGameplay) return `Fits a ${matchedGameplay.replace(/_/g, " ")} plan without forcing one narrow line.`;
  return `Broad ${archetypeLabel(candidate)} option with ${descriptionLabel(candidate)} support.`;
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
  score += scoreTagMatches(candidate.theme_tags, pref.desiredThemeTags, 16);
  score += scoreTagMatches(candidate.gameplay_tags, pref.desiredGameplayTags, 8);
  score += scoreTagMatches(candidate.archetype_tags, pref.desiredArchetypes, 12);
  score += scoreTagMatches(candidate.commander_tags, pref.desiredCommanderTags, 12);
  score += scoreBandMatch(candidate.commander_power_band, pref.desiredPowerBand, 8);
  score += scoreBandMatch(candidate.commander_budget_band, pref.desiredBudgetBand, 8);
  score += scoreBandMatch(candidate.commander_complexity, pref.desiredComplexity, 6);
  score += scoreBandMatch(candidate.commander_interaction, pref.desiredInteraction, 6);
  if (pref.seedNames.includes(candidate.name)) score += 10;
  score += Math.round((candidate.popularity_score ?? 0) * 8);
  return score;
}

export async function fetchScryfallTagSourceRows(
  admin: SupabaseClient,
  options?: { names?: string[]; fromNameExclusive?: string | null; limit?: number },
): Promise<ScryfallTagSourceRow[]> {
  let query = admin
    .from("scryfall_cache")
    .select(
      "name, type_line, oracle_text, keywords, mana_cost, cmc, color_identity, colors, legalities, is_land, is_creature, is_instant, is_sorcery, is_artifact, is_enchantment, is_planeswalker, small, normal, art_crop",
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
): Promise<CommanderRecommendation[]> {
  const limit = Math.max(6, Math.min(input.limit ?? 6, 12));
  const bannedMaps = bannedDataToMaps(await getBannedCards());
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
      "name, type_line, oracle_text, color_identity, colors, legalities, is_land, is_creature, is_instant, is_sorcery, is_artifact, is_enchantment, is_planeswalker, small, normal, art_crop",
    )
    .or(postgrestCommanderEligibleCatalogOr())
    .limit(5000);
  if (cacheError) throw new Error(cacheError.message);

  const cacheByName = new Map<string, ScryfallTagSourceRow>();
  for (const row of (cacheRows ?? []) as ScryfallTagSourceRow[]) cacheByName.set(row.name, row);

  const candidates: RecommendationCandidate[] = [];
  for (const tagRow of (tagRows ?? []) as CardTagCacheRow[]) {
    const sourceRow = cacheByName.get(tagRow.name);
    if (!sourceRow) continue;
    if (!isCommanderEligible(sourceRow.type_line ?? undefined, sourceRow.oracle_text ?? undefined)) continue;
    if ((sourceRow.legalities?.commander ?? "").toLowerCase() !== "legal") continue;
    if (bannedCommanderMap[tagRow.name]) continue;
    candidates.push({ ...sourceRow, ...tagRow });
  }

  const pref = buildCommanderPreference(input);
  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, pref) }))
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));

  const diversified = diversifyRecommendations(ranked.slice(0, 40), limit);
  const finalRows = diversified.length >= limit ? diversified : ranked.slice(0, limit);

  return finalRows.map(({ candidate, score }) => ({
    name: candidate.name,
    description: descriptionLabel(candidate),
    archetype: archetypeLabel(candidate).replace(/_/g, " "),
    fitReason: buildFitReason(candidate, pref),
    matchScore: score,
    imageUri: candidate.art_crop ?? candidate.normal ?? candidate.small ?? undefined,
    colorIdentity: candidate.color_identity ?? [],
  }));
}
