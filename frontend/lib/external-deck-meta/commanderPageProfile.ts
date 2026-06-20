import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdmin } from "@/app/api/_lib/supa";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

const FLAG_KEY = "commander_page_community_profile_beta";
const MIN_APPROVED_SAMPLE_SIZE = 50;
const MIN_CONFIDENCE_SCORE = 0.55;
const COMMON_CARD_LIMIT = 10;

type QueryClient = Pick<SupabaseClient, "from">;

type ExternalCommanderPageProfileRow = {
  commander_name?: unknown;
  approved_sample_size?: unknown;
  averages?: unknown;
  common_cards?: unknown;
  last_refreshed_at?: unknown;
};

export type CommanderPageCommunityProfile = {
  commanderName: string;
  approvedSampleSize: number;
  averages: {
    lands: number;
    ramp: number;
    draw: number;
    removal: number;
    protection: number;
  };
  commonCards: Array<{
    name: string;
    inclusionRate: number;
  }>;
  lastRefreshedAt: string | null;
};

function cleanNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(1)) : 0;
}

function cleanInclusionRate(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Number(Math.min(n, 1).toFixed(4));
}

function cleanTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function cleanCommonCards(value: unknown): CommanderPageCommunityProfile["commonCards"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((card) => {
      if (!card || typeof card !== "object") return null;
      const row = card as { name?: unknown; inclusion_rate?: unknown };
      const name = String(row.name ?? "").trim();
      const inclusionRate = cleanInclusionRate(row.inclusion_rate);
      if (!name || inclusionRate == null) return null;
      return { name, inclusionRate };
    })
    .filter((card): card is { name: string; inclusionRate: number } => Boolean(card))
    .slice(0, COMMON_CARD_LIMIT);
}

function cleanAverages(value: unknown): CommanderPageCommunityProfile["averages"] {
  const averages = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    lands: cleanNumber(averages.lands),
    ramp: cleanNumber(averages.ramp),
    draw: cleanNumber(averages.draw),
    removal: cleanNumber(averages.removal),
    protection: cleanNumber(averages.protection),
  };
}

async function isCommanderPageCommunityProfileEnabled(admin: QueryClient): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "flags")
      .maybeSingle();
    if (error) return false;
    const flags = (data as { value?: Record<string, unknown> } | null)?.value;
    return flags?.[FLAG_KEY] === true;
  } catch {
    return false;
  }
}

export async function getCommanderPageCommunityProfile(
  commanderName: string,
  client?: QueryClient
): Promise<CommanderPageCommunityProfile | null> {
  const commanderNameNorm = normalizeScryfallCacheName(commanderName);
  if (!commanderNameNorm) return null;

  const admin = client ?? getAdmin();
  if (!admin) return null;

  const enabled = await isCommanderPageCommunityProfileEnabled(admin);
  if (!enabled) return null;

  try {
    const { data, error } = await admin
      .from("external_commander_profiles")
      .select("commander_name, approved_sample_size, averages, common_cards, last_refreshed_at")
      .eq("commander_name_norm", commanderNameNorm)
      .eq("approved_for_public", true)
      .gte("approved_sample_size", MIN_APPROVED_SAMPLE_SIZE)
      .gte("confidence_score", MIN_CONFIDENCE_SCORE)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;

    const row = data as ExternalCommanderPageProfileRow;
    const approvedSampleSize = Number(row.approved_sample_size);
    const commander = String(row.commander_name ?? "").trim();
    if (!commander || !Number.isFinite(approvedSampleSize) || approvedSampleSize < MIN_APPROVED_SAMPLE_SIZE) {
      return null;
    }

    return {
      commanderName: commander,
      approvedSampleSize,
      averages: cleanAverages(row.averages),
      commonCards: cleanCommonCards(row.common_cards),
      lastRefreshedAt: cleanTimestamp(row.last_refreshed_at),
    };
  } catch {
    return null;
  }
}
