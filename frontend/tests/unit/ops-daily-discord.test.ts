import assert from "node:assert/strict";
import { buildCompactDailyOpsLines } from "@/lib/ops/discord";
import { websitePageviewCountFromEventCounts } from "@/lib/ops/run-ops-report";

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
        analytics: { events_seen: 476 },
        ai: { calls_24h: 1 },
      },
      website: {
        analytics: {
          first_visits_24h: 1769,
          pageviews_24h: 3200,
          signups_24h: 22,
          logins_24h: 47,
          pro_upgrade_starts_24h: 2,
          pro_upgrade_completions_24h: 1,
        },
        ai: { calls_24h: 909 },
      },
      shared: {
        users: { new_profiles_24h: 27 },
        revenue: { openai_actual_24h_usd: 0, openai_actual_mtd_usd: 2.73, stripe_subs: 41 },
        reliability: { sentry_unresolved: 3, rate_limit_hits_24h: 14 },
      },
      counts: { critical_alerts: 0, warning_alerts: 0 },
    },
    "warn",
    { staleJobs: ["bulk_scryfall"] },
  );

  assert.ok(lines[0].includes("Daily Ops"));
  assert.ok(lines.some((line) => line.startsWith("**App**")));
  assert.ok(lines.some((line) => line.startsWith("**Website**")));
  assert.ok(lines.some((line) => line.startsWith("**Total**")));
  assert.ok(lines.some((line) => line.includes("3200 page load")));
  assert.ok(lines.some((line) => line.includes("bulk_scryfall stale")));
  assert.ok(lines.some((line) => line.includes("Accounts = database rows")));
}

testWebsitePageviewCountCombinesServerAndClient();
testCompactDailyOpsLinesShape();
console.log("ops-daily-discord.test.ts: ok");
