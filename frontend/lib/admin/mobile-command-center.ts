import { getAdmin } from "@/app/api/_lib/supa";
import {
  adminJobAttemptKey,
  adminJobDetailKey,
  computeAdminJobHealth,
  jobLastSuccessConfigKey,
  parseAdminJobDetail,
} from "@/lib/admin/adminJobDetail";
import {
  AI_USAGE_SOURCE_MANATAP_APP,
  getAppAiUsagePostgrestOrClause,
  isAppAiUsageRow,
} from "@/lib/ai/manatap-client-origin";
import { getPosthogQueryCredentials, posthogHogql } from "@/lib/server/posthog-hogql";

export type Severity = "ok" | "info" | "warn" | "critical";

export type MetricCard = {
  key: string;
  label: string;
  value: number | string | null;
  sub?: string;
  severity?: Severity;
  href?: string;
};

export type LaunchAlert = {
  key: string;
  title: string;
  detail: string;
  severity: Severity;
  source: string;
  href?: string;
};

export type CommandCenterPayload = {
  generatedAt: string;
  days: number;
  env: {
    supabaseAdminConfigured: boolean;
    posthogConfigured: boolean;
    sentryConfigured: boolean;
    revenueCatConfigured: boolean;
    discordWebhookConfigured: boolean;
  };
  metrics?: MetricCard[];
  alerts?: LaunchAlert[];
  rows?: Array<Record<string, unknown>>;
  tables?: Record<string, Array<Record<string, unknown>>>;
  notes?: string[];
};

type Db = NonNullable<ReturnType<typeof getAdmin>>;
type JsonRecord = Record<string, unknown>;

const AI_SELECT =
  "id,created_at,user_id,route,model,source,source_page,request_kind,layer0_mode,cache_hit,input_tokens,output_tokens,cost_usd,latency_ms,planner_cost_usd,error_code,is_guest,user_tier";
const WARN_DISCORD_REMINDER_MS = 6 * 60 * 60 * 1000;
const CRITICAL_DISCORD_REMINDER_MS = 60 * 60 * 1000;
/** All pipeline jobs shown in the cockpit Ops tab. */
export const PIPELINE_JOB_IDS = [
  "bulk_scryfall",
  "bulk_price_import",
  "price_snapshot_bulk",
  "deck-costs",
] as const;

/** Daily price/cache jobs that trigger hourly Discord when late or failed. */
export const TIER1_PIPELINE_JOB_IDS = [
  "bulk_price_import",
  "price_snapshot_bulk",
  "deck-costs",
] as const;

/** Weekly jobs surfaced in the Sunday ops digest. */
export const WEEKLY_PIPELINE_JOB_IDS = [
  "bulk_scryfall",
  "mtg-legality-refresh",
  "budget-swaps-update",
] as const;

/** Discover / intelligence jobs included in the daily digest. */
export const DAILY_DIGEST_JOB_IDS = ["meta-signals", "commander-aggregates", "top-cards"] as const;

export function parseBoundedIntParam(
  value: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function parseDaysParam(value: string | null | undefined, fallback = 7): number {
  return parseBoundedIntParam(value, fallback, 1, 90);
}

export function parseHoursParam(value: string | null | undefined, fallback = 24): number {
  return parseBoundedIntParam(value, fallback, 1, 168);
}

export function maskUserRef(value: unknown): string {
  const s = String(value || "").trim();
  if (!s) return "(unknown)";
  if (s === "(guest)" || s === "(unknown)") return s;
  if (s.length <= 12) return `${s.slice(0, 3)}...`;
  return `${s.slice(0, 8)}...${s.slice(-4)}`;
}

export function maskEmail(value: unknown): string {
  const s = String(value || "").trim();
  const at = s.indexOf("@");
  if (at <= 1) return s ? "***" : "";
  return `${s.slice(0, 1)}***${s.slice(at)}`;
}

export function severityForThreshold(value: number, warnAt: number, criticalAt: number): Severity {
  if (value >= criticalAt) return "critical";
  if (value >= warnAt) return "warn";
  return "ok";
}

function nowIso(): string {
  return new Date().toISOString();
}

function sinceDays(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function alertDedupeKey(alert: LaunchAlert): string {
  return `${alert.source}:${alert.key}`;
}

function severityRank(severity: Severity | string | null | undefined): number {
  if (severity === "critical") return 3;
  if (severity === "warn") return 2;
  if (severity === "info") return 1;
  return 0;
}

export function shouldCreateLaunchAlert(metric: MetricCard): metric is MetricCard & { severity: "critical" | "warn" } {
  if (metric.key === "advisor_warnings") return false;
  return metric.severity === "critical" || metric.severity === "warn";
}

/** Hourly Discord: Tier-1 pipeline jobs + critical Sentry/error spikes only. */
export function shouldSendHourlyDiscordAlert(alert: LaunchAlert): boolean {
  if (alert.severity !== "critical" && alert.severity !== "warn") return false;
  if (alert.key === "tier1_pipeline_jobs") return true;
  if (alert.key === "sentry_unresolved" || alert.key === "local_errors") {
    return alert.severity === "critical";
  }
  if (alert.key === "supabase_admin" || alert.key === "missing_supabase_admin") {
    return alert.severity === "critical";
  }
  return false;
}

/** Daily digest status/watch list: broader than hourly, excludes hourly-only noise. */
export function shouldCountForDailyDigestStatus(alert: LaunchAlert): boolean {
  if (alert.severity !== "critical" && alert.severity !== "warn") return false;
  if (alert.key === "discord_missing") return false;
  if (shouldSendHourlyDiscordAlert(alert)) return false;
  return true;
}

export function shouldSendDiscordAlert(
  alert: LaunchAlert,
  existing?: {
    severity?: string | null;
    detail?: string | null;
    status?: string | null;
    discord_sent_at?: string | null;
  } | null,
  nowMs = Date.now(),
): boolean {
  if (alert.severity !== "critical" && alert.severity !== "warn") return false;
  if (existing?.status === "muted") return false;
  if (!existing) return true;
  if (severityRank(alert.severity) > severityRank(existing.severity)) return true;
  if (String(existing.detail || "") !== alert.detail) return true;
  if (!existing.discord_sent_at) return true;

  const sentAt = new Date(existing.discord_sent_at).getTime();
  if (!Number.isFinite(sentAt)) return true;
  const reminderMs = alert.severity === "critical" ? CRITICAL_DISCORD_REMINDER_MS : WARN_DISCORD_REMINDER_MS;
  return nowMs - sentAt >= reminderMs;
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? round(numerator / denominator, 4) : 0;
}

function envStatus() {
  const sentryConfigured = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);
  const discordWebhook = getDiscordAdminWebhook();
  return {
    supabaseAdminConfigured: Boolean(getAdmin()),
    posthogConfigured: Boolean(getPosthogQueryCredentials()),
    sentryConfigured,
    revenueCatConfigured: Boolean(
      process.env.REVENUECAT_V2_SECRET_API_KEY ||
        process.env.REVENUECAT_SECRET_API_KEY ||
        process.env.REVENUECAT_SECRET_KEY,
    ),
    discordWebhookConfigured: Boolean(discordWebhook),
  };
}

function getDiscordAdminWebhook(): string {
  return (
    process.env.DISCORD_ADMIN_ALERT_WEBHOOK ||
    process.env.DISCORD_APPSUB_WEBHOOK ||
    process.env.DISCORD_APP_SUBS_WEBHOOK ||
    process.env.DISCORD_WEBHOOK_URL ||
    ""
  ).trim();
}

function missingDbPayload(days: number): CommandCenterPayload {
  return {
    generatedAt: nowIso(),
    days,
    env: envStatus(),
    metrics: [
      {
        key: "supabase_admin",
        label: "Supabase admin",
        value: "missing",
        severity: "critical",
        sub: "Set the server-only Supabase admin key for admin rollups.",
      },
    ],
    alerts: [
      {
        key: "missing_supabase_admin",
        title: "Supabase admin client is not configured",
        detail: "The cockpit can render, but live database metrics are unavailable without the server-only Supabase admin key.",
        severity: "critical",
        source: "config",
      },
    ],
  };
}

async function safeCount(
  db: Db,
  table: string,
  options: { since?: string; column?: string; eq?: Record<string, unknown>; notNull?: string[] } = {},
): Promise<{ count: number; error?: string }> {
  try {
    let q = db.from(table).select("id", { count: "exact", head: true });
    if (options.since) q = q.gte(options.column || "created_at", options.since);
    for (const [key, value] of Object.entries(options.eq || {})) q = q.eq(key, value);
    for (const key of options.notNull || []) q = q.not(key, "is", null);
    const { count, error } = await q;
    if (error) return { count: 0, error: error.message };
    return { count: count || 0 };
  } catch (e) {
    return { count: 0, error: e instanceof Error ? e.message : "count_failed" };
  }
}

async function safeRows(
  db: Db,
  table: string,
  select: string,
  options: { since?: string; column?: string; limit?: number; order?: string; ascending?: boolean } = {},
): Promise<{ rows: JsonRecord[]; error?: string }> {
  try {
    let q = db.from(table).select(select);
    if (options.since) q = q.gte(options.column || "created_at", options.since);
    q = q.order(options.order || "created_at", { ascending: options.ascending ?? false });
    q = q.limit(options.limit || 50);
    const { data, error } = await q;
    if (error) return { rows: [], error: error.message };
    return { rows: (data || []) as unknown as JsonRecord[] };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "rows_failed" };
  }
}

