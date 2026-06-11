const DISCORD_MAX = 1900;

function reviewWebhookUrl(): string | null {
  const url =
    process.env.MARKETING_RADAR_DISCORD_WEBHOOK ||
    process.env.DISCORD_ADMIN_ALERT_WEBHOOK ||
    process.env.DISCORD_WEBHOOK_URL;
  return url?.trim() || null;
}

export function isMarketingReviewNotifyConfigured(): boolean {
  return !!reviewWebhookUrl();
}

export async function notifyMarketingReview(opts: {
  briefId: string;
  summary: string;
  draftPlatforms: string[];
  siteBase?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const webhook = reviewWebhookUrl();
  if (!webhook) {
    return { sent: false, reason: "no_webhook_configured" };
  }

  const base = (opts.siteBase || "https://www.manatap.ai").replace(/\/$/, "");
  const link = `${base}/admin/marketing-radar?brief_id=${opts.briefId}&tab=drafts`;
  const platforms = opts.draftPlatforms.join(", ") || "none";

  const content = [
    "**Marketing Radar** — drafts ready for your review",
    "",
    opts.summary.slice(0, 400),
    "",
    `Platforms: ${platforms}`,
    `→ Approve & post: ${link}`,
  ].join("\n");

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, DISCORD_MAX) }),
      cache: "no-store",
    });
    if (!res.ok) {
      return { sent: false, reason: `discord_http_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "discord_failed" };
  }
}
