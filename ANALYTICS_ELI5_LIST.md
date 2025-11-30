# 📊 All Analytics Wired in ManaTap.ai - ELI5 Edition

**ELI5 = Explain Like I'm 5** - Simple explanations of what each analytics event does and why it matters.

---

## 🎯 **PRO Funnel Analytics** (Making Money Tracking)

### 1. `pro_gate_viewed` 
**What it does:** Tracks when a non-PRO user sees a "PRO only" badge or locked feature.
**Why it matters:** Shows which features make people want to upgrade. Like seeing a toy behind glass.
**Where it fires:** HandTestingWidget, CollectionEditor (when PRO features are visible)

### 2. `pro_gate_clicked`
**What it does:** Tracks when someone clicks on a PRO-locked feature they can't use yet.
**Why it matters:** Shows strong upgrade intent - they want the feature but can't have it yet.
**Where it fires:** When clicking disabled PRO buttons (hand testing, fix card names, price snapshots)

### 3. `pro_upgrade_started`
**What it does:** Tracks when someone clicks "Upgrade to PRO" or visits pricing page.
**Why it matters:** This is the start of the money-making journey! They're seriously considering paying.
**Where it fires:** Upgrade buttons, pricing page clicks

### 4. `pro_upgrade_completed`
**What it does:** Tracks successful PRO subscription payment.
**Why it matters:** 🎉 MONEY! This is the goal. Shows which features/triggers lead to actual revenue.
**Where it fires:** After successful Stripe payment

### 5. `pro_feature_used`
**What it does:** Tracks when PRO users actually use their premium features.
**Why it matters:** Shows if PRO users are getting value. If they don't use features, they might cancel.
**Where it fires:** Hand testing, fix card names, price snapshots, bulk actions

### 6. `pro_downgrade`
**What it does:** Tracks when PRO users cancel their subscription.
**Why it matters:** Shows churn - need to understand why people leave to prevent it.
**Where it fires:** Subscription cancellation (if implemented)

---

## 🔄 **Workflow Analytics** (User Journey Tracking)

### 7. `workflow.started`
**What it does:** Tracks when someone begins a multi-step process (like creating a deck).
**Why it matters:** Shows how many people start vs. finish. If many start but few finish, something's broken.
**Where it fires:** Deck creation started, collection import started

### 8. `workflow.step_completed`
**What it does:** Tracks each step someone completes in a workflow.
**Why it matters:** Shows where people get stuck. Like a video game checkpoint - see where players die.
**Where it fires:** Format selected, cards added, file uploaded, etc.

### 9. `workflow.abandoned`
**What it does:** Tracks when someone gives up mid-workflow.
**Why it matters:** Shows what's too hard or confusing. The "rage quit" moment.
**Where it fires:** When user closes/cancels during deck creation or import

### 10. `workflow.completed`
**What it does:** Tracks successful completion of entire workflow.
**Why it matters:** Success! Shows what works. High completion = good UX.
**Where it fires:** Deck saved, collection import finished

**Specific Workflows:**
- **Deck Creation:** started → format_selected → cards_added → saved
- **Collection Import:** started → file_selected → uploaded → completed

---

## ⚡ **Performance Analytics** (Speed Tracking)

### 11. `performance.api_latency`
**What it does:** Tracks how long API calls take (in milliseconds).
**Why it matters:** Slow = bad. Fast = good. Shows if servers are struggling.
**Where it fires:** Every API call (wrapped in `trackApiCall()`)

### 12. `performance.page_load`
**What it does:** Tracks how long pages take to load.
**Why it matters:** Slow pages = users leave. Google also penalizes slow sites.
**Where it fires:** Page navigation (if implemented)

### 13. `performance.component_render`
**What it does:** Tracks how long React components take to render.
**Why it matters:** Slow components = laggy UI. Shows which components need optimization.
**Where it fires:** Using `useRenderPerformance()` hook (if implemented)

### 14. `performance.search_query`
**What it does:** Tracks how long searches take.
**Why it matters:** Slow search = frustrated users. Shows if search needs optimization.
**Where it fires:** Card searches, deck searches (if implemented)

---

## 🐛 **Error Analytics** (Problem Tracking)

