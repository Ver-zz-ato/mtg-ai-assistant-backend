import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnrichedCard } from "@/lib/deck/deck-enrichment";
import type { AnalyzeFormat } from "@/lib/deck/formatRules";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

const MIN_APPROVED_SAMPLE_SIZE = 50;
const MIN_CONFIDENCE_SCORE = 0.55;

export type CommunityProfileMetricLabel = "Lands" | "Ramp" | "Draw" | "Removal" | "Protection";

export type CommunityProfileComparison = {
  title: "Community Profile";
  subtitle: string;
  commander: string;
  approvedSampleSize: number;
  metrics: Array<{
    label: CommunityProfileMetricLabel;
    yourDeck: number;
    profileAverage: number;
    delta: number;
  }>;
  missingCommonCards: Array<{
    name: string;
    inclusionRate?: number;
  }>;
};

type QueryClient = Pick<SupabaseClient, "from">;

type ExternalCommanderProfileRow = {
  commander_name: string;
  commander_name_norm?: string;
  approved_sample_size: number;
  confidence_score: number;
  averages?: {
    lands?: number;
    ramp?: number;
    draw?: number;
    removal?: number;
    protection?: number;
  } | null;
  common_cards?: Array<{ name?: string; deck_count?: number; inclusion_rate?: number }> | null;
};

type CardFact = {
  name: string;
  color_identity?: string[] | null;
};

export type BuildCommunityProfileComparisonInput = {
  admin: QueryClient;
  format: AnalyzeFormat | string;
  commander?: string | null;
  deckCards: EnrichedCard[];
  counts: {
    lands: number;
    ramp: number;
    draw: number;
    removal: number;
    protection: number;
  };
};

function cleanNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(1)) : 0;
}

function isColorIdentityLegal(cardColors: string[] | null | undefined, commanderColors: string[] | null | undefined): boolean {
  const allowed = new Set((commanderColors ?? []).map((color) => String(color).toUpperCase()));
  return (cardColors ?? []).every((color) => allowed.has(String(color).toUpperCase()));
}

async function fetchCardFacts(admin: QueryClient, names: string[]): Promise<Map<string, CardFact>> {
  const keys = [...new Set(names.map(normalizeScryfallCacheName).filter(Boolean))];
  const facts = new Map<string, CardFact>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await admin
      .from("scryfall_cache")
      .select("name, color_identity")
      .in("name", keys.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const r = row as CardFact;
      facts.set(normalizeScryfallCacheName(r.name), r);
    }
  }
  return facts;
}

function metric(label: CommunityProfileMetricLabel, yourDeck: number, profileAverage: number) {
  const yours = cleanNumber(yourDeck);
  const average = cleanNumber(profileAverage);
  return {
    label,
    yourDeck: yours,
    profileAverage: average,
    delta: cleanNumber(yours - average),
  };
}

export async function buildCommunityProfileComparison(
  input: BuildCommunityProfileComparisonInput
): Promise<CommunityProfileComparison | null> {
  if (input.format !== "Commander") return null;
  const commander = String(input.commander ?? "").trim();
  if (!commander) return null;

  const commanderNorm = normalizeScryfallCacheName(commander);
  const { data, error } = await input.admin
    .from("external_commander_profiles")
    .select("commander_name, commander_name_norm, approved_sample_size, confidence_score, averages, common_cards")
    .eq("commander_name_norm", commanderNorm)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const profile = data as ExternalCommanderProfileRow;
  const approvedSampleSize = Number(profile.approved_sample_size) || 0;
  const confidenceScore = Number(profile.confidence_score) || 0;
  if (approvedSampleSize < MIN_APPROVED_SAMPLE_SIZE || confidenceScore < MIN_CONFIDENCE_SCORE) return null;

  const commonCards = Array.isArray(profile.common_cards) ? profile.common_cards : [];
  const deckNames = new Set(input.deckCards.map((card) => normalizeScryfallCacheName(card.name)));
  const commanderKey = normalizeScryfallCacheName(profile.commander_name);
  const cardFacts = await fetchCardFacts(input.admin, [
    profile.commander_name,
    ...commonCards.map((card) => String(card.name ?? "")),
  ]);
  const commanderColors = cardFacts.get(commanderKey)?.color_identity ?? [];
  const missingCommonCards = commonCards
    .filter((card) => {
      const name = String(card.name ?? "").trim();
      const key = normalizeScryfallCacheName(name);
      if (!name || !key || key === commanderKey || deckNames.has(key)) return false;
      const fact = cardFacts.get(key);
      return isColorIdentityLegal(fact?.color_identity, commanderColors);
    })
    .slice(0, 5)
    .map((card) => ({
      name: String(card.name),
      ...(Number.isFinite(Number(card.inclusion_rate)) ? { inclusionRate: cleanNumber(Number(card.inclusion_rate)) } : {}),
    }));

  const averages = profile.averages ?? {};
  return {
    title: "Community Profile",
    subtitle: `Based on ${approvedSampleSize} approved community decklists`,
    commander: profile.commander_name,
    approvedSampleSize,
    metrics: [
      metric("Lands", input.counts.lands, averages.lands ?? 0),
      metric("Ramp", input.counts.ramp, averages.ramp ?? 0),
      metric("Draw", input.counts.draw, averages.draw ?? 0),
      metric("Removal", input.counts.removal, averages.removal ?? 0),
      metric("Protection", input.counts.protection, averages.protection ?? 0),
    ],
    missingCommonCards,
  };
}
