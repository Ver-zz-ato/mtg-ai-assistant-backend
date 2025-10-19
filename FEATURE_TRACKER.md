# ManaTap AI - Comprehensive Feature Tracker

**Last Updated**: October 19, 2025  
**Status Legend**: ☑ Complete · ◪ Partial · ☐ Pending · ⊗ Removed

---

## Recently Implemented Features (October 2025)

### Navigation & UI Polish (Oct 19, 2025)
- ☑ **Top Loading Bar** - Gradient progress indicator during page navigation <!-- id:ui.top_loading_bar -->
  - Files: `frontend/components/TopLoadingBar.tsx`, `frontend/app/layout.tsx`
  - Gradient blue→purple→pink animation, suspense-wrapped
  - Shows briefly during route changes, auto-hides after 200ms

- ☑ **Colorful Navigation Links** - Distinct colors for each nav item <!-- id:ui.colorful_nav -->
  - Files: `frontend/components/Header.tsx`
  - Colors: What's New (green), Browse Decks (purple), Blog (blue), Pricing (yellow), Help (orange), My Decks (pink), Collections (cyan), Wishlist (rose)
  - Applied to both desktop and mobile navigation

- ☑ **Logo Size Increase** - 3x larger ManaTap AI logo <!-- id:ui.logo_3x -->
  - Files: `frontend/components/Header.tsx`
  - Changed from 42px to 63px for better brand prominence

- ☑ **Dark Theme for AI Memory Popup** - Matches site dark theme <!-- id:ui.ai_memory_dark -->
  - Files: `frontend/components/AIMemoryGreeting.tsx`
  - Updated from light (white/blue-50) to dark (purple-900/blue-900) gradients
  - Consent prompt and greeting card both styled for dark mode

- ⊗ **Theme Toggle Removed** - Non-functional toggle removed <!-- id:ui.theme_toggle_removed -->
  - Reason: Toggle didn't work, site uses fixed dark theme
  - Files modified: `frontend/components/Header.tsx`, `frontend/components/Providers.tsx`
  - Removed ThemeProvider and ThemeToggle component

### Browse Decks & Discovery (Oct 17-19, 2025)
- ☑ **Browse Decks Page** - `/decks/browse` with filters and search <!-- id:decks.browse_page -->
  - Files: `frontend/app/decks/browse/page.tsx`, `frontend/app/api/decks/browse/route.ts`
  - Format filters, color selection, search functionality
  - 24 decks per page with pagination
  - Fixed RLS issues by using cookie-free public Supabase client
  - Minimum 10 cards filter to prevent empty decks from showing

- ☑ **Deck Art Placeholder** - Consistent fallback for decks without art <!-- id:decks.art_placeholder -->
  - Files: `frontend/components/DeckArtPlaceholder.tsx`
  - Gradient background with card stack icon and "MTG Deck" label
  - Used across Browse Decks and Recent Public Decks

- ☑ **Enhanced Deck Art Loader** - Robust fallback strategies <!-- id:decks.art_loader_enhanced -->
  - Files: `frontend/components/DeckArtLoader.tsx`
  - Processes up to 20 lines, extracts 15 card names
  - Skips basic lands and common patterns
  - Prioritizes non-basic lands
  - Fetches from deck_cards table if needed
  - Fuzzy matching for misspelled names
  - Ultimate fallback to basic lands
  - Extensive console logging for debugging

- ☑ **Recent Public Decks Filter** - Minimum 10 cards required <!-- id:decks.recent_10_min -->
  - Files: `frontend/components/RecentPublicDecks.tsx`, `frontend/app/api/decks/browse/route.ts`
  - Prevents empty/WIP decks from appearing in public listings
  - Uses accurate card counting from deck_text

### Keyboard Navigation & Commands (Oct 2025)
- ☑ **Command Palette** - Quick navigation with Cmd/Ctrl+K <!-- id:ui.command_palette -->
  - Files: `frontend/components/CommandPalette.tsx`, `frontend/components/KeyboardShortcutsProvider.tsx`
  - Search across all major app sections
  - Keyboard navigation (arrow keys, enter to select)
  - 8 quick actions: New Deck, My Decks, Collections, Wishlist, Price Tracker, Pricing, Profile, Help
  - Analytics: `command_palette_opened`, `command_palette_action`

- ☑ **Keyboard Shortcuts System** - Global shortcuts with help modal <!-- id:ui.keyboard_shortcuts -->
  - Files: `frontend/hooks/useKeyboardShortcuts.ts`, `frontend/components/ShortcutsModal.tsx`, `frontend/components/KeyboardShortcutsProvider.tsx`
  - `/` - Focus search, `n` - New deck, `?` - Help modal, Esc - Close modals
  - Smart detection to avoid conflicts while typing
  - Analytics: `shortcut_used`, `shortcuts_help_opened`

