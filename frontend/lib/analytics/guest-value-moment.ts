/**
 * Guest value moment tracking
 * Tracks when guests hit "wow" moments that indicate value
 */

import { useCapture } from './useCapture';
import { AnalyticsEvents } from './events';

export type ValueMomentType = 'deck_analyzed' | 'chat_engaged' | 'suggestion_shown';

/**
 * Track a guest value moment
 * Should be called when:
 * - deck_analyzed: After a deck analysis completes
 * - chat_engaged: After 2+ chat messages sent
 * - suggestion_shown: After an AI suggestion is displayed
 */
export function trackGuestValueMoment(
  type: ValueMomentType,
  capture: ReturnType<typeof useCapture>,
  context?: {
    deck_id?: string;
    chat_count?: number;
    suggestion_id?: string;
  }
) {
  capture(AnalyticsEvents.GUEST_VALUE_MOMENT, {
    value_moment_type: type,
    ...context,
  });
  
  // Store in sessionStorage for modal to check
  if (typeof window !== 'undefined') {
    try {
      const existing = sessionStorage.getItem('guest_value_moments') || '[]';
      const moments = JSON.parse(existing);
      if (!moments.includes(type)) {
        moments.push(type);
        sessionStorage.setItem('guest_value_moments', JSON.stringify(moments));
      }
    } catch {}
  }
}

/**
 * Check if user should see value moment variant of guest limit modal
 * Checks sessionStorage for tracked value moments
 */
export function hasValueMoment(
  chatCount: number,
  hasDeckAnalyzed?: boolean,
  hasSuggestionShown?: boolean
): boolean {
  // Check sessionStorage first (most reliable)
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem('guest_value_moments');
      if (stored) {
        const moments = JSON.parse(stored);
        if (moments.length > 0) return true;
      }
    } catch {}
  }
  
  // Fallback to passed parameters
  return (
    hasDeckAnalyzed === true ||
    chatCount >= 2 ||
    hasSuggestionShown === true
  );
}

/**
 * Get value moment type from current state
 * Checks sessionStorage first, then falls back to parameters
 */
export function getValueMomentType(
  hasDeckAnalyzed?: boolean,
  chatCount?: number,
  hasSuggestionShown?: boolean
): ValueMomentType | undefined {
  // Check sessionStorage first
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem('guest_value_moments');
      if (stored) {
        const moments = JSON.parse(stored) as ValueMomentType[];
        // Return the first (most recent) value moment
        if (moments.length > 0) return moments[moments.length - 1];
      }
    } catch {}
  }
  
  // Fallback to parameters
  if (hasDeckAnalyzed) return 'deck_analyzed';
  if (chatCount && chatCount >= 2) return 'chat_engaged';
  if (hasSuggestionShown) return 'suggestion_shown';
  return undefined;
}
