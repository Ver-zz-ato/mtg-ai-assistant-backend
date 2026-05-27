/**
 * Run ops report checks. Used by cron routes.
 */
import { getAdmin } from "@/app/api/_lib/supa";
import { costUSD } from "@/lib/ai/pricing";
import { isAppAiUsageRow } from "@/lib/ai/manatap-client-origin";
import {
  type CommandCenterPayload,
  getMobileCommandCenterAi,
  getMobileCommandCenterAnalytics,
  getMobileCommandCenterErrors,
  getMobileCommandCenterFeedback,
  getMobileCommandCenterOps,
  getMobileCommandCenterOverview,
  getMobileCommandCenterRevenue,
  getMobileCommandCenterSecurity,
  getMobileCommandCenterUsers,
  shouldCountForDailyDigestStatus,
  WEEKLY_PIPELINE_JOB_IDS,
} from "@/lib/admin/mobile-command-center";
import { jobLastSuccessConfigKey } from "@/lib/admin/adminJobDetail";
import { posthogHogql, getPosthogQueryCredentials } from "@/lib/server/posthog-hogql";
import { postOpsReportToDiscord } from "@/lib/ops/discord";

const JOB_KEYS = [
  "job:last:bulk_scryfall",
  "job:last:bulk_price_import",
  "job:last:price_snapshot_bulk",
  "job:last:deck-costs",
  "job:last:meta-signals",
  "job:last:top-cards",
  "job:last:commander-aggregates",
];

const AI_LIMIT = 200;
const AI_WINDOW_LIMIT = 5000;
const SEO_WINNERS_THRESHOLD = 10;
const SEO_WINNERS_LIMIT = 50;
const STALE_HOURS = 48;
const DAILY_WINDOW_HOURS = 24;

