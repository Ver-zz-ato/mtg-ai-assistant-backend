import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { normalizeName } from "@/lib/mtg/normalize";
import { filterRecommendationRowsByName } from "@/lib/deck/recommendation-legality";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { CardTagCacheRow, ScryfallTagSourceRow } from "@/lib/recommendations/commander-recommender";

type TagGroundedCacheRow = Pick<
  ScryfallTagSourceRow,
  | "name"
  | "printed_name"
  | "type_line"
  | "oracle_text"
  | "color_identity"
  | "colors"
  | "legalities"
  | "small"
  | "normal"
  | "art_crop"
> &
  Pick<
    CardTagCacheRow,
    | "gameplay_tags"
    | "theme_tags"
    | "archetype_tags"
    | "commander_tags"
    | "commander_eligible"
    | "commander_power_band"
    | "commander_budget_band"
    | "commander_complexity"
    | "commander_interaction"
    | "popularity_score"
    | "tag_version"
    | "source"
    | "updated_at"
  >;

export type GroundedCardCandidate = TagGroundedCacheRow & {
  score?: number;
  reason?: string;
  price?: number;
  imageUrl?: string;
  imageNormal?: string;
};

export type TagProfile = {
  topThemeTags: string[];
  topGameplayTags: string[];
  topArchetypeTags: string[];
  topCommanderTags: string[];
  colorIdentity: string[];
  profileSummary: string;
  counts: {
    theme: Map<string, number>;
    gameplay: Map<string, number>;
    archetype: Map<string, number>;
    commander: Map<string, number>;
  };
};

type FetchCandidatesInput = {
  formatLabel: string;
  topThemeTags?: string[];
  topGameplayTags?: string[];
  topArchetypeTags?: string[];
  topCommanderTags?: string[];
  commanderColors?: string[];
  excludeNames?: string[];
  requireCommanderEligible?: boolean;
  limitPerBucket?: number;
};

type CategoryKey = "mana_base" | "interaction" | "card_draw" | "win_condition" | "owned_upgrades";

const EMPTY_COUNTS = {
  theme: new Map<string, number>(),
  gameplay: new Map<string, number>(),
  archetype: new Map<string, number>(),
  commander: new Map<string, number>(),
};

function increment(map: Map<string, number>, tag: string): void {
  if (!tag) return;
  map.set(tag, (map.get(tag) ?? 0) + 1);
}

function sortEntries(map: Map<string, number>): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

function normalizeTagList(tags: string[] | null | undefined): string[] {
  return Array.isArray(tags)
    ? [...new Set(tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0))]
    : [];
}