### AI & Personalization (Oct 2025)
- ☑ **AI Memory Illusion System** - Context-aware personalized greetings <!-- id:ai.memory_illusion -->
  - Files: `frontend/lib/ai-memory.ts`, `frontend/components/AIMemoryGreeting.tsx`
  - Local storage system with 30-day automatic expiry
  - Tracks: last deck (id, name, commander, colors), collection (id, name, count), recent cards (up to 10)
  - Privacy-first: explicit user consent required with clear opt-out
  - Integrated in chat, deck interactions, card searches
  - Analytics: `ai_memory_consent`, `ai_memory_greeting_shown`, `ai_memory_cleared`

### Rate Limiting & Performance (Oct 2025)
- ☑ **Rate Limit Indicator** - Shows Pro users their API usage <!-- id:rate_limit.indicator -->
  - Files: `frontend/components/RateLimitIndicator.tsx`, `frontend/app/api/rate-limit/status/route.ts`
  - Displayed on `/profile` page in Pro Subscription section
  - Color-coded status: green (<75%), amber (75-90%), red (>90%)
  - Dropdown with progress bar, remaining count, reset timer
  - Warning toast at 90% usage
  - Auto-refreshes every 30 seconds
  - Analytics: `rate_limit_indicator_clicked`, `rate_limit_warning_shown`

- ☑ **API Rate Limiting Infrastructure** - Tiered limits by user tier <!-- id:rate_limit.tiers -->
  - Files: `frontend/lib/api/rate-limit.ts`
  - Free: 100 requests/hour, Pro: 1000 requests/hour
  - Standard headers: X-RateLimit-Limit, Remaining, Reset, Retry-After
  - In-memory store with automatic cleanup

- ☑ **Query Performance Logging** - Logs slow queries (>100ms) <!-- id:perf.query_logging -->
  - Files: `frontend/lib/server/query-logger.ts`
  - Stores in `admin_audit` table
  - `withQueryLogging` wrapper for easy integration
  - Console warnings in development

### User Experience Enhancements (Oct 2025)
- ☑ **Empty States** - Beautiful placeholders for My Decks, Collections, Wishlist <!-- id:ux.empty_states -->
  - Files: `frontend/components/EmptyStates.tsx`
  - Contextual tips and quick actions
  - Engaging visuals and helpful suggestions
  - Analytics: `empty_state_action_clicked`

- ☑ **Email Verification Reminder** - 24hr reminder toast with resend button <!-- id:auth.email_verification -->
  - Files: `frontend/components/EmailVerificationReminder.tsx`
  - "Early Adopter" badge incentive
  - Analytics: `email_verification_reminder_shown`, `email_verification_resend_clicked`

- ☑ **Guest Limit Modal** - Beautiful modal at 20/20 messages <!-- id:chat.guest_limits -->
  - Files: `frontend/components/GuestLimitModal.tsx`, `frontend/components/Chat.tsx`
  - Warnings at 15/20, 18/20, modal at 20/20
  - Benefits list and sign-up CTAs
  - Analytics: `guest_limit_warning_15`, `guest_limit_warning_18`, `guest_limit_modal_shown`

- ☑ **Guest Exit Warning** - Modal when navigating away with active chat <!-- id:chat.guest_exit_warning -->
  - Files: `frontend/components/GuestExitWarning.tsx`
  - "Don't show again" option (session-based)
  - Analytics: `guest_exit_warning_triggered`, `guest_exit_warning_signup_clicked`

- ☑ **Guest Chat Persistence** - Auto-save to localStorage <!-- id:chat.guest_persistence -->
  - Files: `frontend/components/Chat.tsx`
  - Restores messages on page reload
  - Thread ID preservation
  - Analytics: `guest_chat_restored`

### PWA & Mobile (Oct 2025)
- ☑ **Smart Install Prompt** - Shows after 2-3 visits, 30-day dismissal <!-- id:pwa.smart_prompt -->
  - Files: `frontend/components/InstallPrompt.tsx`
  - Visit counter tracking
  - Checks if already installed
  - Analytics: `pwa_visit_tracked`, `pwa_install_prompted`, `pwa_install_accepted`

- ☑ **iOS Install Prompt** - Custom Safari instructions <!-- id:pwa.ios_prompt -->
  - Files: `frontend/components/iOSInstallPrompt.tsx`
  - Step-by-step guide with visual icons
  - Bottom-sheet style, 30-day dismissal
  - Analytics: `ios_pwa_prompted`, `ios_pwa_dismissed`