async function safeAppConfigRows(db: Db, keys: string[]) {
  try {
    const { data, error } = await db.from("app_config").select("key,value,updated_at").in("key", keys);
    if (error) return { rows: [] as JsonRecord[], error: error.message };
    return { rows: (data || []) as unknown as JsonRecord[] };
  } catch (e) {
    return { rows: [] as JsonRecord[], error: e instanceof Error ? e.message : "app_config_failed" };
  }
}

function ageShort(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = new Date(String(iso)).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  const diffH = Math.max(0, (Date.now() - ms) / 36e5);
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}m ago`;
  if (diffH < 48) return `${Math.round(diffH)}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

function freshnessWord(iso: string | null | undefined, warnHours: number): { value: string; severity: Severity } {
  if (!iso) return { value: "unknown", severity: "warn" };
  const ms = new Date(String(iso)).getTime();
  if (!Number.isFinite(ms)) return { value: "unknown", severity: "warn" };
  const ageH = (Date.now() - ms) / 36e5;
  if (ageH <= warnHours / 2) return { value: `updated ${ageShort(iso)}`, severity: "ok" };
  if (ageH <= warnHours) return { value: `updated ${ageShort(iso)}`, severity: "info" };
  return { value: `stale (${ageShort(iso)})`, severity: "warn" };
}

async function getAiRows(db: Db, days: number, limit = 5000) {
  const since = sinceDays(days);
  try {
    const { data, error, count } = await db
      .from("ai_usage")
      .select(AI_SELECT, { count: "exact" })
      .gte("created_at", since)
      .or(getAppAiUsagePostgrestOrClause())
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { rows: [] as JsonRecord[], count: 0, error: error.message };
    return {
      rows: ((data || []) as unknown as JsonRecord[]).filter((row) =>
        isAppAiUsageRow({
          route: row.route as string | null,
          source: row.source as string | null,
          source_page: row.source_page as string | null,
        }),
      ),
      count: count || 0,
    };
  } catch (e) {
    return { rows: [] as JsonRecord[], count: 0, error: e instanceof Error ? e.message : "ai_usage_failed" };
  }
}

function summarizeAi(rows: JsonRecord[]) {
  let costUsd = 0;
  let requests = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let errors = 0;
  let cacheHits = 0;
  let cacheKnown = 0;
  const byFeature = new Map<string, { requests: number; cost_usd: number; errors: number }>();
  const byRoute = new Map<string, { requests: number; cost_usd: number; errors: number }>();
  const byUser = new Map<string, { user: string; requests: number; cost_usd: number; errors: number }>();
  const byModel = new Map<string, { requests: number; cost_usd: number }>();

  for (const row of rows) {
    const rowCost = (Number(row.cost_usd) || 0) + (Number(row.planner_cost_usd) || 0);
    const hasError = Boolean(row.error_code);
    const feature = String(row.source_page || row.route || "unknown");
    const route = String(row.route || "unknown");
    const model = String(row.model || "unknown");
    const user = row.user_id ? maskUserRef(row.user_id) : row.is_guest ? "(guest)" : "(unknown)";

    costUsd += rowCost;
    requests += 1;
    tokensIn += Number(row.input_tokens) || 0;
    tokensOut += Number(row.output_tokens) || 0;
    if (hasError) errors += 1;
    if (typeof row.cache_hit === "boolean") {
      cacheKnown += 1;
      if (row.cache_hit) cacheHits += 1;
    }

    for (const [key, map] of [
      [feature, byFeature],
      [route, byRoute],
    ] as const) {
      if (!map.has(key)) map.set(key, { requests: 0, cost_usd: 0, errors: 0 });
      const item = map.get(key)!;
      item.requests += 1;
      item.cost_usd += rowCost;
      if (hasError) item.errors += 1;
    }

    if (!byModel.has(model)) byModel.set(model, { requests: 0, cost_usd: 0 });
    byModel.get(model)!.requests += 1;
    byModel.get(model)!.cost_usd += rowCost;

    if (!byUser.has(user)) byUser.set(user, { user, requests: 0, cost_usd: 0, errors: 0 });
    const userItem = byUser.get(user)!;
    userItem.requests += 1;
    userItem.cost_usd += rowCost;
    if (hasError) userItem.errors += 1;
  }

  const sorted = <T extends Record<string, unknown>>(map: Map<string, T>, labelKey: string) =>
    Array.from(map.entries())
      .map(([key, value]) => ({ [labelKey]: key, ...value, cost_usd: round(Number(value.cost_usd) || 0) }))
      .sort((a, b) => Number(b.cost_usd || 0) - Number(a.cost_usd || 0));

  return {
    totals: {
      requests,
      cost_usd: round(costUsd),
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      errors,
      error_rate: pct(errors, requests),
      cache_hits: cacheHits,
      cache_known: cacheKnown,
      cache_hit_rate: cacheKnown ? pct(cacheHits, cacheKnown) : null,
    },
    byFeature: sorted(byFeature, "feature").slice(0, 20),
    byRoute: sorted(byRoute, "route").slice(0, 20),
    byModel: sorted(byModel, "model").slice(0, 20),
    byUser: sorted(byUser, "user").slice(0, 30),
  };
}

function getCacheMetricCard(summary: ReturnType<typeof summarizeAi>): MetricCard {
  const { requests, cache_hits: cacheHits, cache_known: cacheKnown, cache_hit_rate: cacheHitRate } = summary.totals;
  const missing = Math.max(0, requests - cacheKnown);

  if (requests === 0) {
    return {
      key: "cache",
      label: "AI cache reuse",
      value: "no data yet",
      sub: "No app AI requests in this window.",
      severity: "info",
    };
  }

  if (cacheKnown === 0) {
    return {
      key: "cache",
      label: "AI cache reuse",
      value: "not enough data yet",
      sub: "Recent app AI rows did not include cache info.",
      severity: "info",
    };
  }

  const sampleNote = missing > 0 ? `${cacheKnown} of ${requests} rows reported cache info` : `${cacheHits} hits from ${cacheKnown} measured rows`;
  const severity: Severity =
    cacheKnown < 5
      ? "info"
      : (cacheHitRate ?? 0) < 0.2
        ? "warn"
        : "ok";

  return {
    key: "cache",
    label: "AI cache reuse",
    value: `${round((cacheHitRate ?? 0) * 100, 1)}%`,
    sub: sampleNote,
    severity,
  };
}

