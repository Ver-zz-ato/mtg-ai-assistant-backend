// frontend/lib/server/analytics.ts
// Server-side PostHog helper (safe no-op if keys are missing)
import type { PostHog } from 'posthog-node';
import { sanitizeAnalyticsProps } from '@/lib/analytics/sanitize';
import {
  buildAnalyticsCommonProps,
  type AnalyticsSurface,
  type AnalyticsTier,
  type DeckFormatAnalytics,
} from '@/lib/analytics/common';
import { resolveAnalyticsSessionId } from '@/lib/server/analytics-session';

// Runtime-agnostic UUID generation (works in both Node.js and Edge)
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

let ph: PostHog | null = null;
const STARTED_EVENT_DEDUPE_TTL_MS = 5 * 60 * 1000;
const aiStartedDedupe = new Map<string, number>();

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

/** Optional options for server-side capture (e.g. client IP for GeoIP). */
export type CaptureServerOptions = { ip?: string };

/**
 * Capture a server-side analytics event
 *
 * Use visitor_id as distinctId when anonymous; user_id when authenticated.
 * Include visitor_id in properties when available for joining funnels.
 * Pass options.ip when available so PostHog can run GeoIP enrichment ($geoip_country_name etc.).
 *
 * @param event - Event name (prefer AnalyticsEvents constants from '@/lib/analytics/events')
 * @param properties - Event properties (should include visitor_id when available)
 * @param distinctId - distinct_id: visitor_id (anon) or user_id (auth). Defaults to properties.user_id || properties.visitor_id || 'anon'
 * @param options - Optional: { ip } for GeoIP enrichment (e.g. from x-forwarded-for / x-real-ip)
 */
export async function captureServer(
  event: string,
  properties: Record<string, any> = {},
  distinctId?: string | null,
  options?: CaptureServerOptions
) {
  try {
    const key = getKey();
    if (!key) return;
    if (!ph) {
      const { PostHog } = await import('posthog-node');
      ph = new PostHog(key, { host: getHost(), flushAt: 1, flushInterval: 100 });
    }
    let id = distinctId ?? properties.user_id ?? properties.visitor_id ?? properties.anonymous_fallback_id;
    if (!id || id === 'anon') id = `fallback_${generateId()}`;
    const resolvedSessionId =
      typeof properties.session_id === 'string' && properties.session_id.trim()
        ? properties.session_id
        : await resolveAnalyticsSessionId();
    const props = sanitizeAnalyticsProps({
      ...buildAnalyticsCommonProps({
        platform: 'server',
        app_surface:
          typeof properties.app_surface === 'string'
            ? (properties.app_surface as AnalyticsSurface)
            : event === 'pageview_server' || event === 'user_first_visit'
              ? 'website'
              : 'api',
        logged_in: Boolean(properties.logged_in ?? properties.is_authenticated ?? properties.user_id),
        user_tier:
          typeof properties.user_tier === 'string'
            ? (properties.user_tier as AnalyticsTier)
            : 'unknown',
        route_path:
          typeof properties.route_path === 'string'
            ? properties.route_path
            : typeof properties.pathname === 'string'
              ? properties.pathname
              : typeof properties.source_path === 'string'
                ? properties.source_path
                : null,
        session_id: resolvedSessionId,
        source_surface: typeof properties.source_surface === 'string' ? properties.source_surface : null,
        source_feature: typeof properties.source_feature === 'string' ? properties.source_feature : null,
        user_id: typeof properties.user_id === 'string' ? properties.user_id : null,
        visitor_id: typeof properties.visitor_id === 'string' ? properties.visitor_id : null,
        device_id: typeof properties.device_id === 'string' ? properties.device_id : null,
        distinct_id: id,
        deck_id_present: Boolean(properties.deck_id_present ?? properties.deck_id),
        deck_format:
          typeof properties.deck_format === 'string'
            ? (properties.deck_format as DeckFormatAnalytics)
            : null,
      }),
      ...properties,
      ...(options?.ip ? { $ip: options.ip } : {}),
    });
    ph!.capture({ event, distinctId: id, properties: props });
  } catch {}
}

export async function captureAiServerEvent(
  event: 'ai_call_started' | 'ai_call_completed' | 'ai_call_failed',
  properties: Record<string, any>,
  distinctId?: string | null
) {
  const analyticsRequestId =
    typeof properties.analytics_request_id === 'string' && properties.analytics_request_id.trim()
      ? properties.analytics_request_id.trim()
      : null;
  if (event === 'ai_call_started' && analyticsRequestId) {
    const now = Date.now();
    for (const [key, timestamp] of aiStartedDedupe.entries()) {
      if (now - timestamp > STARTED_EVENT_DEDUPE_TTL_MS) {
        aiStartedDedupe.delete(key);
      }
    }
    if (aiStartedDedupe.has(analyticsRequestId)) return;
    aiStartedDedupe.set(analyticsRequestId, now);
  }

  return captureServer(
    event,
    {
      analytics_request_id: analyticsRequestId,
      user_id: properties.user_id ?? null,
      visitor_id: properties.visitor_id ?? null,
      device_id: properties.device_id ?? null,
      streamed: properties.streamed ?? null,
      cache_hit: properties.cache_hit ?? null,
      input_tokens: properties.input_tokens ?? null,
      output_tokens: properties.output_tokens ?? null,
      total_tokens: properties.total_tokens ?? null,
      estimated_cost_usd: properties.estimated_cost_usd ?? null,
      latency_ms: properties.latency_ms ?? null,
      success: properties.success ?? (event === 'ai_call_completed'),
      error_code: properties.error_code ?? null,
      provider: properties.provider ?? 'openai',
      feature: properties.feature ?? null,
      route: properties.route ?? null,
      model: properties.model ?? null,
      user_tier: properties.user_tier ?? 'unknown',
      deck_format: properties.deck_format ?? null,
      app_surface: properties.app_surface ?? 'api',
      source_feature: properties.source_feature ?? properties.feature ?? null,
      source_surface: properties.source_surface ?? null,
      ...properties,
    },
    distinctId
  );
}

/**
 * Alias a previous distinct_id to the current one (merge two persons).
 * Call when signup/login happens so visitor_id (anon) is merged into user_id.
 *
 * @param previousDistinctId - e.g. visitor_id from first visit
 * @param distinctId - e.g. user_id after auth
 */
export async function aliasServer(previousDistinctId: string, distinctId: string): Promise<void> {
  if (!previousDistinctId || !distinctId || previousDistinctId === distinctId) return;
  try {
    const key = getKey();
    if (!key) return;
    if (!ph) {
      const { PostHog } = await import('posthog-node');
      ph = new PostHog(key, { host: getHost(), flushAt: 1, flushInterval: 100 });
    }
    ph!.alias({ distinctId, alias: previousDistinctId });
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
