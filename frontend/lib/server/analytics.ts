// frontend/lib/server/analytics.ts
// Server-side PostHog helper (safe no-op if keys are missing)
import type { PostHog } from 'posthog-node';
import { randomUUID } from 'crypto';

let ph: PostHog | null = null;

function getKey() {
  return process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
}
function getHost() {
  return process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com';
}

/**
 * Check if server-side analytics is enabled
 * 
 * @returns true if PostHog key is configured
 */
export function serverAnalyticsEnabled() {
  return !!getKey();
}

/**
 * Capture a server-side analytics event
 *
 * Use visitor_id as distinctId when anonymous; user_id when authenticated.
 * Include visitor_id in properties when available for joining funnels.
 *
 * @param event - Event name (prefer AnalyticsEvents constants from '@/lib/analytics/events')
 * @param properties - Event properties (should include visitor_id when available)
 * @param distinctId - distinct_id: visitor_id (anon) or user_id (auth). Defaults to properties.user_id || properties.visitor_id || 'anon'
 */
export async function captureServer(event: string, properties: Record<string, any> = {}, distinctId?: string | null) {
  try {
    const key = getKey();
    if (!key) return;
    if (!ph) {
      const { PostHog } = await import('posthog-node');
      ph = new PostHog(key, { host: getHost(), flushAt: 1, flushInterval: 100 });
    }
    let id = distinctId ?? properties.user_id ?? properties.visitor_id ?? properties.anonymous_fallback_id;
    if (!id || id === 'anon') id = `fallback_${randomUUID()}`;
    ph!.capture({ event, distinctId: id, properties });
  } catch {}
}

/**
 * Shutdown PostHog client (flush pending events)
 * 
 * Should be called during app shutdown to ensure all events are sent.
 */
export function shutdownAnalytics() {
  try { (ph as any)?.shutdown?.(); } catch {}
}
