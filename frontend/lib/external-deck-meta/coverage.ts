import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExternalCommanderCoverageBucket,
  ExternalCommanderCoverageReport,
  ExternalCommanderCoverageSummary,
  ExternalCommanderCoverageTarget,
} from "./types";
import { withSupabaseRetry } from "./supabaseRetry";

export const COMMUNITY_PROFILE_MIN_SAMPLE = 50;
export const COMMUNITY_PROFILE_MIN_CONFIDENCE = 0.55;

type Candidate = {
  name: string;
  bestName: string;
  score: number;
};

type ExternalProfileCoverageRow = {
  commander_name: string;
  approved_sample_size: number | null;
  confidence_score: number | null;
  profile_warnings?: string[] | null;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function titleWord(word: string, index: number): string {
  const lower = word.toLowerCase();
  if (index > 0 && ["of", "the", "a", "an", "and", "or", "to", "in"].includes(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function commanderNameFromSlug(slug: string): string {
  return String(slug || "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map(titleWord)
    .join(" ");
}

export function commanderCoverageKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function communityProfileCoverageBucket(
  approvedSampleSize: number,
  confidenceScore: number
): ExternalCommanderCoverageBucket {
  if (approvedSampleSize >= COMMUNITY_PROFILE_MIN_SAMPLE) {
    return confidenceScore >= COMMUNITY_PROFILE_MIN_CONFIDENCE ? "eligible" : "needs_confidence_review";
  }
  if (approvedSampleSize >= 25) return "usable_qa";
  if (approvedSampleSize >= 10) return "early_signal";
  return "not_ready";
}

function addCandidate(candidates: Map<string, Candidate>, rawName: unknown, score: number) {
  const name = String(rawName || "").trim();
  if (!name) return;
  const key = commanderCoverageKey(name);
  if (!key) return;
  const existing = candidates.get(key) ?? { name, bestName: name, score: 0 };
  existing.score += score;
  if (name.includes(",") || !existing.bestName.includes(",")) existing.bestName = name;
  candidates.set(key, existing);
}

async function fetchAll<T>(
  admin: SupabaseClient,
  table: string,
  select: string,
  order?: { column: string; ascending?: boolean }
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await withSupabaseRetry(
      {
        operation: "coverage_fetch_page",
        table,
        range: `${from}-${from + 999}`,
      },
      async () => {
        let query = admin.from(table).select(select).range(from, from + 999);
        if (order) query = query.order(order.column, { ascending: order.ascending ?? false });
        return query;
      }
    );
    if (error) throw new Error(`${table}:${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function addCommanderSignals(candidates: Map<string, Candidate>, signalType: string, data: unknown) {
  if (!["most-played-commanders", "trending-commanders"].includes(signalType)) return;
  if (!Array.isArray(data)) return;
  data.slice(0, 250).forEach((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const name = typeof item === "string" ? item : row?.name ?? row?.commander ?? row?.commander_name;
    const count = row ? num(row.count ?? row.deck_count ?? row.blendedScore) : 0;
    addCandidate(candidates, name, 120 / (index + 1) + Math.log1p(count) * 10);
  });
}

function summarizeCoverage(rows: ExternalCommanderCoverageTarget[]): ExternalCommanderCoverageSummary {
  return {
    total: rows.length,
    eligible: rows.filter((row) => row.readiness_bucket === "eligible").length,
    near_eligible: rows.filter((row) => row.readiness_bucket === "usable_qa").length,
    early_signal: rows.filter((row) => row.readiness_bucket === "early_signal").length,
    not_ready: rows.filter((row) => row.readiness_bucket === "not_ready").length,
    needs_confidence_review: rows.filter((row) => row.readiness_bucket === "needs_confidence_review").length,
  };
}

export async function buildExternalCommanderCoverageReport(admin: SupabaseClient): Promise<ExternalCommanderCoverageReport> {
  const candidates = new Map<string, Candidate>();
  const [aggregates, history, signals, profiles] = await Promise.all([
    fetchAll<{ commander_slug?: string; deck_count?: number; recent_decks?: number }>(
      admin,
      "commander_aggregates",
      "commander_slug, deck_count, recent_decks"
    ),
    fetchAll<{ commander_slug?: string; deck_count?: number; recent_decks?: number }>(
      admin,
      "commander_aggregates_history",
      "commander_slug, deck_count, recent_decks, snapshot_date",
      { column: "snapshot_date", ascending: false }
    ),
    fetchAll<{ signal_type?: string; data?: unknown }>(admin, "meta_signals", "signal_type, data"),
    fetchAll<ExternalProfileCoverageRow>(
      admin,
      "external_commander_profiles",
      "commander_name, approved_sample_size, confidence_score, profile_warnings"
    ),
  ]);

  for (const row of aggregates) {
    addCandidate(
      candidates,
      commanderNameFromSlug(row.commander_slug ?? ""),
      Math.log1p(num(row.deck_count)) * 30 + Math.log1p(num(row.recent_decks)) * 50
    );
  }

  const seenHistory = new Set<string>();
  for (const row of history) {
    const slug = row.commander_slug ?? "";
    if (!slug || seenHistory.has(slug)) continue;
    seenHistory.add(slug);
    addCandidate(
      candidates,
      commanderNameFromSlug(slug),
      Math.log1p(num(row.deck_count)) * 18 + Math.log1p(num(row.recent_decks)) * 25
    );
  }

  for (const signal of signals) addCommanderSignals(candidates, String(signal.signal_type ?? ""), signal.data);

  const profileByKey = new Map<string, ExternalProfileCoverageRow>();
  let communityProfileEligibleCount = 0;
  for (const profile of profiles) {
    if (!profile.commander_name) continue;
    const approved = num(profile.approved_sample_size);
    const confidence = num(profile.confidence_score);
    profileByKey.set(commanderCoverageKey(profile.commander_name), profile);
    if (approved >= COMMUNITY_PROFILE_MIN_SAMPLE && confidence >= COMMUNITY_PROFILE_MIN_CONFIDENCE) {
      communityProfileEligibleCount += 1;
    }
  }

  const ranked = [...candidates.entries()]
    .map(([key, candidate]) => {
      const profile = profileByKey.get(key);
      const approved = num(profile?.approved_sample_size);
      const confidence = Number(num(profile?.confidence_score).toFixed(3));
      const bucket = communityProfileCoverageBucket(approved, confidence);
      return {
        rank: 0,
        commander: profile?.commander_name ?? candidate.bestName,
        commander_key: key,
        popularity_score: Number(candidate.score.toFixed(3)),
        approved_sample_size: approved,
        confidence_score: confidence,
        readiness_bucket: bucket,
        needed_to_50: Math.max(0, COMMUNITY_PROFILE_MIN_SAMPLE - approved),
        community_profile_eligible: bucket === "eligible",
        warnings: profile?.profile_warnings ?? [],
      };
    })
    .sort((a, b) => b.popularity_score - a.popularity_score)
    .slice(0, 250)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const top100 = ranked.slice(0, 100);
  const top250 = ranked;
  return {
    top100,
    top250,
    top100_summary: summarizeCoverage(top100),
    top250_summary: summarizeCoverage(top250),
    community_profile_eligible_count: communityProfileEligibleCount,
    remaining_growth_opportunities: top250.filter((row) => !row.community_profile_eligible).length,
  };
}
