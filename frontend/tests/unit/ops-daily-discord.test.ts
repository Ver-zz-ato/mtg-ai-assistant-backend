import assert from "node:assert/strict";
import { buildCompactDailyOpsLines } from "@/lib/ops/discord";
import { websitePageviewCountFromEventCounts } from "@/lib/ops/run-ops-report";

async function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const prior = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    prior.set(key, process.env[key]);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of prior.entries()) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function testDailyOpsUsesDailyDigestWebhook() {
  await withEnv(
    {
      DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/daily-digest",
      DISCORD_ADMIN_ALERT_WEBHOOK: "https://discord.com/api/webhooks/app-launch-alerts",
      DISCORD_DAILY_OPS_WEBHOOK: undefined,
      DISCORD_APPSUB_WEBHOOK: undefined,
      DISCORD_APP_SUBS_WEBHOOK: undefined,
    },
    async () => {
      const seen: { url?: string } = {};
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        seen.url = String(input);
        return new Response("{}", { status: 200 });
      }) as typeof fetch;

      try {
        const { postOpsReportToDiscord } = await import("@/lib/ops/discord");
        await postOpsReportToDiscord({
          status: "ok",
          reportType: "daily_ops",
          dailyDigest: {
            window: { london_range: "test window" },
            app: { users: { signups_24h: 0 }, analytics: { events_seen: 0 }, ai: { calls_24h: 0 } },
            website: {
              analytics: {
                first_visits_24h: 0,
                pageviews_24h: 0,
                signups_24h: 0,
                logins_24h: 0,
                pro_upgrade_starts_24h: 0,
                pro_upgrade_completions_24h: 0,
              },
              ai: { calls_24h: 0 },
            },
            shared: {
              users: { new_profiles_24h: 0 },
              revenue: { openai_actual_24h_usd: 0, openai_actual_mtd_usd: 0, stripe_subs: 0, app_subs: 0 },
              reliability: { sentry_unresolved: 0, rate_limit_hits_24h: 0, rate_limit_hit_rows_24h: 0 },
            },
            counts: { critical_alerts: 0, warning_alerts: 0 },
          },
        });
        assert.equal(seen.url, "https://discord.com/api/webhooks/daily-digest");
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
}

function testWebsitePageviewCountCombinesServerAndClient() {
  const counts = new Map<string, number>([
    ["pageview_server", 1769],
    ["$pageview", 0],
  ]);
  assert.equal(websitePageviewCountFromEventCounts(counts), 1769);

  counts.set("$pageview", 42);
  assert.equal(websitePageviewCountFromEventCounts(counts), 1811);
}

function testCompactDailyOpsLinesShape() {
  const lines = buildCompactDailyOpsLines(
    {
      window: { london_range: "10 Jun 2026, 23:30 -> 11 Jun 2026, 23:30 Europe/London" },
      app: {
        users: { signups_24h: 0 },
        analytics: { events_seen: 3025, unique_users_24h: 5, scanner_sessions_completed: 100 },
        ai: { calls_24h: 0, cost_usd_24h: 0.12, error_rate_pct: 1.2 },
        revenue: { revenuecat_grants_24h: 2 },
      },
      website: {
        analytics: {
          unique_visitors_24h: 1811,
          first_visits_24h: 1769,
          pageviews_24h: 3200,
          signups_24h: 22,
          logins_24h: 47,
          pro_upgrade_starts_24h: 2,
          pro_upgrade_completions_24h: 1,
        },
        ai: { calls_24h: 909, cost_usd_24h: 0.56, error_rate_pct: 0.4 },
      },
      shared: {
        users: { new_profiles_24h: 27 },
        revenue: { openai_actual_24h_usd: 0.68, openai_actual_mtd_usd: 2.73, stripe_subs: 41, app_subs: 7 },
        reliability: {
          sentry_unresolved: 3,
          rate_limit_hits_24h: 4,
          rate_limit_hit_rows_24h: 14,
          top_rate_limit_route_24h: "/api/deck/analyze",
          top_rate_limit_route_hits_24h: 8,
        },
        summary: { visitors_24h: 1816, signups_24h: 22, ai_calls_24h: 909 },
      },
      counts: { critical_alerts: 0, warning_alerts: 0 },
    },
    "warn",
    { staleJobs: ["bulk_scryfall"] },
  );

  assert.ok(lines[0].includes("Daily Ops"));
  assert.ok(lines.some((line) => line.startsWith("**App**")));
  assert.ok(lines.some((line) => line.startsWith("**Website**")));
  assert.ok(lines.some((line) => line.startsWith("**Summary**")));
  assert.ok(lines.some((line) => line.includes("3200 page load")));
  assert.ok(lines.some((line) => line.includes("5 visitors")));
  assert.ok(lines.some((line) => line.includes("100 scanner sessions")));
  assert.ok(lines.some((line) => line.includes("$0.68 OpenAI actual")));
  assert.ok(lines.some((line) => line.includes("7 app subs")));
  assert.ok(lines.some((line) => line.includes("AI error rate: App 1.2% - Website 0.40%")));
  assert.ok(lines.some((line) => line.includes("New Pro events: 1 website - 2 app")));
  assert.ok(lines.some((line) => line.includes("Top rate-limited route: /api/deck/analyze (8)")));
  assert.ok(lines.some((line) => line.includes("bulk_scryfall stale")));
  assert.ok(lines.some((line) => line.includes("DB account rows")));
}

async function main() {
  testWebsitePageviewCountCombinesServerAndClient();
  testCompactDailyOpsLinesShape();
  await testDailyOpsUsesDailyDigestWebhook();
  console.log("ops-daily-discord.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
