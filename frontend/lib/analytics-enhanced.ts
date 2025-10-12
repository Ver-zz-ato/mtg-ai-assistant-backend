// lib/analytics-enhanced.ts
// Enhanced analytics tracking for user journey, onboarding, and feature adoption

import { capture } from './ph';

// ===== 1. USER ONBOARDING & FIRST EXPERIENCE =====

export interface OnboardingEventProps {
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  landing_page?: string;
  user_agent?: string;
  screen_size?: string;
}

export function trackFirstVisit(props: OnboardingEventProps = {}) {
  const enrichedProps = {
    ...props,
    timestamp: new Date().toISOString(),
    session_id: getSessionId(),
    is_returning_visitor: checkReturningVisitor()
  };
  
  capture('user_first_visit', enrichedProps);
  
  // Mark as visited to track returning users
  try {
    localStorage.setItem('analytics_first_visit', Date.now().toString());
  } catch {}
}

export function trackSignupStarted(method: 'email' | 'oauth' | 'guest', source?: string) {
  capture('signup_started', {
    method,
    source: source || 'unknown',
    timestamp: new Date().toISOString()
  });
  
  // Store signup start time for completion tracking
  try {
    sessionStorage.setItem('signup_started_at', Date.now().toString());
  } catch {}
}

export function trackSignupCompleted(method: 'email' | 'oauth', userId?: string) {
  const startTime = sessionStorage.getItem('signup_started_at');
  const activationTime = startTime ? Math.round((Date.now() - parseInt(startTime)) / (1000 * 60)) : null;
  
  capture('signup_completed', {
    method,
    user_id: userId,
    activation_time_minutes: activationTime,
    timestamp: new Date().toISOString()
  });
  
  // Clean up
  try {
    sessionStorage.removeItem('signup_started_at');
  } catch {}
}

export function trackFirstAction(action: 'chat' | 'deck_create' | 'collection_upload' | 'browse_decks' | 'search_cards', context?: any) {
  const isFirstAction = !localStorage.getItem('analytics_first_action_taken');
  
  if (isFirstAction) {
    capture('first_action_taken', {
      action,
      context,
      time_since_signup: getTimeSinceSignup(),
      timestamp: new Date().toISOString()
    });
    
    try {
      localStorage.setItem('analytics_first_action_taken', action);
    } catch {}
  }
}

// ===== 2. SEARCH & DISCOVERY =====

export function trackCardSearch(query: string, resultsCount: number, context?: string) {
  capture('card_search_query', {
    query: query.slice(0, 100), // Truncate for privacy
    query_length: query.length,
    results_count: resultsCount,
    search_context: context,
    timestamp: new Date().toISOString()
  });
}

export function trackCardSelected(cardName: string, searchQuery?: string, position?: number) {
  capture('card_selected', {
    card_name: cardName,
    search_query: searchQuery?.slice(0, 100),
    position_in_results: position,
    timestamp: new Date().toISOString()
  });
}

export function trackPublicDeckViewed(deckId: string, source: 'browse' | 'search' | 'recommendation' | 'direct_link') {
  capture('public_deck_viewed', {
    deck_id: deckId,
    source,
    timestamp: new Date().toISOString()
  });
}

export function trackDeckCopied(originalDeckId: string, sourceUserId?: string) {
  capture('deck_copied', {
    original_deck_id: originalDeckId,
    source_user_id: sourceUserId,
    timestamp: new Date().toISOString()
  });
}

// ===== 3. FEATURE ADOPTION & ENGAGEMENT =====

export function trackFeatureDiscovered(featureName: string, discoveryMethod: 'navigation' | 'tooltip' | 'search' | 'recommendation' | 'tutorial') {
  capture('feature_discovered', {
    feature_name: featureName,
    discovery_method: discoveryMethod,
    user_tenure: getUserTenure(),
    timestamp: new Date().toISOString()
  });
}

export function trackHelpTooltipViewed(tooltipId: string, component: string) {
  capture('help_tooltip_viewed', {
    tooltip_id: tooltipId,
    component,
    timestamp: new Date().toISOString()
  });
}

export function trackTutorialStarted(tutorialType: string) {
  capture('tutorial_started', {
    tutorial_type: tutorialType,
    timestamp: new Date().toISOString()
  });
  
  // Store start time for completion tracking
  try {
    sessionStorage.setItem(`tutorial_${tutorialType}_started`, Date.now().toString());
  } catch {}
}

export function trackChatSessionLength(messagesSent: number, durationMinutes: number, topics: string[] = []) {
  capture('chat_session_length', {
    messages_sent: messagesSent,
    duration_minutes: durationMinutes,
    topics,
    avg_time_per_message: messagesSent > 0 ? Math.round(durationMinutes * 60 / messagesSent) : 0,
    timestamp: new Date().toISOString()
  });
}

export function trackAdvancedFeatureUsed(feature: 'goldfish_test' | 'cost_analysis' | 'meta_analysis' | 'card_suggestions' | 'deck_optimization') {
  capture('advanced_feature_used', {
    feature,
    user_tenure: getUserTenure(),
    is_pro_user: checkIsProUser(),
    timestamp: new Date().toISOString()
  });
}

