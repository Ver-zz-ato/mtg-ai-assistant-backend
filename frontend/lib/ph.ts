'use client';

// Lightweight PostHog helpers with consent guard.
// Safe to import from any client component.

import { getConsentStatus } from '@/lib/consent';
import { sanitizeAnalyticsProps } from '@/lib/analytics/sanitize';
import { getSessionContext } from '@/lib/analytics/session-bootstrap';
import { pushCaptureEvent } from '@/lib/analytics/capture-buffer';
import {
  ATTRIBUTION_CURRENT_COOKIE,
  ATTRIBUTION_FIRST_COOKIE,
  buildAnalyticsCommonProps,
  formatIsoWeek,
  parseAttributionCookie,
  readBrowserCookie,
} from '@/lib/analytics/common';

type Props = Record<string, any> | undefined;
const FIRST_EVENT_PREFIX = 'analytics:first:';
const FIRST_FEATURE_KEY = 'analytics:person:first_feature_used';
const FIRST_DECK_FORMAT_KEY = 'analytics:person:first_deck_format';
const SESSION_STARTED_PREFIX = 'analytics:session:started:';
const SESSION_ENGAGED_PREFIX = 'analytics:session:engaged:';
const SESSION_ENGAGED_DELAY_MS = 10_000;
let sessionEngagedTimer: number | null = null;

function stripSensitiveAnalyticsProps(input: Props): Record<string, any> {
  return sanitizeAnalyticsProps(input);
}

function firstFeatureForEvent(event: string, props: Record<string, any>): string | null {
  const tool = typeof props.tool === 'string' ? props.tool : null;
  if (event === 'tool_opened' && tool) return tool;
  if (event === 'chat_started') return 'ai_chat';
  if (event === 'playstyle_quiz_started') return 'playstyle_quiz';
  if (event === 'mulligan_advice_requested') return 'mulligan';
  if (event === 'deck_saved') return 'deck_saved';
  if (event === 'profile_share_completed') return 'profile_share';
  if (event === 'collection_created') return 'collection_created';
  return null;
}

function persistIdentityTraits(event: string, props: Record<string, any>) {
  if (!hasWindow()) return;
  try {
    const firstFeature = firstFeatureForEvent(event, props);
    if (firstFeature && !window.localStorage.getItem(FIRST_FEATURE_KEY)) {
      window.localStorage.setItem(FIRST_FEATURE_KEY, firstFeature);
    }
    const deckFormat = typeof props.deck_format === 'string' ? props.deck_format : null;
    if ((event === 'deck_saved' || event === 'first_deck_saved') && deckFormat && deckFormat !== 'unknown') {
      if (!window.localStorage.getItem(FIRST_DECK_FORMAT_KEY)) {
        window.localStorage.setItem(FIRST_DECK_FORMAT_KEY, deckFormat);
      }
    }
  } catch {}
}

function trackFirstEventOnce(key: string, event: string, props: Record<string, any>) {
  if (!hasWindow()) return;
  try {
    const storageKey = `${FIRST_EVENT_PREFIX}${key}`;
    if (window.localStorage.getItem(storageKey) === '1') return;
    window.localStorage.setItem(storageKey, '1');
    const ph = (window as any).posthog;
    ph?.capture?.(event, props);
  } catch {}
}

