/**
 * Post ops report summary to Discord webhook.
 * Env: DISCORD_WEBHOOK_URL
 * Failure MUST NOT block report save — catches and logs only.
 */

export type DiscordOpsPayload = {
  status: "ok" | "warn" | "fail";
  reportType: string;
  aiMismatchRate?: number;
  rate429?: number;
  routeNullPct?: number;
  staleJobs?: string[];
  indexedPageCount?: number;
  seoWinnersCount?: number;
  seoWinnersSlugs?: string[];
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
    lines.push(`• Stale jobs: ${payload.staleJobs.slice(0, 2).join(", ")}`);
  }
  if (payload.indexedPageCount != null) {
    lines.push(`• Indexed pages: ${payload.indexedPageCount}`);
  }
  if (payload.seoWinnersCount != null && payload.seoWinnersCount > 0) {
    lines.push(`• SEO winners (noindex w/ impressions): ${payload.seoWinnersCount}`);
    if (payload.seoWinnersSlugs && payload.seoWinnersSlugs.length > 0) {
      lines.push(`  Top: ${payload.seoWinnersSlugs.slice(0, 3).join(", ")}`);
    }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: lines.join("\n"),
      }),
    });
    if (!res.ok) {
      console.warn("[discord] Webhook failed:", res.status, await res.text());
    }
  } catch (e) {
    console.warn("[discord] Post failed:", e);
  }
}