export async function getMobileCommandCenterAi(days: number): Promise<CommandCenterPayload> {
  const db = getAdmin();
  if (!db) return missingDbPayload(days);

  const ai = await getAiRows(db, days);
  const mobileRouteRows = await safeCount(db, "ai_usage", {
    since: sinceDays(days),
    column: "created_at",
  });
  const summary = summarizeAi(ai.rows);
  const cacheMetric = getCacheMetricCard(summary);
  const notes = [
    "AI rows use source = manatap_app, source_page app_* markers, or known mobile AI route fallbacks.",
    "AI cache reuse only counts rows that explicitly recorded cache_hit. 'Not enough data yet' means the logger still missed cache info on recent rows.",
    ai.error ? `AI usage query warning: ${ai.error}` : "",
  ].filter(Boolean);

  return {
    generatedAt: nowIso(),
    days,
    env: envStatus(),
    metrics: [
      {
        key: "requests",
        label: "App AI requests",
        value: summary.totals.requests,
        sub: summary.totals.requests ? undefined : "No app AI requests seen in this window yet.",
        severity: summary.totals.requests ? "ok" : "info",
      },
      { key: "cost", label: "AI cost", value: `$${summary.totals.cost_usd.toFixed(2)}`, severity: severityForThreshold(summary.totals.cost_usd, 25, 75) },
      { key: "errors", label: "AI errors", value: summary.totals.errors, sub: `${round(summary.totals.error_rate * 100, 2)}%`, severity: severityForThreshold(summary.totals.error_rate, 0.03, 0.1) },
      cacheMetric,
      {
        key: "all_ai_rows",
        label: "All AI rows in window",
        value: mobileRouteRows.count,
        sub: mobileRouteRows.error ? "count unavailable" : "for attribution gap checks",
        severity: mobileRouteRows.error ? "info" : "ok",
      },
    ],
    tables: {
      "Expensive users": summary.byUser,
      "Cost by feature": summary.byFeature,
      "Cost by route": summary.byRoute,
      "Cost by model": summary.byModel,
    },
    notes,
  };
}

export async function getMobileCommandCenterUsers(days: number): Promise<CommandCenterPayload> {
  const db = getAdmin();
  if (!db) return missingDbPayload(days);
  const since = sinceDays(days);
  const [total, recent, pro, stripe, recentRows] = await Promise.all([
    safeCount(db, "profiles"),
    safeCount(db, "profiles", { since }),
    safeCount(db, "profiles", { eq: { is_pro: true } }),
    safeCount(db, "profiles", { notNull: ["stripe_customer_id"] }),
    safeRows(db, "profiles", "id,created_at,is_pro,pro_plan,pro_until,stripe_customer_id,stripe_subscription_id,username", {
      since,
      limit: 80,
    }),
  ]);

  const rows = recentRows.rows.map((row) => ({
    user: maskUserRef(row.id),
    created_at: row.created_at,
    pro: Boolean(row.is_pro),
    plan: row.pro_plan || (row.stripe_subscription_id ? "stripe" : null) || "free",
    billing_source: row.stripe_subscription_id ? "stripe" : row.pro_plan && row.pro_plan !== "manual" ? "revenuecat_or_manual" : "none",
    username_present: Boolean(row.username),
  }));

  const daily = new Map<string, number>();
  for (const row of recentRows.rows) {
    const day = String(row.created_at || "").slice(0, 10) || "unknown";
    daily.set(day, (daily.get(day) || 0) + 1);
  }
  const counts = Array.from(daily.values());
  const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const max = counts.length ? Math.max(...counts) : 0;
  const spikeSeverity = max >= 20 && max >= avg * 2.5 ? "warn" : "ok";

  return {
    generatedAt: nowIso(),
    days,
    env: envStatus(),
    metrics: [
      { key: "total_profiles", label: "Total profiles", value: total.count, severity: total.error ? "info" : "ok" },
      { key: "new_profiles", label: "New signups", value: recent.count, severity: recent.count === 0 ? "warn" : "ok" },
      { key: "pro_profiles", label: "Pro profiles", value: pro.count, severity: pro.error ? "info" : "ok" },
      { key: "stripe_profiles", label: "Stripe-linked", value: stripe.count, severity: stripe.error ? "info" : "ok" },
      { key: "signup_spike", label: "Signup spike", value: max, sub: `max/day vs avg ${round(avg, 1)}`, severity: spikeSeverity },
    ],
    rows,
    tables: {
      "Signup days": Array.from(daily.entries()).map(([date, count]) => ({ date, count })),
    },
    notes: [
      "User rows are masked by default. Use the existing support/debug pages for full user investigations.",
      recentRows.error ? `Recent user query warning: ${recentRows.error}` : "",
    ].filter(Boolean),
  };
}

async function getPosthogAnalytics(days: number) {
  if (!getPosthogQueryCredentials()) {
    return {
      configured: false,
      rows: [] as JsonRecord[],
      eventCount: 0,
      scannerEventCount: 0,
      scannerSessionCompletions: 0,
      toolEventCount: 0,
      toolOutcomeCount: 0,
      monetizationEventCount: 0,
      feedbackEventCount: 0,
      missingFamilies: [] as string[],
      error: "PostHog query env is not configured.",
    };
  }
  const safeDays = parseDaysParam(String(days), 7);
  const query = `
    SELECT event, count() AS count
    FROM events
    WHERE timestamp > now() - INTERVAL ${safeDays} DAY
      AND (
        event LIKE 'tool_%'
        OR event LIKE 'scan_%'
        OR event LIKE 'pro_%'
        OR event LIKE 'paywall_%'
        OR event LIKE 'feedback_%'
        OR event LIKE 'chat_%'
        OR event LIKE 'voice_%'
        OR event LIKE 'hero_%'
        OR event LIKE 'home_%'
        OR event LIKE 'analysis_%'
        OR properties.$lib = 'posthog-react-native'
        OR properties.platform = 'app'
        OR properties.source = 'manatap_app'
      )
    GROUP BY event
    ORDER BY count DESC
    LIMIT 120
  `;
  try {
    const result = await posthogHogql(query);
    const rows = result.results.map((row) => ({ event: row[0], count: Number(row[1] || 0) })) as JsonRecord[];
    const countFor = (matcher: (event: string) => boolean) =>
      rows.reduce((sum, row) => {
        const event = String(row.event || "");
        return matcher(event) ? sum + (Number(row.count) || 0) : sum;
      }, 0);
    const eventNames = new Set(rows.map((row) => String(row.event || "")));
    const missingFamilies = [
      !Array.from(eventNames).some((event) => event.startsWith("tool_")) ? "tool events" : null,
      !Array.from(eventNames).some((event) => event.startsWith("pro_") || event.startsWith("paywall_")) ? "monetization funnel" : null,
      !Array.from(eventNames).some((event) => event.startsWith("feedback_") || event === "chat_feedback" || event === "chat_issue_report_submitted" || event === "analysis_feedback_submitted")
        ? "feedback/reporting"
        : null,
    ].filter(Boolean) as string[];
    return {
      configured: true,
      rows,
      eventCount: rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
      scannerEventCount: countFor((event) => event.startsWith("scan_")),
      scannerSessionCompletions: countFor((event) => event === "scan_card_session_completed"),
      toolEventCount: countFor((event) => event.startsWith("tool_")),
      toolOutcomeCount: countFor((event) => event === "tool_action_completed" || event === "tool_action_failed"),
      monetizationEventCount: countFor((event) => event.startsWith("pro_") || event.startsWith("paywall_") || event.startsWith("purchase_") || event.startsWith("restore_")),
      feedbackEventCount: countFor((event) => event.startsWith("feedback_") || event === "chat_feedback" || event === "chat_issue_report_submitted" || event === "analysis_feedback_submitted"),
      missingFamilies,
    };
  } catch (e) {
    return {
      configured: true,
      rows: [] as JsonRecord[],
      eventCount: 0,
      scannerEventCount: 0,
      scannerSessionCompletions: 0,
      toolEventCount: 0,
      toolOutcomeCount: 0,
      monetizationEventCount: 0,
      feedbackEventCount: 0,
      missingFamilies: [] as string[],
      error: e instanceof Error ? e.message : "posthog_query_failed",
    };
  }
}

