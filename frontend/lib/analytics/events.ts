/**
 * Centralized PostHog event names
 * 
 * All event names used in the application should be defined here.
 * This ensures consistency, prevents typos, and enables type safety.
 * 
 * Usage:
 *   import { AnalyticsEvents } from '@/lib/analytics/events';
 *   import { capture } from '@/lib/ph';
 *   capture(AnalyticsEvents.APP_OPEN);
 */

export const AnalyticsEvents = {
  // ===== CORE APP EVENTS =====
  APP_OPEN: 'app_open',
  PAGE_VIEW: '$pageview',
  USER_FIRST_VISIT: 'user_first_visit',
  
  // ===== CONSENT & PRIVACY =====
  CONSENT_CHOICE: 'consent_choice',
  
  // ===== AUTHENTICATION =====
  AUTH_LOGIN_ATTEMPT: 'auth_login_attempt',
  AUTH_LOGIN_SUCCESS: 'auth_login_success',
  AUTH_LOGIN_FAILED: 'auth_login_failed',
  AUTH_LOGOUT_ATTEMPT: 'auth_logout_attempt',
  AUTH_LOGOUT_SUCCESS: 'auth_logout_success',
  AUTH_LOGOUT_FAILED: 'auth_logout_failed',
  AUTH_LOGOUT_TIMEOUT_FALLBACK: 'auth_logout_timeout_fallback',
  SIGNUP_COMPLETED: 'signup_completed',
  SIGNUP_CTA_CLICKED: 'signup_cta_clicked',
  
  // ===== EMAIL VERIFICATION =====
  EMAIL_VERIFICATION_REMINDER_SHOWN: 'email_verification_reminder_shown',
  EMAIL_VERIFICATION_RESENT: 'email_verification_resent',
  EMAIL_VERIFICATION_RESENT_ON_LOGIN: 'email_verification_resent_on_login',
  EMAIL_VERIFICATION_RESENT_FROM_PROFILE: 'email_verification_resent_from_profile',
  EMAIL_VERIFICATION_RESENT_ON_SIGNUP: 'email_verification_resent_on_signup',
  EMAIL_VERIFICATION_RESEND_FAILED: 'email_verification_resend_failed',
  EMAIL_VERIFICATION_REMINDER_DISMISSED: 'email_verification_reminder_dismissed',
  EMAIL_VERIFIED_SUCCESS: 'email_verified_success',
  EMAIL_VERIFICATION_POPUP_DISMISSED: 'email_verification_popup_dismissed',
  
  // ===== DECK EVENTS =====
  DECK_SAVED: 'deck_saved',
  DECK_UPDATED: 'deck_updated',
  DECK_DELETED: 'deck_deleted',
  DECK_CREATED: 'deck_created',
  DECK_ANALYZED: 'deck_analyzed',
  DECK_IMPORTED: 'deck_imported',
  DECK_IMPORT_ATTEMPTED: 'deck_import_attempted',
  DECK_IMPORT_COMPLETED: 'deck_import_completed',
  DECK_IMPORT_MODAL_OPENED: 'deck_import_modal_opened',
  DECK_EDITOR_OPENED: 'deck_editor_opened',
  DECK_CARD_ADDED: 'deck_card_added',
  DECK_CARD_REMOVED: 'deck_card_removed',
  DECK_CARD_QUANTITY_CHANGED: 'deck_card_quantity_changed',
  DECK_CARD_CLICK: 'deck_card_click',
  DECK_DUPLICATED: 'deck_duplicated',
  DECK_VERSION_SAVED: 'deck_version_saved',
  DECK_VERSION_RESTORED: 'deck_version_restored',
  DECK_COMMENT_POSTED: 'deck_comment_posted',
  DECK_COMMENT_DELETED: 'deck_comment_deleted',
  BULK_DELETE_CARDS: 'bulk_delete_cards',
  
  // ===== DECK BROWSING =====
  BROWSE_DECKS_PAGE_VIEW: 'browse_decks_page_view',
  BROWSE_DECKS_LOADED: 'browse_decks_loaded',
  BROWSE_DECK_CLICKED: 'browse_deck_clicked',
  BACK_TO_TOP_CLICKED: 'back_to_top_clicked',
  ADVANCED_FILTERS_APPLIED: 'advanced_filters_applied',
  
  // ===== AI & CHAT EVENTS =====
  CHAT_SENT: 'chat_sent',
  CHAT_STREAM_STOP: 'chat_stream_stop',
  CHAT_STREAM_FALLBACK: 'chat_stream_fallback',
  CHAT_STREAM_ERROR: 'chat_stream_error',
  CHAT_GUEST_LIMIT: 'chat_guest_limit',
  CHAT_GUEST_LIMIT_WARNING_15: 'guest_limit_warning_15',
  CHAT_GUEST_LIMIT_WARNING_18: 'guest_limit_warning_18',
  CHAT_FEEDBACK: 'chat_feedback',
  GUEST_CHAT_RESTORED: 'guest_chat_restored',
  
  // ===== AI SUGGESTIONS =====
  AI_SUGGESTION_SHOWN: 'ai_suggestion_shown',
  AI_SUGGESTION_ACCEPTED: 'ai_suggestion_accepted',
  
  // ===== COLLECTIONS =====
  COLLECTION_IMPORTED: 'collection_imported',
  COLLECTION_CREATED: 'collection_created',
  COLLECTION_DELETED: 'collection_deleted',
  COLLECTION_CARD_CLICK: 'collections.card_click',
  BULK_DELETE_COLLECTION_ITEMS: 'bulk_delete_collection_items',
  CSV_UPLOADED: 'csv_uploaded',
  
  // ===== WISHLIST =====
  WISHLIST_PAGE_VIEW: 'wishlist_page_view',
  WISHLIST_CREATED: 'wishlist_created',
  WISHLIST_RENAMED: 'wishlist_renamed',
  WISHLIST_DELETED: 'wishlist_deleted',
  WISHLIST_ITEM_ADDED: 'wishlist_item_added',
  BULK_DELETE_WISHLIST_ITEMS: 'bulk_delete_wishlist_items',
  
  // ===== WATCHLIST =====
  WATCHLIST_PAGE_VIEW: 'watchlist_page_view',
  WATCHLIST_ITEM_ADDED: 'watchlist_item_added',
  WATCHLIST_ITEM_REMOVED: 'watchlist_item_removed',
  
  // ===== COST ANALYSIS =====
  COST_TO_FINISH_OPENED: 'cost_to_finish_opened',
  COST_COMPUTED: 'cost_computed',
  
  // ===== PROFILE =====
  PROFILE_VIEW: 'profile_view',
  PROFILE_WISHLIST_SAVE: 'profile_wishlist_save',
  PROFILE_USERNAME_CHANGE: 'profile_username_change',
  PROFILE_FAV_COMMANDER_SET: 'profile_fav_commander_set',
  PROFILE_AVATAR_CHANGE: 'profile_avatar_change',
  PROFILE_PRICING_CTA_CLICKED: 'profile_pricing_cta_clicked',
  PROFILE_PRICING_LEARN_MORE_CLICKED: 'profile_pricing_learn_more_clicked',
  PROFILE_SHARE: 'profile_share',
  PRIVACY_DATA_SHARE_TOGGLED: 'privacy_data_share_toggled',
  
  // ===== PRICING & PRO =====
  PRICING_PAGE_VIEWED: 'pricing_page_viewed',
  PRICING_UPGRADE_CLICKED: 'pricing_upgrade_clicked',
  PRICING_INTERVAL_CHANGED: 'pricing_interval_changed',
  BILLING_PORTAL_CLICKED: 'billing_portal_clicked',
  PRO_GATE_VIEWED: 'pro_gate_viewed',
  PRO_GATE_CLICKED: 'pro_gate_clicked',
  PRO_UPGRADE_STARTED: 'pro_upgrade_started',
  PRO_UPGRADE_COMPLETED: 'pro_upgrade_completed',
  PRO_FEATURE_USED: 'pro_feature_used',
  PRO_FEATURE_AWARENESS: 'pro_feature_awareness',
  PRO_FEATURE_CTA_CLICKED: 'pro_feature_cta_clicked',
  PRO_DOWNGRADE: 'pro_downgrade',
  
  // ===== NAVIGATION =====
  NAV_LINK_CLICKED: 'nav_link_clicked',
  HELP_MENU_CLICKED: 'help_menu_clicked',
  
  // ===== UI INTERACTIONS =====
  UI_CLICK: 'ui_click',
  THEME_CHANGED: 'theme_changed',
  CONTENT_SHARED: 'content_shared',
  EMPTY_STATE_PRIMARY_ACTION: 'empty_state_primary_action',
  EMPTY_STATE_SECONDARY_ACTION: 'empty_state_secondary_action',
  
  // ===== COMMAND PALETTE =====
  COMMAND_PALETTE_OPENED: 'command_palette_opened',
  COMMAND_PALETTE_ACTION: 'command_palette_action',
  SHORTCUT_USED: 'shortcut_used',
  SHORTCUTS_HELP_OPENED: 'shortcuts_help_opened',
  
  // ===== RATE LIMITING =====
  RATE_LIMIT_WARNING_SHOWN: 'rate_limit_warning_shown',
  RATE_LIMIT_INDICATOR_CLICKED: 'rate_limit_indicator_clicked',
  
  // ===== GUEST LIMITS =====
  GUEST_LIMIT_MODAL_SHOWN: 'guest_limit_modal_shown',
  GUEST_LIMIT_SIGNUP_CLICKED: 'guest_limit_signup_clicked',
  GUEST_LIMIT_SIGNIN_CLICKED: 'guest_limit_signin_clicked',
  GUEST_EXIT_WARNING_TRIGGERED: 'guest_exit_warning_triggered',
  GUEST_EXIT_WARNING_SIGNUP_CLICKED: 'guest_exit_warning_signup_clicked',
  GUEST_EXIT_WARNING_LEFT_ANYWAY: 'guest_exit_warning_left_anyway',
  GUEST_EXIT_WARNING_DISMISSED_SESSION: 'guest_exit_warning_dismissed_session',
  GUEST_VALUE_MOMENT: 'guest_value_moment',
  GUEST_LIMIT_MODAL_VARIANT: 'guest_limit_modal_variant',
  
  // ===== AUTH REQUIRED =====
  AUTH_REQUIRED_VIEWED: 'auth_required_viewed',
  AUTH_REQUIRED_CTA_CLICKED: 'auth_required_cta_clicked',
  
  // ===== HOME EXPERIMENT =====
  HOME_VARIANT_VIEWED: 'home_variant_viewed',
  HOME_PRIMARY_CTA_CLICKED: 'home_primary_cta_clicked',
  
  // ===== PWA & INSTALL =====
  APP_OPENED_STANDALONE: 'app_opened_standalone',
  PWA_VISIT_TRACKED: 'pwa_visit_tracked',
  PWA_INSTALL_PROMPTED: 'pwa_install_prompted',
  PWA_INSTALL_ACCEPTED: 'pwa_install_accepted',
  PWA_INSTALL_DISMISSED: 'pwa_install_dismissed',
  IOS_PWA_VISIT_TRACKED: 'ios_pwa_visit_tracked',
  IOS_PWA_PROMPTED: 'ios_pwa_prompted',
  IOS_PWA_DISMISSED: 'ios_pwa_dismissed',
  IOS_PWA_INSTRUCTIONS_VIEWED: 'ios_pwa_instructions_viewed',
  
  // ===== ONBOARDING & TOUR =====
  ONBOARDING_TOUR_STEP: 'onboarding_tour_step',
  ONBOARDING_TOUR_SKIPPED: 'onboarding_tour_skipped',
  ONBOARDING_TOUR_COMPLETED: 'onboarding_tour_completed',
  
  // ===== AI MEMORY =====
  AI_MEMORY_GREETING_SHOWN: 'ai_memory_greeting_shown',
  AI_MEMORY_CONSENT: 'ai_memory_consent',
  AI_MEMORY_GREETING_DISMISSED: 'ai_memory_greeting_dismissed',
  AI_MEMORY_CLEARED: 'ai_memory_cleared',
  
  // ===== COACH & TIPS =====
  COACH_BUBBLE_SHOWN: 'coach_bubble_shown',
  COACH_BUBBLE_DISMISSED: 'coach_bubble_dismissed',
  COACH_BUBBLE_ACTION_CLICKED: 'coach_bubble_action_clicked',
  CONTEXTUAL_TIP_SHOWN: 'contextual_tip_shown',
  
  // ===== SAMPLE DECKS =====
  SAMPLE_DECK_IMPORT_STARTED: 'sample_deck_import_started',
  SAMPLE_DECK_IMPORT_COMPLETED: 'sample_deck_import_completed',
  SAMPLE_DECK_IMPORT_FAILED: 'sample_deck_import_failed',
  SAMPLE_DECK_BUTTON_CLICKED: 'sample_deck_button_clicked',
  
  // ===== BADGES =====
  BADGE_SHARE_ACTION: 'badge_share_action',
  
  // ===== CUSTOM CARDS =====
  CUSTOM_CARD_CREATED: 'custom_card_created',
  CUSTOM_CARD_SHARED: 'custom_card_shared',
  
  // ===== SERVER-SIDE EVENTS (from API routes) =====
  THREAD_CREATED: 'thread_created',
  THREAD_RENAMED: 'thread_renamed',
  THREAD_LINKED: 'thread_linked',
  THREAD_UNLINKED: 'thread_unlinked',
  THREAD_DELETED: 'thread_deleted',
  FEEDBACK_SENT: 'feedback_sent',
  
  // ===== PERFORMANCE & TIMING (from server) =====
  STAGE_TIME_RESEARCH: 'stage_time_research',
  STAGE_TIME_ANSWER: 'stage_time_answer',
  STAGE_TIME_REVIEW: 'stage_time_review',
  
  // ===== WORKFLOW EVENTS =====
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_STEP_COMPLETED: 'workflow.step_completed',
  WORKFLOW_ABANDONED: 'workflow.abandoned',
  WORKFLOW_COMPLETED: 'workflow.completed',
  
  // ===== WEB VITALS =====
  WEB_VITAL: 'web_vital', // Prefix for web vitals (e.g., web_vital_LCP, web_vital_CLS)
} as const;

/**
 * Type-safe event name
 * 
 * Usage:
 *   function trackEvent(event: AnalyticsEventName, props?: Record<string, any>) {
 *     capture(event, props);
 *   }
 */
export type AnalyticsEventName =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];


