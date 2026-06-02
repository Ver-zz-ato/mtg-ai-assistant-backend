import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { getDiscordProUpgradeWebhook } from '@/lib/stripe/discord-pro-upgrade';

const ENV_KEYS = [
  'DISCORD_PRO_UPGRADE_WEBHOOK',
  'DISCORD_STRIPE_PRO_UPGRADE_WEBHOOK',
  'DISCORD_ADMIN_ALERT_WEBHOOK',
  'DISCORD_APPSUB_WEBHOOK',
  'DISCORD_APP_SUBS_WEBHOOK',
  'DISCORD_WEBHOOK_URL',
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

function clearDiscordWebhookEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

beforeEach(clearDiscordWebhookEnv);

after(() => {
  clearDiscordWebhookEnv();
  for (const [key, value] of originalEnv.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('getDiscordProUpgradeWebhook', () => {
  it('strips common pasted wrappers from the configured Discord URL', () => {
    process.env.DISCORD_PRO_UPGRADE_WEBHOOK =
      ' "https://discord.com/api/webhooks/123/token" ';

    assert.equal(
      getDiscordProUpgradeWebhook(),
      'https://discord.com/api/webhooks/123/token'
    );
  });

  it('falls back to the shared webhook env when the dedicated one is absent', () => {
    process.env.DISCORD_WEBHOOK_URL = '<https://discord.com/api/webhooks/456/token>';

    assert.equal(
      getDiscordProUpgradeWebhook(),
      'https://discord.com/api/webhooks/456/token'
    );
  });
});
