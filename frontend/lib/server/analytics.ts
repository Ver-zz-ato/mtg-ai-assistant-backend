// frontend/lib/server/analytics.ts
// Server-side PostHog helper (safe no-op if keys are missing)
import type { PostHog } from 'posthog-node';
import {
  buildAnalyticsCommonProps,
  type AnalyticsSurface,
  type AnalyticsTier,
  type DeckFormatAnalytics,
} from '@/lib/analytics/common';

// Runtime-agnostic UUID generation (works in both Node.js and Edge)
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

let ph: PostHog | null = null;

function stripSensitiveServerProps(input: Record<string, any>): Record<string, any> {
  const sanitized = { ...input };
  const hadThreadId = sanitized.thread_id != null || sanitized.threadId != null;
  const hadUserMessage = sanitized.user_message != null || sanitized.userMessage != null;
  const hadAssistantMessage = sanitized.assistant_message != null || sanitized.assistantMessage != null;
  const hadPrompt = sanitized.prompt != null || sanitized.prompt_text != null;
  const hadMessages = sanitized.messages != null;
  const hadDecklist = sanitized.decklist != null || sanitized.decklist_text != null;
  const hadCollection = sanitized.collection != null || sanitized.collection_cards != null || sanitized.card_collection != null;

  delete sanitized.email;
  delete sanitized.user_email;
  delete sanitized.thread_id;
  delete sanitized.threadId;
  delete sanitized.user_message;
  delete sanitized.userMessage;
  delete sanitized.assistant_message;
  delete sanitized.assistantMessage;
  delete sanitized.message;
  delete sanitized.messages;
  delete sanitized.prompt;
  delete sanitized.prompt_text;
  delete sanitized.completion;
  delete sanitized.response_text;
  delete sanitized.decklist;
  delete sanitized.decklist_text;
  delete sanitized.collection;
  delete sanitized.collection_cards;
  delete sanitized.card_collection;

  if (hadThreadId) sanitized.thread_id_present = true;
  if (hadUserMessage) sanitized.user_message_present = true;
  if (hadAssistantMessage) sanitized.assistant_message_present = true;
  if (hadPrompt) sanitized.prompt_present = true;
  if (hadMessages) sanitized.messages_present = true;
  if (hadDecklist) sanitized.decklist_present = true;
  if (hadCollection) sanitized.collection_present = true;

  return sanitized;
}

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
    const props = stripSensitiveServerProps({
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
        session_id: typeof properties.session_id === 'string' ? properties.session_id : null,
        source_surface: typeof properties.source_surface === 'string' ? properties.source_surface : null,
        source_feature: typeof properties.source_feature === 'string' ? properties.source_feature : null,
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
  return captureServer(
    event,
    {
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
