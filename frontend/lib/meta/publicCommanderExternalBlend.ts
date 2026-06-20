import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

const MIN_APPROVED_SAMPLE_SIZE = 50;
const MIN_CONFIDENCE_SCORE = 0.55;
const DEFAULT_EXTERNAL_WEIGHT = 0.1;
const MAX_EXTERNAL_WEIGHT = 0.35;
const TOP_TEN_MIN_OVERLAP = 7;
const TOP_TEN_MAX_UPWARD_MOVE = 2;
const TOP_TWENTY_FIVE_MAX_UPWARD_MOVE = 5;

type QueryClient = Pick<SupabaseClient, "from">;

export type PublicCommanderExternalMetaFlags = {
  enabled: boolean;
  websiteCommanderMetaPages: boolean;
  apiMetaTrendingShadow: boolean;
  weight: number;
};

export type PublicCommanderMetaItem = {
  name: string;
  slug?: string;
  count?: number;
  rank?: number;
  rankDelta?: number;
  medianCost?: number;
  metaLabel?: string;
};

export type SanitizedExternalCommanderProfile = {
  commanderName: string;
  commanderNameNorm: string;
  approvedSampleSize: number;
  lastRefreshedAt: string | null;
};

export type CommanderMetaShadowReport = {
  currentTop10: string[];
  blendedTop10: string[];
  overlap: number;
  rankDeltas: Array<{
    name: string;
    currentRank: number | null;
    blendedRank: number | null;
    delta: number | null;
  }>;
  commandersAdded: string[];
  commandersRemoved: string[];
  maxRankMovement: number;
  shockWarnings: string[];
  eligibleExternalProfiles: number;
  applied: boolean;
};

type ExternalProfileRow = {
  commander_name?: unknown;
  commander_name_norm?: unknown;
  approved_sample_size?: unknown;
  last_refreshed_at?: unknown;
};

function clampWeight(value: unknown): number {
  const n = Number(value);
  if (value == null || value === "") return DEFAULT_EXTERNAL_WEIGHT;
  if (!Number.isFinite(n)) return DEFAULT_EXTERNAL_WEIGHT;
  return Math.min(Math.max(n, 0), MAX_EXTERNAL_WEIGHT);
}

function nestedFlag(flags: Record<string, unknown>, key: string): boolean {
  const surfaces = flags.public_external_meta_surfaces;
  return !!surfaces && typeof surfaces === "object" && (surfaces as Record<string, unknown>)[key] === true;
}

export async function readPublicCommanderExternalMetaFlags(
  db: QueryClient
): Promise<PublicCommanderExternalMetaFlags> {
  try {
    const { data, error } = await db
      .from("app_config")
      .select("value")
      .eq("key", "flags")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const flags = (data as { value?: Record<string, unknown> } | null)?.value ?? {};
    const enabled = flags.public_external_meta_enabled === true;
    return {
      enabled,
      websiteCommanderMetaPages: enabled && nestedFlag(flags, "website_commander_meta_pages"),
      apiMetaTrendingShadow:
        enabled &&
        flags.public_external_meta_shadow_mode === true &&
        nestedFlag(flags, "api_meta_trending_shadow"),
      weight: clampWeight(flags.public_external_meta_weight),
    };
  } catch {
    return {
      enabled: false,
      websiteCommanderMetaPages: false,
      apiMetaTrendingShadow: false,
      weight: DEFAULT_EXTERNAL_WEIGHT,
    };
  }
}

export function sanitizeExternalCommanderProfileRow(row: unknown): SanitizedExternalCommanderProfile | null {
  if (!row || typeof row !== "object") return null;
  const r = row as ExternalProfileRow;
  const commanderName = String(r.commander_name ?? "").trim();
  const commanderNameNorm = String(r.commander_name_norm ?? normalizeScryfallCacheName(commanderName)).trim();
  const approvedSampleSize = Number(r.approved_sample_size);
  const refreshed = typeof r.last_refreshed_at === "string" && Date.parse(r.last_refreshed_at)
    ? new Date(r.last_refreshed_at).toISOString()
    : null;

  if (!commanderName || !commanderNameNorm || !Number.isFinite(approvedSampleSize)) return null;
  if (approvedSampleSize < MIN_APPROVED_SAMPLE_SIZE) return null;

  return {
    commanderName,
    commanderNameNorm,
    approvedSampleSize,
    lastRefreshedAt: refreshed,
  };
}

export async function fetchApprovedExternalCommanderProfiles(
  db: QueryClient,
  commanderNames: string[]
): Promise<SanitizedExternalCommanderProfile[]> {
  const keys = [...new Set(commanderNames.map(normalizeScryfallCacheName).filter(Boolean))];
  if (keys.length === 0) return [];

  const rows: unknown[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await db
      .from("external_commander_profiles")
      .select("commander_name, commander_name_norm, approved_sample_size, last_refreshed_at")
      .eq("approved_for_public", true)
      .gte("approved_sample_size", MIN_APPROVED_SAMPLE_SIZE)
      .gte("confidence_score", MIN_CONFIDENCE_SCORE)
      .in("commander_name_norm", keys.slice(i, i + 100));
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }

  return rows
    .map(sanitizeExternalCommanderProfileRow)
    .filter((profile): profile is SanitizedExternalCommanderProfile => Boolean(profile));
}

function itemKey(item: PublicCommanderMetaItem): string {
  return normalizeScryfallCacheName(item.name);
}

function namesTop(items: PublicCommanderMetaItem[], limit = 10): string[] {
  return items.slice(0, limit).map((item) => item.name);
}

