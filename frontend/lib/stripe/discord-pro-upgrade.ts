const DISCORD_CONTENT_MAX = 1900;

export type StripeProUpgradeDiscordDetails = {
  source:
    | 'checkout.session.completed'
    | 'customer.subscription.updated'
    | 'invoice.payment_succeeded'
    | 'invoice.paid'
    | 'admin_test';
  userId: string;
  email?: string | null;
  plan?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
  livemode?: boolean;
};

function normalizeWebhookUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  // Vercel env values are sometimes pasted with quotes or angle brackets.
  const normalized = trimmed.replace(/^['"`<]+|['"`>]+$/g, '').trim();
  return normalized || null;
}

export function getDiscordProUpgradeWebhook(): string | null {
  const url =
    process.env.DISCORD_PRO_UPGRADE_WEBHOOK ||
    process.env.DISCORD_STRIPE_PRO_UPGRADE_WEBHOOK ||
    process.env.DISCORD_ADMIN_ALERT_WEBHOOK ||
    process.env.DISCORD_APPSUB_WEBHOOK ||
    process.env.DISCORD_APP_SUBS_WEBHOOK ||
    process.env.DISCORD_WEBHOOK_URL;
  return normalizeWebhookUrl(url);
}

function shortId(value: string | number | null | undefined): string {
  const s = String(value || '').trim();
  if (!s) return 'n/a';
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}...${s.slice(-4)}`;
}

function buildProUpgradeDiscordContent(details: StripeProUpgradeDiscordDetails): string {
  const lines =
    details.source === 'admin_test'
      ? [
          '🧪 Stripe Pro upgrade Discord test',
          'If you see this, production can reach your webhook URL.',
          `Actor: ${shortId(details.userId)}`,
          `Mode: ${process.env.NODE_ENV || 'unknown'}`,
        ]
      : [
          '💳 Stripe Pro upgrade completed',
          `Source: ${details.source}`,
          `Plan: ${details.plan || 'unknown'}`,
          `User: ${details.email || shortId(details.userId)}`,
          `Subscription: ${shortId(details.subscriptionId)}`,
          `Customer: ${shortId(details.customerId)}`,
          `Mode: ${details.livemode ? 'live' : 'test'}`,
        ];

  let content = lines.join('\n');
  if (content.length > DISCORD_CONTENT_MAX) {
    content = content.slice(0, DISCORD_CONTENT_MAX - 3) + '...';
  }
  return content;
}

export type DiscordProUpgradeNotifyResult =
  | { ok: true; status: number }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'http_error'; status: number; bodySnippet: string }
  | { ok: false; reason: 'network_error'; message: string };

export async function notifyDiscordStripeProUpgrade(
  details: StripeProUpgradeDiscordDetails
): Promise<DiscordProUpgradeNotifyResult> {
  const url = getDiscordProUpgradeWebhook();
  if (!url) {
    return { ok: false, reason: 'not_configured' };
  }

  const content = buildProUpgradeDiscordContent(details);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      return { ok: false, reason: 'http_error', status: res.status, bodySnippet: text };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'fetch failed';
    return { ok: false, reason: 'network_error', message };
  }
}