- ☑ **App Shortcuts** - Quick actions in manifest <!-- id:pwa.shortcuts -->
  - Files: `frontend/public/manifest.json`
  - New Deck, My Decks, Price Tracker, Collections
  - Appears on home screen long-press

---

## Core Features (By Category)

### 🏗️ Architecture & Standards
- ☑ All API inputs validated with Zod <!-- id:core.zod -->
- ☑ Unified API response envelope { ok, error? } <!-- id:core.envelope -->
- ☑ Middleware logging (method, path, status, ms, userId) <!-- id:core.logging -->
- ☑ PostHog analytics wired <!-- id:core.posthog -->
- ☑ Environment variables wired (Supabase/OpenAI) <!-- id:core.env -->
- ☑ CSRF same-origin guard on mutating endpoints <!-- id:core.csrf -->
- ☑ ESLint rule to prefer fetchJson over bare fetch <!-- id:core.lint_fetch -->

### 💾 Data & Caching
- ☑ Scryfall bulk sync <!-- id:data.scryfall_bulk -->
- ☑ Nightly Scryfall refresh <!-- id:data.nightly_jobs -->
- ☑ Scryfall server-side cache (DB table, 30-day TTL) <!-- id:data.scryfall_cache -->
  - Files: `frontend/lib/server/scryfallCache.ts`, `frontend/db/sql/016_scryfall_cache.sql`
  - Max 200 card refreshes per request
  - Batch prefetching, stale detection
- ☑ Price cache (24-hour TTL) <!-- id:data.price_cache -->
  - Files: `frontend/app/api/price/route.ts`
  - Database-backed price_cache table
  - Multi-currency support (USD, EUR, GBP)
- ☑ In-memory memoCache <!-- id:cache.memo -->
  - Files: `frontend/lib/utils/memoCache.ts`
  - Simple TTL-based caching with globalThis persistence
- ☑ Cached price snapshots for Cost-to-Finish <!-- id:data.price_snapshots -->
- ☑ Schedule nightly cache prewarm + daily snapshot (GH Actions) <!-- id:data.cache_prewarm_schedule -->
- ☑ Weekly FULL snapshot (ALL cards) via GH Actions <!-- id:data.full_snapshot_weekly -->
- ☑ Bulk price import system (491MB Scryfall daily bulk file) <!-- id:price.bulk_import_system -->
  - 100% price coverage vs 200/day limit
  - Processes 110k+ cards in ~11 seconds

### 💬 Chat & AI Assistant
- ☑ Supabase chat_threads/messages persistence <!-- id:chat.persist -->
- ☑ History dropdown loads threads <!-- id:chat.history_dropdown -->
- ☑ Thread cap at 30 with create guard <!-- id:chat.thread_cap -->
- ☑ Thread rename/delete endpoints <!-- id:chat.rename_delete -->
- ☑ Consistent chat bubble styles <!-- id:chat.bubbles_style -->
- ☑ NL→Scryfall translator API and auto-helper <!-- id:chat.nl_translate -->
  - Files: `frontend/app/api/search/scryfall-nl/route.ts`, `frontend/lib/search/nl.ts`
- ☑ Combos auto-surface when commander linked (top 3) <!-- id:chat.combos -->
- ☑ Answer packs renderer (fast swaps, combos, curve/removal, rules) <!-- id:chat.answer_packs -->
- ☑ Why toggles on suggestions (compact) <!-- id:chat.why_toggle -->
- ☑ Multi-agent pipeline (lite) with stage metrics <!-- id:chat.multi_agent -->
- ☑ Assumption pill in replies (Format/Value/Colors) <!-- id:chat.assumptions -->
- ☑ Grounded answers that know deck/collection/budget <!-- id:chat.grounded -->

### 🃏 Decks & Deck Building
- ☑ Deck builder (Supabase persistence) <!-- id:deck.builder -->
- ☑ My Decks: grid pills with banner art, wider layout <!-- id:mydecks.pills_actions -->
- ☑ My Decks: right drawer with stats, Cost to Finish link <!-- id:mydecks.drawer_stats -->
- ☑ Pin up to 3 decks; pinned sorted to top <!-- id:mydecks.pinning -->
- ☑ CSV import (Arena format) <!-- id:deck.import_csv -->
- ☑ Export deck CSV + copy list <!-- id:deck.export_csv_copy -->
- ☑ Export to Moxfield/Arena text formats <!-- id:deck.export_moxfield_arena -->
- ☑ Cost-to-Finish (live pricing + FX) <!-- id:deck.cost_to_finish -->
  - Files: `frontend/app/collections/cost-to-finish/Client.tsx`
  - Full UX redesign with two-pane layout
  - Summary panel with core category counts
  - Price bucket and rarity charts
  - Commander art preview
  - Shopping list with image hovers, reprint risk dots
  - Pro-gated "Why?" per shopping row