### 15. `error.api_failure`
**What it does:** Tracks when API calls fail (network errors, 500 errors, etc.).
**Why it matters:** Shows what's broken. High error rate = unhappy users.
**Where it fires:** Failed API calls (automatically via `trackApiCall()`)

### 16. `error.client_error`
**What it does:** Tracks JavaScript errors in the browser.
**Why it matters:** Shows bugs that break the app. Critical for fixing crashes.
**Where it fires:** React Error Boundaries, try/catch blocks

### 17. `error.network_timeout`
**What it does:** Tracks when requests take too long and timeout.
**Why it matters:** Shows network issues or overloaded servers.
**Where it fires:** Timeout handlers (if implemented)

### 18. `error.validation_failed`
**What it does:** Tracks when user input fails validation (wrong format, missing fields).
**Why it matters:** Shows confusing forms or unclear requirements.
**Where it fires:** Form validation errors (if implemented)

---

## 👤 **User Onboarding Analytics** (First Experience)

### 19. `user_first_visit`
**What it does:** Tracks the very first time someone visits the site.
**Why it matters:** Shows new user acquisition. First impression matters!
**Where it fires:** FirstVisitTracker component, middleware

### 20. `signup_started`
**What it does:** Tracks when someone clicks "Sign Up" or starts registration.
**Why it matters:** Shows signup intent. How many people want accounts?
**Where it fires:** Sign up buttons, registration forms

### 21. `signup_completed`
**What it does:** Tracks successful account creation.
**Why it matters:** Shows conversion rate. How many starters actually finish?
**Where it fires:** After successful email signup or OAuth

### 22. `first_action_taken`
**What it does:** Tracks the first thing a new user does (chat, create deck, etc.).
**Why it matters:** Shows what hooks new users. First action = engagement!
**Where it fires:** First chat message, first deck created, first collection upload

### 23. `value_moment_reached`
**What it does:** Tracks when users experience their first "wow" moment.
**Why it matters:** Shows what makes users stick around. Key retention metric.
**Where it fires:** First deck created, first good AI response, collection imported

---

## 💬 **Chat Analytics** (AI Assistant Tracking)

### 24. `chat_sent`
**What it does:** Tracks every chat message sent to the AI.
**Why it matters:** Shows engagement. More messages = more value users get.
**Where it fires:** Every AI chat message (server-side)

### 25. `chat_session_length`
**What it does:** Tracks how long chat sessions last and how many messages.
**Why it matters:** Long sessions = users finding value. Short = maybe AI isn't helpful.
**Where it fires:** When chat session ends (Chat component)

### 26. `chat_stream_stop`
**What it does:** Tracks when users stop AI responses mid-stream.
**Why it matters:** Shows if responses are too long or users get what they need quickly.
**Where it fires:** When user clicks "Stop" during streaming

### 27. `chat_feedback`
**What it does:** Tracks thumbs up/down on AI responses.
**Why it matters:** Direct quality signal. Bad responses = fix the AI.
**Where it fires:** Feedback buttons in chat

### 28. `guest_limit_warning_15` / `guest_limit_warning_18`
**What it does:** Tracks when guest users hit message limits (15 and 18 messages).
**Why it matters:** Shows conversion opportunity - they're engaged, time to sign up!
**Where it fires:** Guest chat limit warnings

### 29. `guest_limit_modal_shown`
**What it does:** Tracks when the "sign up to continue" modal appears.
**Why it matters:** Shows signup prompts. How many see it vs. how many convert?
**Where it fires:** Guest limit reached modal

### 30. `stage_time_research` / `stage_time_answer` / `stage_time_review`
**What it does:** Tracks how long each AI stage takes (research, answer, review).
**Why it matters:** Shows AI performance. Slow stages = need optimization.
**Where it fires:** Multi-stage AI chat pipeline (server-side)

---

## 🃏 **Deck Analytics** (Deck Building Tracking)

### 31. `deck_created`
**What it does:** Tracks when a new deck is created.
**Why it matters:** Core feature usage. More decks = more engaged users.
**Where it fires:** After deck save (server-side)