export async function getMobileCommandCenterAnalytics(days: number): Promise<CommandCenterPayload> {
  const db = getAdmin();
  if (!db) return missingDbPayload(days);
  const [posthog, budgetSwap, mulligan] = await Promise.all([
    getPosthogAnalytics(days),
    safeCount(db, "budget_swap_analytics", { since: sinceDays(days) }),
    safeCount(db, "mulligan_advice_runs", { since: sinceDays(days) }),
  ]);
  const scannerRows = posthog.rows.filter((row) => String(row.event || "").startsWith("scan_"));
  const toolRows = posthog.rows.filter((row) => String(row.event || "").startsWith("tool_"));
  const monetizationRows = posthog.rows.filter((row) => {
    const event = String(row.event || "");
    return event.startsWith("pro_") || event.startsWith("paywall_") || event.startsWith("purchase_") || event.startsWith("restore_");
  });
  const feedbackRows = posthog.rows.filter((row) => {
    const event = String(row.event || "");
    return event.startsWith("feedback_") || event === "chat_feedback" || event === "chat_issue_report_submitted" || event === "analysis_feedback_submitted";
  });
  const scannerStatus =
    posthog.error
      ? "query_failed"
      : posthog.scannerEventCount > 0
        ? "recent activity seen"
        : posthog.eventCount > 0
          ? "quiet but healthy"
          : "waiting for first app traffic";
  return {
    generatedAt: nowIso(),
    days,
    env: envStatus(),
    metrics: [
      {
        key: "posthog",
        label: "PostHog",
        value: posthog.configured ? (posthog.error ? "failing" : "connected") : "missing",
        severity: posthog.configured ? (posthog.error ? "warn" : "ok") : "warn",
      },
      { key: "app_events", label: "App events seen", value: posthog.eventCount, severity: posthog.rows.length ? "ok" : "info" },
      { key: "scanner_events_seen", label: "Scanner events seen", value: posthog.scannerEventCount, sub: scannerStatus, severity: posthog.error ? "warn" : posthog.scannerEventCount ? "ok" : "info" },
      { key: "scanner_sessions_completed", label: "Scanner sessions completed", value: posthog.scannerSessionCompletions, severity: posthog.scannerSessionCompletions ? "ok" : "info" },
      { key: "tool_events_seen", label: "Tool events seen", value: posthog.toolEventCount, sub: `${posthog.toolOutcomeCount} outcomes`, severity: posthog.toolEventCount ? "ok" : "info" },
      { key: "feedback_events", label: "Feedback events", value: posthog.feedbackEventCount, severity: posthog.feedbackEventCount ? "ok" : "info" },
      { key: "missing_families", label: "Critical families missing", value: posthog.missingFamilies.length, sub: posthog.missingFamilies.join(", ") || "none", severity: posthog.error ? "warn" : posthog.missingFamilies.length ? "info" : "ok" },
      { key: "budget_swaps", label: "Budget swap rows", value: budgetSwap.count, severity: budgetSwap.error ? "info" : "ok" },
      { key: "mulligan_runs", label: "Mulligan runs", value: mulligan.count, severity: mulligan.error ? "info" : "ok" },
    ],
    tables: {
      "Scanner funnel health": [
        { metric: "Recent scanner events", value: posthog.scannerEventCount, status: scannerStatus },
        { metric: "Scanner sessions completed", value: posthog.scannerSessionCompletions, status: posthog.scannerSessionCompletions ? "captured" : "none yet" },
        { metric: "AI fallback events", value: scannerRows.filter((row) => String(row.event || "").startsWith("scan_ai_")).reduce((sum, row) => sum + Number(row.count || 0), 0), status: "diagnostic" },
      ],
      "Tool funnel health": [
        { metric: "tool_opened", count: toolRows.filter((row) => row.event === "tool_opened").reduce((sum, row) => sum + Number(row.count || 0), 0) },
        { metric: "tool_action_started", count: toolRows.filter((row) => row.event === "tool_action_started").reduce((sum, row) => sum + Number(row.count || 0), 0) },
        { metric: "tool_action_completed", count: toolRows.filter((row) => row.event === "tool_action_completed").reduce((sum, row) => sum + Number(row.count || 0), 0) },
        { metric: "tool_action_failed", count: toolRows.filter((row) => row.event === "tool_action_failed").reduce((sum, row) => sum + Number(row.count || 0), 0) },
      ],
      "Monetization funnel health": monetizationRows.length
        ? monetizationRows
        : [{ event: "No recent monetization events", count: 0, note: "Expected before active launch traffic." }],
      "Feedback + reporting health": feedbackRows.length
        ? feedbackRows
        : [{ event: "No recent feedback events", count: 0, note: "Healthy if nobody has used those flows yet." }],
      "Critical expected event families": [
        { family: "scanner events", status: posthog.scannerEventCount ? "seen" : "quiet", launch_meaning: posthog.eventCount ? "No recent scanner usage yet." : "No recent app analytics yet." },
        { family: "tool events", status: posthog.toolEventCount ? "seen" : "missing", launch_meaning: posthog.toolEventCount ? "Core tool funnel data present." : "Check app tool instrumentation." },
        { family: "monetization funnel", status: posthog.monetizationEventCount ? "seen" : "quiet", launch_meaning: "Fine if nobody has hit upgrade flow yet." },
        { family: "feedback/reporting", status: posthog.feedbackEventCount ? "seen" : "quiet", launch_meaning: "Fine until users start sending feedback." },
        { event_area: "Rate limit hits", expected: "ops_rate_limit_hit", status: "server-side admin_audit" },
      ],
      "PostHog app events": posthog.rows,
      "Missing coverage checklist": [
        { event_area: "Scanner session outcome", expected: "scan_card_session_completed", status: posthog.rows.some((row) => row.event === "scan_card_session_completed") ? "seen" : "waiting for first scanner run" },
        { event_area: "Tool funnel", expected: "tool_opened/tool_action_started/completed/failed", status: posthog.toolEventCount ? "seen" : "missing" },
        { event_area: "Feedback failures", expected: "feedback_submission_failed", status: posthog.rows.some((row) => row.event === "feedback_submission_failed") ? "seen" : "instrumented, waiting for first failure" },
      ],
    },
    notes: [
      posthog.error ? `PostHog warning: ${posthog.error}` : "",
      `Last successful PostHog query shape check: ${nowIso()}.`,
      "Quiet prelaunch scanner or feedback metrics are treated as informational, not launch alerts.",
    ].filter(Boolean),
  };
}

