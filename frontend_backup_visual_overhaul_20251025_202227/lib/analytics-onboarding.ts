import { capture } from './ph';

/**
 * Onboarding Analytics Module
 * Tracks user onboarding progress, tour completion, and feature adoption funnels
 */

export interface OnboardingEvent {
  user_id?: string;
  timestamp: string;
  session_id?: string;
}

export interface OnboardingStepEvent extends OnboardingEvent {
  step: number;
  feature: string;
  duration_ms?: number;
}

export interface OnboardingFunnelEvent extends OnboardingEvent {
  funnel_name: string;
  step_name: string;
  metadata?: Record<string, any>;
}

/**
 * Track when a user starts the onboarding tour
 */
export function trackOnboardingStarted(metadata?: Record<string, any>) {
  try {
    capture('onboarding_started', {
      timestamp: new Date().toISOString(),
      session_id: getSessionId(),
      ...metadata,
    });
  } catch (e) {
    console.error('Failed to track onboarding started:', e);
  }
}

/**
 * Track when a user progresses through an onboarding step
 */
export function trackOnboardingStep(step: number, feature: string, duration_ms?: number) {
  try {
    capture('onboarding_step', {
      step,
      feature,
      timestamp: new Date().toISOString(),
      session_id: getSessionId(),
      duration_ms,
    });
  } catch (e) {
    console.error('Failed to track onboarding step:', e);
  }
}

/**
 * Track when a user completes the onboarding tour
 */
export function trackOnboardingCompleted(totalSteps: number, totalDuration_ms?: number, metadata?: Record<string, any>) {
  try {
    capture('onboarding_completed', {
      total_steps: totalSteps,
      total_duration_ms: totalDuration_ms,
      timestamp: new Date().toISOString(),
      session_id: getSessionId(),
      ...metadata,
    });
    
    // Mark completion in localStorage for metrics
    localStorage.setItem('onboarding_completed_at', new Date().toISOString());
  } catch (e) {
    console.error('Failed to track onboarding completed:', e);
  }
}

/**
 * Track when a user skips the onboarding tour
 */
export function trackOnboardingSkipped(currentStep: number, reason?: string) {
  try {
    capture('onboarding_skipped', {
      current_step: currentStep,
      reason,
      timestamp: new Date().toISOString(),
      session_id: getSessionId(),
    });
  } catch (e) {
    console.error('Failed to track onboarding skipped:', e);
  }
}

/**
 * Track funnel progression (e.g., sample-deck → CTF → Share)
 */
export function trackFunnelStep(funnelName: string, stepName: string, metadata?: Record<string, any>) {
  try {
    capture(`funnel_${funnelName}`, {
      step: stepName,
      timestamp: new Date().toISOString(),
      session_id: getSessionId(),
      ...metadata,
    });
  } catch (e) {
    console.error('Failed to track funnel step:', e);
  }
}

/**
 * Track time-to-first-value (TTFV) - how long until user completes a key action
 */
export function trackTimeToFirstValue(action: string, duration_ms: number) {
  try {
    capture('time_to_first_value', {
      action,
      duration_ms,
      duration_seconds: Math.round(duration_ms / 1000),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to track TTFV:', e);
  }
}

/**
 * Track user return behavior
 */
export function trackReturnVisit(daysSinceSignup: number, metadata?: Record<string, any>) {
  try {
    capture('user_return_visit', {
      days_since_signup: daysSinceSignup,
      is_next_day: daysSinceSignup === 1,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  } catch (e) {
    console.error('Failed to track return visit:', e);
  }
}

/**
 * Helper: Get or create session ID
 */
function getSessionId(): string {
  try {
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  } catch {
    return 'unknown';
  }
}

/**
 * Helper: Calculate KPI - Time to First Value (<90s goal)
 */
export function measureTTFV(startKey: string = 'user_signed_up_at'): number | null {
  try {
    const startTime = localStorage.getItem(startKey);
    if (!startTime) return null;
    
    const start = new Date(startTime).getTime();
    const now = Date.now();
    return now - start;
  } catch {
    return null;
  }
}

/**
 * Funnel tracking helpers
 */
export const Funnels = {
  /**
   * Sample Deck → Cost to Finish → Share funnel
   */
  sampleDeckToShare: {
    importDeck: (deckId: string) => trackFunnelStep('sample_to_share', 'import_deck', { deck_id: deckId }),
    viewCTF: (deckId: string) => trackFunnelStep('sample_to_share', 'view_ctf', { deck_id: deckId }),
    shareDeck: (deckId: string) => trackFunnelStep('sample_to_share', 'share_deck', { deck_id: deckId }),
  },

  /**
   * Chat → Analysis → Feature Use funnel
   */
  chatToFeature: {
    askQuestion: (topic: string) => trackFunnelStep('chat_to_feature', 'ask_question', { topic }),
    useFeature: (feature: string) => trackFunnelStep('chat_to_feature', 'use_feature', { feature }),
  },

  /**
   * Budget Swaps → Acceptance → Deck Update funnel
   */
  budgetSwaps: {
    viewSuggestions: (deckId: string) => trackFunnelStep('budget_swaps', 'view_suggestions', { deck_id: deckId }),
    acceptSwap: (deckId: string, card: string) => trackFunnelStep('budget_swaps', 'accept_swap', { deck_id: deckId, card }),
    updateDeck: (deckId: string) => trackFunnelStep('budget_swaps', 'update_deck', { deck_id: deckId }),
  },
};

/**
 * Track first-time feature use for KPI metrics
 */
export function trackFirstFeatureUse(feature: string) {
  const key = `first_use_${feature}`;
  if (localStorage.getItem(key)) return; // Already tracked

  try {
    localStorage.setItem(key, new Date().toISOString());
    
    // Calculate TTFV if user is signed up
    const ttfv = measureTTFV();
    if (ttfv) {
      trackTimeToFirstValue(feature, ttfv);
    }
    
    capture('first_feature_use', {
      feature,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to track first feature use:', e);
  }
}

