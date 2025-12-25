# 📊 Analytics Overview - Complete Summary

**Last Updated**: January 2025  
**Total Events Tracked**: 200+ events across 25+ categories  
**Analytics Platform**: PostHog

---

## 📈 Summary by Category

### 1. **Core App Events** (3 events)
**Purpose**: Track fundamental app lifecycle and user visits

- `app_open` - App initialization
- `$pageview` - Page navigation (automatic)
- `user_first_visit` - First-time user detection

**Key Metrics**: User acquisition, app engagement, page views

---

### 2. **Authentication & Signup** (9 events)
**Purpose**: Track user authentication flows and signup conversion

- `auth_login_attempt` - Login initiated (method: email_password)
- `auth_login_success` - Successful login
- `auth_login_failed` - Failed login (error_type)
- `auth_logout_attempt` - Logout initiated
- `auth_logout_success` - Successful logout
- `auth_logout_failed` - Logout error
- `auth_logout_timeout_fallback` - Logout timeout handling
- `signup_completed` - New user registration completed
- `signup_started` - Signup flow initiated (source tracking)

**Key Metrics**: Login success rate, signup conversion, authentication errors

---

### 3. **Email Verification** (9 events)
**Purpose**: Track email verification completion and reminders

- `email_verification_reminder_shown` - Reminder displayed (hours_since_signup)
- `email_verification_resent` - Resend email triggered
- `email_verification_resent_on_login` - Resent during login
- `email_verification_resent_on_signup` - Resent during signup
- `email_verification_resent_from_profile` - Resent from profile page
- `email_verification_resend_failed` - Resend error
- `email_verification_reminder_dismissed` - User dismissed reminder
- `email_verified_success` - Email verified successfully
- `email_verification_popup_dismissed` - Popup dismissed

**Key Metrics**: Verification completion rate, reminder effectiveness, resend patterns

---

### 4. **Deck Management** (20 events)
**Purpose**: Track deck creation, editing, and user interactions

**Deck Lifecycle**:
- `deck_created` - New deck created (deck_id, user_id, name)
- `deck_saved` - Deck saved
- `deck_updated` - Deck modified
- `deck_deleted` - Deck removed
- `deck_duplicated` - Deck copied
- `deck_analyzed` - AI analysis performed
- `deck_editor_opened` - Editor accessed

**Deck Import**:
- `deck_import_attempted` - Import started
- `deck_import_completed` - Import successful
- `deck_import_modal_opened` - Import UI opened
- `deck_imported` - Import finished

**Card Operations**:
- `deck_card_added` - Card added to deck
- `deck_card_removed` - Card removed
- `deck_card_quantity_changed` - Quantity modified (old/new values)
- `bulk_delete_cards` - Multiple cards deleted
- `deck_card_click` - Card clicked

**Deck Versions**:
- `deck_version_saved` - Version snapshot created
- `deck_version_restored` - Version restored

**Deck Comments**:
- `deck_comment_posted` - Comment added
- `deck_comment_deleted` - Comment removed

**Key Metrics**: Deck creation rate, card addition patterns, import success rate, engagement depth

---

### 5. **Deck Browsing** (5 events)
**Purpose**: Track public deck discovery and browsing behavior

- `browse_decks_page_view` - Browse page visited
- `browse_decks_loaded` - Decks loaded (count, filters)
- `browse_deck_clicked` - Deck selected (deck_id)
- `back_to_top_clicked` - Scroll to top action
- `advanced_filters_applied` - Filters used (filters object)

**Key Metrics**: Browse engagement, filter usage, deck discovery patterns

---

### 6. **AI Chat & Interactions** (8 events)
**Purpose**: Track AI chat usage, limits, and user feedback

**Chat Messages**:
- `chat_sent` - Message sent (chars, source)
- `chat_stream_stop` - Stream stopped (stopped_by)
- `chat_stream_fallback` - Fallback response used
- `chat_stream_error` - Stream error (reason)
- `chat_feedback` - User feedback (rating, thread_id, msg_id)

**Guest Limits**:
- `chat_guest_limit` - Guest limit reached (message_count)
- `guest_limit_warning_15` - Warning at 15 messages
- `guest_limit_warning_18` - Warning at 18 messages
- `guest_chat_restored` - Guest session restored (message_count)

**Key Metrics**: Chat engagement, guest conversion, error rates, feedback sentiment

---

### 7. **AI Suggestions** (2 events)
**Purpose**: Track AI-powered deck improvement suggestions