function maybeTrackDerivedMilestones(event: string, props: Record<string, any>) {
  const tool = typeof props.tool === 'string' ? props.tool : null;
  if (event === 'tool_opened' && tool) {
    trackFirstEventOnce(`tool:${tool}`, 'first_tool_used', { ...props, first_tool: tool });
  }
  if (event === 'chat_started') {
    trackFirstEventOnce('ai_chat', 'first_ai_chat', props);
  }
  if (event === 'deck_saved') {
    trackFirstEventOnce('deck_saved', 'first_deck_saved', props);
  }
  if (event === 'mulligan_advice_requested') {
    trackFirstEventOnce('mulligan', 'first_mulligan', props);
  }
  if (event === 'pro_gate_viewed' || event === 'paywall_viewed') {
    trackFirstEventOnce('pro_gate', 'first_pro_gate', props);
  }
  if (event === 'pro_upgrade_completed') {
    trackFirstEventOnce('upgrade', 'first_upgrade', props);
  }
  if (event === 'playstyle_quiz_started') {
    trackFirstEventOnce('playstyle_quiz_started', 'first_playstyle_quiz_started', props);
  }
  if (event === 'playstyle_quiz_completed') {
    trackFirstEventOnce('playstyle_quiz_completed', 'first_playstyle_quiz_completed', props);
  }
  if (event === 'profile_share_completed') {
    trackFirstEventOnce('share', 'first_share', props);
  }
  if (event === 'collection_created') {
    trackFirstEventOnce('collection_created', 'first_collection_created', props);
  }
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function sessionStorageHas(key: string): boolean {
  if (!hasWindow()) return true;
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function setSessionStorageFlag(key: string): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {}
}

function isMeaningfulSessionEvent(event: string): boolean {
  if (event === 'session_started' || event === 'session_engaged' || event === 'app_open') return false;
  if (event.startsWith('web_vital_')) return false;
  return true;
}

function captureSessionMilestone(event: 'session_started' | 'session_engaged', props: Record<string, any>): void {
  const sessionId = typeof props.session_id === 'string' ? props.session_id : null;
  if (!sessionId) return;
  const storagePrefix = event === 'session_started' ? SESSION_STARTED_PREFIX : SESSION_ENGAGED_PREFIX;
  const storageKey = `${storagePrefix}${sessionId}`;
  if (sessionStorageHas(storageKey)) return;
  setSessionStorageFlag(storageKey);
  const ph = (window as any).posthog;
  ph?.capture?.(event, props);
}

function markSessionMilestoneTracked(event: 'session_started' | 'session_engaged', props: Record<string, any>): void {
  const sessionId = typeof props.session_id === 'string' ? props.session_id : null;
  if (!sessionId) return;
  const storagePrefix = event === 'session_started' ? SESSION_STARTED_PREFIX : SESSION_ENGAGED_PREFIX;
  setSessionStorageFlag(`${storagePrefix}${sessionId}`);
}

function scheduleSessionEngagement(props: Record<string, any>): void {
  if (!hasWindow()) return;
  if (sessionEngagedTimer != null) return;
  sessionEngagedTimer = window.setTimeout(() => {
    sessionEngagedTimer = null;
    captureSessionMilestone('session_engaged', props);
  }, SESSION_ENGAGED_DELAY_MS);
}

export function trackSessionStarted(props?: Props, options?: { isAuthenticated?: boolean }): void {
  const safeProps = stripSensitiveAnalyticsProps(props);
  const sessionCtx = getSessionContext(options?.isAuthenticated ?? false);
  const enrichedProps = {
    ...buildAnalyticsCommonProps({
      platform: 'web',
      app_surface: 'website',
      logged_in: options?.isAuthenticated ?? false,
      user_tier: (safeProps?.user_tier as any) ?? 'unknown',
      source_surface: (safeProps?.source_surface as any) ?? null,
      source_feature: (safeProps?.source_feature as any) ?? null,
      route_path: sessionCtx.current_path,
      session_id: sessionCtx.session_id,
      user_id: typeof (safeProps as any)?.user_id === 'string' ? (safeProps as any).user_id : null,
      visitor_id: readBrowserCookie('visitor_id'),
      deck_id_present: Boolean((safeProps as any)?.deck_id_present ?? (safeProps as any)?.deck_id),
      deck_format: (safeProps as any)?.deck_format ?? null,
    }),
    ...sessionCtx,
    ...safeProps,
  };
  try {
    captureSessionMilestone('session_started', enrichedProps);
    scheduleSessionEngagement(enrichedProps);
  } catch {}
}

export function hasConsent(): boolean {
  if (!hasWindow()) return false;
  try {
    // Use new consent helper for consistency
    return getConsentStatus() === 'accepted';
  } catch {
    // Fallback to legacy check
    try {
      return window.localStorage.getItem('analytics:consent') === 'granted';
    } catch {
      return false;
    }
  }
}

/**
 * Capture an analytics event with automatic session context enrichment
 * 
 * Automatically adds: landing_page, referrer, utm_*, device_type, current_path, is_authenticated
 * 
 * @param event - Event name (prefer AnalyticsEvents constants from '@/lib/analytics/events')
 * @param props - Optional event properties (will be merged with session context)
 * @param options - Optional configuration
 * @param options.isAuthenticated - Whether user is authenticated (defaults to false if not provided)
 * @param options.skipEnrichment - Skip automatic enrichment (for special cases)
 * 
 * @example
 *   import { AnalyticsEvents } from '@/lib/analytics/events';
 *   capture(AnalyticsEvents.DECK_SAVED, { deck_id: '123' }, { isAuthenticated: true });
 * 
 * @example
 *   // Legacy string usage still works
 *   capture('custom_event', { custom_prop: 'value' });
 */
export function capture(
  event: string, 
  props?: Props,
  options?: { isAuthenticated?: boolean; skipEnrichment?: boolean }
): void {
  if (!hasWindow() || !hasConsent()) return;
  try {
    // @ts-ignore - posthog is attached globally by the provider init
    const ph = (window as any).posthog;
    if (!ph?._loaded) {
      // PostHog not ready - event will be dropped (safe no-op)
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[analytics] PostHog not ready, event dropped:', event);
      }
      return;
    }
    
    // Auto-enrich with session context unless explicitly skipped
    const safeProps = stripSensitiveAnalyticsProps(props);
    let enrichedProps = safeProps;
    if (!options?.skipEnrichment) {
      const sessionCtx = getSessionContext(options?.isAuthenticated ?? false);
      const currentAttribution = parseAttributionCookie(readBrowserCookie(ATTRIBUTION_CURRENT_COOKIE));
      const firstAttribution = parseAttributionCookie(readBrowserCookie(ATTRIBUTION_FIRST_COOKIE));
      const commonProps = buildAnalyticsCommonProps({
        platform: 'web',
        app_surface: 'website',
        logged_in: options?.isAuthenticated ?? false,
        user_tier: (safeProps?.user_tier as any) ?? 'unknown',
        source_surface: (safeProps?.source_surface as any) ?? null,
        source_feature: (safeProps?.source_feature as any) ?? (safeProps?.tool as any) ?? null,
        route_path: sessionCtx.current_path,
        session_id: sessionCtx.session_id,
        user_id: typeof (safeProps as any)?.user_id === 'string' ? (safeProps as any).user_id : null,
        visitor_id: readBrowserCookie('visitor_id'),
        distinct_id: ph.get_distinct_id?.() ?? ph.getDistinctId?.() ?? null,
        deck_id_present: Boolean((safeProps as any)?.deck_id_present ?? (safeProps as any)?.deck_id),
        deck_format: (safeProps as any)?.deck_format ?? null,
      });
      enrichedProps = {
        ...commonProps,
        ...sessionCtx,
        ...firstAttribution,
        ...(currentAttribution
          ? {
              current_utm_source: currentAttribution.utm_source,
              current_utm_medium: currentAttribution.utm_medium,
              current_utm_campaign: currentAttribution.utm_campaign,
              current_utm_content: currentAttribution.utm_content,
              current_utm_term: currentAttribution.utm_term,
              current_referrer: currentAttribution.referrer,
              current_referring_domain: currentAttribution.referring_domain,
              current_channel_type: currentAttribution.channel_type,
            }
          : {}),
        ...safeProps, // Props override session context if keys conflict
      };
    }
    
    ph.capture(event, enrichedProps);
    if (event === 'session_started') {
      markSessionMilestoneTracked('session_started', enrichedProps);
      scheduleSessionEngagement(enrichedProps);
    } else if (event === 'session_engaged') {
      markSessionMilestoneTracked('session_engaged', enrichedProps);
    } else if (isMeaningfulSessionEvent(event)) {
      captureSessionMilestone('session_engaged', enrichedProps);
    }
    persistIdentityTraits(event, enrichedProps);
    maybeTrackDerivedMilestones(event, enrichedProps);
    try {
      pushCaptureEvent(event, enrichedProps ?? {});
    } catch {}
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[analytics] %s', event, enrichedProps ?? {});
    }
  } catch {}
}

