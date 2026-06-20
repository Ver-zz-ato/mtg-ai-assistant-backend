import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import type { EnrichedCard } from "@/lib/deck/deck-enrichment";
import { summarizeDeckRoles } from "@/lib/deck/role-classifier";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

type ProfileAverages = {
  lands?: number;
  ramp?: number;
  draw?: number;
  removal?: number;
  protection?: number;
};

type CommanderProfileRow = {
  commander_name: string;
  raw_sample_size: number;
  approved_sample_size: number;
  confidence_score: number;
  source_breakdown: Record<string, number>;
  averages: ProfileAverages | null;
  common_cards: Array<{ name: string; deck_count: number; inclusion_rate: number }> | null;
  missing_common_support: Array<{ name: string }> | null;
  confidence_components?: Record<string, unknown> | null;
  profile_consistency?: Record<string, unknown> | null;
  role_variance?: Record<string, unknown> | null;
  profile_warnings?: string[] | null;
  off_color_support_gap_count?: number | null;
  exclusion_reasons: Record<string, number> | null;
  last_refreshed_at: string | null;
};

type RoleCounts = {
  lands: number;
  ramp: number;
  draw: number;
  removal: number;
  protection: number;
};

function countsFromAverages(avg: ProfileAverages | null | undefined): RoleCounts {
  return {
    lands: Number(avg?.lands ?? 0),
    ramp: Number(avg?.ramp ?? 0),
    draw: Number(avg?.draw ?? 0),
    removal: Number(avg?.removal ?? 0),
    protection: Number(avg?.protection ?? 0),
  };
}

function deltaCounts(deck: RoleCounts, profile: RoleCounts): RoleCounts {
  return {
    lands: Number((deck.lands - profile.lands).toFixed(1)),
    ramp: Number((deck.ramp - profile.ramp).toFixed(1)),
    draw: Number((deck.draw - profile.draw).toFixed(1)),
    removal: Number((deck.removal - profile.removal).toFixed(1)),
    protection: Number((deck.protection - profile.protection).toFixed(1)),
  };
}

function parsedCommanderName(inputCommander: string | null | undefined, deckText: string): string | null {
  const explicit = String(inputCommander ?? "").trim();
  if (explicit) return explicit;
  const match = deckText.match(/(?:^|\n)\s*(?:Commander|CMDR)\s*:?\s*\n?\s*(?:1\s*[xX]?\s*)?([^\n]+)/i);
  return match?.[1]?.trim() ?? null;
}

function isColorIdentityLegal(cardColors: string[] | null | undefined, commanderColors: string[] | null | undefined): boolean {
  const allowed = new Set((commanderColors ?? []).map((color) => String(color).toUpperCase()));
  return (cardColors ?? []).every((color) => allowed.has(String(color).toUpperCase()));
}

async function fetchEnrichedCards(
  admin: SupabaseClient,
  entries: Array<{ name: string; qty: number }>
): Promise<EnrichedCard[]> {
  const keys = [...new Set(entries.map((entry) => normalizeScryfallCacheName(entry.name)).filter(Boolean))];
  const facts = new Map<string, Partial<EnrichedCard>>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await admin
      .from("scryfall_cache")
      .select("name, type_line, oracle_text, color_identity, cmc, mana_cost, legalities, power, toughness, loyalty, colors, keywords, is_land, is_creature")
      .in("name", keys.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const r = row as Partial<EnrichedCard> & { name: string };
      facts.set(r.name, r);
    }
  }
  return entries.map((entry) => {
    const key = normalizeScryfallCacheName(entry.name);
    const fact = facts.get(key);
    return {
      name: entry.name,
      qty: entry.qty,
      type_line: fact?.type_line,
      oracle_text: fact?.oracle_text,
      color_identity: fact?.color_identity,
      cmc: fact?.cmc,
      mana_cost: fact?.mana_cost,
      legalities: fact?.legalities,
      power: fact?.power,
      toughness: fact?.toughness,
      loyalty: fact?.loyalty,
      colors: fact?.colors,
      keywords: fact?.keywords,
      layout: fact?.layout,
      is_land: fact?.is_land,
      is_creature: fact?.is_creature,
      cache_miss: !fact,
    };
  });
}