- `ai_suggestion_shown` - Suggestion displayed (suggestion_id, category, deck_id)
- `ai_suggestion_accepted` - Suggestion accepted (suggestion_id, card, category, deck_id, prompt_version)

**Key Metrics**: Suggestion acceptance rate, category effectiveness, prompt version performance

---

### 8. **Collections** (6 events)
**Purpose**: Track collection management and imports

- `collection_created` - Collection created (collection_id, user_id, name)
- `collection_deleted` - Collection removed (collection_id, user_id)
- `collection_imported` - Import completed
- `collections.card_click` - Card clicked in collection
- `bulk_delete_collection_items` - Bulk removal
- `csv_uploaded` - CSV file uploaded

**Key Metrics**: Collection creation rate, import success, engagement

---

### 9. **Wishlist** (6 events)
**Purpose**: Track wishlist management

- `wishlist_page_view` - Wishlist page visited
- `wishlist_created` - New wishlist (wishlist_id, name)
- `wishlist_renamed` - Wishlist renamed (wishlist_id, new_name)
- `wishlist_deleted` - Wishlist removed (wishlist_id)
- `wishlist_item_added` - Item added (wishlist_id, user_id, name)
- `bulk_delete_wishlist_items` - Bulk removal

**Key Metrics**: Wishlist usage, item addition patterns

---

### 10. **Watchlist** (3 events)
**Purpose**: Track price watchlist functionality

- `watchlist_page_view` - Watchlist page visited
- `watchlist_item_added` - Card added to watchlist (watchlist_id, user_id, name)
- `watchlist_item_removed` - Card removed (watchlist_id, user_id, name)

**Key Metrics**: Watchlist engagement, price tracking interest

---

### 11. **Cost Analysis** (2 events)
**Purpose**: Track cost-to-finish feature usage

- `cost_to_finish_opened` - Feature accessed
- `cost_computed` - Cost calculation completed

**Key Metrics**: Feature usage, cost analysis engagement

---

### 12. **PRO & Pricing** (10 events)
**Purpose**: Track PRO conversion funnel and subscription management

**Pricing Page**:
- `pricing_page_viewed` - Pricing page visited (is_authenticated)
- `pricing_upgrade_clicked` - Upgrade button clicked (is_authenticated, plan, source)
- `pricing_interval_changed` - Monthly/annual toggle (interval)

**PRO Gates**:
- `pro_gate_viewed` - PRO gate displayed (feature, location)
- `pro_gate_clicked` - PRO gate clicked (feature, location)
- `pro_upgrade_started` - Upgrade flow started (feature, source)
- `pro_upgrade_completed` - Subscription completed
- `pro_feature_used` - PRO feature used (feature name)
- `pro_downgrade` - Subscription cancelled

**Billing**:
- `billing_portal_clicked` - Billing portal accessed (source)

**Key Metrics**: Conversion funnel, gate effectiveness, feature usage, churn

---

### 13. **Profile** (8 events)
**Purpose**: Track profile interactions and settings

- `profile_view` - Profile page visited
- `profile_wishlist_save` - Wishlist saved (count)
- `profile_username_change` - Username updated
- `profile_fav_commander_set` - Favorite commander set
- `profile_avatar_change` - Avatar changed (src, type)
- `profile_pricing_cta_clicked` - Pricing CTA clicked (source)
- `profile_pricing_learn_more_clicked` - Learn more clicked (source)
- `profile_share` - Profile shared (user_id, is_public)

**Key Metrics**: Profile engagement, customization patterns

---

### 14. **Navigation** (2 events)
**Purpose**: Track navigation patterns and help menu usage

- `nav_link_clicked` - Navigation link clicked (destination, source: header/mobile_menu)
- `help_menu_clicked` - Help menu accessed (link)

**Key Metrics**: Navigation patterns, help usage, mobile vs desktop behavior

---

### 15. **UI Interactions** (5 events)
**Purpose**: Track general UI interactions and preferences

- `ui_click` - Generic UI click
- `theme_changed` - Theme switched (from, to)
- `content_shared` - Content shared (platform, type)
- `empty_state_primary_action` - Empty state CTA clicked (title)
- `empty_state_secondary_action` - Empty state secondary action (title)

**Key Metrics**: Theme preferences, sharing behavior, empty state effectiveness

---

### 16. **Command Palette & Shortcuts** (4 events)
**Purpose**: Track keyboard shortcuts and command palette usage

- `command_palette_opened` - Command palette opened
- `command_palette_action` - Command executed (command)
- `shortcut_used` - Keyboard shortcut used (key, action)
- `shortcuts_help_opened` - Shortcuts help viewed

