'use client';

/**
 * Click tracking helper for UI interactions
 * 
 * Features:
 * - Feature flag protected (analytics.clicks_enabled in flags)
 * - Respects DNT (Do Not Track)
 * - Prefers PostHog when consented, falls back to server-side tracking
 * - Zero runtime risk (all wrapped in try/catch)
 */

import { hasConsent } from '@/lib/ph';

type TrackProps = {
  area: string;
  action: string;
  [key: string]: any; // Allow additional props
};

let featureFlagCache: boolean | null = null;
let featureFlagCheckInProgress = false;

async function isClicksEnabled(): Promise<boolean> {
  // Check cache first
  if (featureFlagCache !== null) {
    return featureFlagCache;
  }

  // Prevent multiple simultaneous checks
  if (featureFlagCheckInProgress) {
    // Wait a bit and retry
    await new Promise(resolve => setTimeout(resolve, 100));
    if (featureFlagCache !== null) {
      return featureFlagCache;
    }
  }

  featureFlagCheckInProgress = true;
  
  try {
    // Check feature flag via app_config
    const response = await fetch('/api/config?key=flags', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    
    const flags = data?.config?.flags || {};
    const enabled = flags['analytics_clicks_enabled'] === true;
    
    featureFlagCache = enabled;
    return enabled;
  } catch (error) {
    // On error, default to false (safe)
    featureFlagCache = false;
    return false;
  } finally {
    featureFlagCheckInProgress = false;
  }
}

function getPathname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname;
}

function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Track a UI click/interaction event
 * 
 * @param name - Event name (should be 'ui_click')
 * @param props - Event properties (must include 'area' and 'action')
 * @param context - Optional user context (userId, isPro)
 */
export async function track(
  name: string,
  props?: TrackProps,
  context?: { userId?: string | null; isPro?: boolean }
): Promise<void> {
  // Early return if not enabled
  if (!(await isClicksEnabled())) {
    return;
  }

  // Respect DNT
  if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') {
    return;
  }

  // Validate props
  if (!props || typeof props !== 'object') {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[track] Missing or invalid props');
    }
    return;
  }

  if (!props.area || !props.action) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[track] Props must include area and action');
    }
    return;
  }

  try {
    const pathname = getPathname();
    const ts = getTimestamp();

    // Build enriched properties
    const enrichedProps: Record<string, any> = {
      ...props,
      pathname,
      ts,
    };

    // Add user context if provided
    if (context) {
      if (context.userId) {
        enrichedProps.user_id = context.userId;
      }
      if (context.isPro !== undefined) {
        enrichedProps.isPro = context.isPro;
      }
    }

    // Try PostHog first (if consented and available)
    if (hasConsent() && typeof window !== 'undefined' && (window as any).posthog) {
      try {
        enrichedProps.source = 'client';
        (window as any).posthog?.capture?.(name, enrichedProps);
        
        if (process.env.NODE_ENV === 'development') {
          console.debug('[track] PostHog:', name, enrichedProps);
        }
        return; // Success, exit early
      } catch (posthogError) {
        // Fall through to server-side if PostHog fails
        if (process.env.NODE_ENV === 'development') {
          console.debug('[track] PostHog failed, falling back:', posthogError);
        }
      }
    }

    // Fallback to server-side tracking
    try {
      enrichedProps.source = 'server-fallback';
      await fetch('/api/analytics/track-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: name,
          properties: enrichedProps,
          userId: context?.userId || null,
        }),
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.debug('[track] Server-side:', name, enrichedProps);
      }
    } catch (serverError) {
      // Silent fail - tracking is best effort
      if (process.env.NODE_ENV === 'development') {
        console.debug('[track] Server-side tracking failed:', serverError);
      }
    }
  } catch (error) {
    // Ultimate catch-all - never throw
    if (process.env.NODE_ENV === 'development') {
      console.debug('[track] Unexpected error:', error);
    }
  }
}

