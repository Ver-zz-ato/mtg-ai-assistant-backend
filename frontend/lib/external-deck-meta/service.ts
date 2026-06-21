import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { fetchExternalDeck, discoverArchidektCommanderSearchDecks, discoverArchidektRecentDecks } from "./adapters";
import {
  buildExternalCommanderCoverageReport,
  commanderCoverageKey,
  COMMUNITY_PROFILE_MIN_SAMPLE,
} from "./coverage";
import { countCards, stableDeckHash } from "./hash";
import { isSourceCoolingDown, markSourceFailure, markSourceSuccess, politeDelay, retryAfterToCooldownIso } from "./rateLimit";
import { withSupabaseRetry } from "./supabaseRetry";
import type {
  ExternalCommanderCoverageReport,
  ExternalCommanderCoverageTarget,
  ExclusionReason,
  ExternalDeckIngestSummary,
  ExternalDeckSourceKey,
  ExternalDeckSourceRow,
  NormalizedExternalDeck,
} from "./types";
import { parseExternalDeckUrl, sourceDeckUrl } from "./url";

const COMMANDER_MIN_CARDS = 80;
const CONSTRUCTED_MIN_CARDS = 40;
const PUBLIC_CANDIDATE_CONFIDENCE = 0.45;
const ROLE_KEYS = ["lands", "ramp", "draw", "removal", "protection"] as const;
const ALLOCATOR_APP_CONFIG_KEY = "external_deck_meta:last_allocator_summary";
const ALLOCATOR_HEARTBEAT_APP_CONFIG_KEY = "external_deck_meta:last_cron_heartbeat";
const ALLOCATOR_CURSOR_APP_CONFIG_KEY = "external_deck_meta:archidekt_search_cursors";
const ALLOCATOR_TARGET_STATS_APP_CONFIG_KEY = "external_deck_meta:growth_target_stats";
const TARGET_ELIGIBLE_PROFILES = 100;
const HOURLY_DETAIL_FETCH_CAP = 25;
const HOURLY_GROWTH_QUEUE_CAP = 60;
const CRON_DETAIL_PROCESSING_BUDGET_MS = 85_000;
const CRON_FINAL_COVERAGE_BUDGET_MS = 108_000;
const TARGET_POOR_YIELD_BACKOFF_MS = 12 * 60 * 60 * 1000;
const TARGET_POOR_YIELD_STREAK_LIMIT = 2;
const MAX_GROWTH_SEARCH_PAGES_BY_BUCKET: Record<string, number> = {
  usable_qa: 3,
  early_signal: 2,
  not_ready: 1,
  needs_confidence_review: 1,
};

type ExternalDeckMetaAllocatorSummary = {
  ok: boolean;
  mode: "growth" | "refresh" | "cooldown" | "disabled" | "idle";
  target_eligible_profiles: number;
  detail_fetch_cap: number;
  growth_budget: number;
  refresh_budget: number;
  queued_growth_target: number;
  queued_growth: number;
  queued_refresh: number;
  search_events: Array<{
    commander: string;
    bucket: string;
    page: number;
    query: string;
    status: number;
    found: number;
    queued: number;
    retry_after?: string | null;
  }>;
  selected_growth_targets: Array<{
    rank: number;
    commander: string;
    approved_sample_size: number;
    confidence_score: number;
    readiness_bucket: string;
    needed_to_50: number;
  }>;
  processed_summary: ExternalDeckIngestSummary | null;
  heartbeat_key?: string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  coverage_before?: {
    top100: ExternalCommanderCoverageReport["top100_summary"];
    top250: ExternalCommanderCoverageReport["top250_summary"];
    community_profile_eligible_count: number;
  };
  coverage_after?: {
    top100: ExternalCommanderCoverageReport["top100_summary"];
    top250: ExternalCommanderCoverageReport["top250_summary"];
    community_profile_eligible_count: number;
  };
  next_work_bucket: string;
  cooldown_until?: string | null;
  errors: string[];
  ran_at: string;
};

type ExternalDeckMetaTargetStats = Record<
  string,
  {
    commander: string;
    searches: number;
    found: number;
    queued: number;
    no_queue_streak: number;
    last_page: number;
    last_status: number;
    last_searched_at: string;
    skip_until?: string | null;
  }
>;

type ExternalCommanderProfileStatusRow = {
  id: string;
  commander_name: string;
  raw_sample_size: number;
  approved_sample_size: number;
  excluded_count: number;
  exclusion_reasons: Record<string, number>;
  source_breakdown: Record<string, number>;
  common_cards?: Array<{ name: string; deck_count: number; inclusion_rate: number }>;
  missing_common_support?: Array<{ name: string }>;
  confidence_components?: Record<string, unknown>;
  profile_consistency?: Record<string, unknown>;
  role_variance?: Record<string, unknown>;
  profile_warnings?: string[];
  off_color_support_gap_count?: number;
  averages?: {
    lands?: number;
    ramp?: number;
    draw?: number;
    removal?: number;
    protection?: number;
    average_mv?: number;
  };
  curve_summary?: Record<string, number>;
  confidence_score: number;
  approved_for_public: boolean;
  attribution?: { copy?: string };
  last_refreshed_at: string;
};

function profileReadinessBucket(profile: ExternalCommanderProfileStatusRow): "not_ready" | "early_signal" | "usable_qa" | "public_candidate" {
  if (profile.approved_sample_size < 10) return "not_ready";
  if (profile.approved_sample_size < 25) return "early_signal";
  if (profile.approved_sample_size < 50) return "usable_qa";
  return profile.confidence_score >= PUBLIC_CANDIDATE_CONFIDENCE ? "public_candidate" : "usable_qa";
}

function profileSuspiciousMetrics(profile: ExternalCommanderProfileStatusRow): string[] {
  if (profile.approved_sample_size <= 0) return [];
  const avg = profile.averages ?? {};
  const flags: string[] = [];
  if ((avg.ramp ?? 0) > 25) flags.push("ramp_gt_25");
  if ((avg.lands ?? 0) < 25) flags.push("lands_lt_25");
  if ((avg.lands ?? 0) > 45) flags.push("lands_gt_45");
  if ((avg.removal ?? 0) > 25) flags.push("removal_gt_25");
  if ((avg.draw ?? 0) > 35) flags.push("draw_gt_35");
  if ((avg.protection ?? 0) > 20) flags.push("protection_gt_20");
  return flags;
}

function withProfileQa(profile: ExternalCommanderProfileStatusRow) {
  return {
    ...profile,
    readiness_bucket: profileReadinessBucket(profile),
    suspicious_metrics: profileSuspiciousMetrics(profile),
  };
}

function emptySummary(): ExternalDeckIngestSummary {
  return {
    queued: 0,
    processed: 0,
    insertedOrUpdated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    discovered: 0,
    rollupsWritten: 0,
    profilesWritten: 0,
    rollupRegenerationMode: "full",
    profileRegenerationMode: "full",
    touchedCommanders: [],
    errors: [],
  };
}

function sourceRows(data: unknown): ExternalDeckSourceRow[] {
  return Array.isArray(data) ? (data as ExternalDeckSourceRow[]) : [];
}