**Key Metrics**: Power user behavior, shortcut adoption

---

### 17. **Rate Limiting** (2 events)
**Purpose**: Track API rate limit warnings and user awareness

- `rate_limit_warning_shown` - Warning displayed (percent_used)
- `rate_limit_indicator_clicked` - Indicator clicked (percent_used)

**Key Metrics**: Rate limit impact, user awareness

---

### 18. **Guest Limits** (6 events)
**Purpose**: Track guest user limits and conversion prompts

- `guest_limit_modal_shown` - Limit modal displayed (message_count)
- `guest_limit_signup_clicked` - Signup clicked from modal (message_count)
- `guest_limit_signin_clicked` - Signin clicked from modal (message_count)
- `guest_exit_warning_triggered` - Exit warning shown
- `guest_exit_warning_signup_clicked` - Signup from exit warning
- `guest_exit_warning_left_anyway` - User left despite warning

**Key Metrics**: Guest conversion rate, limit effectiveness

---

### 19. **PWA & Install** (7 events)
**Purpose**: Track Progressive Web App installation and usage

- `app_opened_standalone` - App opened as PWA
- `pwa_visit_tracked` - PWA visit counted
- `pwa_install_prompted` - Install prompt shown
- `pwa_install_accepted` - Install accepted
- `pwa_install_dismissed` - Install dismissed
- `ios_pwa_visit_tracked` - iOS PWA visit (visit_count)
- `ios_pwa_prompted` - iOS install prompt (visit_count)
- `ios_pwa_dismissed` - iOS prompt dismissed
- `ios_pwa_instructions_viewed` - iOS instructions viewed

**Key Metrics**: PWA adoption, install conversion, iOS engagement

---

### 20. **Sample Decks** (4 events)
**Purpose**: Track sample deck import and discovery

- `sample_deck_import_started` - Import initiated (deck_id)
- `sample_deck_import_completed` - Import successful (deck_id, source)
- `sample_deck_import_failed` - Import failed (deck_id, error)
- `sample_deck_button_clicked` - Sample deck button clicked (source)
- `sample_deck_auth_clicked` - Auth required clicked (action: signin)

**Key Metrics**: Sample deck usage, import success rate

---

### 21. **Workflow Tracking** (4 events)
**Purpose**: Track multi-step user journeys and abandonment

- `workflow.started` - Workflow initiated (workflow_type, source)
- `workflow.step_completed` - Step completed (workflow_type, step, data)
- `workflow.abandoned` - Workflow abandoned (workflow_type, current_step, abandon_reason)
- `workflow.completed` - Workflow finished (workflow_type, completion_data)

**Tracked Workflows**:
- Deck Creation (started → format selected → cards added → saved)
- Collection Import (started → file selected → uploaded → completed)

**Key Metrics**: Completion rates, abandonment points, workflow optimization

---

### 22. **Performance & Errors** (8 events)
**Purpose**: Track performance metrics and error occurrences

**Performance**:
- `performance.api_latency` - API call duration (endpoint, operation, duration_ms)
- `performance.page_load` - Page load time
- `performance.component_render` - Component render time (component, duration_ms)
- `performance.search_query` - Search operation duration

**Errors**:
- `error.api_failure` - API call failed (error_type, error_code, api_endpoint, user_action)
- `error.client_error` - Client-side error (error_type, component, error_message)
- `error.network_timeout` - Network timeout (endpoint, timeout_ms)
- `error.validation_failed` - Validation error (form, field, error_type)

**Key Metrics**: Performance bottlenecks, error rates, user experience impact

---

### 23. **Web Vitals** (6 events)
**Purpose**: Track Core Web Vitals for performance monitoring

- `web_vital_LCP` - Largest Contentful Paint
- `web_vital_FID` - First Input Delay
- `web_vital_CLS` - Cumulative Layout Shift
- `web_vital_INP` - Interaction to Next Paint
- `web_vital_FCP` - First Contentful Paint
- `web_vital_TTFB` - Time to First Byte

**Key Metrics**: Core Web Vitals scores, performance trends

---

### 24. **Consent & Privacy** (1 event)
**Purpose**: Track privacy consent choices

- `consent_choice` - Consent decision (accepted/rejected, timestamp)

**Key Metrics**: Consent acceptance rate, GDPR compliance

---

### 25. **Server-Side Events** (6 events)
**Purpose**: Track server-side operations and chat threads