export async function getMobileCommandCenterRevenue(days: number): Promise<CommandCenterPayload> {
  const db = getAdmin();
  if (!db) return missingDbPayload(days);
  const since = sinceDays(days);
  const [pro, stripe, revenueCatGrants, revenueCatRevokes, stripeWebhook] = await Promise.all([
    safeCount(db, "profiles", { eq: { is_pro: true } }),
    safeCount(db, "profiles", { notNull: ["stripe_subscription_id"] }),
    safeCount(db, "admin_audit", { since, eq: { action: "ops_entitlement_granted" } }),
    safeCount(db, "admin_audit", { since, eq: { action: "ops_entitlement_revoked" } }),
    safeCount(db, "admin_audit", { since, eq: { action: "ops_stripe_webhook_processed" } }),
  ]);

  return {
    generatedAt: nowIso(),
    days,
    env: envStatus(),
    metrics: [
      { key: "pro", label: "Active Pro profiles", value: pro.count, severity: pro.error ? "info" : "ok" },
      { key: "stripe", label: "Stripe subs", value: stripe.count, severity: stripe.error ? "info" : "ok", href: "/admin/monetize" },
      {
        key: "revenuecat_config",
        label: "RevenueCat API",
        value: envStatus().revenueCatConfigured ? "configured" : "missing",
        severity: envStatus().revenueCatConfigured ? "ok" : "warn",
      },
      { key: "rc_grants", label: "RC grants", value: revenueCatGrants.count, severity: revenueCatGrants.error ? "info" : "ok" },
      { key: "rc_revokes", label: "RC revokes", value: revenueCatRevokes.count, severity: revenueCatRevokes.count ? "info" : "ok" },
      { key: "stripe_webhooks", label: "Stripe webhooks", value: stripeWebhook.count, severity: stripeWebhook.error ? "info" : "ok" },
    ],
    tables: {
      "Revenue checks": [
        { check: "Mobile Pro source", status: "RevenueCat webhook updates profiles.is_pro", link: "/api/revenuecat/webhook" },
        { check: "Website Pro source", status: "Stripe webhooks and sync pages", link: "/admin/monetize" },
        { check: "Entitlement debug", status: "Use for one-user investigations", link: "/admin/entitlements/debug" },
      ],
    },
    notes: ["RevenueCat v2 is optional in v1; webhook/admin_audit health is shown even when the API key is absent."],
  };
}

async function fetchSentryIssues(days: number) {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!token || !org || !project) return { configured: false, rows: [] as JsonRecord[], error: "Sentry env is not configured." };
  const base = (process.env.SENTRY_BASE_URL || "https://sentry.io").replace(/\/$/, "");
  const url = new URL(`${base}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/`);
  url.searchParams.set("query", "is:unresolved");
  url.searchParams.set("statsPeriod", days <= 1 ? "24h" : "14d");
  url.searchParams.set("limit", "20");
  url.searchParams.set("sort", "date");
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 500);
      let detail = "";
      try {
        const json = JSON.parse(body) as JsonRecord;
        detail = String(json.detail || json.error || json.message || "").slice(0, 160);
      } catch {
        detail = body.replace(/\s+/g, " ").slice(0, 160);
      }
      return {
        configured: true,
        rows: [] as JsonRecord[],
        error: `Sentry API ${res.status}${detail ? `: ${detail}` : ""}`,
      };
    }
    const json = (await res.json()) as JsonRecord[];
    return {
      configured: true,
      rows: (Array.isArray(json) ? json : []).map((issue) => ({
        id: issue.id,
        short_id: issue.shortId,
        title: issue.title,
        level: issue.level,
        count: issue.count,
        user_count: issue.userCount,
        first_seen: issue.firstSeen,
        last_seen: issue.lastSeen,
        permalink: issue.permalink,
      })),
    };
  } catch (e) {
    return { configured: true, rows: [] as JsonRecord[], error: e instanceof Error ? e.message : "sentry_query_failed" };
  }
}

export async function getMobileCommandCenterErrors(days: number): Promise<CommandCenterPayload> {
  const db = getAdmin();
  if (!db) return missingDbPayload(days);
  const [sentry, localErrors] = await Promise.all([
    fetchSentryIssues(days),
    safeRows(db, "error_logs", "created_at,kind,message,path", { since: sinceDays(days), limit: 50 }),
  ]);
  return {
    generatedAt: nowIso(),
    days,
    env: envStatus(),
    metrics: [
      {
        key: "sentry",
        label: "Sentry",
        value: sentry.configured ? (sentry.error ? "failing" : "connected") : "missing",
        sub: sentry.error,
        severity: sentry.configured ? (sentry.error ? "warn" : "ok") : "warn",
      },
      { key: "sentry_unresolved", label: "Sentry unresolved", value: sentry.rows.length, severity: severityForThreshold(sentry.rows.length, 5, 15) },
      { key: "local_errors", label: "Local error logs", value: localErrors.rows.length, severity: severityForThreshold(localErrors.rows.length, 10, 50) },
    ],
    tables: {
      "Sentry unresolved issues": sentry.rows,
      "Local error logs": localErrors.rows.map((row) => ({
        created_at: row.created_at,
        kind: row.kind,
        path: row.path,
        message: String(row.message || "").slice(0, 220),
      })),
    },
    notes: [sentry.error ? `Sentry warning: ${sentry.error}` : "", localErrors.error ? `Local error warning: ${localErrors.error}` : ""].filter(Boolean),
  };
}

export async function getMobileCommandCenterSecurity(days: number, hours = 24): Promise<CommandCenterPayload> {
  const db = getAdmin();
  if (!db) return missingDbPayload(days);
  const today = new Date().toISOString().slice(0, 10);
  const [rateRows, hitEvents, auditRows] = await Promise.all([
    safeRows(db, "api_usage_rate_limits", "date,route_path,key_hash,request_count,updated_at", {
      column: "updated_at",
      since: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
      limit: 100,
      order: "request_count",
    }),
    safeRows(db, "admin_audit", "created_at,actor_id,action,target,payload", {
      since: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
      limit: 100,
    }),
    safeRows(db, "admin_audit", "created_at,actor_id,action,target,payload", { since: sinceDays(days), limit: 50 }),
  ]);
  const topLimits = rateRows.rows
    .filter((row) => !row.date || String(row.date) >= today)
    .map((row) => ({
      route: row.route_path,
      key: maskUserRef(row.key_hash),
      request_count: row.request_count,
      updated_at: row.updated_at,
    }));
  const recentLimitHits = hitEvents.rows
    .filter((row) => row.action === "ops_rate_limit_hit")
    .map((row) => {
      const payload = (row.payload || {}) as JsonRecord;
      return {
        created_at: row.created_at,
        route: row.target || payload.route || "unknown",
        key_prefix: payload.key_prefix || "unknown",
        reason: payload.reason || "unknown",
        env: payload.env || "unknown",
        source: payload.source || null,
      };
    })
    .filter((row) => row.env !== "development");
  const distinctLimitKeys = new Set(recentLimitHits.map((row) => String(row.key_prefix || "unknown")));
  const distinctLimitRoutes = new Set(recentLimitHits.map((row) => String(row.route || "unknown")));
  const knownAdvisorWarnings = [
    { level: "warn", area: "RLS policies", detail: "Several public tables have RLS enabled but no policy or overly permissive policies.", href: "https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy" },
    { level: "warn", area: "Function search_path", detail: "Some functions have mutable search_path warnings.", href: "https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable" },
    { level: "warn", area: "Extension schema", detail: "vector extension is currently reported in public.", href: "https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public" },
    { level: "info", area: "Performance", detail: "Unindexed foreign keys and multiple permissive policies are present in advisor output.", href: "https://supabase.com/docs/guides/database/database-advisors" },
  ];
  return {
    generatedAt: nowIso(),
    days,
    env: envStatus(),
    metrics: [
      { key: "rate_limit_rows", label: "Rate-limit rows", value: topLimits.length, severity: rateRows.error ? "info" : "ok" },
      {
        key: "rate_limit_hits",
        label: "People/guests hitting limits",
        value: distinctLimitKeys.size,
        sub: recentLimitHits.length
          ? `${recentLimitHits.length} hit row(s) across ${distinctLimitRoutes.size} route(s) in the last ${hours}h`
          : `No production limit hits in the last ${hours}h`,
        severity: distinctLimitKeys.size >= 5 ? "warn" : recentLimitHits.length ? "info" : "ok",
      },
      { key: "admin_audit", label: "Admin audit rows", value: auditRows.rows.length, severity: auditRows.error ? "info" : "ok" },
      { key: "advisor_warnings", label: "Advisor warnings", value: knownAdvisorWarnings.length, severity: "warn" },
    ],
    tables: {
      "Top durable rate limits": topLimits,
      "Recent limit hits": recentLimitHits,
      "Recent admin audit": auditRows.rows.map((row) => ({
        created_at: row.created_at,
        actor: maskUserRef(row.actor_id),
        action: row.action,
        target: row.target,
      })),
      "Supabase advisor launch items": knownAdvisorWarnings,
    },
    notes: [
      rateRows.error ? `Rate-limit query warning: ${rateRows.error}` : "",
      recentLimitHits.length
        ? "Limit hits currently include website and app routes together. Use the route names to judge whether this is really mobile-launch pressure."
        : "No production rate-limit hits were seen in the last 24 hours.",
      "Advisor rows are surfaced as launch-health reminders; broad schema cleanup is intentionally deferred.",
    ].filter(Boolean),
  };
}

