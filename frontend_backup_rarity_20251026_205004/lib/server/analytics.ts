// frontend/lib/server/analytics.ts
// Server-side PostHog helper (safe no-op if keys are missing)
import type { PostHog } from 'posthog-node';

let ph: PostHog | null = null;

function getKey() {
  return process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
}
function getHost() {
  return process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com';
}

export function serverAnalyticsEnabled() {
  return !!getKey();
}

export async function captureServer(event: string, properties: Record<string, any> = {}, distinctId?: string | null) {
  try {
    const key = getKey();
    if (!key) return;
    if (!ph) {
      const { PostHog } = await import('posthog-node');
      ph = new PostHog(key, { host: getHost(), flushAt: 1, flushInterval: 100 });
    }
    ph!.capture({ event, distinctId: distinctId || properties.user_id || 'anon', properties });
  } catch {}
}

export function shutdownAnalytics() {
  try { (ph as any)?.shutdown?.(); } catch {}
}