- `thread_created` - Chat thread created (thread_id, user_id)
- `thread_renamed` - Thread renamed (thread_id, user_id, title)
- `thread_linked` - Thread linked to deck (thread_id, user_id, deck_id)
- `thread_unlinked` - Thread unlinked (thread_id, user_id, deck_id)
- `thread_deleted` - Thread deleted (thread_id, user_id)
- `feedback_sent` - User feedback submitted (thread_id, rating, message)

**Key Metrics**: Thread management, feedback collection

---

## 📊 Event Tracking Summary

| Category | Event Count | Primary Purpose |
|----------|-------------|-----------------|
| Core App | 3 | App lifecycle |
| Authentication | 9 | User auth flows |
| Email Verification | 9 | Verification completion |
| Deck Management | 20 | Deck operations |
| Deck Browsing | 5 | Public deck discovery |
| AI Chat | 8 | Chat interactions |
| AI Suggestions | 2 | Deck improvements |
| Collections | 6 | Collection management |
| Wishlist | 6 | Wishlist operations |
| Watchlist | 3 | Price tracking |
| Cost Analysis | 2 | Cost calculations |
| PRO & Pricing | 10 | Conversion funnel |
| Profile | 8 | User profile |
| Navigation | 2 | Navigation patterns |
| UI Interactions | 5 | General UI |
| Command Palette | 4 | Keyboard shortcuts |
| Rate Limiting | 2 | API limits |
| Guest Limits | 6 | Guest conversion |
| PWA & Install | 7 | PWA adoption |
| Sample Decks | 4 | Sample deck usage |
| Workflow Tracking | 4 | User journeys |
| Performance & Errors | 8 | Performance monitoring |
| Web Vitals | 6 | Core Web Vitals |
| Consent & Privacy | 1 | GDPR compliance |
| Server-Side | 6 | Server operations |
| **TOTAL** | **~150+** | **Comprehensive tracking** |

---

## 🎯 Key Analytics Use Cases

### Conversion Funnel Analysis
- **Signup Flow**: `signup_started` → `signup_completed` → `email_verified_success`
- **PRO Conversion**: `pro_gate_viewed` → `pro_gate_clicked` → `pro_upgrade_started` → `pro_upgrade_completed`
- **Guest Conversion**: `guest_limit_warning_*` → `guest_limit_signup_clicked` → `signup_completed`

### User Engagement
- **Deck Building**: `deck_created` → `deck_card_added` → `deck_saved` → `deck_analyzed`
- **Chat Usage**: `chat_sent` → `chat_feedback` → `ai_suggestion_accepted`
- **Feature Discovery**: `nav_link_clicked` → `feature_discovered` → `pro_feature_used`

### Performance Monitoring
- **Web Vitals**: All `web_vital_*` events for Core Web Vitals tracking
- **API Performance**: `performance.api_latency` for endpoint monitoring
- **Error Tracking**: `error.*` events for error rate analysis

### Workflow Optimization
- **Deck Creation**: `workflow.started` → `workflow.step_completed` → `workflow.completed` or `workflow.abandoned`
- **Collection Import**: Track import success and failure points

---

## 🔧 Implementation Details

### Client-Side Tracking
- **Helper**: `lib/ph.ts` - `capture()` function
- **Consent-Gated**: All custom events require cookie consent
- **Type-Safe**: Uses `AnalyticsEvents` constants from `lib/analytics/events.ts`

### Server-Side Tracking
- **Helper**: `lib/server/analytics.ts` - `captureServer()` function
- **User Context**: Automatically includes user_id when available
- **Error Handling**: Non-fatal (won't break app if tracking fails)

### Event Naming Convention
- **Format**: `snake_case` for all events
- **Categories**: Prefixed by category (e.g., `pro_*`, `workflow.*`, `error.*`)
- **Centralized**: All events defined in `lib/analytics/events.ts`

---

## 📈 Recommended Dashboards

1. **Conversion Funnel**: Signup → Email Verification → PRO Upgrade
2. **Feature Usage**: PRO features, deck operations, AI interactions
3. **Performance**: Web Vitals, API latency, error rates
4. **User Journey**: Workflow completion rates, abandonment points
5. **Engagement**: Chat usage, deck building depth, feature discovery

---

## ⚠️ Important Notes

- **Cookie Consent**: Custom events only fire after consent acceptance
- **Default Events**: PostHog auto-captures `$pageview` and some web vitals without consent
- **Internal Users**: Filtered via `is_internal` property in PostHog
- **Development Mode**: Events logged to console for debugging

---

**For detailed implementation, see**:
- `docs/posthog-standardization-report.md` - Architecture overview
- `docs/POSTHOG_EVENTS_SUMMARY.md` - Event details
- `frontend/lib/analytics/events.ts` - Event constants