export async function getMobileCommandCenterFeedback(days: number): Promise<CommandCenterPayload> {
  const db = getAdmin();
  if (!db) return missingDbPayload(days);
  const since = sinceDays(days);
  const [feedback, aiReports, appReports, negativeFeedback, posthog] = await Promise.all([
    safeCount(db, "feedback", { since }),
    safeCount(db, "ai_response_reports", { since }),
    safeRows(db, "ai_response_reports", "created_at,status,issue_types,user_id,context_jsonb,description", { since, limit: 50 }),
    safeRows(db, "feedback", "created_at,rating,user_id,source,message", { since, limit: 50 }),
    getPosthogAnalytics(days),
  ]);
  const appRows = appReports.rows.filter((row) => {
    const context = (row.context_jsonb || {}) as JsonRecord;
    return String(context.chat_surface || "").startsWith("app_") || String(context.source || "").startsWith("app_");
  });
  const genericRows = negativeFeedback.rows.map((row) => ({
    created_at: row.created_at,
    rating: row.rating,
    user: maskUserRef(row.user_id),
    source: row.source || "unknown",
    message: String(row.message || "").slice(0, 180),
  }));
  const appGenericRows = genericRows.filter((row) => String(row.source).startsWith("app_") || row.source === "deck_analysis");
  const genericMissingSource = genericRows.filter((row) => row.source === "unknown").length;
  const unresolvedAppReports = appRows.filter((row) => String(row.status || "open") !== "resolved").length;
  const feedbackFailureRows = posthog.rows.filter((row) => String(row.event || "") === "feedback_submission_failed");
  const feedbackFailureCount = feedbackFailureRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const groupedSources = new Map<string, number>();
  for (const row of appRows) {
    const context = (row.context_jsonb || {}) as JsonRecord;
    const source = String(context.chat_surface || context.source || "unknown");
    groupedSources.set(source, (groupedSources.get(source) || 0) + 1);
  }
  return {
    generatedAt: nowIso(),
    days,
    env: envStatus(),
    metrics: [
      { key: "feedback", label: "Generic feedback", value: feedback.count, severity: feedback.error ? "info" : "ok" },
      { key: "app_feedback", label: "App generic feedback", value: appGenericRows.length, severity: appGenericRows.length ? "ok" : "info" },
      { key: "ai_reports", label: "AI reports", value: aiReports.count, severity: aiReports.error ? "info" : "ok" },
      { key: "app_ai_reports", label: "App AI reports", value: appRows.length, sub: `${unresolvedAppReports} unresolved`, severity: appRows.length ? "ok" : "info" },
      { key: "negative", label: "Negative feedback rows", value: negativeFeedback.rows.filter((row) => Number(row.rating) < 0).length, severity: "info" },
      { key: "feedback_source_gaps", label: "Missing source attribution", value: genericMissingSource, severity: genericMissingSource ? "warn" : "ok" },
      {
        key: "feedback_submit_failures",
        label: "Submission failures",
        value: feedbackFailureCount,
        sub: posthog.error ? "PostHog unavailable for failure-side check" : feedbackFailureCount ? "Investigate broken feedback/report flows." : "None seen in this window",
        severity: posthog.error ? "info" : feedbackFailureCount ? "warn" : "ok",
      },
    ],
    tables: {
      "Recent app AI reports": appRows.map((row) => ({
        created_at: row.created_at,
        status: row.status,
        user: maskUserRef(row.user_id),
        issue_types: row.issue_types,
        surface: ((row.context_jsonb || {}) as JsonRecord).chat_surface || ((row.context_jsonb || {}) as JsonRecord).source,
        description: String(row.description || "").slice(0, 180),
      })),
      "Recent app generic feedback": appGenericRows,
      "Recent generic feedback": genericRows,
      "Feedback submission failures": feedbackFailureRows.length
        ? feedbackFailureRows.map((row) => ({ event: row.event, count: row.count }))
        : [{ event: "feedback_submission_failed", count: 0, note: posthog.error ? "PostHog check unavailable." : "No failures seen in this window." }],
      "App report sources": Array.from(groupedSources.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
    },
    notes: [
      "Generic feedback is now surfaced as app-specific where source markers exist.",
      feedbackFailureCount
        ? "Failure-side feedback tracking is firing, so some users are hitting submit problems or blocked report flows."
        : "No feedback submission failures were seen in this window.",
      genericMissingSource ? "Some feedback rows still lack source attribution and may include website traffic." : "Source attribution looks healthy in this window.",
    ],
  };
}

function summarizePipelineJobs(configRows: JsonRecord[], jobIds: readonly string[]) {
  const configMap = new Map<string, JsonRecord>();
  for (const row of configRows) configMap.set(String(row.key), row);

  const labelMap: Record<string, string> = {
    bulk_scryfall: "Scryfall import",
    bulk_price_import: "Price import",
    price_snapshot_bulk: "Price snapshot build",
    "deck-costs": "Deck cost refresh",
    "meta-signals": "Meta signals",
    "commander-aggregates": "Commander aggregates",
    "top-cards": "Top cards",
    "budget-swaps-update": "Budget swaps refresh",
    "mtg-legality-refresh": "Legality refresh",
  };
  const statusMap: Record<string, string> = {
    healthy: "working",
    degraded: "working, with warnings",
    partial: "partly worked",
    stale: "late",
    failed: "failed",
  };

  const rows = jobIds.map((jobId) => {
    const detailRow = configMap.get(adminJobDetailKey(jobId));
    const attemptRow = configMap.get(adminJobAttemptKey(jobId));
    const lastKey = jobLastSuccessConfigKey(jobId);
    const lastSuccess = String(configMap.get(lastKey)?.value || "") || null;
    const detail = parseAdminJobDetail(typeof detailRow?.value === "string" ? detailRow.value : null);
    const health = computeAdminJobHealth(jobId, detail, lastSuccess);
    const finishedAt = lastSuccess || detail?.finishedAt || (typeof attemptRow?.value === "string" ? attemptRow.value : null);

    return {
      job: labelMap[jobId] || jobId,
      job_id: jobId,
      status: statusMap[health] || health,
      last_seen: ageShort(finishedAt),
      last_at: finishedAt,
      detail: detail?.compactLine || "No recent detail saved.",
      severity: (health === "healthy" ? "ok" : health === "degraded" ? "warn" : health === "partial" ? "warn" : health === "stale" ? "warn" : "critical") as Severity,
    };
  });

  const healthy = rows.filter((row) => row.severity === "ok").length;
  const warning = rows.filter((row) => row.severity === "warn").length;
  const failing = rows.filter((row) => row.severity === "critical").length;

  return {
    rows,
    healthy,
    warning,
    failing,
    latestAt: rows
      .map((row) => {
        const raw = row.last_at ? new Date(String(row.last_at)).getTime() : NaN;
        return Number.isFinite(raw) ? raw : null;
      })
      .filter((value): value is number => value != null)
      .sort((a, b) => b - a)[0] ?? null,
  };
}

function summarizeImportantJobs(configRows: JsonRecord[]) {
  return summarizePipelineJobs(configRows, PIPELINE_JOB_IDS);
}

export function summarizeMonitoredJobs(configRows: JsonRecord[], jobIds: readonly string[]) {
  return summarizePipelineJobs(configRows, jobIds);
}

export async function getMobileCommandCenterOps(days: number): Promise<CommandCenterPayload> {
  const db = getAdmin();
  if (!db) return missingDbPayload(days);
  const monitoredJobIds = [
    ...PIPELINE_JOB_IDS,
    ...DAILY_DIGEST_JOB_IDS,
    ...WEEKLY_PIPELINE_JOB_IDS,
  ];
  const appConfigKeys = [
    ...new Set(
      monitoredJobIds.flatMap((jobId) => {
        const keys = [adminJobDetailKey(jobId), adminJobAttemptKey(jobId), jobLastSuccessConfigKey(jobId)];
        return keys;
      }),
    ),
    "job:last:scryfall_cache_incomplete_repair",
    "job:last:scryfall_cache_phase3_backfill",
  ];
  const [flags, config, changelog, scryfall, opsAudit, appConfig] = await Promise.all([
    safeRows(db, "feature_flags", "key,enabled,platform,updated_at", { limit: 50, order: "updated_at" }),
    safeRows(db, "remote_config", "key,platform,updated_at", { limit: 50, order: "updated_at" }),
    safeRows(db, "app_changelog", "title,is_active,platform,starts_at,updated_at", { limit: 10, order: "updated_at" }),
    safeRows(db, "scryfall_cache", "name,updated_at", { limit: 1, order: "updated_at" }),
    safeRows(db, "admin_audit", "created_at,action,target", { since: sinceDays(days), limit: 30 }),
    safeAppConfigRows(db, appConfigKeys),
  ]);
  const configFreshness = freshnessWord(typeof config.rows[0]?.updated_at === "string" ? String(config.rows[0].updated_at) : null, 7 * 24);
  const scryfallFreshness = freshnessWord(typeof scryfall.rows[0]?.updated_at === "string" ? String(scryfall.rows[0].updated_at) : null, 24);
  const importantJobs = summarizeImportantJobs(appConfig.rows);
  const tier1Jobs = summarizePipelineJobs(appConfig.rows, TIER1_PIPELINE_JOB_IDS);
  const dailyDigestJobs = summarizePipelineJobs(appConfig.rows, DAILY_DIGEST_JOB_IDS);
  const weeklyJobs = summarizePipelineJobs(appConfig.rows, WEEKLY_PIPELINE_JOB_IDS);
  const failingJobs = importantJobs.failing;
  const warningJobs = importantJobs.warning;
  const tier1Failing = tier1Jobs.failing;
  const tier1Warning = tier1Jobs.warning;
  const latestJobSeen = importantJobs.latestAt ? ageShort(new Date(importantJobs.latestAt).toISOString()) : "not yet";

  return {
    generatedAt: nowIso(),
    days,
    env: envStatus(),
    metrics: [
      {
        key: "tier1_pipeline_jobs",
        label: "Daily price jobs",
        value: tier1Failing ? "needs attention" : tier1Warning ? "mostly okay" : "all okay",
        sub: `${tier1Jobs.healthy}/${tier1Jobs.rows.length} healthy, latest run ${tier1Jobs.latestAt ? ageShort(new Date(tier1Jobs.latestAt).toISOString()) : "not yet"}`,
        severity: tier1Failing ? "critical" : tier1Warning ? "warn" : "ok",
        href: "/admin/ops",
      },
      {
        key: "important_jobs",
        label: "Pipeline jobs",
        value: failingJobs ? "needs attention" : warningJobs ? "mostly okay" : "all okay",
        sub: `${importantJobs.healthy}/${importantJobs.rows.length} healthy, latest run ${latestJobSeen}`,
        severity: failingJobs ? "critical" : warningJobs ? "warn" : "ok",
        href: "/admin/ops",
      },
      {
        key: "scryfall",
        label: "Scryfall cache update",
        value: scryfallFreshness.value,
        sub: scryfall.error ? `Lookup warning: ${scryfall.error}` : "When card data was last refreshed in the cache.",
        severity: scryfall.error ? "info" : scryfallFreshness.severity,
        href: "/admin/data",
      },
      {
        key: "config_freshness",
        label: "App settings update",
        value: configFreshness.value,
        sub: "When mobile settings were last changed.",
        severity: configFreshness.severity,
        href: "/admin/feature-flags",
      },
      { key: "flags", label: "Feature flags", value: flags.rows.length, severity: flags.error ? "info" : "ok", href: "/admin/feature-flags" },
      { key: "config", label: "Remote config rows", value: config.rows.length, severity: config.error ? "info" : "ok", href: "/admin/feature-flags" },
      { key: "changelog", label: "Active app notes", value: changelog.rows.filter((row) => row.is_active).length, severity: changelog.error ? "info" : "ok", href: "/admin/app-whats-new" },
    ],
    tables: {
      "Daily price jobs (hourly alerts)": tier1Jobs.rows,
      "Pipeline jobs": importantJobs.rows,
      "Discover jobs (daily digest)": dailyDigestJobs.rows,
      "Weekly jobs (Sunday digest)": weeklyJobs.rows,
      "Feature flags": flags.rows,
      "Remote config": config.rows,
      "App changelog": changelog.rows,
      "Recent admin actions": opsAudit.rows,
    },
    notes: [
      "Hourly Discord alerts only cover daily price jobs (import, snapshot, deck costs) and critical Sentry/error spikes.",
      "The 22:30 UTC daily digest covers analytics, revenue, Discover jobs, and the full pipeline table.",
      "Weekly jobs (Scryfall bulk, legality, budget swaps) are summarized in the Sunday ops digest.",
      "Use /admin/ops when a job says late, failed, or partly worked.",
      "Use /admin/data for deeper cache checks when Scryfall freshness looks stale.",
    ],
  };
}

export async function getMobileCommandCenterOverview(days: number): Promise<CommandCenterPayload> {
  const db = getAdmin();
  if (!db) return missingDbPayload(days);
  const [ai, users, analytics, revenue, errors, security, feedback, ops] = await Promise.all([
    getMobileCommandCenterAi(days),
    getMobileCommandCenterUsers(days),
    getMobileCommandCenterAnalytics(days),
    getMobileCommandCenterRevenue(days),
    getMobileCommandCenterErrors(days),
    getMobileCommandCenterSecurity(days),
    getMobileCommandCenterFeedback(days),
    getMobileCommandCenterOps(days),
  ]);

  const allMetrics = [ai, users, analytics, revenue, errors, security, feedback, ops].flatMap((payload) => payload.metrics || []);
  const alerts: LaunchAlert[] = [];
  for (const metric of allMetrics) {
    if (shouldCreateLaunchAlert(metric)) {
      alerts.push({
        key: metric.key,
        title: metric.label,
        detail: `${metric.value ?? "unknown"}${metric.sub ? ` - ${metric.sub}` : ""}`,
        severity: metric.severity,
        source: "overview",
        href: metric.href,
      });
    }
  }
  if (!envStatus().discordWebhookConfigured) {
    alerts.push({
      key: "discord_missing",
      title: "Discord launch alerts are not configured",
      detail: "Set DISCORD_ADMIN_ALERT_WEBHOOK, or reuse DISCORD_APPSUB_WEBHOOK while launch alerts are low-volume.",
      severity: "warn",
      source: "config",
    });
  }

  return {
    generatedAt: nowIso(),
    days,
    env: envStatus(),
    metrics: [
      {
        key: "launch_health",
        label: "Launch health",
        value: alerts.some((a) => a.severity === "critical") ? "critical" : alerts.length ? "watch" : "ok",
        sub: alerts.some((a) => a.severity === "critical")
          ? `${alerts.filter((a) => a.severity === "critical").length} critical item(s)`
          : alerts.length
            ? `${alerts.length} thing(s) worth watching`
            : "Nothing urgent right now",
        severity: alerts.some((a) => a.severity === "critical") ? "critical" : alerts.length ? "warn" : "ok",
      },
      ...(ai.metrics || []).slice(0, 4),
      ...(users.metrics || []).slice(1, 3),
      ...(revenue.metrics || []).slice(0, 3),
      ...(errors.metrics || []).slice(0, 3),
      ...(ops.metrics || []).slice(0, 3),
      ...(security.metrics || []).slice(0, 3),
    ],
    alerts: alerts.slice(0, 20),
    tables: {
      "Top AI cost by feature": ai.tables?.["Cost by feature"] || [],
      "Recent signups": users.rows || [],
      "Sentry unresolved issues": errors.tables?.["Sentry unresolved issues"] || [],
      "Rate-limit pressure": security.tables?.["Top durable rate limits"] || [],
      "Feedback": feedback.tables?.["Recent app AI reports"] || [],
      "Ops": ops.tables?.["Pipeline jobs"] || [],
    },
    notes: [
      "This page is meant to be a quick plain-English check, not a deep technical audit.",
      "No full emails, raw prompts, Sentry stack traces, or server-only secrets are shown here.",
    ],
  };
}

async function writeSnapshot(db: Db, group: string, metrics: MetricCard[], days: number, source: string) {
  if (!metrics.length) return;
  try {
    await db.from("admin_app_metric_snapshots").upsert(
      metrics.map((metric) => ({
        metric_group: group,
        metric_key: metric.key,
        window_key: `${days}d`,
        source,
        value: { value: metric.value, sub: metric.sub },
        severity: metric.severity || "info",
        captured_at: nowIso(),
      })),
      { onConflict: "metric_group,metric_key,window_key,source" },
    );
  } catch {
    // The migration may not be applied yet; refresh still returns live data.
  }
}

async function writeAlerts(db: Db, alerts: LaunchAlert[], actorId: string | null) {
  if (!alerts.length) return;
  try {
    await db.from("admin_app_alerts").upsert(
      alerts.map((alert) => ({
        severity: alert.severity,
        status: "open",
        dedupe_key: alertDedupeKey(alert),
        title: alert.title,
        detail: alert.detail,
        source: alert.source,
        payload: { href: alert.href || null, actor_id: actorId },
        last_seen_at: nowIso(),
      })),
      { onConflict: "dedupe_key" },
    );
  } catch {
    // Best-effort until the migration is live.
  }
}

async function loadExistingAlerts(db: Db, alerts: LaunchAlert[]) {
  const keys = alerts.map(alertDedupeKey);
  if (!keys.length) return new Map<string, JsonRecord>();
  try {
    const { data, error } = await db
      .from("admin_app_alerts")
      .select("dedupe_key,severity,detail,status,discord_sent_at")
      .in("dedupe_key", keys);
    if (error) return new Map<string, JsonRecord>();
    return new Map(((data || []) as JsonRecord[]).map((row) => [String(row.dedupe_key), row]));
  } catch {
    return new Map<string, JsonRecord>();
  }
}

async function markDiscordAlertStatus(db: Db, alerts: LaunchAlert[], status: "sent" | "failed") {
  const keys = alerts.map(alertDedupeKey);
  if (!keys.length) return;
  try {
    await db
      .from("admin_app_alerts")
      .update({
        discord_status: status,
        discord_sent_at: status === "sent" ? nowIso() : null,
      })
      .in("dedupe_key", keys);
  } catch {
    // Alert status writes are best-effort.
  }
}

async function sendDiscordAlerts(
  alerts: LaunchAlert[],
  options: { db?: Db; force?: boolean; reason?: string; hourlyOnly?: boolean } = {},
) {
  const webhook = getDiscordAdminWebhook();
  if (!webhook) return { attempted: false, sent: 0 };
  const urgent = alerts.filter((alert) => alert.severity === "critical" || alert.severity === "warn");
  let sendable = options.hourlyOnly ? urgent.filter(shouldSendHourlyDiscordAlert) : urgent;
  if (!options.force && options.db) {
    const existing = await loadExistingAlerts(options.db, urgent);
    sendable = urgent.filter((alert) => shouldSendDiscordAlert(alert, existing.get(alertDedupeKey(alert)) as any));
  }
  sendable = sendable.slice(0, 8);
  const skipped = urgent.length - sendable.length;
  if (!sendable.length) return { attempted: false, sent: 0, skipped };
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: [
          options.reason === "manual_test"
            ? "**ManaTap launch alerts test**"
            : "**ManaTap mobile launch alerts**",
          ...sendable.map((alert) => `- [${alert.severity}] ${alert.title}: ${alert.detail}`),
        ].join("\n"),
      }),
    });
    if (options.db) await markDiscordAlertStatus(options.db, sendable, res.ok ? "sent" : "failed");
    return { attempted: true, sent: res.ok ? sendable.length : 0, skipped, status: res.status };
  } catch {
    if (options.db) await markDiscordAlertStatus(options.db, sendable, "failed");
    return { attempted: true, sent: 0, skipped, status: "failed" };
  }
}

