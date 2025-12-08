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
 * @param event - Event name (prefer AnalyticsEvents constants from '@/lib/analytics/events')
 * @param properties - Event properties
 * @param distinctId - Optional distinct ID (defaults to 'anon' or properties.user_id)
 * 
 * @example
 *   import { AnalyticsEvents } from '@/lib/analytics/events';
 *   await captureServer(AnalyticsEvents.DECK_SAVED, { deck_id: '123' }, userId);
 * 
 * @example
 *   // Legacy string usage still works
 *   await captureServer('custom_event', { custom_prop: 'value' });
 */
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

/**
 * Shutdown PostHog client (flush pending events)
 * 
 * Should be called during app shutdown to ensure all events are sent.
 */
export function shutdownAnalytics() {
  try { (ph as any)?.shutdown?.(); } catch {}
}