- ☑ Budget Swaps page + API <!-- id:deck.budget_swaps -->
- ☑ Shopping list generator <!-- id:deck.shopping_list -->
- ☑ Scryfall links + hover preview <!-- id:deck.scryfall_links_previews -->
- ☑ Token needs analysis <!-- id:deck.token_needs -->
- ☑ Banned badge (Commander via Scryfall legalities) <!-- id:deck.legality_banned -->
- ☑ Legality & Tokens panel on My Decks <!-- id:deck.legality_tokens_panel -->
- ☑ Deck curve/types/core meters and price mini <!-- id:decks.sidebar_meters_price -->
- ☑ Reprint risk dots (green/orange/red) <!-- id:deck.reprint_risk -->
- ☑ Commander staples/metagame context <!-- id:deck.meta_seed -->

### 📦 Collections & Wishlist
- ☑ Collection manager <!-- id:deck.collection_mgr -->
- ☑ Collections pills simplified (Edit + 3-dot menu) <!-- id:collections.pills_simplified -->
- ☑ Collections editor: two-column layout with virtualized list <!-- id:collections.editor_virtualized -->
- ☑ Filters: immediate apply (colors, type, price bands) <!-- id:collections.filters_immediate -->
- ☑ Analytics panels: Type histogram, Price distribution, Sets <!-- id:collections.analytics_panels_order -->
- ☑ Batch toolbar: larger UI, Undo snackbar, Add to wishlist <!-- id:collections.batch_toolbar -->
- ☑ Wishlist sync: mirrors into Profile wishlist <!-- id:collections.wishlist_sync_profile -->
- ☑ Collections index: grid tiles with cover, quick stats <!-- id:collections.grid_tiles -->
- ☑ Wishlist Editor v1 - tiles with thumbnails, prices, +/- controls <!-- id:wishlist.editor_v1 -->
- ☑ Wishlist Editor v2 - typeahead, hover previews, CSV, batch remove <!-- id:wishlist.editor_v2 -->
  - Keyboard shortcuts (+/−/Delete, Ctrl+F, Ctrl+B)
  - Selection checkboxes + action bar
  - CSV import/export
  - Inline "fix?" rename for price-missing items
  - Batch Fix Names modal (Pro-gated)

### 📊 Analytics & Tools
- ☑ Price Tracker with charts and movers <!-- id:price_tracker.chart_fixed -->
  - Files: `frontend/app/price-tracker/page.tsx`
  - Center chart renders properly
  - Tooltip, zero-baseline Y, dots, CSV export
- ☑ Mulligan Simulator upgrades <!-- id:tools.mulligan_refine -->
  - Real keep heuristics, London bottoming
  - Confidence band (95% CI)
  - Sample keeps/ships, quick advice
- ☑ Probability Helper refinements <!-- id:tools.prob_refine -->
  - K-chips, play/draw, sensitivity
  - Color requirement solver by turn
  - URL persistence, copy link
- ☑ Route timing logs <!-- id:analytics.api_timing -->
- ☑ AI cost tracker (tokens → £/$ per chat) <!-- id:analytics.ai_cost_tracker -->
- ☑ Admin AI usage dashboard <!-- id:analytics.ai_usage_admin_page -->
- ☑ Deck metrics (curve/ramp/draw/removal bands) <!-- id:analytics.deck_metrics -->

### 🎨 UI/UX & Design
- ☑ Custom Card Creator - authentic MTG styling <!-- id:cardcreator.authentic_redesign -->
  - Homepage right-rail creator
  - Proper MTG card proportions (2.5"x3.5")
  - Inline editing, art selection overlay
  - Attaches to profile, public profile support
- ☑ Glossary & hover tooltips for MTG terms <!-- id:ux.glossary_tooltips -->
- ☑ Quick bug/feedback widget (bottom-right dock) <!-- id:ux.feedback_widget -->
- ☑ Inline feedback buttons on AI suggestions (👍/👎) <!-- id:ux.feedback_buttons -->
- ☑ Progress bars & collection milestones <!-- id:ux.progress_milestones -->
- ☑ Badges & milestones celebration system <!-- id:badges.celebration_system -->
  - Animated celebration toasts for new badge unlocks
  - PNG generation for social sharing (800x400px)
  - Pro members: golden foil effects
- ☑ Public profile enhancements with pinned badges showcase <!-- id:profile.public_badges_showcase -->
- ☑ Mobile-responsive header navigation <!-- id:ui.mobile_header -->
- ☑ Homepage mobile layout improvements <!-- id:ui.homepage_mobile -->
- ☑ Trust footer with model attribution <!-- id:ui.public_trust_layer -->
  - Shows AI model version (GPT-5, GPT-4o Mini)
  - Scryfall data attribution
  - Last updated timestamp