/**
 * Identify a user in PostHog
 * 
 * @param distinctId - Unique identifier for the user
 * @param props - Optional user properties to set
 * 
 * @example
 *   identify('user_123', { email: 'user@example.com', isPro: true });
 */
export function identify(distinctId: string, props?: Props): void {
  if (!hasWindow() || !hasConsent()) return;
  try {
    const safeProps = stripSensitiveAnalyticsProps(props);
    const firstAttribution = parseAttributionCookie(readBrowserCookie(ATTRIBUTION_FIRST_COOKIE));
    const currentAttribution = parseAttributionCookie(readBrowserCookie(ATTRIBUTION_CURRENT_COOKIE));
    const firstSeenAt = firstAttribution?.first_seen_at ?? new Date().toISOString();
    const hasSavedDeck = hasWindow() && window.localStorage.getItem(`${FIRST_EVENT_PREFIX}deck_saved`) === '1';
    const hasUsedAi = hasWindow() && window.localStorage.getItem(`${FIRST_EVENT_PREFIX}ai_chat`) === '1';
    const firstFeatureUsed = hasWindow() ? window.localStorage.getItem(FIRST_FEATURE_KEY) : null;
    const firstDeckFormat = hasWindow() ? window.localStorage.getItem(FIRST_DECK_FORMAT_KEY) : null;
    const commonProps = buildAnalyticsCommonProps({
      platform: 'web',
      app_surface: 'website',
      logged_in: true,
      user_tier: (safeProps?.user_tier as any) ?? 'unknown',
      route_path: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
      session_id: getSessionContext(true).session_id,
      user_id: distinctId,
      visitor_id: readBrowserCookie('visitor_id'),
      source_surface: null,
      source_feature: null,
      deck_id_present: false,
      deck_format: null,
    });
    // Enrich user properties with app-specific context
    const enrichedProps = {
      ...safeProps,
      $set: {
        ...safeProps?.$set,
        ...commonProps,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
        identified_at: new Date().toISOString(),
        first_acquisition_channel: firstAttribution?.channel_type ?? null,
        first_landing_path: firstAttribution?.landing_path ?? null,
        current_acquisition_channel: currentAttribution?.channel_type ?? firstAttribution?.channel_type ?? null,
        current_landing_path: currentAttribution?.landing_path ?? firstAttribution?.landing_path ?? null,
        first_platform: 'web',
        signup_week: formatIsoWeek(new Date()),
        first_seen_week: formatIsoWeek(firstSeenAt),
        has_saved_deck: hasSavedDeck,
        has_used_ai: hasUsedAi,
      },
      $set_once: {
        ...safeProps?.$set_once,
        first_seen: firstSeenAt,
        first_seen_week: formatIsoWeek(firstSeenAt),
        first_acquisition_channel: firstAttribution?.channel_type ?? null,
        first_landing_path: firstAttribution?.landing_path ?? null,
        first_platform: 'web',
        first_feature_used: firstFeatureUsed ?? undefined,
        first_deck_format: firstDeckFormat ?? undefined,
      }
    };
    
    // @ts-ignore
    window.posthog?.identify?.(distinctId, enrichedProps);
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[analytics] identify', distinctId, enrichedProps ?? {});
    }
  } catch {}
}

