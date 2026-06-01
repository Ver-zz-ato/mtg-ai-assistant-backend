import assert from "node:assert";
import {
  maskEmail,
  maskUserRef,
  parseBoundedIntParam,
  parseDaysParam,
  parseHoursParam,
  severityForThreshold,
  shouldCountForDailyDigestStatus,
  shouldCreateLaunchAlert,
  shouldSendDiscordAlert,
  shouldSendHourlyDiscordAlert,
} from "@/lib/admin/mobile-command-center";

assert.strictEqual(parseDaysParam(null, 7), 7);
assert.strictEqual(parseDaysParam("0", 7), 1);
assert.strictEqual(parseDaysParam("999", 7), 90);
assert.strictEqual(parseDaysParam("14", 7), 14);

assert.strictEqual(parseHoursParam("0", 24), 1);
assert.strictEqual(parseHoursParam("500", 24), 168);
assert.strictEqual(parseBoundedIntParam("abc", 5, 1, 10), 5);

assert.strictEqual(maskUserRef(""), "(unknown)");
assert.strictEqual(maskUserRef("(guest)"), "(guest)");
assert.strictEqual(maskUserRef("12345678-1234-1234-1234-123456789abc"), "12345678...9abc");
assert.strictEqual(maskEmail("davy@example.com"), "d***@example.com");

assert.strictEqual(severityForThreshold(0.02, 0.03, 0.1), "ok");
assert.strictEqual(severityForThreshold(0.03, 0.03, 0.1), "warn");
assert.strictEqual(severityForThreshold(0.1, 0.03, 0.1), "critical");
assert.strictEqual(
  shouldCreateLaunchAlert({ key: "requests", label: "App AI requests", value: 0, severity: "info" }),
  false,
);
assert.strictEqual(
  shouldCreateLaunchAlert({ key: "sentry", label: "Sentry", value: "failing", severity: "warn" }),
  true,
);
assert.strictEqual(
  shouldSendHourlyDiscordAlert({ key: "sentry", title: "Sentry", detail: "failing", severity: "warn", source: "overview" }),
  false,
);
assert.strictEqual(
  shouldSendHourlyDiscordAlert({ key: "sentry_unresolved", title: "Sentry unresolved", detail: "20 issues", severity: "critical", source: "overview" }),
  true,
);
assert.strictEqual(
  shouldSendHourlyDiscordAlert({ key: "tier1_pipeline_jobs", title: "Daily price jobs", detail: "mostly okay", severity: "warn", source: "overview" }),
  true,
);
assert.strictEqual(
  shouldSendHourlyDiscordAlert({ key: "important_jobs", title: "Pipeline jobs", detail: "mostly okay", severity: "warn", source: "overview" }),
  false,
);
assert.strictEqual(
  shouldCountForDailyDigestStatus({ key: "important_jobs", title: "Pipeline jobs", detail: "mostly okay", severity: "warn", source: "overview" }),
  true,
);
assert.strictEqual(
  shouldCountForDailyDigestStatus({ key: "tier1_pipeline_jobs", title: "Daily price jobs", detail: "mostly okay", severity: "warn", source: "overview" }),
  false,
);
assert.strictEqual(
  shouldCountForDailyDigestStatus({ key: "config_freshness", title: "App settings update", detail: "stale (7d ago)", severity: "warn", source: "overview" }),
  false,
);

const alert = {
  key: "sentry",
  title: "Sentry",
  detail: "failing",
  severity: "warn" as const,
  source: "overview",
};
const now = new Date("2026-05-24T12:00:00Z").getTime();
assert.strictEqual(shouldSendDiscordAlert(alert, null, now), true);
assert.strictEqual(
  shouldSendDiscordAlert(
    alert,
    { severity: "warn", detail: "failing", status: "open", discord_sent_at: "2026-05-24T10:00:00Z" },
    now,
  ),
  false,
);
assert.strictEqual(
  shouldSendDiscordAlert(
    alert,
    { severity: "warn", detail: "still failing", status: "open", discord_sent_at: "2026-05-24T10:00:00Z" },
    now,
  ),
  true,
);
assert.strictEqual(
  shouldSendDiscordAlert(
    { ...alert, severity: "critical" },
    { severity: "warn", detail: "failing", status: "open", discord_sent_at: "2026-05-24T11:30:00Z" },
    now,
  ),
  true,
);

console.log("mobile-command-center.test.ts: all assertions passed.");
export {};