### 🔐 Authentication & Privacy
- ☑ Polish account creation flow - social proof <!-- id:auth.social_proof -->
  - Files: `frontend/components/Header.tsx`, `frontend/app/api/stats/users/route.ts`
  - Shows user count: "Join 1,234+ deck builders"
  - Real-time activity feed
- ☑ User privacy data-sharing toggle <!-- id:privacy.data_sharing_toggle -->
  - Files: `frontend/app/api/profile/privacy/route.ts`, `frontend/components/PrivacyDataToggle.tsx`
  - Default ON for new users
  - Detailed "Learn more" modal
  - Toast confirmations

### 📱 PWA & Mobile
- ☑ Service Worker with offline support <!-- id:pwa.service_worker -->
  - Files: `frontend/public/sw.js`, `frontend/components/ServiceWorkerRegistration.tsx`
  - Caches homepage, My Decks, Collections, Wishlist, Pricing
  - Auto-update on new version
- ☑ PWA Manifest with app metadata <!-- id:pwa.manifest -->
  - Files: `frontend/public/manifest.json`
  - Standalone display mode
  - Themed status bar (emerald green)

### 💎 Pro Features & Monetization
- ☑ Full Stripe subscriptions <!-- id:adv.stripe_subscriptions -->
  - Monthly/yearly plans with webhooks
- ☑ Functional Stripe subscription management <!-- id:admin.stripe_management -->
  - Billing portal integration
- ☑ Pro badge visibility system <!-- id:ui.pro_badge_visibility -->
- ☑ Pro value tooltips <!-- id:ui.pro_perception_enhancements -->
  - Hover-triggered tooltips showing pro feature benefits
  - Integrated in pricing page
- ☑ Pro perception improvements <!-- id:ui.pro_perception -->

### 📝 Content & Communication
- ☑ Changelog system with admin management <!-- id:content.changelog_system -->
  - Files: `frontend/app/admin/changelog/page.tsx`, `frontend/app/changelog/page.tsx`
  - Full CRUD admin interface
  - Version, date, title, description editing
  - Feature/fix categorization
  - Public changelog page with dark theme
  - What's New navigation link
- ☑ Blog system with dynamic routing <!-- id:content.blog_system -->
  - Files: `frontend/app/blog/[slug]/page.tsx`
  - SEO optimization with metadata

### 🔧 Admin & Operations
- ☑ Admin panel suite <!-- id:admin.panel_suite -->
  - AI usage, users, pricing, security, data, backups
  - Event tracking, badge summary
  - Bulk price import management
- ☑ Admin authentication using profiles.is_admin <!-- id:admin.auth -->
- ☑ Audit logging in admin_audit table <!-- id:admin.audit_logging -->

---

## Recently Completed (Phase 5-8 - Oct 19, 2025)

### Social & Engagement
- ☑ **Deck Comments System** - Comments on public decks with moderation <!-- id:social.deck_comments -->
  - Files: `frontend/app/api/decks/[id]/comments/route.ts`
  - Social proof seeding script: `seed-social-proof-BETTER.sql`
  - 5 likes + 4 comments per public deck (10+ cards)
  - Fake user profiles for demo purposes

- ☑ **Achievement System Expansion** - 15+ new badges with progress tracking <!-- id:gamification.achievements_expanded -->
  - Files: `frontend/components/BadgeProgressWidget.tsx`
  - Homepage widget showing 3 closest badges
  - Progress bars on profile page
  - "View All" link to profile badges

- ☑ **Card Recommendations Feed** - Deck-specific AI recommendations <!-- id:discovery.card_recommendations -->
  - Files: `frontend/components/DeckCardRecommendations.tsx`, `frontend/app/api/recommendations/deck/[id]/route.ts`
  - Auto-shows on individual deck pages
  - "Why?" explanation per recommendation
  - Filters out cards already in deck

- ☑ **Deck Comparison Tool** - Compare 2-3 decks side-by-side <!-- id:decks.comparison_tool -->
  - Files: `frontend/components/DeckComparisonTool.tsx`, `frontend/app/compare-decks/page.tsx`
  - Side-by-side layout with card art
  - Shared/unique card analysis
  - Pro-gated 3rd deck comparison
  - PDF export functionality
  - Widget on My Decks page
  - "Compare" button on individual deck pages

- ☑ **Deck Tags System** - User-created tags with autocomplete <!-- id:decks.tags_system -->
  - Files: `frontend/components/TagSelector.tsx`, `frontend/app/api/decks/[id]/tags/route.ts`
  - Max 10 tags per deck
  - Auto-suggest existing tags
  - Profanity filter on manual input
  - Small pills below deck title with auto-assigned colors