// ===== 4. CONVERSION & REVENUE OPTIMIZATION =====

export function trackPricingPageViewed(source: string, userTenureDays?: number) {
  capture('pricing_page_viewed', {
    source,
    user_tenure_days: userTenureDays || getUserTenure(),
    timestamp: new Date().toISOString()
  });
}

export function trackFeatureLimitHit(featureName: string, currentUsage: number, limit: number) {
  capture('feature_limit_hit', {
    feature_name: featureName,
    current_usage: currentUsage,
    limit,
    utilization_percent: Math.round((currentUsage / limit) * 100),
    timestamp: new Date().toISOString()
  });
}

export function trackUpgradeAbandoned(step: 'pricing' | 'payment' | 'confirmation', reason?: string) {
  capture('upgrade_abandoned', {
    step,
    reason,
    user_tenure: getUserTenure(),
    timestamp: new Date().toISOString()
  });
}

export function trackValueMomentReached(moment: 'first_deck_created' | 'first_good_chat_response' | 'collection_imported' | 'first_deck_shared') {
  capture('value_moment_reached', {
    moment,
    time_to_value: getTimeSinceSignup(),
    timestamp: new Date().toISOString()
  });
}

// ===== 5. ERROR & SUPPORT ANALYTICS =====

export function trackErrorBoundary(component: string, errorMessage: string, errorStack?: string, userActionBefore?: string) {
  capture('error_boundary_triggered', {
    component,
    error_message: errorMessage,
    error_stack: errorStack?.slice(0, 500), // Truncate for storage
    user_action_before_error: userActionBefore,
    page_path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
    timestamp: new Date().toISOString()
  });
}

export function trackApiError(endpoint: string, statusCode: number, errorType: string, retryCount?: number) {
  capture('api_error', {
    endpoint,
    status_code: statusCode,
    error_type: errorType,
    retry_count: retryCount || 0,
    timestamp: new Date().toISOString()
  });
}

export function trackUserFrustration(indicator: 'rapid_clicks' | 'form_resubmit' | 'back_button_spam' | 'error_repeat', context?: any) {
  capture('user_frustrated', {
    indicator,
    context,
    page_path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
    timestamp: new Date().toISOString()
  });
}

export function trackFeedbackWidgetOpened(page: string, trigger: 'button_click' | 'error_occurred' | 'feature_limit' | 'satisfaction_prompt') {
  capture('feedback_widget_opened', {
    page,
    trigger,
    user_tenure: getUserTenure(),
    timestamp: new Date().toISOString()
  });
}

// ===== 6. CONTENT & COMMUNITY =====

export function trackDeckShared(deckId: string, method: 'link' | 'social', privacy: 'public' | 'unlisted' | 'private') {
  capture('deck_shared', {
    deck_id: deckId,
    method,
    deck_privacy: privacy,
    timestamp: new Date().toISOString()
  });
}

export function trackDeckCommentAdded(deckId: string, commentType: 'suggestion' | 'praise' | 'question') {
  capture('deck_comment_added', {
    deck_id: deckId,
    comment_type: commentType,
    timestamp: new Date().toISOString()
  });
}

export function trackUserProfileViewed(profileUserId: string, viewerRelationship: 'self' | 'friend' | 'stranger') {
  capture('user_profile_viewed', {
    profile_user_id: profileUserId,
    viewer_relationship: viewerRelationship,
    timestamp: new Date().toISOString()
  });
}

export function trackArchetypeBrowsed(archetype: string, format: string) {
  capture('deck_archetype_browsed', {
    archetype,
    format,
    timestamp: new Date().toISOString()
  });
}

// ===== UTILITY FUNCTIONS =====

function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
      sessionStorage.setItem('analytics_session_id', sessionId);
    } catch {}
  }
  return sessionId;
}

function checkReturningVisitor(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!localStorage.getItem('analytics_first_visit');
  } catch {
    return false;
  }
}

function getTimeSinceSignup(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const signupTime = localStorage.getItem('user_signup_time');
    if (signupTime) {
      return Math.round((Date.now() - parseInt(signupTime)) / (1000 * 60)); // minutes
    }
  } catch {}
  return null;
}

function getUserTenure(): number {
  const timeSince = getTimeSinceSignup();
  return timeSince ? Math.round(timeSince / (60 * 24)) : 0; // days
}

function checkIsProUser(): boolean {
  // This would need to be connected to your actual pro status check
  // For now, return false as placeholder
  return false;
}

// Session tracking for workflow continuity
export function startSession(sessionType: 'chat' | 'deck_creation' | 'browsing') {
  try {
    sessionStorage.setItem(`session_${sessionType}_start`, Date.now().toString());
  } catch {}
}

export function endSession(sessionType: 'chat' | 'deck_creation' | 'browsing', additionalData?: any) {
  try {
    const startTime = sessionStorage.getItem(`session_${sessionType}_start`);
    if (startTime) {
      const duration = Math.round((Date.now() - parseInt(startTime)) / (1000 * 60)); // minutes
      capture(`${sessionType}_session_ended`, {
        duration_minutes: duration,
        ...additionalData,
        timestamp: new Date().toISOString()
      });
      sessionStorage.removeItem(`session_${sessionType}_start`);
    }
  } catch {}
}