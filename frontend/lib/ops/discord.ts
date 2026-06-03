/**
 * Post ops report summary to Discord webhook.
 * Env: DISCORD_WEBHOOK_URL, with fallback to the admin/app-sub alert hooks
 * Failure must not block report save.
 * Discord content limit: 2000 chars - we cap at 1900.
 */

const DISCORD_CONTENT_MAX = 1900;
const DISCORD_DAILY_MESSAGE_MAX = 3;
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

function pct(value: unknown): string {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

function splitDiscordMessages(lines: string[], maxMessages: number): string[] {
  const chunks: string[] = [];
  let current = "";
  let truncated = false;

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= DISCORD_CONTENT_MAX) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    current = line;
    if (chunks.length >= maxMessages - 1) {
      truncated = true;
      break;
    }
  }

  if (current && chunks.length < maxMessages) chunks.push(current);

  if (truncated && chunks.length === maxMessages) {
    const last = chunks[chunks.length - 1];
    chunks[chunks.length - 1] = last.length > DISCORD_CONTENT_MAX - 42
      ? `${last.slice(0, DISCORD_CONTENT_MAX - 42)}\n...more in admin/ops`
      : `${last}\n...more in admin/ops`;
  }

  return chunks;
}

function describeDailyDigest(digest: Record<string, unknown>, status: DiscordOpsPayload["status"]): string[] {
  const appSignups = num(digest, ["app", "users", "signups_24h"]);
  const websiteSignups = num(digest, ["website", "analytics", "signups_24h"]);
  const newProfiles = num(digest, ["shared", "users", "new_profiles_24h"]);
  const appEvents = num(digest, ["app", "analytics", "events_seen"]);
  const pageviews = num(digest, ["website", "analytics", "pageviews_24h"]);
  const firstVisits = num(digest, ["website", "analytics", "first_visits_24h"]);
  const appLlm = num(digest, ["app", "ai", "calls_24h"]);
  const websiteLlm = num(digest, ["website", "ai", "calls_24h"]);
  const openAi24h = num(digest, ["shared", "revenue", "openai_actual_24h_usd"]);
  const sentry = num(digest, ["shared", "reliability", "sentry_unresolved"]);
  const rateLimits = num(digest, ["shared", "reliability", "rate_limit_hits_24h"]);
  const errors = num(digest, ["shared", "reliability", "local_error_logs_24h"]);
  const critical = num(digest, ["counts", "critical_alerts"]);
  const warnings = num(digest, ["counts", "warning_alerts"]);

  const health = status === "fail"
    ? "Something needs urgent attention before you trust today's numbers."
    : status === "warn"
      ? "Mostly alive, but there are a few things worth checking."
      : "Quiet and healthy overall.";

  const acquisition = websiteSignups + appSignups > 0
    ? `${websiteSignups + appSignups} signup${websiteSignups + appSignups === 1 ? "" : "s"} landed: ${websiteSignups} website, ${appSignups} app.`
    : "No signups landed in this window.";

  const traffic = pageviews > 0 || firstVisits > 0
    ? `Website saw ${firstVisits} first visit${firstVisits === 1 ? "" : "s"} and ${pageviews} pageview${pageviews === 1 ? "" : "s"}.`
    : "Website pageview tracking was quiet, even though signup/visit counters may still have activity.";

  const appActivity = appEvents > 0
    ? `Mobile app generated ${appEvents} tracked event${appEvents === 1 ? "" : "s"}.`
    : "Mobile app activity was quiet.";

  const ai = appLlm + websiteLlm > 0
    ? `${appLlm + websiteLlm} LLM call${appLlm + websiteLlm === 1 ? "" : "s"} were logged: ${websiteLlm} website, ${appLlm} app. OpenAI actual spend for the rolling 24h was ${money(openAi24h)}.`
    : `No billable LLM calls were logged. OpenAI actual spend for the rolling 24h was ${money(openAi24h)}.`;

  const reliability = sentry || rateLimits || errors
    ? `Reliability watch: ${sentry} unresolved Sentry, ${errors} local error log${errors === 1 ? "" : "s"}, ${rateLimits} rate-limit hit${rateLimits === 1 ? "" : "s"}.`
    : "Reliability looks clean: no local errors, no rate-limit hits, no unresolved Sentry count increase in the headline.";

  return [
    `- ${health}`,
    `- ${acquisition} New profiles across all platforms: ${newProfiles}.`,
    `- ${traffic} ${appActivity}`,
    `- ${ai}`,
    `- ${reliability}`,
    `- Watch list count: ${critical} critical, ${warnings} warning.`,
  ];
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
    const tier1Jobs =
      (valueAtPath(digest, ["shared", "ops", "tier1_jobs"]) as Array<Record<string, unknown>> | undefined) || [];
    const notes = (valueAtPath(digest, ["notes"]) as Array<string> | undefined) || [];
    const apiKeyFilters = (valueAtPath(digest, ["shared", "revenue", "openai_actual_api_key_ids"]) as Array<string> | undefined) || [];
    const projectFilters = (valueAtPath(digest, ["shared", "revenue", "openai_actual_project_ids"]) as Array<string> | undefined) || [];

    lines.push(
      "",
      `**Window**`,
      `${text(digest, ["window", "london_range"])}`,
      "",
      `**Plain English**`,
      ...describeDailyDigest(digest, payload.status),
      "",
      `**App**`,
      `- Signups: ${num(digest, ["app", "users", "signups_24h"])} mobile app signup(s).`,
      `- Activity: ${num(digest, ["app", "analytics", "events_seen"])} event(s), ${num(digest, ["app", "analytics", "scanner_sessions_completed"])} completed scanner session(s), ${num(digest, ["app", "analytics", "tool_events_seen"])} tool event(s).`,
      `- AI: ${num(digest, ["app", "ai", "calls_24h"])} billable LLM call(s), ${pct(valueAtPath(digest, ["app", "ai", "error_rate_pct"]))} error rate, ${pct(valueAtPath(digest, ["app", "ai", "cache_hit_pct"]))} cache hit rate.`,
      `- Feedback: ${num(digest, ["app", "feedback", "app_feedback_events_24h"])} feedback event(s), ${num(digest, ["app", "feedback", "app_ai_reports_24h"])} AI report(s), ${num(digest, ["app", "feedback", "feedback_submit_failures_24h"])} submit failure(s).`,
      "",
      `**Website**`,
      `- Traffic: ${num(digest, ["website", "analytics", "first_visits_24h"])} first visit(s), ${num(digest, ["website", "analytics", "pageviews_24h"])} pageview(s), ${num(digest, ["website", "analytics", "logins_24h"])} login(s).`,
      `- Conversion: ${num(digest, ["website", "analytics", "signups_24h"])} signup(s), ${num(digest, ["website", "analytics", "pro_upgrade_starts_24h"])} Pro start(s), ${num(digest, ["website", "analytics", "pro_upgrade_completions_24h"])} Pro completion(s).`,
      `- AI: ${num(digest, ["website", "ai", "calls_24h"])} billable LLM call(s), ${pct(valueAtPath(digest, ["website", "ai", "error_rate_pct"]))} error rate, ${pct(valueAtPath(digest, ["website", "ai", "cache_hit_pct"]))} cache hit rate.`,
      `- Feedback: ${num(digest, ["website", "feedback", "generic_feedback_rows_24h"])} database row(s), ${num(digest, ["website", "analytics", "feedback_sent_24h"])} tracked sent event(s).`,
      "",
      `**Money + AI Cost**`,
      `- Stripe: ${num(digest, ["shared", "revenue", "stripe_subs"])} active subscription(s), ${num(digest, ["shared", "revenue", "stripe_webhooks_24h"])} webhook(s) in this window.`,
      `- OpenAI actual rolling 24h: ${money(valueAtPath(digest, ["shared", "revenue", "openai_actual_24h_usd"]))} from the OpenAI Costs API.`,
      `- OpenAI latest completed UTC day: ${money(valueAtPath(digest, ["shared", "revenue", "openai_actual_latest_day_usd"]))} on ${text(digest, ["shared", "revenue", "openai_actual_latest_day_date_utc"], "unavailable")}.`,
      `- OpenAI month to date: ${money(valueAtPath(digest, ["shared", "revenue", "openai_actual_mtd_usd"]))}.`,
    );
    if (apiKeyFilters.length > 0) lines.push(`- Cost filter: API key IDs ${apiKeyFilters.join(", ")}.`);
    if (projectFilters.length > 0) lines.push(`- Cost filter: project IDs ${projectFilters.join(", ")}.`);
    lines.push(
      "",
      `**Reliability**`,
      `- Sentry unresolved: ${num(digest, ["shared", "reliability", "sentry_unresolved"])} (${text(digest, ["shared", "reliability", "sentry_status"], "unknown")}).`,
      `- Local error logs: ${num(digest, ["shared", "reliability", "local_error_logs_24h"])}.`,
      `- Rate limits: ${num(digest, ["shared", "reliability", "rate_limit_hits_24h"])} hit(s) across ${num(digest, ["shared", "reliability", "rate_limit_rows_24h"])} row(s).`,
      `- Admin audit rows: ${num(digest, ["shared", "reliability", "admin_audit_rows_24h"])}.`,
    );

    if (tier1Jobs.length > 0) {
      lines.push("", `**Tier-1 Hourly Jobs**`);
      for (const job of tier1Jobs.slice(0, 4)) {
        lines.push(`- ${String(job.job || "Job")}: ${String(job.status || "unknown")} (${String(job.last_seen || "unknown")})`);
      }
    }
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
    if (notes.length > 0) {
      lines.push("", `**Notes / ELI5**`);
      for (const note of notes.slice(0, 4)) {
        lines.push(`- ${note}`);
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

  const contents = payload.reportType === "daily_ops" && payload.dailyDigest
    ? splitDiscordMessages(lines.filter((line) => line != null) as string[], DISCORD_DAILY_MESSAGE_MAX)
    : [lines.join("\n")];

  if (contents.length === 1 && contents[0].length > DISCORD_CONTENT_MAX) {
    contents[0] = `${contents[0].slice(0, DISCORD_CONTENT_MAX - 3)}...`;
  }

  try {
    for (const content of contents) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        console.warn("[discord] Webhook failed:", res.status, await res.text());
      }
    }
  } catch (error) {
    console.warn("[discord] Post failed:", error);
  }
}