### 32. `deck_saved`
**What it does:** Tracks when a deck is saved (new or updated).
**Why it matters:** Shows active deck building. Saved = user invested time.
**Where it fires:** Deck save API (server-side)

### 33. `deck_updated`
**What it does:** Tracks when existing decks are modified.
**Why it matters:** Shows ongoing engagement. Users improving decks = retention.
**Where it fires:** Deck update API (server-side)

### 34. `deck_deleted`
**What it does:** Tracks when decks are deleted.
**Why it matters:** Shows churn or cleanup. High delete rate = maybe decks aren't useful?
**Where it fires:** Deck delete API (server-side)

### 35. `deck_card_added` / `deck_card_removed`
**What it does:** Tracks every card added/removed from decks.
**Why it matters:** Shows active deck building. Lots of adds = engaged users.
**Where it fires:** Card add/remove actions in deck editor

### 36. `deck_copied`
**What it does:** Tracks when someone copies a public deck.
**Why it matters:** Shows popular decks and sharing. Social proof!
**Where it fires:** Copy deck button

### 37. `deck_shared`
**What it does:** Tracks when decks are shared (made public or shared via link).
**Why it matters:** Shows community engagement and viral potential.
**Where it fires:** Deck public toggle, share buttons

### 38. `public_deck_viewed`
**What it does:** Tracks when someone views a public deck.
**Why it matters:** Shows content discovery. Popular decks = more engagement.
**Where it fires:** Public deck views

---

## 📦 **Collection Analytics** (Card Collection Tracking)

### 39. `collection_created`
**What it does:** Tracks when users create a new collection.
**Why it matters:** Shows feature adoption. Collections = organized users.
**Where it fires:** Collection creation API (server-side)

### 40. `collection_deleted`
**What it does:** Tracks when collections are deleted.
**Why it matters:** Shows if collections are useful or if users abandon them.
**Where it fires:** Collection delete API (server-side)

### 41. `csv_uploaded`
**What it does:** Tracks CSV file uploads for collection import.
**Why it matters:** Shows bulk import usage. Popular feature!
**Where it fires:** CSV upload API (server-side)

---

## 💰 **Cost & Pricing Analytics**

### 42. `cost_computed`
**What it does:** Tracks when users calculate deck/collection costs.
**Why it matters:** Shows budget awareness feature usage. Popular for budget players.
**Where it fires:** Cost-to-finish calculations (server-side)

### 43. `pricing_page_viewed`
**What it does:** Tracks when someone visits the pricing page.
**Why it matters:** Shows upgrade interest. High views = potential revenue.
**Where it fires:** Pricing page visits

### 44. `pricing_upgrade_clicked`
**What it does:** Tracks clicks on upgrade buttons on pricing page.
**Why it matters:** Shows strong conversion intent. They're ready to pay!
**Where it fires:** Upgrade button clicks

### 45. `feature_limit_hit`
**What it does:** Tracks when free users hit usage limits (e.g., 20 guest messages).
**Why it matters:** Shows conversion opportunity. They're engaged, time to upgrade!
**Where it fires:** When limits are reached (chat, etc.)

---

## 🔍 **Search & Discovery Analytics**

### 46. `card_search_query`
**What it does:** Tracks card searches (what people search for).
**Why it matters:** Shows popular cards and search patterns. Helps improve search.
**Where it fires:** Card search (if implemented)

### 47. `card_selected`
**What it does:** Tracks when users click/select a card from search results.
**Why it matters:** Shows search effectiveness. Do people find what they want?
**Where it fires:** Card selection from search (if implemented)

### 48. `feature_discovered`
**What it does:** Tracks when users discover new features (via navigation, tooltips, etc.).
**Why it matters:** Shows feature visibility. Hidden features = wasted development.
**Where it fires:** Navigation clicks, tooltip views, feature discovery

---

## 🧪 **Experiment & Feature Flag Analytics**

### 49. `experiment.assigned`
**What it does:** Tracks when users are assigned to A/B test variants.
**Why it matters:** Shows experiment participation. Need even distribution for valid tests.
**Where it fires:** A/B test assignment (if implemented)

### 50. `experiment.converted`
**What it does:** Tracks when users hit experiment goals (signup, purchase, etc.).
**Why it matters:** Shows which variant wins. Data-driven decisions!
**Where it fires:** Conversion events in experiments (if implemented)

