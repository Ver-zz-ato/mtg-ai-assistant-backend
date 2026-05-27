import { NextRequest, NextResponse } from 'next/server';
import { validateOrigin } from '@/lib/api/csrf';
import { requireAdminForApi } from '@/lib/server-admin';
import {
  getDiscordProUpgradeWebhook,
  notifyDiscordStripeProUpgrade,
} from '@/lib/stripe/discord-pro-upgrade';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;
  if (!validateOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid origin. This request must come from the same site.' },
      { status: 403 }
    );
  }

  const configured = Boolean(getDiscordProUpgradeWebhook());
  const result = await notifyDiscordStripeProUpgrade({
    source: 'admin_test',
    userId: admin.user.id,
    email: admin.user.email ?? null,
  });

  return NextResponse.json(
    {
      ok: result.ok,
      configured,
      env_primary: Boolean(process.env.DISCORD_PRO_UPGRADE_WEBHOOK?.trim()),
      result,
      hint: !configured
        ? 'Set DISCORD_PRO_UPGRADE_WEBHOOK in Vercel Production, then redeploy.'
        : !result.ok
          ? 'Webhook URL is set but Discord rejected the POST — regenerate the webhook in Discord and update Vercel.'
          : 'Check the Discord channel tied to this webhook for the test message.',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
