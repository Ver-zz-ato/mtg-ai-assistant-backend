/**
 * Homepage A/B test experiment
 * Variant A (control): Current home
 * Variant B: Activation-first with primary CTA above the fold
 */

import { capture } from '@/lib/ph';
import { AnalyticsEvents } from '@/lib/analytics/events';

export type HomeVariant = 'A' | 'B';

/**
 * Get current homepage variant
 * Checks env var first, then URL param (client-side only)
 * 
 * Note: For server-side usage, only checks env var
 */
export function getHomeVariant(): HomeVariant {
  // Check env var (works on both server and client)
  const envVariant = process.env.NEXT_PUBLIC_HOME_VARIANT;
  if (envVariant === 'B') return 'B';
  if (envVariant === 'A') return 'A';

  // Check URL param (client-side only, for testing)
  if (typeof window !== 'undefined') {
    const forced = new URLSearchParams(window.location.search).get('home_variant');
    if (forced === 'A' || forced === 'B') {
      return forced as HomeVariant;
    }
  }

  // Default to A (control)
  return 'A';
}

/**
 * Track homepage variant view
 */
export function trackHomeVariantViewed(variant: HomeVariant) {
  capture(AnalyticsEvents.HOME_VARIANT_VIEWED, {
    variant,
  });
}

/**
 * Track primary CTA click on homepage
 */
export function trackHomePrimaryCTAClicked(ctaType: 'analyze_deck' | 'import_sample' | 'start_chat') {
  capture(AnalyticsEvents.HOME_PRIMARY_CTA_CLICKED, {
    cta_type: ctaType,
    variant: getHomeVariant(),
  });
}