export async function sendMobileCommandCenterTestDiscord(actorId?: string | null) {
  const db = getAdmin();
  if (!db) return missingDbPayload(1);
  const testAlert: LaunchAlert = {
    key: "manual_discord_test",
    title: "Manual Discord test",
    detail: `Launch alert webhook verified${actorId ? ` by ${maskUserRef(actorId)}` : ""}.`,
    severity: "warn",
    source: "manual_test",
  };
  await writeAlerts(db, [testAlert], actorId || null);
  const discord = await sendDiscordAlerts([testAlert], { db, force: true, reason: "manual_test" });
  return {
    generatedAt: nowIso(),
    days: 1,
    env: envStatus(),
    alerts: [testAlert],
    refresh: { ok: discord.sent > 0, discord },
  };
}

export async function refreshMobileCommandCenterRollups(options: {
  days: number;
  actorId?: string | null;
  sendDiscord?: boolean;
}) {
  const db = getAdmin();
  if (!db) return missingDbPayload(options.days);
  const [overview, ai, users, analytics, revenue, errors, security, feedback, ops] = await Promise.all([
    getMobileCommandCenterOverview(options.days),
    getMobileCommandCenterAi(options.days),
    getMobileCommandCenterUsers(options.days),
    getMobileCommandCenterAnalytics(options.days),
    getMobileCommandCenterRevenue(options.days),
    getMobileCommandCenterErrors(options.days),
    getMobileCommandCenterSecurity(options.days),
    getMobileCommandCenterFeedback(options.days),
    getMobileCommandCenterOps(options.days),
  ]);

  await Promise.all([
    writeSnapshot(db, "overview", overview.metrics || [], options.days, "mobile-command-center"),
    writeSnapshot(db, "ai", ai.metrics || [], options.days, "mobile-command-center"),
    writeSnapshot(db, "users", users.metrics || [], options.days, "mobile-command-center"),
    writeSnapshot(db, "analytics", analytics.metrics || [], options.days, "mobile-command-center"),
    writeSnapshot(db, "revenue", revenue.metrics || [], options.days, "mobile-command-center"),
    writeSnapshot(db, "errors", errors.metrics || [], options.days, "mobile-command-center"),
    writeSnapshot(db, "security", security.metrics || [], options.days, "mobile-command-center"),
    writeSnapshot(db, "feedback", feedback.metrics || [], options.days, "mobile-command-center"),
    writeSnapshot(db, "ops", ops.metrics || [], options.days, "mobile-command-center"),
    writeAlerts(db, overview.alerts || [], options.actorId || null),
  ]);

  const discord = options.sendDiscord
    ? await sendDiscordAlerts(overview.alerts || [], { db, reason: "scheduled_rollup", hourlyOnly: true })
    : { attempted: false, sent: 0 };
  return {
    ...overview,
    refresh: {
      ok: true,
      snapshots: 9,
      alerts: overview.alerts?.length || 0,
      discord,
    },
  };
}