### Performance & UX
- ☑ **Infinite Scroll** - Browse Decks with smooth loading <!-- id:perf.infinite_scroll -->
  - Files: `frontend/app/decks/browse/page.tsx`
  - Intersection Observer implementation
  - "Back to Top" button after 2 screens
  - URL updates with offset

- ☑ **Optimistic UI Updates** - Instant feedback for all actions <!-- id:perf.optimistic_ui -->
  - Files: `frontend/components/LikeButton.tsx`, `frontend/components/MyDecksList.tsx`
  - Like/unlike, add/remove card, deck save
  - Toast error + "Retry" button on failure
  - Keeps optimistic change even on error

- ☑ **Image Lazy Loading** - Card images load on-demand <!-- id:perf.image_lazy_loading -->
  - Files: `frontend/components/LazyImage.tsx`
  - Gray skeleton shimmer placeholder
  - Intersection Observer
  - Preload next 10 images
  - Deck art banners included

- ☑ **Request Deduplication** - Prevents duplicate API calls <!-- id:perf.request_dedup -->
  - Automatic deduplication within 100ms window
  - Console.log in dev mode
  - No visual indicator needed

- ☑ **Skeleton Screens** - Content placeholders during loading <!-- id:ux.skeleton_screens -->
  - Files: Multiple skeleton components
  - Verified across My Decks, Collections, Browse Decks
  - Professional polish

- ☑ **Virtual Scrolling** - Handle 1000+ card collections <!-- id:perf.virtual_scrolling -->
  - Files: `frontend/components/CardsPane.tsx`, Collection editor
  - 50+ items trigger virtual scrolling
  - Smooth 60fps performance

- ☑ **Prefetch Links** - Hover prefetching for instant navigation <!-- id:perf.prefetch_links -->
  - Next.js `<Link prefetch>` prop throughout site
  - Disabled on mobile to save data

- ☑ **Search Debouncing** - 300ms delay on search inputs <!-- id:perf.search_debounce -->
  - Implemented across card search, deck search
  - -70% search API calls

- ☑ **Bundle Size Optimization** - Code splitting for heavy components <!-- id:perf.bundle_optimization -->
  - Dynamic imports for PDF library (jspdf)
  - Recharts lazy loaded
  - Radix UI components split

### Mobile & Gestures
- ☑ **Mobile Gestures** - Swipe actions on deck cards <!-- id:mobile.gestures -->
  - Files: `frontend/components/MyDecksList.tsx`
  - Swipe left on deck cards for quick actions (Compare, Duplicate, Delete)
  - Smooth animations with `react-swipeable`
  - Touch-friendly interface

### Pro Features
- ☑ **Deck Changelog** - Version tracking with modal <!-- id:pro.deck_changelog -->
  - Files: `frontend/components/DeckChangelogModal.tsx`
  - Modal button next to "Save Version"
  - Automatic + optional manual notes
  - Collapsible section in deck editor
  - Full rollback capability

- ☑ **Deck Version History** - Full git-like version control <!-- id:pro.version_history -->
  - Files: Database migration for `deck_versions.changelog_note`
  - Every save creates a version
  - Chronological list with timestamps
  - Compare versions side-by-side

- ☑ **Priority Support Channel** - Pro users get fast-track support <!-- id:pro.priority_support -->
  - Files: `frontend/components/SupportForm.tsx`, `frontend/app/support/page.tsx`
  - Pro users email `prosupport@manatap.ai`
  - Support form auto-includes user info
  - Toast message showing Pro response time commitment
  - Enhanced Pro detection logic

- ☑ **Collection Import Improvements** - Full preview with fuzzy matching <!-- id:pro.collection_import_v2 -->
  - Files: `frontend/components/CollectionImportPreview.tsx`, `frontend/components/CollectionCsvUpload.tsx`
  - Two modes: "Import a New Collection" on /collections, "Import CSV" on individual pages
  - Full preview with checkboxes before import
  - Match status: exact, fuzzy, not found
  - Merge/overwrite options
  - Fuzzy matching with Levenshtein distance
  - Progress bar for multi-step process
  - Support for multiple CSV formats (TCGPlayer, Moxfield, etc.)

### Build Assistant & AI
- ☑ **Enhanced Build Assistant** - Auto-hidden, improved UI <!-- id:ai.build_assistant_enhanced -->
  - Files: `frontend/components/BuildAssistantSticky.tsx`
  - Auto-hidden by default
  - Positioned as sticky element
  - Enhanced functions for deck building

---

