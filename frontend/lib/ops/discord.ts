/**
 * Post ops report summary to Discord webhook.
 * Env: DISCORD_WEBHOOK_URL
 * Failure MUST NOT block report save — catches and logs only.
 * Discord content limit: 2000 chars — we cap at 1900.
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
};

export async function postOpsReportToDiscord(payload: DiscordOpsPayload): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  const emoji = payload.status === "ok" ? "✅" : payload.status === "warn" ? "⚠️" : "❌";
  const lines: string[] = [
    `${emoji} **Ops Report** (${payload.reportType})`,
    "",
    `• AI cost mismatch: ${(payload.aiMismatchRate ?? 0).toFixed(1)}%`,
    `• 429 rate: ${payload.rate429 ?? "—"}`,
    `• Route null: ${(payload.routeNullPct ?? 0).toFixed(1)}%`,
  ];

  if (payload.staleJobs && payload.staleJobs.length > 0) {
    lines.push(`• Stale jobs: ${payload.staleJobs.slice(0, STALE_JOBS_CAP).join(", ")}`);
  }
  if (payload.indexedPageCount != null) {
    lines.push(`• Indexed pages: ${payload.indexedPageCount}`);
  }
  if (payload.seoWinnersCount != null && payload.seoWinnersCount > 0) {
    lines.push(`• SEO winners (noindex w/ impressions): ${payload.seoWinnersCount}`);
    if (payload.seoWinnersSlugs && payload.seoWinnersSlugs.length > 0) {
      lines.push(`  Top: ${payload.seoWinnersSlugs.slice(0, SEO_SLUGS_CAP).join(", ")}`);
    }
  }
  if (payload.status === "fail" && payload.errorSummary) {
    const truncated = payload.errorSummary.length > ERROR_TRUNCATE
      ? payload.errorSummary.slice(0, ERROR_TRUNCATE) + "…"
      : payload.errorSummary;
    lines.push(`• Error: ${truncated}`);
  }
  if (payload.adminUrl) {
    lines.push("", `View in [admin/ops](${payload.adminUrl})`);
  }

  let content = lines.join("\n");
  if (content.length > DISCORD_CONTENT_MAX) {
    content = content.slice(0, DISCORD_CONTENT_MAX - 3) + "…";
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
  } catch (e) {
    console.warn("[discord] Post failed:", e);
  }
}
