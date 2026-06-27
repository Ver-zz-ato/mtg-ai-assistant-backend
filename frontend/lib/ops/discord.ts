/**
 * Post ops report summary to Discord webhook.
 * Daily/weekly digests go to #daily-digest (DISCORD_WEBHOOK_URL).
 * Hourly launch alerts use DISCORD_ADMIN_ALERT_WEBHOOK separately (mobile-command-center).
 * Failure must not block report save.
 * Discord content limit: 2000 chars - we cap at 1900.
 */

const DISCORD_CONTENT_MAX = 1900;
const STALE_JOBS_CAP = 3;
const SEO_SLUGS_CAP = 5;
const ERROR_TRUNCATE = 200;

export type DiscordOpsPayload = {
  status: "ok" | "warn" | "fail";
  reportType: string;
  adminUrl?: string;
  aiMismatchRate?: number;
  rate429?: number;
  routeNullPct?: number;
  staleJobs?: string[];
  indexedPageCount?: number;
  seoWinnersCount?: number;
  seoWinnersSlugs?: string[];
  errorSummary?: string | null;
  dailyDigest?: Record<string, unknown>;
  weeklyDigest?: Record<string, unknown>;
};

function valueAtPath(root: Record<string, unknown> | undefined, path: string[]): unknown {
  let current: unknown = root;
  for (const part of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function num(root: Record<string, unknown>, path: string[]): number {
  return Number(valueAtPath(root, path) ?? 0) || 0;
}

function text(root: Record<string, unknown>, path: string[], fallback = ""): string {
  const value = valueAtPath(root, path);
  return value == null || value === "" ? fallback : String(value);
}

function money(value: unknown, digits = 2): string {
  return `$${(Number(value) || 0).toFixed(digits)}`;
}

function pct(value: number): string {
  return `${value.toFixed(value > 0 && value < 1 ? 2 : 1)}%`;
}

function word(count: number, base: string, pluralForm?: string): string {
  return count === 1 ? base : (pluralForm ?? `${base}s`);
}

function dailyMood(status: DiscordOpsPayload["status"]): string {
  if (status === "fail") return "Needs attention today.";
  if (status === "warn") return "Mostly fine — worth a quick look.";
  return "Quiet and healthy.";
}

function collectJobWatchlist(
  digest: Record<string, unknown>,
  staleJobs: string[] | undefined,
): string[] {
  const watch: string[] = [];
  for (const section of ["tier1_jobs", "pipeline_jobs", "discover_jobs"] as const) {
    const jobs = (valueAtPath(digest, ["shared", "ops", section]) as Array<Record<string, unknown>> | undefined) || [];
    for (const job of jobs) {
      const status = String(job.status || "").toLowerCase();
      if (status === "working" || status === "ok") continue;
      watch.push(`${String(job.job || "job")} (${String(job.last_seen || status)})`);
    }
  }
  if (staleJobs?.length) {
    watch.push(...staleJobs.slice(0, STALE_JOBS_CAP).map((job) => `${job} stale`));
  }
  return watch;
}

/** Compact daily digest: App / Website / Summary blocks. */
export function buildCompactDailyOpsLines(
  digest: Record<string, unknown>,
  status: DiscordOpsPayload["status"],
  options: { staleJobs?: string[] } = {},
): string[] {
  const appSignups = num(digest, ["app", "users", "signups_24h"]);
  const websiteSignups = num(digest, ["website", "analytics", "signups_24h"]);
  const totalSignups = appSignups + websiteSignups;
  const newProfiles = num(digest, ["shared", "users", "new_profiles_24h"]);
  const appUsers = num(digest, ["app", "analytics", "unique_users_24h"]);
  const scanSessions = num(digest, ["app", "analytics", "scanner_sessions_completed"]);
  const websiteVisitors =
    num(digest, ["website", "analytics", "unique_visitors_24h"]) ||
    num(digest, ["website", "analytics", "first_visits_24h"]);
  const firstVisits = num(digest, ["website", "analytics", "first_visits_24h"]);
  const pageviews = num(digest, ["website", "analytics", "pageviews_24h"]);
  const proCompletes = num(digest, ["website", "analytics", "pro_upgrade_completions_24h"]);
  const appLlm = num(digest, ["app", "ai", "calls_24h"]);
  const websiteLlm = num(digest, ["website", "ai", "calls_24h"]);
  const totalLlm = appLlm + websiteLlm;
  const appAiCost = num(digest, ["app", "ai", "cost_usd_24h"]);
  const websiteAiCost = num(digest, ["website", "ai", "cost_usd_24h"]);
  const appAiErrorRate = num(digest, ["app", "ai", "error_rate_pct"]);
  const websiteAiErrorRate = num(digest, ["website", "ai", "error_rate_pct"]);
  const openAi24h = num(digest, ["shared", "revenue", "openai_actual_24h_usd"]);
  const openAiMtd = num(digest, ["shared", "revenue", "openai_actual_mtd_usd"]);
  const stripeSubs = num(digest, ["shared", "revenue", "stripe_subs"]);
  const appSubs = num(digest, ["shared", "revenue", "app_subs"]);
  const sentry = num(digest, ["shared", "reliability", "sentry_unresolved"]);
  const rateLimitEvents =
    num(digest, ["shared", "reliability", "rate_limit_hit_rows_24h"]) ||
    num(digest, ["shared", "reliability", "rate_limit_hits_24h"]);
  const topRateLimitRoute = text(digest, ["shared", "reliability", "top_rate_limit_route_24h"]);
  const topRateLimitRouteHits = num(digest, ["shared", "reliability", "top_rate_limit_route_hits_24h"]);
  const revenueCatGrants = num(digest, ["app", "revenue", "revenuecat_grants_24h"]);
  const critical = num(digest, ["counts", "critical_alerts"]);
  const warnings = num(digest, ["counts", "warning_alerts"]);

  const emoji = status === "ok" ? "OK" : status === "warn" ? "WARN" : "FAIL";
  const totalVisitors = num(digest, ["shared", "summary", "visitors_24h"]) || appUsers + websiteVisitors;

  const lines: string[] = [
    `${emoji} **Daily Ops** - ${text(digest, ["window", "london_range"], "last 24h")}`,
    dailyMood(status),
    "",
    `**App** - ${appUsers} ${word(appUsers, "visitor")} - ${appSignups} ${word(appSignups, "signup")} - ${scanSessions} scanner ${word(scanSessions, "session")} - ${appLlm} AI ${word(appLlm, "call")} - ${money(appAiCost)} AI cost`,
    `**Website** - ${websiteVisitors} ${word(websiteVisitors, "visitor")} - ${websiteSignups} ${word(websiteSignups, "signup")} - ${websiteLlm} AI ${word(websiteLlm, "call")} - ${money(websiteAiCost)} AI cost - ${pageviews} page ${word(pageviews, "load")}${firstVisits && firstVisits !== websiteVisitors ? ` - ${firstVisits} new ${word(firstVisits, "visitor")}` : ""}`,
    `**Summary** - ${totalVisitors} ${word(totalVisitors, "visitor")} - ${totalSignups} ${word(totalSignups, "signup")} - ${totalLlm} AI ${word(totalLlm, "call")} - ${money(openAi24h)} OpenAI actual (24h, ${money(openAiMtd)} MTD) - ${stripeSubs} Stripe subs - ${appSubs} app subs - ${sentry} active Sentry - ${rateLimitEvents} rate-limit ${word(rateLimitEvents, "hit")}`,
  ];

  if (newProfiles !== totalSignups) {
    lines.push(`_DB account rows: ${newProfiles}; signup events: ${totalSignups}. Small gaps are normal._`);
  }

  const aiErrorParts = [
    appAiErrorRate > 0 ? `App ${pct(appAiErrorRate)}` : null,
    websiteAiErrorRate > 0 ? `Website ${pct(websiteAiErrorRate)}` : null,
  ].filter(Boolean);
  if (aiErrorParts.length > 0) {
    lines.push(`AI error rate: ${aiErrorParts.join(" - ")}`);
  }

  if (proCompletes > 0 || revenueCatGrants > 0) {
    lines.push(`New Pro events: ${proCompletes} website - ${revenueCatGrants} app`);
  }

  if (rateLimitEvents > 0 && topRateLimitRoute) {
    lines.push(`Top rate-limited route: ${topRateLimitRoute} (${topRateLimitRouteHits || rateLimitEvents})`);
  }

  if (critical > 0 || warnings > 0) {
    lines.push(`Alerts: ${critical} critical - ${warnings} warning`);
  }

  const jobWatch = collectJobWatchlist(digest, options.staleJobs);
  if (jobWatch.length > 0) {
    lines.push(`Jobs to check: ${jobWatch.slice(0, 4).join(" - ")}`);
  }

  const topAlerts = (valueAtPath(digest, ["top_alerts"]) as Array<Record<string, unknown>> | undefined) || [];
  if (topAlerts.length > 0) {
    const first = topAlerts[0];
    lines.push(`Top alert: [${String(first.severity || "info")}] ${String(first.title || "Alert")}`);
  }

  return lines;
}

function getDiscordDailyDigestWebhook(): string {
  return (
    process.env.DISCORD_DAILY_OPS_WEBHOOK ||
    process.env.DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_ADMIN_ALERT_WEBHOOK ||
    process.env.DISCORD_APPSUB_WEBHOOK ||
    process.env.DISCORD_APP_SUBS_WEBHOOK ||
    ""
  ).trim();
}

export async function postOpsReportToDiscord(payload: DiscordOpsPayload): Promise<void> {
  const url =
    payload.reportType === "daily_ops" || payload.reportType === "weekly_ops"
      ? getDiscordDailyDigestWebhook()
      : (
        process.env.DISCORD_WEBHOOK_URL ||
        process.env.DISCORD_ADMIN_ALERT_WEBHOOK ||
        process.env.DISCORD_APPSUB_WEBHOOK ||
        process.env.DISCORD_APP_SUBS_WEBHOOK ||
        ""
      ).trim();
  if (!url) return;

  const lines: string[] = [];

  if (payload.reportType === "daily_ops" && payload.dailyDigest) {
    lines.push(...buildCompactDailyOpsLines(payload.dailyDigest, payload.status, {
      staleJobs: payload.staleJobs,
    }));
  } else if (payload.reportType === "weekly_ops" && payload.weeklyDigest) {
    const digest = payload.weeklyDigest;
    const topAlerts = (valueAtPath(digest, ["top_alerts"]) as Array<Record<string, unknown>> | undefined) || [];
    const weeklyJobs = (valueAtPath(digest, ["weekly_jobs"]) as Array<Record<string, unknown>> | undefined) || [];
    const discoverJobs =
      (valueAtPath(digest, ["shared", "ops", "discover_jobs"]) as Array<Record<string, unknown>> | undefined) || [];
    const pipelineJobs =
      (valueAtPath(digest, ["shared", "ops", "pipeline_jobs"]) as Array<Record<string, unknown>> | undefined) || [];

    lines.push(
      `${payload.status === "ok" ? "OK" : payload.status === "warn" ? "WARN" : "FAIL"} **Ops Report** (${payload.reportType})`,
      "",
      `**Last 7d**`,
      `${String(valueAtPath(digest, ["window", "london_range"]) || "")}`,
      "",
      `**App**`,
      `- App signups (mobile): ${valueAtPath(digest, ["app", "users", "signups_7d"]) ?? 0}`,
      `- LLM calls: ${valueAtPath(digest, ["app", "ai", "calls_7d"]) ?? 0}`,
      `- App events: ${valueAtPath(digest, ["app", "analytics", "events_seen_7d"]) ?? 0}`,
      `- Scanner sessions: ${valueAtPath(digest, ["app", "analytics", "scanner_sessions_completed_7d"]) ?? 0}`,
      `- Tool events: ${valueAtPath(digest, ["app", "analytics", "tool_events_seen_7d"]) ?? 0}`,
      "",
      `**Website**`,
      `- Pageviews: ${valueAtPath(digest, ["website", "analytics", "pageviews_7d"]) ?? 0}`,
      `- First visits: ${valueAtPath(digest, ["website", "analytics", "first_visits_7d"]) ?? 0}`,
      `- Website signups: ${valueAtPath(digest, ["website", "analytics", "signups_7d"]) ?? 0}`,
      `- LLM calls: ${valueAtPath(digest, ["website", "ai", "calls_7d"]) ?? 0}`,
      `- Website feedback rows: ${valueAtPath(digest, ["website", "feedback", "generic_feedback_rows_7d"]) ?? 0}`,
      "",
      `**Revenue & Reliability**`,
      `- New profiles (all platforms): ${valueAtPath(digest, ["shared", "users", "new_profiles_7d"]) ?? 0}`,
      `- Stripe subs: ${valueAtPath(digest, ["shared", "revenue", "stripe_subs"]) ?? 0}`,
      `- Stripe webhooks: ${valueAtPath(digest, ["shared", "revenue", "stripe_webhooks_7d"]) ?? 0}`,
      `- OpenAI actual (Costs API, 7d): $${Number(valueAtPath(digest, ["shared", "revenue", "openai_actual_7d_usd"]) ?? 0).toFixed(2)}`,
      `- OpenAI MTD actual (Costs API): $${Number(valueAtPath(digest, ["shared", "revenue", "openai_actual_mtd_usd"]) ?? 0).toFixed(2)}`,
      `- Sentry unresolved: ${valueAtPath(digest, ["shared", "reliability", "sentry_unresolved"]) ?? 0}`,
      `- Rate-limit hits: ${valueAtPath(digest, ["shared", "reliability", "rate_limit_hits_7d"]) ?? 0}`,
      `- Error logs: ${valueAtPath(digest, ["shared", "reliability", "local_error_logs_7d"]) ?? 0}`,
    );

    if (weeklyJobs.length > 0) {
      lines.push("", `**Weekly pipeline jobs**`);
      for (const job of weeklyJobs.slice(0, 4)) {
        lines.push(`- ${String(job.job || "Job")}: ${String(job.status || "unknown")} (${String(job.last_seen || "unknown")})`);
      }
    }
    if (pipelineJobs.length > 0) {
      lines.push("", `**Pipeline jobs**`);
      for (const job of pipelineJobs.slice(0, 3)) {
        lines.push(`- ${String(job.job || "Job")}: ${String(job.status || "unknown")} (${String(job.last_seen || "unknown")})`);
      }
    }
    if (discoverJobs.length > 0) {
      lines.push("", `**Discover jobs**`);
      for (const job of discoverJobs.slice(0, 3)) {
        lines.push(`- ${String(job.job || "Job")}: ${String(job.status || "unknown")} (${String(job.last_seen || "unknown")})`);
      }
    }
    if (topAlerts.length > 0) {
      lines.push("", `**Watch list**`);
      for (const alert of topAlerts.slice(0, 4)) {
        lines.push(`- [${String(alert.severity || "info")}] ${String(alert.title || "Alert")}: ${String(alert.detail || "")}`);
      }
    }
  } else {
    lines.push(
      `${payload.status === "ok" ? "OK" : payload.status === "warn" ? "WARN" : "FAIL"} **Ops Report** (${payload.reportType})`,
      "",
      `- AI cost mismatch: ${(payload.aiMismatchRate ?? 0).toFixed(1)}%`,
      `- 429 rate: ${payload.rate429 ?? "-"}`,
      `- Route null: ${(payload.routeNullPct ?? 0).toFixed(1)}%`,
    );
  }

  if (payload.reportType !== "daily_ops" && payload.staleJobs && payload.staleJobs.length > 0) {
    lines.push(`- Stale jobs: ${payload.staleJobs.slice(0, STALE_JOBS_CAP).join(", ")}`);
  }
  if (payload.indexedPageCount != null && payload.reportType !== "daily_ops") {
    lines.push(`- Indexed pages: ${payload.indexedPageCount}`);
  }
  if (payload.seoWinnersCount != null && payload.seoWinnersCount > 0 && payload.reportType !== "daily_ops") {
    lines.push(`- SEO winners (noindex w/ impressions): ${payload.seoWinnersCount}`);
    if (payload.seoWinnersSlugs && payload.seoWinnersSlugs.length > 0) {
      lines.push(`  Top: ${payload.seoWinnersSlugs.slice(0, SEO_SLUGS_CAP).join(", ")}`);
    }
  }
  if (payload.status === "fail" && payload.errorSummary) {
    const truncated = payload.errorSummary.length > ERROR_TRUNCATE
      ? `${payload.errorSummary.slice(0, ERROR_TRUNCATE)}...`
      : payload.errorSummary;
    lines.push(`- Error: ${truncated}`);
  }
  if (payload.adminUrl) {
    lines.push("", `Details: [admin/ops](${payload.adminUrl})`);
  }

  let content = lines.join("\n");
  if (content.length > DISCORD_CONTENT_MAX) {
    content = `${content.slice(0, DISCORD_CONTENT_MAX - 3)}...`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      console.warn("[discord] Webhook failed:", res.status, await res.text());
    }
  } catch (error) {
    console.warn("[discord] Post failed:", error);
  }
}
