/**
 * Post ops report summary to Discord webhook.
 * Env: DISCORD_WEBHOOK_URL, with fallback to the admin/app-sub alert hooks
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

export async function postOpsReportToDiscord(payload: DiscordOpsPayload): Promise<void> {
  const url =
    process.env.DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_ADMIN_ALERT_WEBHOOK ||
    process.env.DISCORD_APPSUB_WEBHOOK ||
    process.env.DISCORD_APP_SUBS_WEBHOOK ||
    "";
  if (!url) return;

  const emoji = payload.status === "ok" ? "OK" : payload.status === "warn" ? "WARN" : "FAIL";
  const lines: string[] = [`${emoji} **Ops Report** (${payload.reportType})`];

  if (payload.reportType === "daily_ops" && payload.dailyDigest) {
    const digest = payload.dailyDigest;
    const topAlerts = (valueAtPath(digest, ["top_alerts"]) as Array<Record<string, unknown>> | undefined) || [];
    const discoverJobs =
      (valueAtPath(digest, ["shared", "ops", "discover_jobs"]) as Array<Record<string, unknown>> | undefined) || [];
    const pipelineJobs =
      (valueAtPath(digest, ["shared", "ops", "pipeline_jobs"]) as Array<Record<string, unknown>> | undefined) || [];

    lines.push(
      "",
      `**Last 24h**`,
      `${String(valueAtPath(digest, ["window", "london_range"]) || "")}`,
      "",
      `**App**`,
      `- App signups (mobile): ${valueAtPath(digest, ["app", "users", "signups_24h"]) ?? 0}`,
      `- LLM calls: ${valueAtPath(digest, ["app", "ai", "calls_24h"]) ?? 0}`,
      `- Estimated route cost: $${Number(valueAtPath(digest, ["app", "ai", "cost_usd_24h"]) ?? 0).toFixed(2)}`,
      `- App events: ${valueAtPath(digest, ["app", "analytics", "events_seen"]) ?? 0}`,
      `- Scanner sessions: ${valueAtPath(digest, ["app", "analytics", "scanner_sessions_completed"]) ?? 0}`,
      `- Tool events: ${valueAtPath(digest, ["app", "analytics", "tool_events_seen"]) ?? 0}`,
      "",
      `**Website**`,
      `- Pageviews: ${valueAtPath(digest, ["website", "analytics", "pageviews_24h"]) ?? 0}`,
      `- First visits: ${valueAtPath(digest, ["website", "analytics", "first_visits_24h"]) ?? 0}`,
      `- Website signups: ${valueAtPath(digest, ["website", "analytics", "signups_24h"]) ?? 0}`,
      `- LLM calls: ${valueAtPath(digest, ["website", "ai", "calls_24h"]) ?? 0}`,
      `- Estimated route cost: $${Number(valueAtPath(digest, ["website", "ai", "cost_usd_24h"]) ?? 0).toFixed(2)}`,
      `- Website feedback rows: ${valueAtPath(digest, ["website", "feedback", "generic_feedback_rows_24h"]) ?? 0}`,
      "",
      `**Revenue & Reliability**`,
      `- New profiles (all platforms): ${valueAtPath(digest, ["shared", "users", "new_profiles_24h"]) ?? 0}`,
      `- Stripe subs: ${valueAtPath(digest, ["shared", "revenue", "stripe_subs"]) ?? 0}`,
      `- OpenAI actual (last 24h): $${Number(valueAtPath(digest, ["shared", "revenue", "openai_actual_24h_usd"]) ?? 0).toFixed(2)}`,
      `- Latest completed UTC day: $${Number(valueAtPath(digest, ["shared", "revenue", "openai_actual_latest_day_usd"]) ?? 0).toFixed(2)} on ${String(valueAtPath(digest, ["shared", "revenue", "openai_actual_latest_day_date_utc"]) || "latest UTC day unavailable")} UTC`,
      `- OpenAI MTD actual: $${Number(valueAtPath(digest, ["shared", "revenue", "openai_actual_mtd_usd"]) ?? 0).toFixed(2)}`,
      `- Sentry unresolved: ${valueAtPath(digest, ["shared", "reliability", "sentry_unresolved"]) ?? 0}`,
      `- Rate-limit hits: ${valueAtPath(digest, ["shared", "reliability", "rate_limit_hits_24h"]) ?? 0}`,
      `- Error logs: ${valueAtPath(digest, ["shared", "reliability", "local_error_logs_24h"]) ?? 0}`,
    );

    if (pipelineJobs.length > 0) {
      lines.push("", `**Pipeline jobs**`);
      for (const job of pipelineJobs.slice(0, 4)) {
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
  } else if (payload.reportType === "weekly_ops" && payload.weeklyDigest) {
    const digest = payload.weeklyDigest;
    const topAlerts = (valueAtPath(digest, ["top_alerts"]) as Array<Record<string, unknown>> | undefined) || [];
    const weeklyJobs = (valueAtPath(digest, ["weekly_jobs"]) as Array<Record<string, unknown>> | undefined) || [];
    const discoverJobs =
      (valueAtPath(digest, ["shared", "ops", "discover_jobs"]) as Array<Record<string, unknown>> | undefined) || [];
    const pipelineJobs =
      (valueAtPath(digest, ["shared", "ops", "pipeline_jobs"]) as Array<Record<string, unknown>> | undefined) || [];

    lines.push(
      "",
      `**Last 7d**`,
      `${String(valueAtPath(digest, ["window", "london_range"]) || "")}`,
      "",
      `**App**`,
      `- App signups (mobile): ${valueAtPath(digest, ["app", "users", "signups_7d"]) ?? 0}`,
      `- LLM calls: ${valueAtPath(digest, ["app", "ai", "calls_7d"]) ?? 0}`,
      `- Estimated route cost: $${Number(valueAtPath(digest, ["app", "ai", "cost_usd_7d"]) ?? 0).toFixed(2)}`,
      `- App events: ${valueAtPath(digest, ["app", "analytics", "events_seen_7d"]) ?? 0}`,
      `- Scanner sessions: ${valueAtPath(digest, ["app", "analytics", "scanner_sessions_completed_7d"]) ?? 0}`,
      `- Tool events: ${valueAtPath(digest, ["app", "analytics", "tool_events_seen_7d"]) ?? 0}`,
      "",
      `**Website**`,
      `- Pageviews: ${valueAtPath(digest, ["website", "analytics", "pageviews_7d"]) ?? 0}`,
      `- First visits: ${valueAtPath(digest, ["website", "analytics", "first_visits_7d"]) ?? 0}`,
      `- Website signups: ${valueAtPath(digest, ["website", "analytics", "signups_7d"]) ?? 0}`,
      `- LLM calls: ${valueAtPath(digest, ["website", "ai", "calls_7d"]) ?? 0}`,
      `- Estimated route cost: $${Number(valueAtPath(digest, ["website", "ai", "cost_usd_7d"]) ?? 0).toFixed(2)}`,
      `- Website feedback rows: ${valueAtPath(digest, ["website", "feedback", "generic_feedback_rows_7d"]) ?? 0}`,
      "",
      `**Revenue & Reliability**`,
      `- New profiles (all platforms): ${valueAtPath(digest, ["shared", "users", "new_profiles_7d"]) ?? 0}`,
      `- Stripe subs: ${valueAtPath(digest, ["shared", "revenue", "stripe_subs"]) ?? 0}`,
      `- Stripe webhooks: ${valueAtPath(digest, ["shared", "revenue", "stripe_webhooks_7d"]) ?? 0}`,
      `- OpenAI actual 7d: $${Number(valueAtPath(digest, ["shared", "revenue", "openai_actual_7d_usd"]) ?? 0).toFixed(2)}`,
      `- OpenAI MTD actual: $${Number(valueAtPath(digest, ["shared", "revenue", "openai_actual_mtd_usd"]) ?? 0).toFixed(2)}`,
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
      "",
      `- AI cost mismatch: ${(payload.aiMismatchRate ?? 0).toFixed(1)}%`,
      `- 429 rate: ${payload.rate429 ?? "-"}`,
      `- Route null: ${(payload.routeNullPct ?? 0).toFixed(1)}%`,
    );
  }

  if (payload.staleJobs && payload.staleJobs.length > 0) {
    lines.push(`- Stale jobs: ${payload.staleJobs.slice(0, STALE_JOBS_CAP).join(", ")}`);
  }
  if (payload.indexedPageCount != null) {
    lines.push(`- Indexed pages: ${payload.indexedPageCount}`);
  }
  if (payload.seoWinnersCount != null && payload.seoWinnersCount > 0) {
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
    lines.push("", `View in [admin/ops](${payload.adminUrl})`);
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