## Pending & In Progress

### Chat & Threads
- ☐ Fix "Like this deck" heart hover (top-layer z-index) <!-- id:chat.like_hover_fix -->
- ☐ Add polite toast for liking when not logged in <!-- id:chat.login_toast -->
- ☐ Add one-liner reminder in chat (Format/Budget/Colors) <!-- id:chat.reminder_line -->
- ☐ Standardize login-required toasts across all features <!-- id:chat.login_toasts -->

### Mulligan Simulator
- ☐ Add paste-a-deck input box + "Run" button <!-- id:mulligan.paste_deck -->

### Profile & Account
- ☐ Security: 2FA placeholder, session list, account deletion <!-- id:profile.security_expanded -->
- ☐ Extras: Connected accounts, Data export, Notification preferences <!-- id:profile.extras -->

### Copy & Consistency
- ☐ Standardize toast + auth messages site-wide <!-- id:ux.standardize_toasts -->
- ☐ Echo active filters in relevant chat actions <!-- id:ux.echo_filters -->
- ☐ Ensure guest examples load only in guest mode <!-- id:ux.guest_examples -->

### Other
- ☐ Recent public decks: cap to 10 lines and auto-extend panel height <!-- id:ui.recent_decks_cap -->

### Advanced / Stretch
- ☐ Dedicated Wishlists page with lists + items <!-- id:adv.wishlists_page -->
- ☐ Thumbnail lazy-loading and cache by Scryfall ID <!-- id:adv.thumb_cache -->
- ☐ Binder client: apply chevrons/advanced analytics parity <!-- id:adv.binder_parity -->
- ☐ Nightly sync scaling + Pro recompute <!-- id:adv.nightly_scale_pro -->
- ☐ External login linking (Google/Discord) <!-- id:adv.oauth_links -->

### Analytics & Monitoring
- ☐ Mobile & PWA analytics tracking <!-- id:analytics.mobile_pwa -->
- ☐ Advanced performance monitoring <!-- id:analytics.performance_monitoring -->
- ☐ Stability guardrails and testing <!-- id:stability.guardrails -->
- ☐ Accessibility and mobile polish <!-- id:accessibility.wcag_compliance -->

---

## Future Features (LATER)

### User Engagement
- ☐ **LATER**: Deck Templates Library - 20+ curated starter decks <!-- id:later.deck_templates -->
- ☐ **LATER**: User Following System - Follow deck builders, personalized feed <!-- id:later.user_following -->
- ☐ **LATER**: Deck Voting/Rankings - Upvote/downvote with Hot/Top sorting <!-- id:later.deck_voting -->
- ☐ **LATER**: Tournament Brackets - Create/manage brackets (4-64 participants) <!-- id:later.tournaments -->
- ☐ **LATER**: Playtest Notes - Attach game notes to deck versions <!-- id:later.playtest_notes -->
- ☐ **LATER**: Collaborative Decks - Invite others to co-edit <!-- id:later.collaborative_decks -->

### Performance & UX (Future)
- ☐ **LATER**: Accessibility Audit - WCAG AA compliance pass <!-- id:later.accessibility_audit -->
- ☐ **LATER**: Web Vitals Dashboard - Real-time performance monitoring <!-- id:later.web_vitals_dashboard -->
- ☐ **LATER**: Offline Mode V2 - Editable deck drafts that sync <!-- id:later.offline_mode_v2 -->

### Discovery & Tools
- ☐ **LATER**: Card Price Alerts - Notify when wishlist cards drop <!-- id:later.price_alerts -->
- ☐ **LATER**: Advanced Filters - CMC slider, card types, deck age <!-- id:later.advanced_filters -->

### Pro Features (Future)
- ☐ **LATER**: Advanced Deck Analytics - Win rate tracking, matchup analysis <!-- id:later.deck_analytics -->
- ☐ **LATER**: Bulk Operations - Import/export/modify multiple decks <!-- id:later.bulk_operations -->
- ☐ **LATER**: Custom Price Sources - TCGPlayer, CardMarket, or average <!-- id:later.custom_price_sources -->
- ☐ **LATER**: AI Deck Coach - Weekly AI deck review with suggestions <!-- id:later.ai_deck_coach -->
- ☐ **LATER**: Early Access Features - Pro users test features 2-4 weeks early <!-- id:later.early_access -->
- ☐ **LATER**: Export to All Formats - TappedOut, Archidekt, Deckbox, etc. <!-- id:later.export_all_formats -->
- ☐ **LATER**: Deck Testing Suite - Goldfish simulator with mulligan AI <!-- id:later.deck_testing_suite -->
- ☐ **LATER**: Proxy Generator - High-quality printable proxies <!-- id:later.proxy_generator -->
- ☐ **LATER**: Team/Family Plans - Share Pro benefits with 2-5 users <!-- id:later.team_plans -->