### 51. `feature.enabled` / `feature.used`
**What it does:** Tracks feature flag states and usage.
**Why it matters:** Shows feature adoption and gradual rollouts.
**Where it fires:** Feature flag checks (if implemented)

---

## 🎨 **UI & Theme Analytics**

### 52. `theme_changed`
**What it does:** Tracks when users switch between light/dark mode.
**Why it matters:** Shows user preference. Most users prefer dark? Make it default!
**Where it fires:** Theme toggle

### 53. `help_tooltip_viewed`
**What it does:** Tracks when users view help tooltips.
**Why it matters:** Shows what's confusing. High tooltip views = unclear UI.
**Where it fires:** Tooltip displays (if implemented)

---

## 📱 **Server-Side Events** (Always Tracked, No Cookie Consent Needed)

These fire server-side, so they work even without cookie consent:

### 54. `thread_created`
**What it does:** Tracks new chat thread creation.
**Why it matters:** Shows chat engagement. More threads = more usage.
**Where it fires:** Chat thread creation API

### 55. `thread_renamed` / `thread_deleted` / `thread_linked`
**What it does:** Tracks chat thread management actions.
**Why it matters:** Shows organization behavior. Users organizing = engaged.
**Where it fires:** Thread management APIs

### 56. `watchlist_item_added` / `watchlist_item_removed`
**What it does:** Tracks price watchlist additions/removals.
**Why it matters:** Shows price tracking feature usage.
**Where it fires:** Watchlist APIs

### 57. `wishlist_item_added`
**What it does:** Tracks wishlist additions.
**Why it matters:** Shows future purchase intent. Wishlist = potential customers.
**Where it fires:** Wishlist API

### 58. `feedback_sent`
**What it does:** Tracks user feedback submissions.
**Why it matters:** Direct user input. Critical for improvements!
**Where it fires:** Feedback API

---

## 🔐 **Auth Analytics**

### 59. `auth_login_success` / `auth_login_failed`
**What it does:** Tracks login attempts (success and failure).
**Why it matters:** Shows auth issues. High failure rate = password problems or bugs.
**Where it fires:** Login API, Header component

### 60. `email_verified_success`
**What it does:** Tracks successful email verification.
**Why it matters:** Shows account activation. Unverified = can't use full features.
**Where it fires:** Email verification API

---

## 📊 **Summary by Category**

**PRO Funnel (6 events):** Making money - track upgrade journey
**Workflows (4 events):** User journeys - see where people drop off
**Performance (4 events):** Speed tracking - find slow spots
**Errors (4 events):** Problem tracking - fix bugs
**Onboarding (5 events):** First experience - hook new users
**Chat (7 events):** AI assistant - engagement and quality
**Decks (8 events):** Core feature - deck building activity
**Collections (3 events):** Card management - organization
**Pricing (4 events):** Revenue - conversion tracking
**Search (3 events):** Discovery - what users want
**Experiments (3 events):** A/B testing - data-driven decisions
**UI (2 events):** User preferences - UX insights
**Server-Side (5 events):** Always-on tracking - no consent needed
**Auth (2 events):** Account management - access tracking

**Total: ~60+ analytics events wired and tracking!**

---

## 🎯 **Key Insights You Can Get**

1. **Conversion Funnel:** See where users drop off in the PRO upgrade journey
2. **Feature Adoption:** Which features do users actually use?
3. **Performance Issues:** Find slow APIs and components
4. **Error Patterns:** Identify bugs and fix them proactively
5. **User Engagement:** Track chat sessions, deck creation, collection usage
6. **Revenue Attribution:** See which features drive PRO upgrades
7. **Retention Signals:** Identify "value moments" that keep users coming back

---

## ⚠️ **Important Notes**

- **Cookie Consent:** Most client-side events require cookie consent (GDPR)
- **Server-Side:** Events with `captureServer()` always work (no consent needed)
- **Privacy:** Error messages and user data are sanitized before tracking
- **Performance:** Analytics are non-blocking (won't slow down the app)

---

**All analytics go to PostHog for analysis and visualization!** 📈