export async function queueExternalDeckUrls(
  admin: SupabaseClient,
  urls: string[],
  submittedBy?: string | null
): Promise<{ queued: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  const rows = [];
  for (const raw of urls) {
    const parsed = parseExternalDeckUrl(raw);
    if (!parsed) {
      errors.push(`unsupported_url:${String(raw).slice(0, 120)}`);
      continue;
    }
    rows.push({
      source_key: parsed.sourceKey,
      external_id: parsed.externalId,
      url: parsed.canonicalUrl,
      submitted_by: submittedBy ?? null,
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length === 0) return { queued: 0, skipped: 0, errors };
  const { error } = await admin.from("external_deck_ingest_queue").upsert(rows, {
    onConflict: "source_key,external_id",
    ignoreDuplicates: false,
  });
  if (error) throw new Error(error.message);
  return { queued: rows.length, skipped: 0, errors };
}

export async function discoverArchidektQueue(admin: SupabaseClient): Promise<number> {
  const ids = await discoverArchidektRecentDecks();
  if (ids.length === 0) return 0;
  const { queued } = await queueExternalDeckUrls(
    admin,
    ids.map((id) => sourceDeckUrl("archidekt", id)),
    null
  );
  return queued;
}

function archidektCommanderQuery(commander: string): string {
  const name = String(commander || "").trim();
  if (/^the ur-dragon$/i.test(name)) return "Ur-Dragon";
  return name.split(",")[0]?.trim() || name;
}

async function readAppConfigJson<T>(admin: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data } = await admin.from("app_config").select("value").eq("key", key).maybeSingle();
  const value = (data as { value?: unknown } | null)?.value;
  if (value && typeof value === "object") return value as T;
  return fallback;
}

async function writeAppConfigJson(admin: SupabaseClient, key: string, value: unknown): Promise<void> {
  const { error } = await withSupabaseRetry(
    {
      operation: "app_config_upsert",
      table: "app_config",
      range: key,
    },
    async () =>
      admin.from("app_config").upsert(
        {
          key,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )
  );
  if (error) throw new Error(error.message);
}

async function existingArchidektIds(admin: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [decks, queue] = await Promise.all([
      admin.from("external_decks").select("external_id").eq("source_key", "archidekt").in("external_id", chunk),
      admin.from("external_deck_ingest_queue").select("external_id").eq("source_key", "archidekt").in("external_id", chunk),
    ]);
    if (decks.error) throw new Error(decks.error.message);
    if (queue.error) throw new Error(queue.error.message);
    for (const row of decks.data ?? []) existing.add(String((row as { external_id?: string }).external_id ?? ""));
    for (const row of queue.data ?? []) existing.add(String((row as { external_id?: string }).external_id ?? ""));
  }
  return existing;
}

function targetStatFor(stats: ExternalDeckMetaTargetStats, target: ExternalCommanderCoverageTarget) {
  return stats[target.commander_key || commanderCoverageKey(target.commander)];
}

function isTargetBackedOff(stats: ExternalDeckMetaTargetStats, target: ExternalCommanderCoverageTarget): boolean {
  const stat = targetStatFor(stats, target);
  return Boolean(stat?.skip_until && Date.parse(stat.skip_until) > Date.now());
}

function growthTargetSort(
  stats: ExternalDeckMetaTargetStats,
  a: ExternalCommanderCoverageTarget,
  b: ExternalCommanderCoverageTarget
): number {
  const bucketWeight = (row: ExternalCommanderCoverageTarget) => {
    if (row.readiness_bucket === "usable_qa") return 0;
    if (row.readiness_bucket === "early_signal") return 1;
    if (row.readiness_bucket === "not_ready" && row.rank <= 100) return 2;
    return 3;
  };
  const confidenceTrajectory = (row: ExternalCommanderCoverageTarget) => {
    if (row.approved_sample_size <= 0) return 0;
    return row.confidence_score / Math.max(1, Math.min(row.approved_sample_size, COMMUNITY_PROFILE_MIN_SAMPLE));
  };
  const yieldPenalty = (row: ExternalCommanderCoverageTarget) => {
    const stat = targetStatFor(stats, row);
    if (!stat) return 0;
    const searches = Math.max(1, Number(stat.searches) || 1);
    const queueRate = (Number(stat.queued) || 0) / searches;
    const foundRate = (Number(stat.found) || 0) / searches;
    const noQueuePenalty = (stat.no_queue_streak || 0) * 25;
    const lowQueuePenalty = queueRate < 5 ? 15 : queueRate < 15 ? 8 : 0;
    const lowFoundPenalty = foundRate < 10 ? 10 : 0;
    return Math.min(60, noQueuePenalty + lowQueuePenalty + lowFoundPenalty);
  };
  const sampleCloseness = (row: ExternalCommanderCoverageTarget) => {
    if (row.approved_sample_size >= 25) return row.needed_to_50;
    if (row.approved_sample_size >= 10) return row.needed_to_50 + 25;
    return row.needed_to_50 + 75;
  };
  return (
    bucketWeight(a) - bucketWeight(b) ||
    yieldPenalty(a) - yieldPenalty(b) ||
    sampleCloseness(a) - sampleCloseness(b) ||
    confidenceTrajectory(b) - confidenceTrajectory(a) ||
    b.popularity_score - a.popularity_score ||
    a.rank - b.rank
  );
}

function maxSearchPagesForTarget(target: ExternalCommanderCoverageTarget): number {
  return MAX_GROWTH_SEARCH_PAGES_BY_BUCKET[target.readiness_bucket] ?? 1;
}

async function queueFocusedArchidektGrowth(
  admin: SupabaseClient,
  source: Pick<ExternalDeckSourceRow, "source_key" | "consecutive_failures" | "min_delay_ms">,
  targets: ExternalCommanderCoverageTarget[],
  desiredDecks: number
): Promise<{
  queued: number;
  events: ExternalDeckMetaAllocatorSummary["search_events"];
  selected: ExternalDeckMetaAllocatorSummary["selected_growth_targets"];
  cooldownUntil?: string | null;
}> {
  const stats = await readAppConfigJson<ExternalDeckMetaTargetStats>(admin, ALLOCATOR_TARGET_STATS_APP_CONFIG_KEY, {});
  const selected = targets
    .filter((row) => row.approved_sample_size < COMMUNITY_PROFILE_MIN_SAMPLE)
    .filter((row) => !isTargetBackedOff(stats, row))
    .sort((a, b) => growthTargetSort(stats, a, b))
    .slice(0, 8);
  const cursors = await readAppConfigJson<Record<string, number>>(admin, ALLOCATOR_CURSOR_APP_CONFIG_KEY, {});
  const events: ExternalDeckMetaAllocatorSummary["search_events"] = [];
  let queued = 0;
  let cooldownUntil: string | null | undefined;

  for (const target of selected) {
    if (queued >= desiredDecks) break;
    const key = target.commander_key || commanderCoverageKey(target.commander);
    const pagesForTarget = maxSearchPagesForTarget(target);
    for (let targetPage = 0; targetPage < pagesForTarget; targetPage += 1) {
      if (queued >= desiredDecks || cooldownUntil) break;
      if (isTargetBackedOff(stats, target)) break;
      const page = Math.max(1, Math.floor(Number(cursors[key]) || 1));
      const query = archidektCommanderQuery(target.commander);
      const found = await discoverArchidektCommanderSearchDecks(query, { page, maxIds: 60 });
      cursors[key] = page + 1;
      if (!found.ok) {
        const status = found.status || 0;
        const now = new Date().toISOString();
        const existing = stats[key] ?? {
          commander: target.commander,
          searches: 0,
          found: 0,
          queued: 0,
          no_queue_streak: 0,
          last_page: page,
          last_status: status,
          last_searched_at: now,
          skip_until: null,
        };
        const noQueueStreak = existing.no_queue_streak + 1;
        stats[key] = {
          ...existing,
          commander: target.commander,
          searches: existing.searches + 1,
          last_page: page,
          last_status: status,
          last_searched_at: now,
          no_queue_streak: noQueueStreak,
          skip_until:
            noQueueStreak >= TARGET_POOR_YIELD_STREAK_LIMIT
              ? new Date(Date.now() + TARGET_POOR_YIELD_BACKOFF_MS).toISOString()
              : existing.skip_until ?? null,
        };
        events.push({
          commander: target.commander,
          bucket: target.readiness_bucket,
          page,
          query,
          status,
          found: 0,
          queued: 0,
          retry_after: found.retryAfter ?? null,
        });
        if (status === 429 || status === 403) {
          cooldownUntil = status === 429 ? retryAfterToCooldownIso(found.retryAfter ?? null, 6) : retryAfterToCooldownIso(null, 24);
          await markSourceFailure(admin, source, found.error, { cooldownUntil });
          break;
        }
        await politeDelay(source.min_delay_ms);
        continue;
      }

      const existing = await existingArchidektIds(admin, found.ids);
      const ids = found.ids.filter((id) => !existing.has(id)).slice(0, Math.max(0, desiredDecks - queued));
      if (ids.length > 0) {
        const now = new Date().toISOString();
        const rows = ids.map((id) => ({
          source_key: "archidekt",
          external_id: id,
          url: sourceDeckUrl("archidekt", id),
          submitted_by: null,
          status: "pending",
          next_attempt_at: now,
          updated_at: now,
        }));
        const { error } = await admin.from("external_deck_ingest_queue").upsert(rows, {
          onConflict: "source_key,external_id",
          ignoreDuplicates: true,
        });
        if (error) throw new Error(error.message);
        queued += rows.length;
      }
      const now = new Date().toISOString();
      const existingStats = stats[key] ?? {
        commander: target.commander,
        searches: 0,
        found: 0,
        queued: 0,
        no_queue_streak: 0,
        last_page: page,
        last_status: 200,
        last_searched_at: now,
        skip_until: null,
      };
      const noQueueStreak = ids.length > 0 ? 0 : existingStats.no_queue_streak + 1;
      stats[key] = {
        ...existingStats,
        commander: target.commander,
        searches: existingStats.searches + 1,
        found: existingStats.found + found.ids.length,
        queued: existingStats.queued + ids.length,
        no_queue_streak: noQueueStreak,
        last_page: page,
        last_status: 200,
        last_searched_at: now,
        skip_until:
          noQueueStreak >= TARGET_POOR_YIELD_STREAK_LIMIT
            ? new Date(Date.now() + TARGET_POOR_YIELD_BACKOFF_MS).toISOString()
            : null,
      };

      events.push({
        commander: target.commander,
        bucket: target.readiness_bucket,
        page,
        query,
        status: 200,
        found: found.ids.length,
        queued: ids.length,
      });
      await politeDelay(source.min_delay_ms);
    }
  }

  await writeAppConfigJson(admin, ALLOCATOR_CURSOR_APP_CONFIG_KEY, cursors);
  await writeAppConfigJson(admin, ALLOCATOR_TARGET_STATS_APP_CONFIG_KEY, stats);
  return {
    queued,
    events,
    selected: selected.map((target) => ({
      rank: target.rank,
      commander: target.commander,
      approved_sample_size: target.approved_sample_size,
      confidence_score: target.confidence_score,
      readiness_bucket: target.readiness_bucket,
      needed_to_50: target.needed_to_50,
    })),
    cooldownUntil,
  };
}

async function queueArchidektRefresh(
  admin: SupabaseClient,
  eligibleCommanders: Set<string>,
  desiredDecks: number
): Promise<number> {
  if (desiredDecks <= 0 || eligibleCommanders.size === 0) return 0;
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("external_decks")
    .select("source_key, external_id, url, commanders, fetched_at")
    .eq("source_key", "archidekt")
    .eq("format", "commander")
    .eq("aggregate_approved", true)
    .lt("fetched_at", cutoff)
    .order("fetched_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = [];
  const now = new Date().toISOString();
  for (const row of (data ?? []) as Array<{ external_id?: string; url?: string | null; commanders?: string[] }>) {
    if (rows.length >= desiredDecks) break;
    const commanders = Array.isArray(row.commanders) ? row.commanders : [];
    if (!commanders.some((name) => eligibleCommanders.has(commanderCoverageKey(name)))) continue;
    const externalId = String(row.external_id ?? "");
    if (!/^\d+$/.test(externalId)) continue;
    rows.push({
      source_key: "archidekt",
      external_id: externalId,
      url: row.url || sourceDeckUrl("archidekt", externalId),
      submitted_by: null,
      status: "pending",
      next_attempt_at: now,
      updated_at: now,
    });
  }
  if (rows.length === 0) return 0;
  const { error: upsertError } = await admin.from("external_deck_ingest_queue").upsert(rows, {
    onConflict: "source_key,external_id",
    ignoreDuplicates: false,
  });
  if (upsertError) throw new Error(upsertError.message);
  return rows.length;
}

async function countDueQueuedDecks(admin: SupabaseClient, sourceKey: ExternalDeckSourceKey): Promise<number> {
  const { count, error } = await admin
    .from("external_deck_ingest_queue")
    .select("id", { count: "exact", head: true })
    .eq("source_key", sourceKey)
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function coverageSummaryForAllocator(report: ExternalCommanderCoverageReport) {
  return {
    top100: report.top100_summary,
    top250: report.top250_summary,
    community_profile_eligible_count: report.community_profile_eligible_count,
  };
}

async function writeExternalMetaCronHeartbeat(
  admin: SupabaseClient,
  value: Record<string, unknown>
): Promise<void> {
  await writeAppConfigJson(admin, ALLOCATOR_HEARTBEAT_APP_CONFIG_KEY, {
    ...value,
    updated_at: new Date().toISOString(),
  });
}

function normalizeFormat(format: string | null | undefined): string | null {
  const f = String(format || "").trim().toLowerCase();
  if (!f) return null;
  if (f.includes("commander") || f === "edh" || f === "cedh") return "commander";
  if (f.includes("standard")) return "standard";
  if (f.includes("modern")) return "modern";
  if (f.includes("pioneer")) return "pioneer";
  if (f.includes("pauper")) return "pauper";
  if (f.includes("legacy")) return "legacy";
  if (f.includes("vintage")) return "vintage";
  if (f.includes("brawl")) return "brawl";
  return f.slice(0, 40);
}

function validateDeck(deck: NormalizedExternalDeck): { valid: boolean; reason: ExclusionReason | null; format: string | null } {
  const format = normalizeFormat(deck.format);
  if (!format) return { valid: false, reason: "invalid_format", format: null };
  const isCommander = format === "commander" || format === "brawl";
  if (isCommander && deck.commanders.length === 0) return { valid: false, reason: "missing_commander", format };
  const cardCount = countCards(deck.cards);
  if (isCommander && cardCount < COMMANDER_MIN_CARDS) return { valid: false, reason: "too_few_cards", format };
  if (!isCommander && cardCount < CONSTRUCTED_MIN_CARDS) return { valid: false, reason: "too_few_cards", format };
  return { valid: true, reason: null, format };
}

async function hasDuplicateApprovedHash(admin: SupabaseClient, deckHash: string, sourceKey: string, externalId: string): Promise<boolean> {
  const { data } = await admin
    .from("external_decks")
    .select("source_key, external_id")
    .eq("deck_hash", deckHash)
    .eq("aggregate_approved", true)
    .limit(5);
  return (data ?? []).some((row) => row.source_key !== sourceKey || row.external_id !== externalId);
}

async function fetchCardFacts(
  admin: SupabaseClient,
  names: string[]
): Promise<Map<string, { type_line?: string | null; oracle_text?: string | null; cmc?: number | null; color_identity?: string[] | null }>> {
  const keys = [...new Set(names.map(normalizeScryfallCacheName).filter(Boolean))];
  const out = new Map<string, { type_line?: string | null; oracle_text?: string | null; cmc?: number | null; color_identity?: string[] | null }>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await withSupabaseRetry(
      {
        operation: "profile_fetch_card_facts",
        table: "scryfall_cache",
        range: `${i}-${Math.min(i + 99, keys.length - 1)}`,
      },
      async () =>
        admin
          .from("scryfall_cache")
          .select("name, type_line, oracle_text, cmc, color_identity")
          .in("name", keys.slice(i, i + 100))
    );
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const r = row as { name: string; type_line?: string | null; oracle_text?: string | null; cmc?: number | null; color_identity?: string[] | null };
      out.set(r.name, { type_line: r.type_line, oracle_text: r.oracle_text, cmc: r.cmc, color_identity: r.color_identity });
    }
  }
  return out;
}

async function fetchDeckCardsPage<T>(
  admin: SupabaseClient,
  deckIds: string[],
  columns: string,
  boards: string[]
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let i = 0; i < deckIds.length; i += 100) {
    const ids = deckIds.slice(i, i + 100);
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await withSupabaseRetry(
        {
          operation: "fetch_deck_cards_page",
          table: "external_deck_cards",
          range: `decks ${i}-${Math.min(i + 99, deckIds.length - 1)} rows ${from}-${from + pageSize - 1}`,
        },
        async () =>
          admin
            .from("external_deck_cards")
            .select(columns)
            .in("external_deck_id", ids)
            .in("board", boards)
            .order("external_deck_id", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1)
      );
      if (error) throw new Error(error.message);
      const page = (data ?? []) as T[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
  }
  return rows;
}

async function fetchExternalDeckRowsPage<T>(
  admin: SupabaseClient,
  operation: string,
  select: string,
  filter: (query: any) => any
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await withSupabaseRetry(
      {
        operation,
        table: "external_decks",
        range: `${from}-${from + pageSize - 1}`,
      },
      async () => filter(admin.from("external_decks").select(select).order("id", { ascending: true }).range(from, from + pageSize - 1))
    );
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function persistDeck(
  admin: SupabaseClient,
  deck: NormalizedExternalDeck,
  source: ExternalDeckSourceRow
): Promise<{ status: "updated" | "unchanged" | "skipped"; commanders: string[]; format: string | null; aggregateApproved: boolean }> {
  const hash = stableDeckHash(deck);
  const validation = validateDeck(deck);
  let isValid = validation.valid;
  let reason = validation.reason;
  if (isValid && (await hasDuplicateApprovedHash(admin, hash, deck.sourceKey, deck.externalId))) {
    isValid = false;
    reason = "duplicate_deck_hash";
  }
  const aggregateApproved = isValid && source.approved_for_profiles;
  const existing = await admin
    .from("external_decks")
    .select("id, deck_hash")
    .eq("source_key", deck.sourceKey)
    .eq("external_id", deck.externalId)
    .maybeSingle();
  if (existing.data?.deck_hash === hash) {
    await admin
      .from("external_decks")
      .update({
        format: validation.format,
        commanders: deck.commanders,
        mainboard_count: countCards(deck.cards, ["mainboard", "commander"]),
        sideboard_count: countCards(deck.cards, ["sideboard"]),
        is_valid: isValid,
        aggregate_approved: aggregateApproved,
        exclusion_reason: reason,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing.data as { id: string }).id);
    return { status: "unchanged", commanders: deck.commanders, format: validation.format, aggregateApproved };
  }

  const mainboardCount = countCards(deck.cards, ["mainboard", "commander"]);
  const sideboardCount = countCards(deck.cards, ["sideboard"]);
  const row = {
    source_key: deck.sourceKey,
    external_id: deck.externalId,
    url: deck.url,
    title: deck.title ?? null,
    owner_name: deck.ownerName ?? null,
    format: validation.format,
    commanders: deck.commanders,
    mainboard_count: mainboardCount,
    sideboard_count: sideboardCount,
    deck_hash: hash,
    is_valid: isValid,
    aggregate_approved: aggregateApproved,
    exclusion_reason: reason,
    source_payload: deck.sourcePayload ?? {},
    published_at: deck.publishedAt ?? null,
    external_updated_at: deck.externalUpdatedAt ?? null,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("external_decks")
    .upsert(row, { onConflict: "source_key,external_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const deckId = (data as { id: string }).id;
  await admin.from("external_deck_cards").delete().eq("external_deck_id", deckId);
  const cardRows = deck.cards
    .filter((card) => card.name.trim())
    .map((card) => ({
      external_deck_id: deckId,
      source_key: deck.sourceKey,
      external_deck_source_id: deck.externalId,
      board: card.board,
      quantity: Math.max(1, Number(card.quantity) || 1),
      card_name: card.name.trim(),
      card_name_norm: normalizeScryfallCacheName(card.name),
      category: card.category ?? null,
    }));
  if (cardRows.length > 0) {
    const { error: cardsError } = await admin.from("external_deck_cards").insert(cardRows);
    if (cardsError) throw new Error(cardsError.message);
  }
  return { status: aggregateApproved ? "updated" : "skipped", commanders: deck.commanders, format: validation.format, aggregateApproved };
}

async function processQueueForSource(
  admin: SupabaseClient,
  source: ExternalDeckSourceRow,
  summary: ExternalDeckIngestSummary,
  touchedCommanders: Set<string>,
  opts: { deadlineMs?: number } = {}
): Promise<void> {
  if (!source.enabled || isSourceCoolingDown(source)) {
    summary.skipped += 1;
    return;
  }
  const { data: queueRows } = await admin
    .from("external_deck_ingest_queue")
    .select("id, source_key, external_id, url, attempts")
    .eq("source_key", source.source_key)
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(source.max_decks_per_run);

  for (const raw of queueRows ?? []) {
    if (opts.deadlineMs && Date.now() >= opts.deadlineMs) {
      summary.errors.push("cron_processing_budget_reached");
      return;
    }
    const q = raw as { id: string; external_id: string; attempts: number };
    summary.processed += 1;
    await admin.from("external_deck_ingest_queue").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", q.id);
    const fetched = await fetchExternalDeck(source.source_key, q.external_id);
    if (!fetched.ok) {
      summary.failed += 1;
      const code = fetched.status === 429 ? "rate_limited" : fetched.status === 403 ? "private_unavailable" : "fetch_failed";
      const cooldown =
        fetched.status === 429
          ? retryAfterToCooldownIso(fetched.retryAfter ?? null, 6)
          : fetched.status === 403
            ? retryAfterToCooldownIso(null, 24)
            : null;
      await markSourceFailure(admin, source, fetched.error, { cooldownUntil: cooldown });
      await admin
        .from("external_deck_ingest_queue")
        .update({
          status: "failed",
          attempts: (q.attempts ?? 0) + 1,
          last_error: fetched.error.slice(0, 500),
          last_error_code: code,
          next_attempt_at: cooldown ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", q.id);
      summary.errors.push(fetched.error);
      if (fetched.status === 429 || fetched.status === 403) return;
    } else {
      try {
        const result = await persistDeck(admin, fetched.deck, source);
        if (result.status === "unchanged") summary.unchanged += 1;
        else summary.insertedOrUpdated += 1;
        if (result.status === "updated" && result.aggregateApproved && result.format === "commander") {
          for (const commander of result.commanders) {
            const name = String(commander || "").trim();
            if (name) touchedCommanders.add(name);
          }
        }
        await markSourceSuccess(admin, source.source_key);
        await admin
          .from("external_deck_ingest_queue")
          .update({
            status: result.status === "unchanged" ? "skipped" : "done",
            processed_at: new Date().toISOString(),
            last_error: null,
            last_error_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", q.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "persist_failed";
        summary.failed += 1;
        summary.errors.push(msg);
        await admin
          .from("external_deck_ingest_queue")
          .update({
            status: "failed",
            attempts: (q.attempts ?? 0) + 1,
            last_error: msg.slice(0, 500),
            last_error_code: "persist_failed",
            next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", q.id);
      }
    }
    await politeDelay(source.min_delay_ms);
  }
}

export async function writeExternalMetaRollups(admin: SupabaseClient): Promise<number> {
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const deckRows = await fetchExternalDeckRowsPage<{ id: string; source_key: string; format: string | null; commanders: string[]; aggregate_approved: boolean }>(
    admin,
    "rollups_fetch_approved_decks",
    "id, source_key, format, commanders, aggregate_approved",
    (query) => query.eq("aggregate_approved", true)
  );
  if (deckRows.length === 0) return 0;
  const deckIds = deckRows.map((d) => d.id);
  const cards = await fetchDeckCardsPage<{ external_deck_id: string; source_key: string; card_name: string; card_name_norm?: string | null }>(
    admin,
    deckIds,
    "external_deck_id, source_key, card_name, card_name_norm, board",
    ["mainboard", "commander"]
  );

  const payload = new Map<string, { source_key: string; format: string; entity_type: "commander" | "card"; entity_name: string; entity_name_norm: string; deckIds: Set<string>; sources: Record<string, number> }>();
  const add = (sourceKey: string, format: string, type: "commander" | "card", name: string, deckId: string) => {
    const norm = normalizeScryfallCacheName(name);
    if (!norm) return;
    const key = `${sourceKey}|${format}|${type}|${norm}`;
    const existing = payload.get(key) ?? {
      source_key: sourceKey,
      format,
      entity_type: type,
      entity_name: name,
      entity_name_norm: norm,
      deckIds: new Set<string>(),
      sources: {},
    };
    if (!existing.deckIds.has(deckId)) {
      existing.deckIds.add(deckId);
      existing.sources[sourceKey] = (existing.sources[sourceKey] ?? 0) + 1;
    }
    payload.set(key, existing);
  };

  for (const d of deckRows) {
    const format = d.format ?? "unknown";
    for (const c of d.commanders ?? []) add(d.source_key, format, "commander", c, d.id);
  }
  for (const c of cards) {
    const row = c as { external_deck_id: string; source_key: string; card_name: string; card_name_norm?: string | null };
    const deck = deckRows.find((d) => d.id === row.external_deck_id);
    if (!deck) continue;
    add(row.source_key, deck.format ?? "unknown", "card", row.card_name, row.external_deck_id);
  }

  const rows = [...payload.values()].map((r) => ({
    snapshot_date: snapshotDate,
    source_key: r.source_key,
    format: r.format,
    entity_type: r.entity_type,
    entity_name: r.entity_name,
    entity_name_norm: r.entity_name_norm,
    deck_count: r.deckIds.size,
    source_breakdown: r.sources,
    sample_deck_ids: [...r.deckIds].slice(0, 50),
    payload: {},
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await withSupabaseRetry(
      {
        operation: "rollups_upsert_chunk",
        table: "external_meta_rollups_daily",
        range: `${i}-${Math.min(i + 499, rows.length - 1)}`,
      },
      async () =>
        admin.from("external_meta_rollups_daily").upsert(rows.slice(i, i + 500), {
          onConflict: "snapshot_date,source_key,format,entity_type,entity_name_norm",
        })
    );
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

function variance(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number((values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length).toFixed(2));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isColorIdentityLegal(cardColors: string[] | null | undefined, commanderColors: string[] | null | undefined): boolean {
  const allowed = new Set((commanderColors ?? []).map((color) => String(color).toUpperCase()));
  return (cardColors ?? []).every((color) => allowed.has(String(color).toUpperCase()));
}

function sourceEntropyScore(sourceBreakdown: Record<string, number>, sampleSize: number): number {
  const counts = Object.values(sourceBreakdown).filter((count) => count > 0);
  if (counts.length <= 1 || sampleSize <= 0) return 0;
  const entropy = counts.reduce((sum, count) => {
    const p = count / sampleSize;
    return sum - p * Math.log(p);
  }, 0);
  return Math.min(1, entropy / Math.log(counts.length));
}

function buildProfileQaMetrics(input: {
  approvedCount: number;
  rawSample: number;
  sourceBreakdown: Record<string, number>;
  commonCards: Array<{ name: string; deck_count: number; inclusion_rate: number }>;
  roleSamples: Record<(typeof ROLE_KEYS)[number], number[]>;
  supportGapRejected: number;
  commanderName: string;
}) {
  const top10 = input.commonCards.slice(0, 10);
  const top20 = input.commonCards.slice(0, 20);
  const top10Concentration = Number(average(top10.map((card) => card.inclusion_rate)).toFixed(3));
  const top20Concentration = Number(average(top20.map((card) => card.inclusion_rate)).toFixed(3));
  const roleVariance = Object.fromEntries(
    ROLE_KEYS.map((key) => [key, variance(input.roleSamples[key])])
  ) as Record<(typeof ROLE_KEYS)[number], number>;
  const normalizedRoleVariance = Math.min(
    1,
    ROLE_KEYS.reduce((sum, key) => sum + roleVariance[key], 0) / ROLE_KEYS.length / 50
  );
  const consistencyScore = Number(Math.max(0, Math.min(1, top20Concentration * 0.7 + (1 - normalizedRoleVariance) * 0.3)).toFixed(3));
  const sourceDiversityScore = Number(sourceEntropyScore(input.sourceBreakdown, input.approvedCount).toFixed(3));
  const sampleScore = Number(Math.min(1, input.approvedCount / 50).toFixed(3));
  const dataQualityScore = Number((input.rawSample ? input.approvedCount / input.rawSample : 0).toFixed(3));
  const confidenceComponents = {
    sample_size: Number((sampleScore * 0.4).toFixed(3)),
    source_diversity: Number((sourceDiversityScore * 0.2).toFixed(3)),
    profile_consistency: Number((consistencyScore * 0.2).toFixed(3)),
    data_quality: Number((dataQualityScore * 0.1).toFixed(3)),
    deck_match: 0,
    missing_components: ["deck_match"],
  };
  const warnings: string[] = [];
  if (input.approvedCount < 25) warnings.push("low_sample_size");
  if (Object.keys(input.sourceBreakdown).length < 2) warnings.push("single_source_profile");
  if (top20Concentration < 0.45) warnings.push("archetype_spread_low_common_card_concentration");
  if (normalizedRoleVariance > 0.65) warnings.push("high_role_variance");
  if (/atraxa/i.test(input.commanderName) && input.approvedCount < 25) warnings.push("profile_mixed_archetype_review_recommended");
  if (input.supportGapRejected > 0) warnings.push("off_color_support_gaps_rejected");
  return {
    confidenceScore: Number(Object.values(confidenceComponents).filter((value): value is number => typeof value === "number").reduce((sum, value) => sum + value, 0).toFixed(3)),
    confidenceComponents,
    profileConsistency: {
      common_card_concentration_top10: top10Concentration,
      common_card_concentration_top20: top20Concentration,
      consistency_score: consistencyScore,
      source_diversity_score: sourceDiversityScore,
      data_quality_score: dataQualityScore,
    },
    roleVariance,
    warnings,
  };
}

function categoryHits(name: string, facts: { type_line?: string | null; oracle_text?: string | null } | undefined, category?: string | null) {
  const typeLine = String(facts?.type_line ?? "").toLowerCase();
  const oracle = String(facts?.oracle_text ?? "").toLowerCase();
  const cardName = String(name ?? "").toLowerCase();
  const isLand = /\bland\b/.test(typeLine) || /\blands?\b/i.test(String(category ?? ""));
  const isNonlandManaPermanent = !isLand && /\b(artifact|creature|enchantment)\b/.test(typeLine) && /(add \{[wubrgc]+\}|add (one|two|three|x)? ?mana|treasure token)/i.test(oracle);
  const lower = `${name} ${facts?.type_line ?? ""} ${facts?.oracle_text ?? ""}`.toLowerCase();
  return {
    land: isLand,
    ramp: !isLand && (isNonlandManaPermanent || /(search your library.*land|cultivate|kodama's reach|farseek|nature's lore|three visits|skyshroud claim|rampant growth|arcane signet|sol ring|\bsignet\b|\btalisman\b)/i.test(`${cardName} ${oracle}`)),
    draw: /(draw (a|one|two|three|x|that many) cards?|whenever .* draw|rhystic study|esper sentinel)/i.test(lower),
    removal: /(destroy target (creature|artifact|enchantment|planeswalker|permanent)|exile target (creature|artifact|enchantment|planeswalker|permanent)|counter target spell|return target (creature|nonland permanent|spell)|deals .* damage to (any target|target creature|target planeswalker)|destroy all|exile all|swords to plowshares|path to exile)/i.test(lower),
    protection: /(hexproof|indestructible|protection from|phase out|prevent all damage|heroic intervention|teferi's protection|lightning greaves|swiftfoot boots)/i.test(lower),
  };
}

export async function writeExternalCommanderProfiles(
  admin: SupabaseClient,
  opts: { commanderNames?: string[] } = {}
): Promise<number> {
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const commanderNames = [...new Set((opts.commanderNames ?? []).map((name) => String(name || "").trim()).filter(Boolean))];
  if (opts.commanderNames && commanderNames.length === 0) return 0;
  const requestedCommanderNorms = new Set(commanderNames.map(normalizeScryfallCacheName).filter(Boolean));
  const decks = await fetchExternalDeckRowsPage<{
    id: string;
    source_key: string;
    format: string | null;
    commanders: string[];
    is_valid: boolean;
    aggregate_approved: boolean;
    exclusion_reason: ExclusionReason | null;
  }>(
    admin,
    "profiles_fetch_commander_decks",
    "id, source_key, format, commanders, is_valid, aggregate_approved, exclusion_reason",
    (query) => query.eq("format", "commander")
  );
  const candidateDecks =
    requestedCommanderNorms.size > 0
      ? decks.filter((deck) => (deck.commanders ?? []).some((commander) => requestedCommanderNorms.has(normalizeScryfallCacheName(commander))))
      : decks;
  if (candidateDecks.length === 0) return 0;
  const cards = await fetchDeckCardsPage<{ external_deck_id: string; card_name: string; card_name_norm: string | null; quantity: number; board: string; category?: string | null }>(
    admin,
    candidateDecks.map((d) => d.id),
    "external_deck_id, card_name, card_name_norm, quantity, board, category",
    ["mainboard", "commander"]
  );
  const facts = await fetchCardFacts(admin, [...cards.map((c) => c.card_name), ...candidateDecks.flatMap((d) => d.commanders ?? [])]);
  const cardsByDeck = new Map<string, typeof cards>();
  for (const c of cards) cardsByDeck.set(c.external_deck_id, [...(cardsByDeck.get(c.external_deck_id) ?? []), c]);

  const commanderKeys = new Map<string, string>();
  for (const d of candidateDecks) {
    for (const c of d.commanders ?? []) {
      const norm = normalizeScryfallCacheName(c);
      if (requestedCommanderNorms.size > 0 && !requestedCommanderNorms.has(norm)) continue;
      if (norm && !commanderKeys.has(norm)) commanderKeys.set(norm, c);
    }
  }

  const rows: Array<{ commander_name: string; commander_name_norm: string; [key: string]: unknown }> = [];
  for (const [commanderNorm, commanderName] of commanderKeys.entries()) {
    const related = candidateDecks.filter((d) => (d.commanders ?? []).some((c) => normalizeScryfallCacheName(c) === commanderNorm));
    const rawSample = related.length;
    const approved = related.filter((d) => d.aggregate_approved);
    const exclusionReasons: Record<string, number> = {};
    for (const d of related.filter((row) => !row.aggregate_approved)) {
      const reason = d.exclusion_reason ?? (d.is_valid ? "unsupported_source" : "parse_failure");
      exclusionReasons[reason] = (exclusionReasons[reason] ?? 0) + 1;
    }
    const sourceBreakdown: Record<string, number> = {};
    const cardDeckCounts = new Map<string, { name: string; count: number }>();
    const totals = { lands: 0, ramp: 0, draw: 0, removal: 0, protection: 0, mv: 0, mvCards: 0 };
    const roleSamples = {
      lands: [] as number[],
      ramp: [] as number[],
      draw: [] as number[],
      removal: [] as number[],
      protection: [] as number[],
    };
    const curve: Record<string, number> = {};
    for (const d of approved) {
      sourceBreakdown[d.source_key] = (sourceBreakdown[d.source_key] ?? 0) + 1;
      const seen = new Set<string>();
      const deckCards = cardsByDeck.get(d.id) ?? [];
      const local = { lands: 0, ramp: 0, draw: 0, removal: 0, protection: 0, mv: 0, mvCards: 0 };
      for (const c of deckCards) {
        const norm = c.card_name_norm ?? normalizeScryfallCacheName(c.card_name);
        if (norm === commanderNorm) continue;
        const fact = facts.get(norm);
        const qty = Math.max(1, Number(c.quantity) || 1);
        if (!seen.has(norm)) {
          seen.add(norm);
          const entry = cardDeckCounts.get(norm) ?? { name: c.card_name, count: 0 };
          entry.count += 1;
          cardDeckCounts.set(norm, entry);
        }
        const hits = categoryHits(c.card_name, fact, c.category);
        if (hits.land) local.lands += qty;
        if (hits.ramp) local.ramp += qty;
        if (hits.draw) local.draw += qty;
        if (hits.removal) local.removal += qty;
        if (hits.protection) local.protection += qty;
        const cmc = Number(fact?.cmc ?? 0);
        if (Number.isFinite(cmc) && cmc > 0 && !hits.land) {
          local.mv += cmc * qty;
          local.mvCards += qty;
          const bucket = cmc >= 7 ? "7+" : String(Math.floor(cmc));
          curve[bucket] = (curve[bucket] ?? 0) + qty;
        }
      }
      totals.lands += local.lands;
      totals.ramp += local.ramp;
      totals.draw += local.draw;
      totals.removal += local.removal;
      totals.protection += local.protection;
      totals.mv += local.mv;
      totals.mvCards += local.mvCards;
      roleSamples.lands.push(local.lands);
      roleSamples.ramp.push(local.ramp);
      roleSamples.draw.push(local.draw);
      roleSamples.removal.push(local.removal);
      roleSamples.protection.push(local.protection);
    }
    const approvedCount = approved.length;
    const commonCards = [...cardDeckCounts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 40)
      .map((c) => ({ name: c.name, deck_count: c.count, inclusion_rate: approvedCount ? Number((c.count / approvedCount).toFixed(3)) : 0 }));
    const commanderColors = facts.get(commanderNorm)?.color_identity ?? [];
    let supportGapRejected = 0;
    const missingCommonSupport = commonCards
      .filter((card) => card.inclusion_rate >= 0.5)
      .filter((card) => {
        const fact = facts.get(normalizeScryfallCacheName(card.name));
        const isLegal = isColorIdentityLegal(fact?.color_identity, commanderColors);
        if (!isLegal) supportGapRejected += 1;
        return isLegal && !categoryHits(card.name, fact).land;
      })
      .slice(0, 12)
      .map((card) => ({ name: card.name, inclusion_rate: card.inclusion_rate, deck_count: card.deck_count }));
    const qaMetrics = buildProfileQaMetrics({
      approvedCount,
      rawSample,
      sourceBreakdown,
      commonCards,
      roleSamples,
      supportGapRejected,
      commanderName,
    });
    rows.push({
      commander_name: commanderName,
      commander_name_norm: commanderNorm,
      snapshot_date: snapshotDate,
      raw_sample_size: rawSample,
      approved_sample_size: approvedCount,
      excluded_count: Math.max(0, rawSample - approvedCount),
      exclusion_reasons: exclusionReasons,
      source_breakdown: sourceBreakdown,
      common_cards: commonCards,
      missing_common_support: missingCommonSupport,
      averages: {
        lands: approvedCount ? Number((totals.lands / approvedCount).toFixed(1)) : 0,
        ramp: approvedCount ? Number((totals.ramp / approvedCount).toFixed(1)) : 0,
        draw: approvedCount ? Number((totals.draw / approvedCount).toFixed(1)) : 0,
        removal: approvedCount ? Number((totals.removal / approvedCount).toFixed(1)) : 0,
        protection: approvedCount ? Number((totals.protection / approvedCount).toFixed(1)) : 0,
        average_mv: totals.mvCards ? Number((totals.mv / totals.mvCards).toFixed(2)) : 0,
      },
      curve_summary: curve,
      confidence_score: qaMetrics.confidenceScore,
      confidence_components: qaMetrics.confidenceComponents,
      profile_consistency: qaMetrics.profileConsistency,
      role_variance: qaMetrics.roleVariance,
      profile_warnings: qaMetrics.warnings,
      off_color_support_gap_count: supportGapRejected,
      attribution: {
        claim_sample_size: approvedCount,
        source_breakdown: sourceBreakdown,
        copy: `Based on ${approvedCount} public ${commanderName} decks from approved external sources.`,
      },
      last_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  for (let i = 0; i < rows.length; i += 100) {
    const commanderStart = rows[i]?.commander_name;
    const commanderEnd = rows[Math.min(i + 99, rows.length - 1)]?.commander_name;
    const { error } = await withSupabaseRetry(
      {
        operation: "profiles_upsert_chunk",
        table: "external_commander_profiles",
        commander: commanderStart === commanderEnd ? commanderStart : `${commanderStart}..${commanderEnd}`,
        range: `${i}-${Math.min(i + 99, rows.length - 1)}`,
      },
      async () =>
        admin.from("external_commander_profiles").upsert(rows.slice(i, i + 100), {
          onConflict: "commander_name_norm,snapshot_date",
        })
    );
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

export async function runExternalDeckMetaIngest(
  admin: SupabaseClient,
  opts?: {
    source?: ExternalDeckSourceKey | "all";
    limit?: number;
    discover?: boolean;
    rollupRegeneration?: "full" | "none";
    profileRegeneration?: "full" | "touched" | "none";
    processingDeadlineMs?: number;
  }
): Promise<ExternalDeckIngestSummary> {
  const summary = emptySummary();
  const rollupRegeneration = opts?.rollupRegeneration ?? "full";
  const profileRegeneration = opts?.profileRegeneration ?? "full";
  const touchedCommanders = new Set<string>();
  summary.rollupRegenerationMode = rollupRegeneration;
  summary.profileRegenerationMode = profileRegeneration;
  const sourceFilter = opts?.source && opts.source !== "all" ? opts.source : null;
  if (opts?.discover !== false) {
    const { data: archidekt } = await admin
      .from("external_deck_sources")
      .select("source_key, enabled, discovery_enabled, cooldown_until")
      .eq("source_key", "archidekt")
      .maybeSingle();
    const source = archidekt as { enabled?: boolean; discovery_enabled?: boolean; cooldown_until?: string | null } | null;
    if (!sourceFilter && source?.enabled && source.discovery_enabled && !isSourceCoolingDown({ cooldown_until: source.cooldown_until ?? null })) {
      try {
        summary.discovered = await discoverArchidektQueue(admin);
      } catch (e) {
        summary.errors.push(e instanceof Error ? e.message : "archidekt_discovery_failed");
      }
    }
  }

  let sourceQuery = admin
    .from("external_deck_sources")
    .select("source_key, display_name, enabled, discovery_enabled, approved_for_profiles, cooldown_until, min_delay_ms, max_decks_per_run, max_discovery_pages_per_run, consecutive_failures, last_error")
    .eq("enabled", true);
  if (sourceFilter) sourceQuery = sourceQuery.eq("source_key", sourceFilter);
  const { data: sourceData, error } = await sourceQuery;
  if (error) throw new Error(error.message);

  for (const source of sourceRows(sourceData)) {
    const capped = opts?.limit ? { ...source, max_decks_per_run: Math.min(source.max_decks_per_run, opts.limit) } : source;
    await processQueueForSource(admin, capped, summary, touchedCommanders, { deadlineMs: opts?.processingDeadlineMs });
  }

  summary.rollupsWritten = rollupRegeneration === "full" ? await writeExternalMetaRollups(admin) : 0;
  summary.touchedCommanders = [...touchedCommanders].sort((a, b) => a.localeCompare(b));
  if (profileRegeneration === "full") {
    summary.profilesWritten = await writeExternalCommanderProfiles(admin);
  } else if (profileRegeneration === "touched") {
    summary.profilesWritten = await writeExternalCommanderProfiles(admin, { commanderNames: summary.touchedCommanders });
  } else {
    summary.profilesWritten = 0;
  }
  return summary;
}

export async function runExternalDeckMetaCronAllocator(admin: SupabaseClient): Promise<ExternalDeckMetaAllocatorSummary> {
  const ranAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const base: ExternalDeckMetaAllocatorSummary = {
    ok: true,
    mode: "idle",
    target_eligible_profiles: TARGET_ELIGIBLE_PROFILES,
    detail_fetch_cap: HOURLY_DETAIL_FETCH_CAP,
    growth_budget: 0,
    refresh_budget: 0,
    queued_growth_target: 0,
    queued_growth: 0,
    queued_refresh: 0,
    search_events: [],
    selected_growth_targets: [],
    processed_summary: null,
    heartbeat_key: ALLOCATOR_HEARTBEAT_APP_CONFIG_KEY,
    started_at: ranAt,
    next_work_bucket: "none",
    errors: [],
    ran_at: ranAt,
  };
  const finish = async <T extends ExternalDeckMetaAllocatorSummary>(summary: T, status: string): Promise<T> => {
    const finishedAt = new Date().toISOString();
    const finished = {
      ...summary,
      finished_at: finishedAt,
      duration_ms: Date.now() - startedAtMs,
    };
    await writeExternalMetaCronHeartbeat(admin, {
      status,
      ok: finished.ok,
      mode: finished.mode,
      ran_at: finished.ran_at,
      started_at: finished.started_at,
      finished_at: finished.finished_at,
      duration_ms: finished.duration_ms,
      next_work_bucket: finished.next_work_bucket,
      queued_growth: finished.queued_growth,
      queued_growth_target: finished.queued_growth_target,
      queued_refresh: finished.queued_refresh,
      processed: finished.processed_summary?.processed ?? 0,
      rollups_written: finished.processed_summary?.rollupsWritten ?? 0,
      rollup_regeneration_mode: finished.processed_summary?.rollupRegenerationMode ?? null,
      profiles_written: finished.processed_summary?.profilesWritten ?? 0,
      profile_regeneration_mode: finished.processed_summary?.profileRegenerationMode ?? null,
      touched_commanders: finished.processed_summary?.touchedCommanders ?? [],
      errors: finished.errors,
    });
    await writeAppConfigJson(admin, ALLOCATOR_APP_CONFIG_KEY, finished);
    return finished as T;
  };

  await writeExternalMetaCronHeartbeat(admin, {
    status: "started",
    ok: true,
    mode: "starting",
    ran_at: ranAt,
    started_at: ranAt,
    next_work_bucket: "starting",
  });

  try {
    const coverageBefore = await buildExternalCommanderCoverageReport(admin);
    base.coverage_before = coverageSummaryForAllocator(coverageBefore);

    const { data: sourceData, error: sourceError } = await admin
      .from("external_deck_sources")
      .select("source_key, display_name, enabled, discovery_enabled, approved_for_profiles, cooldown_until, min_delay_ms, max_decks_per_run, max_discovery_pages_per_run, consecutive_failures, last_error")
      .eq("source_key", "archidekt")
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    const source = sourceData as ExternalDeckSourceRow | null;
    if (!source?.enabled) {
      const summary = { ...base, mode: "disabled" as const, next_work_bucket: "source_disabled" };
      return finish(summary, "disabled");
    }
    if (isSourceCoolingDown(source)) {
      const summary = {
        ...base,
        mode: "cooldown" as const,
        cooldown_until: source.cooldown_until,
        next_work_bucket: "cooldown",
      };
      return finish(summary, "cooldown");
    }

    const targetReached = coverageBefore.community_profile_eligible_count >= TARGET_ELIGIBLE_PROFILES;
    const dueQueueBefore = await countDueQueuedDecks(admin, "archidekt");
    const growthBudget = targetReached ? 3 : HOURLY_DETAIL_FETCH_CAP;
    const refreshBudget = HOURLY_DETAIL_FETCH_CAP - growthBudget;
    base.mode = targetReached ? "refresh" : "growth";
    base.growth_budget = growthBudget;
    base.refresh_budget = refreshBudget;
    base.queued_growth_target = targetReached ? growthBudget : Math.max(0, HOURLY_GROWTH_QUEUE_CAP - dueQueueBefore);

    const eligibleCommanders = new Set(
      coverageBefore.top250.filter((row) => row.community_profile_eligible).map((row) => row.commander_key)
    );
    const growthTargets = coverageBefore.top100.filter((row) => row.approved_sample_size < COMMUNITY_PROFILE_MIN_SAMPLE);

    if (base.queued_growth_target > 0 && growthTargets.length > 0) {
      const growth = await queueFocusedArchidektGrowth(admin, source, growthTargets, base.queued_growth_target);
      base.queued_growth = growth.queued;
      base.search_events = growth.events;
      base.selected_growth_targets = growth.selected;
      if (growth.cooldownUntil) {
        const summary = {
          ...base,
          ok: false,
          mode: "cooldown" as const,
          cooldown_until: growth.cooldownUntil,
          next_work_bucket: "cooldown_after_search",
        };
        return finish(summary, "cooldown");
      }
    }

    base.queued_refresh = await queueArchidektRefresh(admin, eligibleCommanders, refreshBudget);
    base.next_work_bucket =
      base.queued_growth > 0 ? "growth" : base.queued_refresh > 0 ? "refresh" : growthTargets.length > 0 ? "growth_search_exhausted" : "idle";

    base.processed_summary = await runExternalDeckMetaIngest(admin, {
      source: "archidekt",
      limit: HOURLY_DETAIL_FETCH_CAP,
      discover: false,
      rollupRegeneration: "none",
      profileRegeneration: "touched",
      processingDeadlineMs: startedAtMs + CRON_DETAIL_PROCESSING_BUDGET_MS,
    });
    if (Date.now() - startedAtMs < CRON_FINAL_COVERAGE_BUDGET_MS) {
      const coverageAfter = await buildExternalCommanderCoverageReport(admin);
      base.coverage_after = coverageSummaryForAllocator(coverageAfter);
    } else {
      base.errors.push("cron_final_coverage_skipped_time_budget");
    }
    return finish(base, "finished");
  } catch (e) {
    const summary = {
      ...base,
      ok: false,
      errors: [e instanceof Error ? e.message : "allocator_failed"],
      next_work_bucket: "error",
    };
    return finish(summary, "error");
  }
}

export async function getExternalDeckMetaStatus(admin: SupabaseClient) {
  const [sources, queuePending, decks, allProfiles, profilesBySample, profilesByConfidence, profilesByRefresh, latestRollups, coverage, lastAllocator, lastCronHeartbeat, growthTargetStats] = await Promise.all([
    admin
      .from("external_deck_sources")
      .select("source_key, display_name, enabled, discovery_enabled, cooldown_until, last_fetched_at, last_success_at, last_error, consecutive_failures, max_decks_per_run"),
    admin.from("external_deck_ingest_queue").select("id, status", { count: "exact" }),
    admin.from("external_decks").select("id, source_key, external_id, format, commanders, mainboard_count, deck_hash, is_valid, aggregate_approved, exclusion_reason", { count: "exact" }),
    admin
      .from("external_commander_profiles")
      .select("id, commander_name, raw_sample_size, approved_sample_size, excluded_count, exclusion_reasons, source_breakdown, common_cards, missing_common_support, averages, curve_summary, confidence_score, confidence_components, profile_consistency, role_variance, profile_warnings, off_color_support_gap_count, approved_for_public, attribution, last_refreshed_at", { count: "exact" })
      .order("approved_sample_size", { ascending: false })
      .limit(1000),
    admin
      .from("external_commander_profiles")
      .select("id, commander_name, raw_sample_size, approved_sample_size, excluded_count, exclusion_reasons, source_breakdown, common_cards, missing_common_support, averages, curve_summary, confidence_score, confidence_components, profile_consistency, role_variance, profile_warnings, off_color_support_gap_count, approved_for_public, attribution, last_refreshed_at")
      .order("approved_sample_size", { ascending: false })
      .order("raw_sample_size", { ascending: false })
      .limit(25),
    admin
      .from("external_commander_profiles")
      .select("id, commander_name, raw_sample_size, approved_sample_size, excluded_count, exclusion_reasons, source_breakdown, common_cards, missing_common_support, averages, curve_summary, confidence_score, confidence_components, profile_consistency, role_variance, profile_warnings, off_color_support_gap_count, approved_for_public, attribution, last_refreshed_at")
      .order("confidence_score", { ascending: false })
      .order("approved_sample_size", { ascending: false })
      .limit(25),
    admin
      .from("external_commander_profiles")
      .select("id, commander_name, raw_sample_size, approved_sample_size, excluded_count, exclusion_reasons, source_breakdown, common_cards, missing_common_support, averages, curve_summary, confidence_score, confidence_components, profile_consistency, role_variance, profile_warnings, off_color_support_gap_count, approved_for_public, attribution, last_refreshed_at")
      .order("last_refreshed_at", { ascending: false })
      .limit(25),
    admin
      .from("external_meta_rollups_daily")
      .select("snapshot_date, entity_type, deck_count")
      .order("snapshot_date", { ascending: false })
      .limit(10),
    buildExternalCommanderCoverageReport(admin),
    readAppConfigJson<ExternalDeckMetaAllocatorSummary | null>(admin, ALLOCATOR_APP_CONFIG_KEY, null),
    readAppConfigJson<Record<string, unknown> | null>(admin, ALLOCATOR_HEARTBEAT_APP_CONFIG_KEY, null),
    readAppConfigJson<ExternalDeckMetaTargetStats>(admin, ALLOCATOR_TARGET_STATS_APP_CONFIG_KEY, {}),
  ]);
  if (sources.error) throw new Error(sources.error.message);
  if (queuePending.error) throw new Error(queuePending.error.message);
  if (decks.error) throw new Error(decks.error.message);
  if (allProfiles.error) throw new Error(allProfiles.error.message);
  if (profilesBySample.error) throw new Error(profilesBySample.error.message);
  if (profilesByConfidence.error) throw new Error(profilesByConfidence.error.message);
  if (profilesByRefresh.error) throw new Error(profilesByRefresh.error.message);
  const deckRows = (decks.data ?? []) as Array<{
    source_key?: string;
    external_id?: string;
    format?: string | null;
    commanders?: string[];
    mainboard_count?: number;
    deck_hash?: string | null;
    is_valid?: boolean;
    aggregate_approved?: boolean;
    exclusion_reason?: string | null;
  }>;
  const sampleProfiles = ((profilesBySample.data ?? []) as ExternalCommanderProfileStatusRow[]).map(withProfileQa);
  const confidenceProfiles = ((profilesByConfidence.data ?? []) as ExternalCommanderProfileStatusRow[]).map(withProfileQa);
  const refreshedProfiles = ((profilesByRefresh.data ?? []) as ExternalCommanderProfileStatusRow[]).map(withProfileQa);
  const qaProfiles = ((allProfiles.data ?? []) as ExternalCommanderProfileStatusRow[]).map(withProfileQa);
  const readinessBuckets = qaProfiles.reduce(
    (acc, row) => {
      acc[row.readiness_bucket] = (acc[row.readiness_bucket] ?? 0) + 1;
      return acc;
    },
    { not_ready: 0, early_signal: 0, usable_qa: 0, public_candidate: 0 } as Record<string, number>
  );
  const deckHashes = deckRows.reduce((acc: Record<string, number>, row) => {
    if (!row.deck_hash) return acc;
    acc[row.deck_hash] = (acc[row.deck_hash] ?? 0) + 1;
    return acc;
  }, {});
  const deckSanityFlags = deckRows.flatMap((row) => {
    const flags: string[] = [];
    if ((row.mainboard_count ?? 0) < COMMANDER_MIN_CARDS && row.format === "commander") flags.push("mainboard_count_below_commander_threshold");
    if (row.format === "commander" && (!row.commanders || row.commanders.length === 0)) flags.push("missing_commander");
    if (row.deck_hash && deckHashes[row.deck_hash] > 1) flags.push("duplicate_deck_hash");
    return flags.map((flag) => ({
      flag,
      source_key: row.source_key ?? "unknown",
      external_id: row.external_id ?? "unknown",
      format: row.format ?? "unknown",
      mainboard_count: row.mainboard_count ?? 0,
      aggregate_approved: Boolean(row.aggregate_approved),
      exclusion_reason: row.exclusion_reason ?? null,
    }));
  });
  const suspiciousProfiles = qaProfiles
    .filter((profile) => profile.suspicious_metrics.length > 0)
    .slice(0, 25)
    .map((profile) => ({
      commander_name: profile.commander_name,
      approved_sample_size: profile.approved_sample_size,
      confidence_score: profile.confidence_score,
      averages: profile.averages ?? {},
      suspicious_metrics: profile.suspicious_metrics,
    }));
  return {
    sources: sources.data ?? [],
    queue_total: queuePending.count ?? 0,
    queue_by_status: (queuePending.data ?? []).reduce((acc: Record<string, number>, row: { status?: string }) => {
      const key = row.status ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    decks_total: decks.count ?? 0,
    summary: {
      total_external_decks: decks.count ?? 0,
      valid_commander_decks: deckRows.filter((row) => row.format === "commander" && row.is_valid && row.aggregate_approved).length,
      excluded_decks: deckRows.filter((row) => !row.aggregate_approved).length,
      commander_profiles_generated: allProfiles.count ?? qaProfiles.length,
    },
    readiness_buckets: readinessBuckets,
    decks_by_state: deckRows.reduce((acc: Record<string, number>, row) => {
      const key = `${row.source_key ?? "unknown"}:${row.format ?? "unknown"}:${row.aggregate_approved ? "approved" : row.is_valid ? "valid" : "excluded"}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    excluded_by_reason: deckRows.reduce((acc: Record<string, number>, row) => {
      if (row.aggregate_approved) return acc;
      const key = row.exclusion_reason ?? "not_approved";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    suspicious_profiles: suspiciousProfiles,
    deck_sanity_flags: deckSanityFlags.slice(0, 50),
    coverage,
    last_allocator_summary: lastAllocator,
    last_cron_heartbeat: lastCronHeartbeat,
    growth_target_stats: growthTargetStats,
    profiles: sampleProfiles,
    top_profiles: sampleProfiles,
    top_profiles_by_confidence: confidenceProfiles,
    recently_refreshed_profiles: refreshedProfiles,
    latest_rollups: latestRollups.data ?? [],
  };
}

export async function setExternalCommanderProfileApproval(
  admin: SupabaseClient,
  profileId: string,
  approved: boolean,
  userId: string
) {
  const { data, error } = await admin
    .from("external_commander_profiles")
    .update({
      approved_for_public: approved,
      approved_at: approved ? new Date().toISOString() : null,
      approved_by: approved ? userId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId)
    .select("id, commander_name, approved_for_public")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
