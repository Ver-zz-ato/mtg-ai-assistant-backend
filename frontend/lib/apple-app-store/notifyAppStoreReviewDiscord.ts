const DISCORD_MAX = 1900;

function getAppReviewsWebhookUrl(): string | null {
  const url = process.env.DISCORD_APP_REVIEWS_WEBHOOK_URL;
  return url?.trim() || null;
}

export function isAppStoreReviewDiscordConfigured(): boolean {
  return !!getAppReviewsWebhookUrl();
}

function formatReviewDate(createdDate: string | null): string {
  if (!createdDate) return "Unknown";
  const parsed = new Date(createdDate);
  if (Number.isNaN(parsed.getTime())) return createdDate;
  return parsed.toISOString();
}

export function formatAppStoreReviewDiscordMessage(review: {
  rating: number | null;
  title: string | null;
  body: string | null;
  reviewerNickname: string | null;
  territory: string | null;
  createdDate: string | null;
}): string {
  const rating = review.rating != null ? `${review.rating}/5` : "Unknown";
  const title = review.title?.trim() || "(no title)";
  const reviewer = review.reviewerNickname?.trim() || "Unknown";
  const territory = review.territory?.trim() || "Unknown";
  const date = formatReviewDate(review.createdDate);
  const body = review.body?.trim() || "(no review text)";

  return [
    "⭐ New iOS App Store Review",
    "",
    `Rating: ${rating}`,
    `Title: ${title}`,
    `Reviewer: ${reviewer}`,
    `Territory: ${territory}`,
    `Date: ${date}`,
    "",
    "Review:",
    `"${body}"`,
    "",
    "App: ManaTap",
  ].join("\n");
}

export async function notifyAppStoreReviewDiscord(review: {
  rating: number | null;
  title: string | null;
  body: string | null;
  reviewerNickname: string | null;
  territory: string | null;
  createdDate: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const webhook = getAppReviewsWebhookUrl();
  if (!webhook) {
    return { sent: false, reason: "no_webhook_configured" };
  }

  const content = formatAppStoreReviewDiscordMessage(review).slice(0, DISCORD_MAX);

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
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