function topOverlap(a: string[], b: string[]): number {
  const left = new Set(a.map(normalizeScryfallCacheName));
  return b.filter((name) => left.has(normalizeScryfallCacheName(name))).length;
}

function rankMap(items: PublicCommanderMetaItem[]): Map<string, number> {
  return new Map(items.map((item, index) => [itemKey(item), index + 1]));
}

function buildReport(
  baseItems: PublicCommanderMetaItem[],
  blendedItems: PublicCommanderMetaItem[],
  profiles: SanitizedExternalCommanderProfile[],
  warnings: string[],
  applied: boolean
): CommanderMetaShadowReport {
  const currentTop10 = namesTop(baseItems);
  const blendedTop10 = namesTop(blendedItems);
  const currentRanks = rankMap(baseItems);
  const blendedRanks = rankMap(blendedItems);
  const names = [...new Set([...currentTop10, ...blendedTop10].map(normalizeScryfallCacheName))];
  const byKey = new Map([...baseItems, ...blendedItems].map((item) => [itemKey(item), item.name]));
  const deltas = names.map((key) => {
    const currentRank = currentRanks.get(key) ?? null;
    const blendedRank = blendedRanks.get(key) ?? null;
    return {
      name: byKey.get(key) ?? key,
      currentRank,
      blendedRank,
      delta: currentRank != null && blendedRank != null ? currentRank - blendedRank : null,
    };
  });

  return {
    currentTop10,
    blendedTop10,
    overlap: topOverlap(currentTop10, blendedTop10),
    rankDeltas: deltas,
    commandersAdded: blendedTop10.filter((name) => !currentTop10.map(normalizeScryfallCacheName).includes(normalizeScryfallCacheName(name))),
    commandersRemoved: currentTop10.filter((name) => !blendedTop10.map(normalizeScryfallCacheName).includes(normalizeScryfallCacheName(name))),
    maxRankMovement: deltas.reduce((max, row) => Math.max(max, Math.abs(row.delta ?? 0)), 0),
    shockWarnings: warnings,
    eligibleExternalProfiles: profiles.length,
    applied,
  };
}

export function blendCommanderMetaWithExternalProfiles(
  baseItems: PublicCommanderMetaItem[],
  profiles: SanitizedExternalCommanderProfile[],
  weight: number
): { items: PublicCommanderMetaItem[]; report: CommanderMetaShadowReport } {
  if (baseItems.length === 0) {
    const report = buildReport([], [], profiles, ["base_empty"], false);
    return { items: baseItems, report };
  }

  const profileMap = new Map(profiles.map((profile) => [profile.commanderNameNorm, profile]));
  const matchedProfiles = baseItems
    .map((item) => profileMap.get(itemKey(item)))
    .filter((profile): profile is SanitizedExternalCommanderProfile => Boolean(profile));
  if (matchedProfiles.length === 0 || weight <= 0) {
    const report = buildReport(baseItems, baseItems, profiles, [matchedProfiles.length === 0 ? "external_empty" : "external_weight_zero"], false);
    return { items: baseItems, report };
  }

  const maxSample = Math.max(...matchedProfiles.map((profile) => profile.approvedSampleSize), MIN_APPROVED_SAMPLE_SIZE);
  const safeWeight = Math.min(Math.max(weight, 0), MAX_EXTERNAL_WEIGHT);
  const scored = baseItems.map((item, index) => {
    const profile = profileMap.get(itemKey(item));
    const baseScore = 1 - index / Math.max(baseItems.length - 1, 1);
    const externalScore = profile
      ? Math.log1p(profile.approvedSampleSize) / Math.log1p(maxSample)
      : 0;
    return {
      item,
      originalRank: index + 1,
      score: baseScore * (1 - safeWeight) + externalScore * safeWeight,
    };
  });

  const blended = scored
    .sort((a, b) => b.score - a.score || a.originalRank - b.originalRank)
    .map(({ item }, index) => ({ ...item, rank: index + 1 }));

  const currentRanks = rankMap(baseItems);
  const warnings: string[] = [];
  const overlap = topOverlap(namesTop(baseItems), namesTop(blended));
  if (overlap < TOP_TEN_MIN_OVERLAP) warnings.push("top10_overlap_below_threshold");

  for (const item of blended.slice(0, 10)) {
    const originalRank = currentRanks.get(itemKey(item)) ?? item.rank ?? 999;
    const upwardMove = originalRank - (item.rank ?? originalRank);
    if (originalRank > 25) warnings.push("top10_entry_from_outside_top25");
    if (upwardMove > TOP_TEN_MAX_UPWARD_MOVE) warnings.push("top10_rank_movement_cap_exceeded");
  }

  for (const item of blended.slice(0, 25)) {
    const originalRank = currentRanks.get(itemKey(item)) ?? item.rank ?? 999;
    const upwardMove = originalRank - (item.rank ?? originalRank);
    if (upwardMove > TOP_TWENTY_FIVE_MAX_UPWARD_MOVE) warnings.push("top25_rank_movement_cap_exceeded");
  }

  const uniqueWarnings = [...new Set(warnings)];
  if (uniqueWarnings.length > 0) {
    return {
      items: baseItems,
      report: buildReport(baseItems, blended, profiles, uniqueWarnings, false),
    };
  }

  return {
    items: blended,
    report: buildReport(baseItems, blended, profiles, [], true),
  };
}

export function buildCommanderMetaShadowReport(
  baseItems: PublicCommanderMetaItem[],
  profiles: SanitizedExternalCommanderProfile[],
  weight: number
): CommanderMetaShadowReport {
  return blendCommanderMetaWithExternalProfiles(baseItems, profiles, weight).report;
}
