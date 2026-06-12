const DISCORD_MAX = 1900;
const MODERATION_ADMIN_URL = "https://www.manatap.ai/admin/moderation";

export type ModerationReportDiscordPayload = {
  reportId: string;
  subjectType: string;
  subjectId: string;
  reason: string;
  details?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  targetUserId?: string | null;
  source?: string;
  authenticated?: boolean;
  siteBase?: string;
};

function moderationWebhookUrl(): string | null {
  const url =
    process.env.DISCORD_MODERATION_WEBHOOK ||
    process.env.DISCORD_ADMIN_ALERT_WEBHOOK ||
    process.env.DISCORD_WEBHOOK_URL;
  return url?.trim() || null;
}

export function isModerationDiscordConfigured(): boolean {
  return !!moderationWebhookUrl();
}

const SUBJECT_LABELS: Record<string, string> = {
  public_profile: "Public profile",
  shared_item: "Shared item",
  shared_comment: "Comment",
};

function subjectLabel(subjectType: string): string {
  return SUBJECT_LABELS[subjectType] || subjectType;
}

export async function notifyModerationReport(
  payload: ModerationReportDiscordPayload
): Promise<{ sent: boolean; reason?: string }> {
  const webhook = moderationWebhookUrl();
  if (!webhook) {
    return { sent: false, reason: "no_webhook_configured" };
  }

  const link = payload.reportId
    ? `${MODERATION_ADMIN_URL}?report_id=${encodeURIComponent(payload.reportId)}`
    : MODERATION_ADMIN_URL;

  const lines = [
    "**New moderation report**",
    link,
    "",
    `Type: ${subjectLabel(payload.subjectType)}`,
    `Reason: ${payload.reason}`,
  ];

  if (payload.resourceType || payload.resourceId) {
    lines.push(`Resource: ${payload.resourceType || "?"} / ${payload.resourceId || "?"}`);
  }
  if (payload.targetUserId) {
    lines.push(`Target user: \`${payload.targetUserId}\``);
  }
  if (payload.details?.trim()) {
    lines.push("", "Details:", payload.details.trim().slice(0, 500));
  }

  const source = payload.source === "mobile_app" ? "Mobile app" : payload.source === "web" ? "Website" : null;
  if (source) {
    lines.push("", `Source: ${source}${payload.authenticated ? " (signed in)" : " (guest)"}`);
  }

  lines.push("", `[Open moderation queue](${link})`);

  const content = lines.join("\n").slice(0, DISCORD_MAX);

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[moderation-discord] Webhook failed:", res.status);
      return { sent: false, reason: `discord_http_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.warn("[moderation-discord] Post failed:", e);
    return { sent: false, reason: e instanceof Error ? e.message : "discord_failed" };
  }
}
