'use client';

// Lightweight PostHog helpers with consent guard.
// Safe to import from any client component.

import { getConsentStatus } from '@/lib/consent';
import { getSessionContext } from '@/lib/analytics/session-bootstrap';

type Props = Record<string, any> | undefined;

function hasWindow(): boolean {
  return typeof window !== 'undefined';
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
    let enrichedProps = props || {};
    if (!options?.skipEnrichment) {
      const sessionCtx = getSessionContext(options?.isAuthenticated ?? false);
      enrichedProps = {
        ...sessionCtx,
        ...props, // Props override session context if keys conflict
      };
    }
    
    ph.capture(event, enrichedProps);
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
    // Enrich user properties with app-specific context
    const enrichedProps = {
      ...props,
      $set: {
        ...props?.$set,
        app_version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
        platform: 'web',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
        identified_at: new Date().toISOString(),
      },
      $set_once: {
        ...props?.$set_once,
        first_seen: new Date().toISOString(),
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
 * Reset PostHog (clears user identification and properties)
 * 
 * Typically called when user logs out or consent is declined.
 */
export function reset(): void {
  if (!hasWindow() || !hasConsent()) return;
  try {
    // @ts-ignore
    window.posthog?.reset?.();
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[analytics] reset');
    }
  } catch {}
}