/**
 * Alias the current distinct_id to another (e.g. merge visitor_id into user_id).
 * Call after identify(userId) on login so pre-login events join the user.
 */
export function alias(aliasId: string): void {
  if (!hasWindow() || !hasConsent()) return;
  try {
    (window as any).posthog?.alias?.(aliasId);
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[analytics] alias', aliasId);
    }
  } catch {}
}

/**
 * Get current PostHog distinct_id (client-only). Returns null if PostHog not loaded.
 */
export function getDistinctId(): string | null {
  if (!hasWindow()) return null;
  try {
    const ph = (window as any).posthog;
    if (!ph?._loaded) return null;
    return (ph.get_distinct_id?.() ?? (ph as any).getDistinctId?.()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Read visitor_id from document.cookie (client-only). visitor_id is not HttpOnly.
 */
export function getVisitorIdFromCookie(): string | null {
  if (!hasWindow()) return null;
  try {
    const match = document.cookie.match(/\bvisitor_id=([^;]+)/);
    return match ? decodeURIComponent(match[1].trim()) : null;
  } catch {
    return null;
  }
}

/**
 * Reset PostHog (clears user identification and properties)
 *
 * Typically called when user logs out or consent is declined.
 */
export function reset(): void {
  if (!hasWindow() || !hasConsent()) return;
  try {
    (window as any).posthog?.reset?.();
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[analytics] reset');
    }
  } catch {}
}