export async function buildCommanderComparisonQa(
  admin: SupabaseClient,
  input: { commander?: string | null; deckText: string }
) {
  const deckText = String(input.deckText ?? "");
  const commander = parsedCommanderName(input.commander, deckText);
  if (!commander) {
    return { found: false, error: "missing_commander", commander: null };
  }

  const commanderNorm = normalizeScryfallCacheName(commander);
  const { data: profile, error } = await admin
    .from("external_commander_profiles")
    .select("commander_name, raw_sample_size, approved_sample_size, confidence_score, confidence_components, profile_consistency, role_variance, profile_warnings, off_color_support_gap_count, source_breakdown, averages, common_cards, missing_common_support, exclusion_reasons, last_refreshed_at")
    .eq("commander_name_norm", commanderNorm)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) {
    return { found: false, error: "profile_not_found", commander };
  }

  const parsed = parseDeckText(deckText).filter((entry) => normalizeScryfallCacheName(entry.name) !== commanderNorm);
  const enriched = await fetchEnrichedCards(admin, parsed);
  const summary = summarizeDeckRoles(enriched);
  const deckCounts: RoleCounts = {
    lands: summary.byRole.land,
    ramp: summary.byRole.ramp,
    draw: summary.byRole.draw,
    removal: summary.byRole.removal,
    protection: summary.byRole.protection,
  };
  const profileRow = profile as CommanderProfileRow;
  const profileCounts = countsFromAverages(profileRow.averages);
  const deckNames = new Set(parsed.map((entry) => normalizeScryfallCacheName(entry.name)));
  const commonCards = (profileRow.common_cards ?? []).slice(0, 25);
  const commonFacts = await fetchEnrichedCards(admin, [
    { name: profileRow.commander_name, qty: 1 },
    ...commonCards.map((card) => ({ name: card.name, qty: 1 })),
  ]);
  const factByName = new Map(commonFacts.map((card) => [normalizeScryfallCacheName(card.name), card]));
  const commanderColors = factByName.get(normalizeScryfallCacheName(profileRow.commander_name))?.color_identity ?? [];
  const missingCommonCards = commonCards
    .filter((card) => {
      const norm = normalizeScryfallCacheName(card.name);
      const fact = factByName.get(norm);
      return !deckNames.has(norm) && isColorIdentityLegal(fact?.color_identity, commanderColors);
    })
    .slice(0, 25);
  const supportGaps = missingCommonCards
    .filter((card) => card.inclusion_rate >= 0.5)
    .filter((card) => !String(factByName.get(normalizeScryfallCacheName(card.name))?.type_line ?? "").toLowerCase().includes("land"))
    .slice(0, 12);
  const commonBasis = commonCards.slice(0, 20);
  const overlap = commonBasis.filter((card) => deckNames.has(normalizeScryfallCacheName(card.name))).length;
  const deckMatchScore = commonBasis.length ? Number((overlap / commonBasis.length).toFixed(3)) : 0;
  const comparisonConfidence = Number(Math.min(1, Number(profileRow.confidence_score ?? 0) + deckMatchScore * 0.1).toFixed(3));

  return {
    found: true,
    qa_only: true,
    commander: profileRow.commander_name,
    commander_profile: {
      raw_sample_size: profileRow.raw_sample_size,
      approved_sample_size: profileRow.approved_sample_size,
      confidence_score: profileRow.confidence_score,
      comparison_confidence_score: comparisonConfidence,
      confidence_components: {
        ...(profileRow.confidence_components ?? {}),
        deck_match: Number((deckMatchScore * 0.1).toFixed(3)),
        deck_match_score: deckMatchScore,
      },
      profile_consistency: profileRow.profile_consistency ?? {},
      role_variance: profileRow.role_variance ?? {},
      profile_warnings: profileRow.profile_warnings ?? [],
      off_color_support_gap_count: profileRow.off_color_support_gap_count ?? 0,
      source_breakdown: profileRow.source_breakdown ?? {},
      exclusion_reasons: profileRow.exclusion_reasons ?? {},
      last_refreshed_at: profileRow.last_refreshed_at,
    },
    parsed_deck: {
      card_count: parsed.length,
      quantity_count: summary.quantityCount,
      cache_misses: enriched.filter((card) => card.cache_miss).map((card) => card.name).slice(0, 25),
    },
    your_deck: deckCounts,
    profile: profileCounts,
    delta: deltaCounts(deckCounts, profileCounts),
    top_common_cards: commonCards,
    missing_common_cards: missingCommonCards,
    support_gaps: supportGaps,
  };
}