---

## Removed Features

### Theme Toggle (Removed Oct 19, 2025)
- ⊗ **Dark Mode Toggle** - Non-functional theme switcher <!-- id:ui.theme_toggle_removed -->
  - **Reason**: Toggle button didn't work, site uses fixed dark theme
  - **Files removed from**: `frontend/components/Header.tsx`, `frontend/components/Providers.tsx`
  - **Impact**: Simplified header, removed unused ThemeProvider
  - **Alternative**: Site maintains consistent dark theme throughout

---

## Database Schema

### Required Tables
- `chat_threads` - Chat thread persistence
- `chat_messages` - Message storage
- `decks` - User decks
- `deck_cards` - Deck card lists
- `collections` - User collections
- `collection_cards` - Collection inventory
- `profiles` - User profiles (with is_pro, is_admin)
- `scryfall_cache` - Scryfall API response cache (30-day TTL)
- `price_cache` - Card price cache (24-hour TTL)
- `admin_audit` - Admin actions and slow query logging
- `app_config` - Application configuration (changelog, features)

### Database Indexes (Recommended)
- `scryfall_cache.updated_at` - For faster stale detection
- `price_cache.updated_at` - For TTL queries
- `decks.user_id, decks.is_public` - For browse decks page
- `deck_cards.deck_id` - For card lookups

---

## Analytics Events Tracked

### Authentication & User Flow
- `login_attempt`, `login_success`, `login_failure`
- `logout_success`, `logout_failure`
- `signup_clicked`, `signin_clicked`
- `email_verification_reminder_shown`, `email_verification_resend_clicked`

### Guest Conversion
- `guest_limit_warning_15`, `guest_limit_warning_18`, `guest_limit_modal_shown`
- `guest_chat_restored`
- `guest_exit_warning_triggered`, `guest_exit_warning_signup_clicked`, `guest_exit_warning_left_anyway`

### Navigation & Discovery
- `nav_link_clicked` (destination, source)
- `command_palette_opened`, `command_palette_action`
- `shortcut_used`, `shortcuts_help_opened`

### Deck & Collection Management
- `deck_editor_opened` (source)
- `card_added` (method: search/suggestion/paste)
- `card_quantity_changed`
- `deck_created`, `deck_deleted`, `deck_published`
- `collection_created`, `collection_deleted`

### AI & Chat
- `ai_memory_consent` (consented: true/false)
- `ai_memory_greeting_shown`, `ai_memory_cleared`
- `chat_message_sent`

### PWA & Mobile
- `pwa_visit_tracked`, `pwa_install_prompted`, `pwa_install_accepted`, `pwa_install_dismissed`
- `ios_pwa_prompted`, `ios_pwa_dismissed`, `ios_pwa_instructions_viewed`
- `app_opened_standalone`

### Rate Limiting & Performance
- `rate_limit_indicator_clicked`, `rate_limit_warning_shown`

### Pro & Monetization
- `pricing_upgrade_clicked`, `pricing_interval_changed`
- `pro_feature_awareness`, `pro_feature_cta_clicked`

### Feature Discovery
- `empty_state_action_clicked`
- `feedback_submitted`
- `badge_unlocked_toast_shown`, `badge_share_action`

---

## Success Metrics

### User Engagement
- Guest-to-user conversion rate: Target +30%
- Average messages before signup: Goal < 10 (baseline: 20)
- PWA install rate: Target 10% of repeat visitors
- Session time: Target +20%

### Performance
- API response time P95: Target < 500ms
- Cache hit rate: Target 70%+ for popular endpoints
- Slow query frequency: Target < 1% of all queries

### Monetization
- Pro conversion rate: Target +15% free-to-pro
- 7-day retention: Target +20%

---

## Technical Debt & Known Issues

1. **Next.js 15 Metadata Warnings** - 64 warnings about viewport/themeColor in metadata export
   - Should use viewport export instead
   - Priority: Medium

2. **ESLint Warnings** - ~2,500 linting issues (1,671 errors, 846 warnings)
   - Non-blocking due to ignoreDuringBuilds: true
   - Priority: Low (technical debt)

3. **Bundle Size** - Some heavy dependencies (Recharts, etc.)
   - Could benefit from code splitting
   - Priority: Medium

4. **Mobile Touch Targets** - Some buttons may be too small for comfortable mobile use
   - Priority: Low

---

**Total Features Implemented**: 195+  
**Total Features Pending**: 15  
**Total Features Planned for LATER**: 20+  
**Last Major Update**: October 19, 2025 (Phase 5-8 Complete)