function costUSDFromRow(r: { model?: string | null; input_tokens?: number | null; output_tokens?: number | null }): number {
  return costUSD(String(r.model ?? ""), Number(r.input_tokens) || 0, Number(r.output_tokens) || 0);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function percent(numerator: number, denominator: number, digits = 1): number {
  if (!denominator) return 0;
  return round((numerator / denominator) * 100, digits);
}

function markWarn(current: "ok" | "warn" | "fail"): "ok" | "warn" | "fail" {
  return current === "fail" ? "fail" : "warn";
}

function getMetric(payload: CommandCenterPayload, key: string) {
  return (payload.metrics || []).find((metric) => metric.key === key);
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}

function formatLondonTimestamp(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

async function getWebsitePosthogDigest(hours: number) {
  if (!getPosthogQueryCredentials()) {
    return {
      configured: false,
      pageviews: 0,
      firstVisits: 0,
      logins: 0,
      signups: 0,
      proStarts: 0,
      proCompletes: 0,
      feedbackSent: 0,
      error: "PostHog query env is not configured.",
    };
  }

  const query = `
    SELECT event, count() AS count
    FROM events
    WHERE timestamp >= now() - INTERVAL ${Math.max(1, Math.min(hours, 168))} HOUR
      AND event IN [
        '$pageview',
        'user_first_visit',
        'auth_login_success',
        'signup_completed',
        'pro_upgrade_started',
        'pro_upgrade_completed',
        'feedback_sent'
      ]
    GROUP BY event
    ORDER BY count DESC
  `;

  try {
    const result = await posthogHogql(query);
    const counts = new Map<string, number>();
    for (const row of result.results) {
      counts.set(String(row[0] || ""), Number(row[1] || 0));
    }
    return {
      configured: true,
      pageviews: counts.get("$pageview") || 0,
      firstVisits: counts.get("user_first_visit") || 0,
      logins: counts.get("auth_login_success") || 0,
      signups: counts.get("signup_completed") || 0,
      proStarts: counts.get("pro_upgrade_started") || 0,
      proCompletes: counts.get("pro_upgrade_completed") || 0,
      feedbackSent: counts.get("feedback_sent") || 0,
    };
  } catch (e) {
    return {
      configured: true,
      pageviews: 0,
      firstVisits: 0,
      logins: 0,
      signups: 0,
      proStarts: 0,
      proCompletes: 0,
      feedbackSent: 0,
      error: e instanceof Error ? e.message : "posthog_query_failed",
    };
  }
}

async function buildDailyDigestDetails(admin: NonNullable<ReturnType<typeof getAdmin>>) {
  const now = new Date();
  const windowEnd = now.toISOString();
  const windowStart = new Date(now.getTime() - DAILY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const [overview, ai, users, analytics, revenue, errors, security, feedback, ops, websitePosthog, aiUsageWindow, websiteFeedbackCount] =
    await Promise.all([
      getMobileCommandCenterOverview(1),
      getMobileCommandCenterAi(1),
      getMobileCommandCenterUsers(1),
      getMobileCommandCenterAnalytics(1),
      getMobileCommandCenterRevenue(1),
      getMobileCommandCenterErrors(1),
      getMobileCommandCenterSecurity(1, 24),
      getMobileCommandCenterFeedback(1),
      getMobileCommandCenterOps(1),
      getWebsitePosthogDigest(24),
      admin
        .from("ai_usage")
        .select("source,source_page,route,cost_usd,error_code,cache_hit")
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(AI_WINDOW_LIMIT),
      admin.from("feedback").select("id", { count: "exact", head: true }).gte("created_at", windowStart),
    ]);

  const aiWindowRows = aiUsageWindow.data || [];
  let appAiCalls = 0;
  let websiteAiCalls = 0;
  let appAiErrors = 0;
  let websiteAiErrors = 0;
  let appAiCost = 0;
  let websiteAiCost = 0;
  let appAiCacheHits = 0;
  let websiteAiCacheHits = 0;

  for (const row of aiWindowRows) {
    const isApp = isAppAiUsageRow({
      source: row.source,
      source_page: row.source_page,
      route: row.route,
    });
    const hasError = Boolean(row.error_code);
    const isCacheHit = row.cache_hit === true;
    const cost = Number(row.cost_usd) || 0;
    if (isApp) {
      appAiCalls += 1;
      appAiCost += cost;
      if (hasError) appAiErrors += 1;
      if (isCacheHit) appAiCacheHits += 1;
    } else {
      websiteAiCalls += 1;
      websiteAiCost += cost;
      if (hasError) websiteAiErrors += 1;
      if (isCacheHit) websiteAiCacheHits += 1;
    }
  }

  const overviewAlerts = (overview.alerts || []).filter((alert) => alert.severity === "critical" || alert.severity === "warn");
  const dailyDigestAlerts = overviewAlerts.filter(shouldCountForDailyDigestStatus);
  const criticalAlerts = dailyDigestAlerts.filter((alert) => alert.severity === "critical");
  const warnAlerts = dailyDigestAlerts.filter((alert) => alert.severity === "warn");
  const tier1Rows = (ops.tables?.["Daily price jobs (hourly alerts)"] || []) as Array<Record<string, unknown>>;
  const pipelineRows = (ops.tables?.["Pipeline jobs"] || []) as Array<Record<string, unknown>>;
  const discoverRows = (ops.tables?.["Discover jobs (daily digest)"] || []) as Array<Record<string, unknown>>;

  return {
    window: {
      hours: 24,
      start_iso: windowStart,
      end_iso: windowEnd,
      london_range: `${formatLondonTimestamp(new Date(windowStart))} -> ${formatLondonTimestamp(now)} Europe/London`,
    },
    app: {
      launch_health: {
        value: asString(getMetric(overview, "launch_health")?.value || "unknown"),
        sub: asString(getMetric(overview, "launch_health")?.sub || ""),
      },
      analytics: {
        events_seen: asNumber(getMetric(analytics, "app_events")?.value),
        scanner_events_seen: asNumber(getMetric(analytics, "scanner_events_seen")?.value),
        scanner_sessions_completed: asNumber(getMetric(analytics, "scanner_sessions_completed")?.value),
        tool_events_seen: asNumber(getMetric(analytics, "tool_events_seen")?.value),
        feedback_events_seen: asNumber(getMetric(analytics, "feedback_events")?.value),
        missing_families: asString(getMetric(analytics, "missing_families")?.sub || "none"),
      },
      users: {
        signups_24h: asNumber(getMetric(users, "new_profiles")?.value),
        total_pro_profiles: asNumber(getMetric(users, "pro_profiles")?.value),
      },
      ai: {
        calls_24h: appAiCalls,
        cost_usd_24h: round(appAiCost, 4),
        error_rate_pct: percent(appAiErrors, appAiCalls),
        cache_hit_pct: percent(appAiCacheHits, appAiCalls),
        requests_metric: asNumber(getMetric(ai, "requests")?.value),
      },
      revenue: {
        active_pro_profiles: asNumber(getMetric(revenue, "pro")?.value),
        revenuecat_grants_24h: asNumber(getMetric(revenue, "rc_grants")?.value),
        revenuecat_revokes_24h: asNumber(getMetric(revenue, "rc_revokes")?.value),
      },
      feedback: {
        app_feedback_events_24h: asNumber(getMetric(analytics, "feedback_events")?.value),
        app_ai_reports_24h: asNumber(getMetric(feedback, "app_ai_reports")?.value),
        feedback_submit_failures_24h: asNumber(getMetric(feedback, "feedback_submit_failures")?.value),
      },
    },
    website: {
      analytics: {
        pageviews_24h: websitePosthog.pageviews,
        first_visits_24h: websitePosthog.firstVisits,
        logins_24h: websitePosthog.logins,
        signups_24h: websitePosthog.signups,
        pro_upgrade_starts_24h: websitePosthog.proStarts,
        pro_upgrade_completions_24h: websitePosthog.proCompletes,
        feedback_sent_24h: websitePosthog.feedbackSent,
        posthog_status: websitePosthog.configured ? (websitePosthog.error ? "failing" : "connected") : "missing",
      },
      ai: {
        calls_24h: websiteAiCalls,
        cost_usd_24h: round(websiteAiCost, 4),
        error_rate_pct: percent(websiteAiErrors, websiteAiCalls),
        cache_hit_pct: percent(websiteAiCacheHits, websiteAiCalls),
      },
      feedback: {
        generic_feedback_rows_24h: websiteFeedbackCount.count || 0,
      },
    },
    shared: {
      revenue: {
        stripe_subs: asNumber(getMetric(revenue, "stripe")?.value),
        stripe_webhooks_24h: asNumber(getMetric(revenue, "stripe_webhooks")?.value),
      },
      reliability: {
        sentry_status: asString(getMetric(errors, "sentry")?.value),
        sentry_unresolved: asNumber(getMetric(errors, "sentry_unresolved")?.value),
        local_error_logs_24h: asNumber(getMetric(errors, "local_errors")?.value),
        rate_limit_rows_24h: asNumber(getMetric(security, "rate_limit_rows")?.value),
        rate_limit_hits_24h: asNumber(getMetric(security, "rate_limit_hits")?.value),
        admin_audit_rows_24h: asNumber(getMetric(security, "admin_audit")?.value),
      },
      ops: {
        config_freshness_hours: asNumber(getMetric(ops, "config_freshness")?.value),
        tier1_jobs: tier1Rows.map((row) => ({
          job: row.job,
          status: row.status,
          last_seen: row.last_seen,
          severity: row.severity,
        })),
        pipeline_jobs: pipelineRows.map((row) => ({
          job: row.job,
          status: row.status,
          last_seen: row.last_seen,
          severity: row.severity,
        })),
        discover_jobs: discoverRows.map((row) => ({
          job: row.job,
          status: row.status,
          last_seen: row.last_seen,
          severity: row.severity,
        })),
      },
    },
    top_alerts: dailyDigestAlerts.slice(0, 6).map((alert) => ({
      severity: alert.severity,
      title: alert.title,
      detail: alert.detail,
    })),
    counts: {
      critical_alerts: criticalAlerts.length,
      warning_alerts: warnAlerts.length,
    },
    notes: [
      websitePosthog.error ? `Website PostHog warning: ${websitePosthog.error}` : null,
      asString(getMetric(analytics, "scanner_events_seen")?.sub || ""),
      asString(getMetric(overview, "launch_health")?.sub || ""),
    ].filter(Boolean),
  };
}
async function buildWeeklyDigestDetails(admin: NonNullable<ReturnType<typeof getAdmin>>) {
  const jobKeys = WEEKLY_PIPELINE_JOB_IDS.map((jobId) => jobLastSuccessConfigKey(jobId));
  const { data: configRows } = await admin.from("app_config").select("key, value").in("key", jobKeys);
  const configMap = new Map((configRows || []).map((row: { key: string; value: string }) => [row.key, row.value]));
  const nowMs = Date.now();
  const rows = WEEKLY_PIPELINE_JOB_IDS.map((jobId) => {
    const raw = configMap.get(jobLastSuccessConfigKey(jobId));
    const labelMap: Record<string, string> = {
      bulk_scryfall: "Scryfall import",
      "mtg-legality-refresh": "Legality refresh",
      "budget-swaps-update": "Budget swaps refresh",
    };
    if (!raw) {
      return { job: labelMap[jobId] || jobId, job_id: jobId, status: "not seen yet", last_seen: "never", age_hours: null };
    }
    try {
      const parsed = JSON.parse(String(raw));
      const iso = typeof parsed === "string" ? parsed : String(parsed);
      const ageHours = Math.round((nowMs - new Date(iso).getTime()) / (1000 * 60 * 60));
      const staleAfter = jobId === "bulk_scryfall" ? 24 * 7 : 24 * 7;
      const status = ageHours > staleAfter ? "late" : "working";
      return {
        job: labelMap[jobId] || jobId,
        job_id: jobId,
        status,
        last_seen: `${ageHours}h ago`,
        age_hours: ageHours,
      };
    } catch {
      return { job: labelMap[jobId] || jobId, job_id: jobId, status: "unknown", last_seen: String(raw), age_hours: null };
    }
  });
  const lateJobs = rows.filter((row) => row.status === "late").map((row) => row.job);
  return { weekly_jobs: rows, late_jobs: lateJobs };
}

export type ReportType = "daily_ops" | "weekly_ops";

export async function runOpsReport(reportType: ReportType): Promise<{
  ok: boolean;
  report_id: string | null;
  report_type: string;
  status: "ok" | "warn" | "fail";
  summary: string;
  duration_ms: number;
  details: Record<string, unknown>;
}> {
  const start = Date.now();
  const admin = getAdmin();
  if (!admin) {
    return {
      ok: false,
      report_id: null,
      report_type: reportType,
      status: "fail",
      summary: "missing_service_role_key",
      duration_ms: Date.now() - start,
      details: {},
    };
  }

  const details: Record<string, unknown> = {};
  let status: "ok" | "warn" | "fail" = "ok";
  const warnings: string[] = [];

  try {
    const { data: aiRows } = await admin.from("ai_usage").select("id,model,input_tokens,output_tokens,cost_usd").order("created_at", { ascending: false }).limit(AI_LIMIT);
    let mismatches = 0;
    const sample: Array<{ id: string; stored: number; expected: number }> = [];
    const ABS = 1e-6;
    const REL = 0.01;
    for (const r of aiRows || []) {
      const stored = Number(r.cost_usd) || 0;
      const expected = costUSDFromRow(r);
      const absDiff = Math.abs(stored - expected);
      const relDiff = expected > 0 ? absDiff / expected : absDiff;
      if (absDiff > ABS && relDiff > REL) {
        mismatches++;
        if (sample.length < 5) sample.push({ id: r.id, stored, expected });
      }
    }
    const mismatchRate = (aiRows?.length ?? 0) > 0 ? (mismatches / aiRows!.length) * 100 : 0;
    details.ai_cost_audit = { mismatch_rate: mismatchRate, sample_mismatches: sample, rows_checked: aiRows?.length ?? 0 };
    if (mismatchRate > 10) {
      status = "warn";
      warnings.push(`AI cost mismatch ${mismatchRate.toFixed(1)}%`);
    }
  } catch (e) {
    details.ai_cost_audit = { error: (e as Error).message };
  }

  try {
    const { data: routeRows } = await admin.from("ai_usage").select("route").order("created_at", { ascending: false }).limit(AI_LIMIT);
    const total = routeRows?.length ?? 0;
    const nullCount = (routeRows || []).filter((r) => r.route == null || r.route === "").length;
    const routeNullPct = total > 0 ? (nullCount / total) * 100 : 0;
    const byRoute = new Map<string, number>();
    for (const r of routeRows || []) {
      const rt = r.route || "null";
      byRoute.set(rt, (byRoute.get(rt) || 0) + 1);
    }
    const topRoutes = Array.from(byRoute.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ route: k, count: v }));
    details.route_coverage = { route_null_pct: routeNullPct, top_routes: topRoutes };
    if (routeNullPct > 20) {
      status = markWarn(status);
      warnings.push(`Route null ${routeNullPct.toFixed(1)}%`);
    }
  } catch (e) {
    details.route_coverage = { error: (e as Error).message };
  }

  try {
    const { data: qRows } = await admin.from("ai_usage").select("request_kind,layer0_mode,response_truncated,error_code,cache_hit,latency_ms").order("created_at", { ascending: false }).limit(AI_LIMIT);
    const total = qRows?.length ?? 0;
    let err429 = 0;
    const latencies: number[] = [];
    for (const r of qRows || []) {
      if (r.error_code && String(r.error_code).includes("429")) err429++;
      if (r.latency_ms != null) latencies.push(Number(r.latency_ms));
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : null;
    const rate429 = total > 0 ? (err429 / total) * 100 : 0;
    const fullLlm = (qRows || []).filter((r) => ((r.request_kind || r.layer0_mode) || "").toUpperCase() === "FULL_LLM").length;
    const miniOnly = (qRows || []).filter((r) => ((r.request_kind || r.layer0_mode) || "").toUpperCase() === "MINI_ONLY").length;
    const noLlm = (qRows || []).filter((r) => ((r.request_kind || r.layer0_mode) || "").toUpperCase() === "NO_LLM").length;
    const truncated = (qRows || []).filter((r) => r.response_truncated === true).length;
    const cacheHit = (qRows || []).filter((r) => r.cache_hit === true).length;
    details.quality_sentinel = {
      full_llm: fullLlm,
      mini_only: miniOnly,
      no_llm: noLlm,
      truncation_rate_pct: total > 0 ? (truncated / total) * 100 : 0,
      err429_rate_pct: rate429,
      cache_hit_pct: total > 0 ? (cacheHit / total) * 100 : 0,
      p95_latency_ms: p95,
      requests: total,
    };
    if (rate429 > 5) {
      status = markWarn(status);
      warnings.push(`429 rate ${rate429.toFixed(1)}%`);
    }
  } catch (e) {
    details.quality_sentinel = { error: (e as Error).message };
  }

  try {
    const { data: configRows } = await admin.from("app_config").select("key, value").in("key", JOB_KEYS);
    const configMap = new Map((configRows || []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const nowMs = Date.now();
    const staleJobs: string[] = [];
    for (const key of JOB_KEYS) {
      const val = configMap.get(key);
      if (!val) continue;
      try {
        const ageHours = (nowMs - new Date(val).getTime()) / (1000 * 60 * 60);
        if (ageHours > STALE_HOURS) staleJobs.push(`${key.replace("job:last:", "")} (${Math.round(ageHours)}h)`);
      } catch {
        // ignore bad timestamps
      }
    }
    details.job_health = {
      jobs: Object.fromEntries(JOB_KEYS.map((k) => [k, configMap.get(k) ?? null])),
      stale_jobs: staleJobs,
    };
    if (staleJobs.length > 2) {
      status = markWarn(status);
      warnings.push(`Stale jobs: ${staleJobs.slice(0, 2).join(", ")}`);
    }
  } catch (e) {
    details.job_health = { error: (e as Error).message };
  }

  try {
    const { data: seoPages } = await admin.from("seo_pages").select("id,slug,indexing,status,query");
    const byStatus = new Map<string, number>();
    const byIndexing = new Map<string, number>();
    for (const p of seoPages || []) {
      byStatus.set(p.status || "unknown", (byStatus.get(p.status || "unknown") || 0) + 1);
      byIndexing.set(p.indexing || "noindex", (byIndexing.get(p.indexing || "noindex") || 0) + 1);
    }
    const indexedCount = byIndexing.get("index") ?? 0;
    const queries = Array.from(new Set((seoPages || []).map((p: { query: string }) => p.query)));
    let topByImpressions: Array<{ slug: string; impressions: number }> = [];
    if (queries.length > 0) {
      const { data: metrics } = await admin.from("seo_queries").select("query, impressions").in("query", queries.slice(0, 500));
      const impByQuery = new Map((metrics || []).map((m: { query: string; impressions: number }) => [m.query, m.impressions ?? 0]));
      topByImpressions = (seoPages || [])
        .map((p: { slug: string; query: string }) => ({ slug: p.slug, impressions: impByQuery.get(p.query) ?? 0 }))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 10);
    }
    details.seo_health = {
      by_status: Object.fromEntries(byStatus),
      by_indexing: Object.fromEntries(byIndexing),
      indexed_page_count: indexedCount,
      top_10_by_impressions: topByImpressions,
    };
  } catch (e) {
    details.seo_health = { error: (e as Error).message };
  }

  try {
    const { data: pages } = await admin.from("seo_pages").select("slug, title, query, priority, indexing").eq("indexing", "noindex").eq("status", "published").limit(500);
    const queries = Array.from(new Set((pages || []).map((p: { query: string }) => p.query)));
    let winners: Array<{ slug: string; title: string; impressions: number; clicks: number; ctr: number | null; position: number | null; priority: number }> = [];
    if (queries.length > 0) {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: rawMetrics } = await admin.from("seo_queries").select("query, clicks, impressions, ctr, position, date_end").in("query", queries);
      const metrics = (rawMetrics || []).filter((m: { date_end?: string | null }) => m.date_end && String(m.date_end).slice(0, 10) >= cutoff);
      const byQuery = new Map(metrics.map((m: { query: string; clicks: number; impressions: number; ctr?: number; position?: number }) => [m.query, { clicks: m.clicks ?? 0, impressions: m.impressions ?? 0, ctr: m.ctr ?? null, position: m.position ?? null }]));
      for (const p of pages || []) {
        const m = byQuery.get(p.query);
        if (!m || m.impressions < SEO_WINNERS_THRESHOLD) continue;
        winners.push({ slug: p.slug, title: p.title ?? p.slug, impressions: m.impressions, clicks: m.clicks, ctr: m.ctr, position: m.position, priority: p.priority ?? 0 });
      }
      winners = winners.sort((a, b) => b.impressions - a.impressions).slice(0, SEO_WINNERS_LIMIT);
    }
    details.seo_winners = { count: winners.length, top_slugs: winners.slice(0, 3).map((w) => w.slug), winners: winners.slice(0, 20) };
  } catch (e) {
    details.seo_winners = { error: (e as Error).message };
  }

  if (reportType === "daily_ops") {
    try {
      const dailyDigest = await buildDailyDigestDetails(admin);
      details.daily_digest = dailyDigest;
      if ((dailyDigest.counts?.critical_alerts || 0) > 0) {
        status = "fail";
        warnings.push(`${dailyDigest.counts.critical_alerts} critical daily digest alert(s)`);
      } else if ((dailyDigest.counts?.warning_alerts || 0) > 0 && status !== "fail") {
        status = "warn";
        warnings.push(`${dailyDigest.counts.warning_alerts} daily digest warning(s)`);
      }
      const lateDiscover = ((dailyDigest.shared as Record<string, unknown> | undefined)?.ops as Record<string, unknown> | undefined)?.discover_jobs as Array<{ severity?: string; job?: string }> | undefined;
      const lateDiscoverCount = (lateDiscover || []).filter((row) => row.severity === "warn" || row.severity === "critical").length;
      if (lateDiscoverCount > 0 && status !== "fail") {
        status = markWarn(status);
        warnings.push(`${lateDiscoverCount} Discover job(s) late or degraded`);
      }
    } catch (e) {
      details.daily_digest = { error: e instanceof Error ? e.message : "daily_digest_failed" };
      status = markWarn(status);
      warnings.push("Daily digest section failed");
    }
  }

  let weeklyDigest: Record<string, unknown> | undefined;
  if (reportType === "weekly_ops") {
    try {
      weeklyDigest = await buildWeeklyDigestDetails(admin);
      details.weekly_digest = weeklyDigest;
      const lateJobs = (weeklyDigest.late_jobs as string[] | undefined) || [];
      if (lateJobs.length > 0) {
        status = markWarn(status);
        warnings.push(`Late weekly jobs: ${lateJobs.slice(0, 3).join(", ")}`);
      }
    } catch (e) {
      details.weekly_digest = { error: e instanceof Error ? e.message : "weekly_digest_failed" };
      status = markWarn(status);
      warnings.push("Weekly digest section failed");
    }
  }

  const durationMs = Date.now() - start;
  const summary = warnings.length > 0 ? warnings.join("; ") : reportType === "daily_ops" ? "Daily digest generated." : "All checks passed.";
  const aiAudit = details.ai_cost_audit as { mismatch_rate?: number } | undefined;
  const routeCov = details.route_coverage as { route_null_pct?: number } | undefined;
  const quality = details.quality_sentinel as { err429_rate_pct?: number } | undefined;
  const jobHealth = details.job_health as { stale_jobs?: string[] } | undefined;
  const seoHealth = details.seo_health as { indexed_page_count?: number } | undefined;
  const seoWinners = details.seo_winners as { count?: number; top_slugs?: string[] } | undefined;
  const dailyDigest = details.daily_digest as Record<string, unknown> | undefined;
  const weeklyDigestPayload = details.weekly_digest as Record<string, unknown> | undefined;

  const reportVersion = reportType === "daily_ops" ? "2" : "1";
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || null;
  const today = new Date().toISOString().slice(0, 10);
  const runKey = `${reportType}:${today}`;

  const row = {
    report_type: reportType,
    status,
    summary,
    details,
    duration_ms: durationMs,
    error: null,
    report_version: reportVersion,
    git_sha: gitSha,
    run_key: runKey,
  };

  let reportId: string | null = null;
  try {
    const { data: existing } = await admin.from("ops_reports").select("id").eq("run_key", runKey).maybeSingle();
    if (existing) {
      const { data: updated } = await admin.from("ops_reports").update(row).eq("id", (existing as { id: string }).id).select("id").single();
      if (updated) reportId = (updated as { id: string }).id;
    } else {
      const { data: inserted, error } = await admin.from("ops_reports").insert(row).select("id").single();
      if (!error && inserted) reportId = (inserted as { id: string }).id;
    }
  } catch (e) {
    console.error("[ops-report] Save failed:", e);
  }

  const adminUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mtgassistant.com";
  await postOpsReportToDiscord({
    status,
    reportType,
    adminUrl: `${adminUrl.replace(/\/$/, "")}/admin/ops`,
    aiMismatchRate: aiAudit?.mismatch_rate,
    rate429: quality?.err429_rate_pct,
    routeNullPct: routeCov?.route_null_pct,
    staleJobs: jobHealth?.stale_jobs,
    indexedPageCount: seoHealth?.indexed_page_count,
    seoWinnersCount: seoWinners?.count,
    seoWinnersSlugs: seoWinners?.top_slugs,
    errorSummary: status === "fail" ? summary : null,
    dailyDigest,
    weeklyDigest: weeklyDigestPayload,
  });

  return {
    ok: true,
    report_id: reportId,
    report_type: reportType,
    status,
    summary,
    duration_ms: durationMs,
    details,
  };
}