function buildSummary(profile: TagProfile): string {
  const themes = profile.topThemeTags.slice(0, 2).map((tag) => tag.replace(/_/g, " "));
  const gameplay = profile.topGameplayTags.slice(0, 2).map((tag) => tag.replace(/_/g, " "));
  const archetypes = profile.topArchetypeTags.slice(0, 1).map((tag) => tag.replace(/_/g, " "));
  return [
    themes.length ? `themes: ${themes.join(", ")}` : "",
    gameplay.length ? `roles: ${gameplay.join(", ")}` : "",
    archetypes.length ? `plan: ${archetypes.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export function buildTagProfile(rows: Array<Partial<TagGroundedCacheRow>>): TagProfile {
  const counts = {
    theme: new Map<string, number>(),
    gameplay: new Map<string, number>(),
    archetype: new Map<string, number>(),
    commander: new Map<string, number>(),
  };
  const colorCount = new Map<string, number>();

  for (const row of rows) {
    for (const tag of normalizeTagList(row.theme_tags)) increment(counts.theme, tag);
    for (const tag of normalizeTagList(row.gameplay_tags)) increment(counts.gameplay, tag);
    for (const tag of normalizeTagList(row.archetype_tags)) increment(counts.archetype, tag);
    for (const tag of normalizeTagList(row.commander_tags)) increment(counts.commander, tag);
    for (const color of normalizeTagList(row.color_identity)) increment(colorCount, color.toUpperCase());
  }

  const colorIdentity = [...colorCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([color]) => color);

  const profile: TagProfile = {
    topThemeTags: sortEntries(counts.theme).slice(0, 3),
    topGameplayTags: sortEntries(counts.gameplay).slice(0, 4),
    topArchetypeTags: sortEntries(counts.archetype).slice(0, 2),
    topCommanderTags: sortEntries(counts.commander).slice(0, 2),
    colorIdentity,
    profileSummary: "",
    counts,
  };
  profile.profileSummary = buildSummary(profile);
  return profile;
}

export async function fetchTagGroundedRowsByNames(
  admin: SupabaseClient,
  names: string[],
): Promise<TagGroundedCacheRow[]> {
  const normalizedNames = [...new Set(names.map((name) => normalizeScryfallCacheName(name)).filter(Boolean))];
  if (!normalizedNames.length) return [];

  const [{ data: tagRows, error: tagError }, { data: cacheRows, error: cacheError }] = await Promise.all([
    admin
      .from("card_tag_cache")
      .select(
        "name, gameplay_tags, theme_tags, archetype_tags, commander_tags, commander_eligible, commander_power_band, commander_budget_band, commander_complexity, commander_interaction, popularity_score, tag_version, source, updated_at",
      )
      .in("name", normalizedNames),
    admin
      .from("scryfall_cache")
      .select("name, printed_name, type_line, oracle_text, color_identity, colors, legalities, small, normal, art_crop")
      .in("name", normalizedNames),
  ]);

  if (tagError) throw new Error(tagError.message);
  if (cacheError) throw new Error(cacheError.message);

  const cacheByName = new Map<string, Partial<ScryfallTagSourceRow>>();
  for (const row of (cacheRows ?? []) as Partial<ScryfallTagSourceRow>[]) {
    cacheByName.set(String(row.name), row);
  }

  return ((tagRows ?? []) as Partial<CardTagCacheRow>[])
    .map((row) => {
      const name = String(row.name ?? "");
      const cacheRow = cacheByName.get(name);
      if (!cacheRow) return null;
      return {
        ...(cacheRow as Partial<ScryfallTagSourceRow>),
        ...(row as Partial<CardTagCacheRow>),
        name,
      } as TagGroundedCacheRow;
    })
    .filter((row): row is TagGroundedCacheRow => !!row);
}

async function fetchBucket(
  admin: SupabaseClient,
  kind: "theme_tags" | "gameplay_tags" | "archetype_tags" | "commander_tags",
  tag: string,
  limit: number,
  requireCommanderEligible: boolean,
): Promise<string[]> {
  const query = admin
    .from("card_tag_cache")
    .select("name")
    .contains(kind, [tag])
    .limit(limit);
  if (requireCommanderEligible) query.eq("commander_eligible", true);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((row) => String((row as { name?: string }).name || "")).filter(Boolean);
}

export async function fetchGroundedCandidatesForProfile(
  admin: SupabaseClient,
  input: FetchCandidatesInput,
): Promise<GroundedCardCandidate[]> {
  const limitPerBucket = Math.max(24, Math.min(input.limitPerBucket ?? 80, 120));
  const tagPromises: Promise<string[]>[] = [];
  const pushBuckets = (kind: "theme_tags" | "gameplay_tags" | "archetype_tags" | "commander_tags", tags: string[]) => {
    for (const tag of tags.slice(0, 3)) {
      tagPromises.push(fetchBucket(admin, kind, tag, limitPerBucket, !!input.requireCommanderEligible));
    }
  };

  pushBuckets("theme_tags", input.topThemeTags ?? []);
  pushBuckets("gameplay_tags", input.topGameplayTags ?? []);
  pushBuckets("archetype_tags", input.topArchetypeTags ?? []);
  pushBuckets("commander_tags", input.topCommanderTags ?? []);

  const bucketRows = await Promise.all(tagPromises);
  const names = [...new Set(bucketRows.flat().filter(Boolean))].filter(
    (name) => !(input.excludeNames ?? []).includes(name),
  );
  if (!names.length) return [];

  let rows = await fetchTagGroundedRowsByNames(admin, names);
  if (input.requireCommanderEligible) {
    rows = rows.filter((row) => row.commander_eligible && String(row.legalities?.commander || "").toLowerCase() === "legal");
  }
  if (input.commanderColors?.length) {
    const commanderColors = input.commanderColors;
    rows = rows.filter((row) =>
      isWithinColorIdentity({ name: row.printed_name || row.name, color_identity: row.color_identity ?? [] } as never, commanderColors),
    );
  }
  const { allowed } = await filterRecommendationRowsByName(
    rows.map((row) => ({ name: row.printed_name || row.name })),
    input.formatLabel,
    { logPrefix: "tag-grounding" },
  );
  const allowedNames = new Set(allowed.map((row) => normalizeScryfallCacheName(row.name)));
  return rows.filter((row) => allowedNames.has(row.name));
}

export function scoreCandidateAgainstProfile(
  candidate: Partial<TagGroundedCacheRow>,
  profile: TagProfile,
  options?: { desiredCategory?: CategoryKey; preferCommander?: boolean },
): number {
  const themeTags = normalizeTagList(candidate.theme_tags);
  const gameplayTags = normalizeTagList(candidate.gameplay_tags);
  const archetypeTags = normalizeTagList(candidate.archetype_tags);
  const commanderTags = normalizeTagList(candidate.commander_tags);
  const themeMatch = themeTags.reduce((sum, tag) => sum + (profile.topThemeTags.includes(tag) ? 18 : 0), 0);
  const gameplayMatch = gameplayTags.reduce((sum, tag) => sum + (profile.topGameplayTags.includes(tag) ? 12 : 0), 0);
  const archetypeMatch = archetypeTags.reduce((sum, tag) => sum + (profile.topArchetypeTags.includes(tag) ? 10 : 0), 0);
  const commanderMatch = commanderTags.reduce((sum, tag) => sum + (profile.topCommanderTags.includes(tag) ? 8 : 0), 0);

  let score = themeMatch + gameplayMatch + archetypeMatch + commanderMatch + Math.round((candidate.popularity_score ?? 0) * 10);
  const anyMatch = themeMatch + gameplayMatch + archetypeMatch + commanderMatch > 0;
  if (!anyMatch) score -= 12;

  switch (options?.desiredCategory) {
    case "mana_base":
      if (gameplayTags.includes("ramp")) score += 12;
      if (gameplayTags.includes("ramp_land")) score += 10;
      if (themeTags.includes("lands") || themeTags.includes("landfall") || themeTags.includes("treasure")) score += 8;
      break;
    case "interaction":
      if (gameplayTags.includes("interaction")) score += 14;
      if (gameplayTags.includes("removal_single")) score += 10;
      if (gameplayTags.includes("removal_boardwipe")) score += 10;
      if (gameplayTags.includes("protection")) score += 6;
      break;
    case "card_draw":
      if (gameplayTags.includes("card_draw")) score += 14;
      if (gameplayTags.includes("draw_repeatable")) score += 10;
      if (gameplayTags.includes("draw_burst")) score += 8;
      if (gameplayTags.includes("engine")) score += 6;
      break;
    case "win_condition":
      if (gameplayTags.includes("finisher")) score += 14;
      if (gameplayTags.includes("payoff")) score += 10;
      if (archetypeTags.some((tag) => profile.topArchetypeTags.includes(tag))) score += 6;
      break;
    case "owned_upgrades":
      if (gameplayTags.includes("engine") || gameplayTags.includes("payoff")) score += 6;
      break;
    default:
      break;
  }

  if (options?.preferCommander && candidate.commander_eligible) score += 6;
  return score;
}

export function buildGroundedReason(
  candidate: Partial<TagGroundedCacheRow>,
  profile: TagProfile,
  options?: { desiredCategory?: CategoryKey; prefix?: string },
): string {
  const theme = normalizeTagList(candidate.theme_tags).find((tag) => profile.topThemeTags.includes(tag));
  const gameplay = normalizeTagList(candidate.gameplay_tags).find((tag) => profile.topGameplayTags.includes(tag));
  const archetype = normalizeTagList(candidate.archetype_tags).find((tag) => profile.topArchetypeTags.includes(tag));
  const category = options?.desiredCategory;

  if (category === "interaction" && gameplay) return `Keeps your ${gameplay.replace(/_/g, " ")} package aligned with the deck's plan.`;
  if (category === "card_draw" && gameplay) return `Adds ${gameplay.replace(/_/g, " ")} support without drifting away from your core game plan.`;
  if (category === "mana_base" && (gameplay || theme)) return `Supports the mana plan through ${[gameplay, theme].filter(Boolean).join(" / ").replace(/_/g, " ")} synergy.`;
  if (category === "win_condition" && (gameplay || archetype)) return `Acts like a cleaner ${[gameplay, archetype].filter(Boolean).join(" / ").replace(/_/g, " ")} closer for this deck.`;
  if (category === "mana_base") return "Supports the mana plan without pulling the deck off-theme.";
  if (category === "interaction") return "Gives the deck a cleaner way to answer threats without breaking theme.";
  if (category === "card_draw") return "Adds more card flow while staying aligned with the deck's plan.";
  if (category === "win_condition") return "Helps close games in a way that still matches the deck's plan.";
  if (theme && gameplay) return `Fits your ${theme.replace(/_/g, " ")} plan and reinforces ${gameplay.replace(/_/g, " ")}.`;
  if (theme && archetype) return `Matches your ${theme.replace(/_/g, " ")} strategy in a ${archetype.replace(/_/g, " ")} shell.`;
  if (gameplay) return `Supports the deck through ${gameplay.replace(/_/g, " ")} without feeling off-plan.`;
  if (theme) return `Leans into your ${theme.replace(/_/g, " ")} theme rather than generic staples.`;
  return options?.prefix ?? "Matches the deck's current themes and role needs.";
}

export async function hydratePriceAndImages(
  admin: SupabaseClient,
  candidates: GroundedCardCandidate[],
): Promise<GroundedCardCandidate[]> {
  if (!candidates.length) return candidates;
  const priceKeys = [...new Set(candidates.map((row) => normalizeName(row.printed_name || row.name)))];
  const { data: prices } = await admin
    .from("price_cache")
    .select("card_name, usd_price")
    .in("card_name", priceKeys);
  const priceByKey = new Map<string, number>();
  for (const row of prices ?? []) {
    const cardName = String((row as { card_name?: string }).card_name || "");
    const usd = Number((row as { usd_price?: number | null }).usd_price ?? 0);
    if (cardName && Number.isFinite(usd) && usd > 0) priceByKey.set(cardName, usd);
  }

  return candidates.map((row) => {
    const displayName = String(row.printed_name || row.name);
    const priceKey = normalizeName(displayName);
    return {
      ...row,
      imageUrl: row.small ?? row.normal ?? undefined,
      imageNormal: row.normal ?? row.small ?? undefined,
      price: priceByKey.get(priceKey),
    };
  });
}

export function rerankNamedRowsByProfile<T extends { name: string }>(
  rows: T[],
  groundedRows: Array<Partial<TagGroundedCacheRow>>,
  profile: TagProfile,
  options?: { desiredCategory?: CategoryKey; reasonKey?: keyof T & string },
): T[] {
  const byName = new Map<string, Partial<TagGroundedCacheRow>>();
  for (const row of groundedRows) byName.set(normalizeScryfallCacheName(String(row.name || "")), row);

  return [...rows]
    .map((row) => {
      const grounded = byName.get(normalizeScryfallCacheName(row.name));
      const score = grounded ? scoreCandidateAgainstProfile(grounded, profile, options) : 0;
      const next = { ...row } as T;
      if (grounded && options?.reasonKey) {
        (next as Record<string, unknown>)[options.reasonKey] = buildGroundedReason(grounded, profile, options);
      }
      return { row: next, score };
    })
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
    .map((entry) => entry.row);
}

export function summarizeTagProfileForPrompt(profile: TagProfile, category?: CategoryKey): string {
  const parts = [
    profile.profileSummary ? `Deck profile: ${profile.profileSummary}.` : "",
    profile.colorIdentity.length ? `Shared colors: ${profile.colorIdentity.join(", ")}.` : "",
  ];
  if (category === "interaction") parts.push("Prioritize real removal, stack interaction, or protection over off-role cards.");
  if (category === "card_draw") parts.push("Prioritize repeatable draw, burst draw, and engine pieces over generic goodstuff.");
  if (category === "mana_base") parts.push("Prioritize mana fixing, lands, treasure, and ramp pieces that support the deck's colors and curve.");
  if (category === "win_condition") parts.push("Prioritize finishers and payoffs that actually close the game in the deck's main strategy.");
  if (category === "owned_upgrades") parts.push("Prefer owned cards that match the same theme and role instead of generic staples.");
  return parts.filter(Boolean).join(" ");
}

export function filterSwapSuggestionsByTagSimilarity<T extends { from: string; to: string; price_delta?: number }>(
  suggestions: T[],
  fromRows: Array<Partial<TagGroundedCacheRow>>,
  toRows: Array<Partial<TagGroundedCacheRow>>,
  profile: TagProfile,
): T[] {
  const fromByName = new Map(fromRows.map((row) => [normalizeScryfallCacheName(String(row.name || "")), row]));
  const toByName = new Map(toRows.map((row) => [normalizeScryfallCacheName(String(row.name || "")), row]));

  return [...suggestions]
    .map((suggestion) => {
      const fromRow = fromByName.get(normalizeScryfallCacheName(suggestion.from));
      const toRow = toByName.get(normalizeScryfallCacheName(suggestion.to));
      let similarity = 0;
      if (fromRow && toRow) {
        const fromGameplay = new Set(normalizeTagList(fromRow.gameplay_tags));
        const fromThemes = new Set(normalizeTagList(fromRow.theme_tags));
        for (const tag of normalizeTagList(toRow.gameplay_tags)) if (fromGameplay.has(tag)) similarity += 16;
        for (const tag of normalizeTagList(toRow.theme_tags)) if (fromThemes.has(tag)) similarity += 14;
        similarity += scoreCandidateAgainstProfile(toRow, profile) / 4;
      } else if (toRow) {
        similarity = scoreCandidateAgainstProfile(toRow, profile) / 5;
      }
      return { suggestion, similarity };
    })
    .filter((entry) => entry.similarity >= 8 || !toByName.has(normalizeScryfallCacheName(entry.suggestion.to)))
    .sort((a, b) => b.similarity - a.similarity || (a.suggestion.price_delta ?? 0) - (b.suggestion.price_delta ?? 0))
    .map((entry) => entry.suggestion);
}

export function createEmptyTagProfile(): TagProfile {
  return {
    topThemeTags: [],
    topGameplayTags: [],
    topArchetypeTags: [],
    topCommanderTags: [],
    colorIdentity: [],
    profileSummary: "",
    counts: EMPTY_COUNTS,
  };
}
