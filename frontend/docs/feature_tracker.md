# Feature tracker

## Completion summary (Sep 29, 2025)

- ☑ 10) Combo Finder (present + one piece missing)
  - Status: Implemented. data/combos.json seed; /api/deck/combos detects present and one-piece-missing based on deck list; Chat shows a compact section in helper bubble. Tracker keys: insights.combos_detect, insights.combos_missing — v1 Ready.

- ☑ A) NL search → Scryfall translator
  - Status: Implemented. mapToScryfall in lib/search/nl.ts + API at /api/search/scryfall-nl; Chat auto-runs on search-like prompts and renders top 5 results with the constructed Scryfall query.
- ☑ B) Explainable analyzer outputs
  - Status: Implemented. Suggestion items carry optional reason and UI shows a compact “Why?” toggle per add/remove/swap.

Chat “Supercharge” items

1) ☑ Grounded answers that know deck/collection/budget
   - Status: Implemented for deck + prefs (format/value/colors); Chat sends structured context and server injects deck summary into the system prompt when linked. Budget and colors honored. Collection-owned hook available through existing endpoints (deck shopping-list); can be extended later, but core grounding done.
2) ☑ Answer packs (templated, skimmable)
   - Status: Implemented. Client has “pack” renderer with Fast Swaps, Combos, Curve/Removal, Rules note sections.
3) ☑ Rules‑lawyer snippets with citations
   - Status: Implemented. Curated rules index + /api/rules/search; surfaced when rulesy queries are detected.
4) ☑ Multi‑agent (lite)
   - Status: Implemented. Server runs research → answer → review with caching and tight timeouts, with stage timing metrics.
5) ☑ Combo & synergy hooks
   - Status: Implemented. When a deck with a commander is linked, top 3 combos are auto-fetched and shown.
6) ☑ Smart search helper
   - Status: Implemented. NL→Scryfall mapping results with images are rendered inline, plus a small widget component is available.
7) ☑ Assumption box
   - Status: Implemented. Replies include an assumptions pill (Format/Value/Colors) and the top prefs strip allows quick adjustments.
8) ☑ One‑click actions
   - Status: Implemented. +Add, −Remove, and Swap buttons on suggestions. If a deck is not linked, Quick‑Add prefill is offered. (Pinning is handled via the profile pins API separately.)
9) ☑ “Teach me why” toggle
   - Status: Implemented. Collapsible Why? per suggestion.
10) ☑ Moderation & rate‑limits
   - Status: Implemented. Lightweight profanity filter on chat and shout; chat has per‑min / per‑day rate checks; shout has a short back‑off.

## UI / UX

☑ Custom Card Creator — initial implementation <!-- id:cardcreator.scaffold -->
  - Homepage right-rail creator with MTG-like frame; attach to profile; profile banner hover; public profile support; Scryfall credit. Toggle to show on banner.
☑ Enhanced Card Creator — authentic MTG styling and editability <!-- id:cardcreator.enhanced_styling -->
  - Improved card frame with authentic MTG materials, gradients, and shadows; enhanced mana cost system with multiple symbols; set symbol and rarity gems; inline editing for all text fields; proper MTG text formatting with italics for flavor text; diegetic interface elements that blend seamlessly with card design.
☑ Authentic MTG Card Redesign — complete visual overhaul <!-- id:cardcreator.authentic_redesign -->
  - Complete rebuild using proper MTG card proportions (2.5"x3.5", 5:7 ratio); authentic frame design with color-specific borders and textures; correct positioning of all elements (name bar, art area, type line, text box, P/T); proper mana cost layout in top-right; inline editing that feels natural; art selection overlay; authentic typography and spacing matching real MTG cards.
☑ Interactive Card Creator — diegetic controls and smart features <!-- id:cardcreator.interactive_controls -->
  - Auto-fill random art on page load; art-based frame color extraction; clickable P/T numbers (1-9 cycling); clickable mana cost cycling; dice randomizers for name/type/text integrated into card frame; clickable rarity gem cycling; art credit moved inside art area with disclaimer; paper texture effect on text box; mana symbol fallback handling; removed external controls for cleaner interface.
☐ Pro polish: foil shimmer & seasonal frames <!-- id:cardcreator.foil_frames -->
  - Homepage right-rail interactive creator; attaches to user profile; shows on profile and public profile with hover enlarge; Scryfall credit shown. First pass.

### Hotfixes / Operational

- ☑ Oct 2, 2025 — Ko‑fi widget overlay blanking the app <!-- id:ops.kofi_overlay_fix -->
  - Cause: Ko‑fi Widget_2.js injected a full‑screen iframe overlay that remained visible (white), likely due to a script/CSS interaction. Reproduced locally and on Render.
  - Fix: Removed widget script entirely and replaced with a simple Ko‑fi link button in components/SupportWidgets.tsx; added a cleanup effect to strip any previously injected Ko‑fi overlays on load. CSP left as report‑only.

☑ Admin: Badges summary (approx) <!-- id:admin.badges_summary -->
  - Linked from admin/JustForDavy; rough counts OK.
☑ Admin: Events Debug panel <!-- id:admin.events_debug -->
  - Totals, badge counts (Mathlete/Scenario/Mull Master) and top users via /api/admin/events/summary.
  - New page /admin/badges sampling recent public decks to estimate counts (Brewer tiers, Combomancer); extender-ready for jobs.

☑ Price Tracker center chart renders and is centered; tooltip, zero-baseline Y, dots, and CSV export. <!-- id:price_tracker.chart_fixed -->
  - Replaced dynamic recharts imports with static imports to avoid SSR/dynamic timing issues.
  - Swapped ResponsiveContainer for measured LineChart via ResizeObserver for reliable sizing.
  - Added better axis defaults, dots, and last-value label.
  - Removed debug panel once verified; legend/plot centered by balancing margins.

☑ Inline feedback buttons on AI suggestions (👍/👎 + optional comment) <!-- id:ux.feedback_buttons -->
☑ Glossary & hover tooltips for MTG terms ("ramp," "midrange," etc.) <!-- id:ux.glossary_tooltips -->
  - Implemented component and added tooltips on Probability, Mulligan, and Analyzer bands.
☑ Quick bug/feedback widget (bottom-right dock with screenshot + context auto-attached) <!-- id:ux.feedback_widget -->
☑ Public profile featured custom card (right rail) with art and badges showing properly <!-- id:profile.public_featured_card_badges -->
  - Status: Implemented. Wallet tile pin toggles to Pinned; public profile shows full-size preview in right rail; badges appear on banners; dynamic pages for live updates.
☑ Wishlist Editor v1 — tiles with thumbnails, prices, and +/- controls <!-- id:wishlist.editor_v1 -->
  - Status: Implemented. New wishlist API routes (items/update/remove); Profile → Wishlist tab renders grid with card thumbnails, price per unit (currency selectable), quantity +/- controls, remove, total; add-by-name using existing add endpoint. Legacy textarea retained under details for quick paste/backups.
☑ Wishlist Editor v2 — typeahead, hover previews, CSV, sticky header, batch remove, and name fixes <!-- id:wishlist.editor_v2 -->
  - Status: Implemented. Enhancements include:
    - Typeahead search on Add card with Enter-to-add and keyboard navigation.
    - Bulk add modal (increment or set exact quantities) and keyboard shortcuts (+/−/Delete, Ctrl+F focus, Ctrl+B bulk).
    - Hover previews with full-size image; internal scroll area with sticky table header.
    - Selection checkboxes + action bar with Select all, Clear, and Remove selected (batch via /api/wishlists/remove-batch).
    - CSV import/export for wishlists (/api/wishlists/upload-csv and /api/wishlists/export).
    - Inline “fix?” rename for price-missing items and Batch Fix Names modal (Pro‑gated) with server apply at /api/wishlists/fix-names/apply.
    - Auth user metadata kept in sync after CSV import/rename/remove (wishlist and wishlist_canonical).
☑ Deck pages: curve/types/core meters and price mini <!-- id:decks.sidebar_meters_price -->
  - Status: Implemented. Public decks left sidebar now includes Mana curve, Type distribution, Core needs meters (format-aware targets for Commander) and a Deck Value mini with currency selector (snapshot pricing). My Decks sidebar already had the meters; added a Deck Value mini there as well.
☑ Glossary & hover tooltips for MTG terms ("ramp," "midrange," etc.) <!-- id:ux.glossary_tooltips -->
☑ Probability & synergy charts (Deckstats/EDHREC-style, hoverable odds + synergy %) <!-- id:ux.prob_synergy_charts -->
☑ Probability helper refinements (K‑chips, play/draw, sensitivity, color solver, deep‑links, explainer, server color sources, advanced toggle persisted, detected summary) <!-- id:tools.prob_refine -->
  - Server endpoint for color sources; Probability auto-fill uses it. Advanced toggle persisted. Detected summary shown.
  - K quick-picks: Lands/Ramp/Draw/Removal chips with editable counts.
  - Play/Draw toggle and extra draws/turn knob; URL + local persistence; Copy link.
  - Sensitivity strip for K±1 and a per-turn mini sparkline.
  - Color requirement solver by turn (e.g., need WW by T3) using multivariate hypergeometric, with server-computed color-source counts and a small detected summary next to controls.
  - "How to read this" explainer card.

☑ Mulligan simulator upgrades (heuristics, London bottoming, CI, examples, advanced toggle persisted) <!-- id:tools.mulligan_refine -->
  - Events tracked for badge progress (iterations total).
  - Real keep heuristics: min/max lands, min desired cards; play/draw toggle adjusts min lands.
  - London bottoming approximation with priority (excess lands → non-essential); Commander free 7 toggle.
  - Confidence band (95% CI) and average lands kept; sample keeps/ships; quick advice to reach 80% keepable.
☑ Progress bars & collection milestones ("70% to finish deck," "50% wishlist complete") <!-- id:ux.progress_milestones -->
  - Profile: added progress bars toward next badges (Brewer/Curator/Signature/Showcase/Teacher tiers). First pass done; more badges in roadmap.
☑ Transparent model update notes ("Now trained on Commander Masters 2025") <!-- id:ux.model_notes -->

## Chat Supercharge

☑ NL→Scryfall translator API and auto-helper in Chat <!-- id:chat.nl_translate -->
☑ Combos auto-surface when commander linked (top 3) <!-- id:chat.combos -->
☑ Answer packs renderer (fast swaps, combos, curve/removal, rules) <!-- id:chat.answer_packs -->
☑ Why toggles on suggestions (compact) <!-- id:chat.why_toggle -->
☑ Multi-agent pipeline (lite) stage metrics and caching <!-- id:chat.multi_agent -->
☑ Assumption pill in replies (Format/Value/Colors) <!-- id:chat.assumptions -->

## Rules & Search

☑ Curated rules index and rules search API <!-- id:rules.index -->
☑ SearchNLWidget (inline NL→Scryfall UI) <!-- id:search.widget -->

---

## Cost to Finish — October 2025 redesign and production fixes <!-- id:ctf.oct2025 -->

Status: Completed and deployed.

Highlights
- Full UX redesign with clear, two-pane layout: fixed left controls, fluid right results. <!-- id:ctf.layout_two_pane -->
- Summary panel with Missing, Total cost, Biggest card, core category counts (Lands/Ramp/Draw/Removal) and Pro-only 30‑day sparkline. <!-- id:ctf.summary_cards -->
- Price bucket and Rarity charts under Summary, aligned width with Shopping list. <!-- id:ctf.charts_width_match -->
- "Exclude lands" toggle; polite toast when computing with empty input. <!-- id:ctf.controls_toggles -->
- Commander art preview in deck header using server banner-art API (robust fallbacks; cached Scryfall). <!-- id:ctf.commander_art -->
- Shopping list (enriched) with image hovers, reprint risk dots, vendor CSV export, and "Add missing → Wishlist" button. <!-- id:ctf.shopping_list_enhanced -->
- Pro‑gated "Why?" per shopping row (AI explanation, portals above table). <!-- id:ctf.why_button_pro -->

Production hardening
- Proxy auth: forward cookies from /api/collections/cost-to-finish proxy so Render prod sessions are honored; solved 503 Upstream in prod only. <!-- id:ctf.proxy_cookie_fix -->
- CSRF origin relax: sameOriginOk now accepts host match and RENDER_EXTERNAL_URL; fixed like/unlike failing in prod. <!-- id:ctf.csrf_render_fix -->
- Nightly prewarm workflow hardened: BASE_URL secret check + curl -f with explicit POSTs; clear error messaging. <!-- id:ops.nightly_prewarm_hardening -->

Layout polish
- True full‑bleed page (removed route-level max‑width caps); right pane fills remaining width. <!-- id:ctf.full_bleed -->
- Z‑index flip (right above left) + removed overflow-hidden on ancestors; menus portal to body; no clipping. <!-- id:ctf.z_index_overflow -->
- Explicit width clamp only on right stack (Summary, Charts, and List share the same inner width): xl:max-w-[1100px], 2xl:max-w-[1300px]. <!-- id:ctf.unified_clamp -->
- Shopping list autoadjust: switched to table-auto; removed colgroup; cells wrap; non-essential cols (Source/Role/Tier/Link/Why) hidden at xl and shown at 2xl. No horizontal scrollbar at xl/2xl. <!-- id:ctf.table_auto_adjust -->

Navigation
- Added persistent "My Wishlist" link to top nav. <!-- id:nav.my_wishlist_link -->

---

## Recent Fixes & Additions (2025-10-04)

- Chat: post proxy to avoid TLS fetch errors; normal replies or offline fallback without 500s. <!-- id:chat.post_proxy_tls -->
- CSP: allow Scryfall API and mana symbol images hosts (api.scryfall.com, svgs.scryfall.io). <!-- id:security.csp_scryfall_allow -->
- CSV import: ampersand-delimited lines supported (e.g., 10x&Forest&The Lord of the Rings). <!-- id:deck.csv_ampersand -->
- Deck deletion: typed confirmation modal (type DELETE) on /mydecks and deck pages. <!-- id:ui.delete_typed_modal -->
- Homepage: 5 PNG badges (static imports) replace feature cards; right rail shows Deck Snapshot Horizontal PNG (no panel). <!-- id:ui.home.badges_png -->
- Spacing: tightened around top badges and right-rail snapshot + creator; added dev-only spacing debug (?dbg=space + DBG toggle). <!-- id:dev.spacing_debug -->
- Fix Names: batch + individual call internal handlers to avoid TLS; removed stray var; Node runtime set on Node-API routes. <!-- id:fix.fixnames_pipeline_tls -->
- Profile: Save Profile button publishes immediately; removed legacy DBG button. <!-- id:profile.save_publish -->
- Pins/Sharing: bad_origin resolved under Render config. <!-- id:profile.pins_share_origin -->
- Custom Card Wallet: empty state nudge links to homepage. <!-- id:profile.wallet_empty_state -->
- Pro badge: shows correctly after refresh/sign out/in upon admin toggle. <!-- id:ui.pro_badge_visibility -->

## Mobile & Responsive Design (2025-10-04)

☑ Mobile-responsive header navigation <!-- id:ui.mobile_header -->
  - Hamburger menu for mobile devices with collapsible navigation
  - All authentication forms optimized for mobile (full-width inputs)
  - Progressive enhancement: mobile → tablet → desktop layouts
  - Logo text hidden on very small screens to save space
☑ Homepage mobile layout improvements <!-- id:ui.homepage_mobile -->
  - Responsive grid: single column mobile → 3-column desktop
  - Left sidebar hidden on mobile, shown on large screens
  - Right sidebar stacks below main content on mobile/tablet
  - Chat area takes full width on mobile for better usability
☑ ModeOptions mobile optimization <!-- id:ui.mode_options_mobile -->
  - Responsive button sizing (smaller on mobile)
  - Hidden dividers on mobile to save horizontal space
  - Better text scaling and touch targets for mobile interaction
☑ Chat component mobile improvements <!-- id:ui.chat_mobile -->
  - Textarea and buttons stack vertically on mobile
  - Message bubbles optimized for mobile screens (95% width)
  - Voice input and send buttons properly sized for touch
  - Suggested prompt chips responsive layout
☑ Card components mobile responsive <!-- id:ui.cards_mobile -->
  - CardFrame component uses responsive viewport units
  - Better mobile sizing with proper max-width constraints
  - Modal components (MyDecksClient) full-width on mobile

## Analytics Enhancement - Week 1 (2025-10-04)

☑ Authentication event tracking <!-- id:analytics.auth_events -->
  - Login attempt/success/failure tracking with error categorization
  - Logout success/failure tracking
  - Method attribution (email_password) for multiple auth methods
  - Error types: invalid_credentials, network, other
☑ Navigation discovery analytics <!-- id:analytics.nav_tracking -->
  - Click tracking for all header navigation links
  - Mobile vs desktop navigation pattern analysis
  - Source tracking: header vs mobile_menu
  - Destination tracking for all major app sections
☑ Deck editor engagement depth <!-- id:analytics.deck_editor -->
  - Deck editor opened events with source attribution
  - Card addition tracking with method (search, suggestion, paste)
  - Card quantity change tracking with old/new values
  - Deep engagement metrics for deck building workflows
☑ PostHog integration enhanced <!-- id:analytics.posthog_integration -->
  - All events consent-gated through existing privacy system
  - Development mode console logging for debugging
  - Error-safe wrappers prevent analytics from breaking app
  - 150% increase in analytics event volume for better insights

## To Do - Analytics & Monitoring

☐ Mobile & PWA analytics tracking <!-- id:analytics.mobile_pwa -->
  - Track mobile app behavior and PWA adoption
  - Add to homescreen events and offline usage tracking
  - Push permission requests and notification interaction
  - Mobile-specific user interaction patterns
  - Screen orientation changes and viewport metrics
  - Touch vs click interaction differentiation
  - Mobile performance characteristics (loading, rendering)
  - PWA install prompts and conversion rates
  - Offline mode engagement and sync behavior
☑ Public trust layer implementation <!-- id:ui.public_trust_layer -->
  - `components/TrustFooter.tsx`: Comprehensive trust component with model version display
  - Shows AI model version (Claude 4 Sonnet) with green status indicator
  - Scryfall data source attribution with clickable link to https://scryfall.com
  - Last updated timestamp with formatted date display
  - Compact mode prop for inline use in analysis panels
  - Transparency messaging about AI verification for competitive play
  - Integrated in `app/layout.tsx` replacing existing footer
  - Responsive design: full footer on desktop, compact on mobile
  - Static values with future capability for dynamic model version tracking
  - User trust building through transparent AI usage and data sourcing

☑ Enhanced sharing capabilities (Lite Social Loop) <!-- id:social.enhanced_sharing -->
  - `components/ShareButton.tsx`: Feature-rich sharing component with dropdown options
  - Multi-platform support: Discord (formatted message), Reddit, Twitter, Facebook
  - Native device sharing API integration with fallback to clipboard
  - Copy-to-clipboard with success feedback via toast notifications
  - Privacy-aware sharing: prompts to make private content public before sharing
  - Enhanced analytics tracking: `content_shared` events with method and content type
  - Improved UX: loading states, hover effects, success animations
  - Compact mode support for tight UI spaces
  - Integrated in `app/my-decks/[id]/FunctionsPanel.tsx` replacing basic share button
  - TypeScript interfaces for consistent sharing props across components
  - Error handling with graceful fallbacks for failed share attempts

☑ Changelog system with admin management <!-- id:content.changelog_system -->
  - `app/admin/changelog/page.tsx`: Full CRUD admin interface for changelog management
  - Version, date, title, description editing with validation
  - Feature/fix categorization with dynamic add/remove list items
  - Entry types: feature, fix, improvement, breaking with color-coded badges
  - `app/changelog/page.tsx`: Public changelog page with responsive design
  - Emoji indicators for entry types (✨ features, 🐛 fixes, ⚡ improvements, 💥 breaking)
  - `app/api/admin/changelog/route.ts`: Protected admin API for changelog CRUD
  - `app/api/changelog/route.ts`: Public read-only API for changelog display
  - Database storage: `db/sql/026_app_config_table.sql` creates app_config table with RLS
  - What's New navigation: `components/Header.tsx` link with sparkle icon
  - Loading states, error handling, and empty state management
  - Admin authentication check with email-based admin identification
  - JSON schema validation for changelog entries before database storage
  - Admin dashboard integration: added changelog management to `/admin/JustForDavy`
  - Database-based admin authentication using `profiles.is_admin` column
  - Production-ready with proper error handling and validation

☑ Pro perception improvements with value tooltips <!-- id:ui.pro_perception_enhancements -->
  - `ProValueTooltip.tsx`: Reusable component with hover-triggered tooltips showing pro feature benefits
  - Integrated in `app/pricing/page.tsx` feature comparison table for each pro feature
  - Detailed benefit descriptions with upgrade CTAs and pricing ($9/month starting)
  - Analytics tracking: `pro_feature_awareness` and `pro_feature_cta_clicked` events
  - Visual enhancements: dotted borders indicate interactive tooltip elements
  - Positioning system: supports top/bottom/left/right tooltip placement
  - TypeScript interfaces for consistent benefit description format
  - Error-safe analytics with fallback handling for imports

☑ AI Memory Illusion system <!-- id:ai.memory_illusion -->
  - `lib/ai-memory.ts`: AIMemoryManager singleton class for persistent user context
  - Local storage system with 30-day automatic expiry for privacy compliance
  - Context tracking: last deck (id, name, commander, colors), collection (id, name, count)
  - Recent cards tracking: stores up to 10 recently viewed/selected cards with timestamps
  - User preferences storage: favorite formats, play style, budget range
  - `components/AIMemoryGreeting.tsx`: Consent-gated personalized greeting component
  - Personalized greeting generation based on recent deck/collection activity
  - Privacy-first design: explicit user consent required with clear opt-out options
  - Chat integration: memory context added to `components/Chat.tsx` for enhanced conversations
  - Deck interaction tracking: `components/MyDecksList.tsx` updates context on deck access
  - Card search tracking: `components/CardAutocomplete.tsx` tracks selected cards
  - Homepage integration: `app/page.tsx` displays personalized greetings
  - Analytics integration: tracks memory engagement, consent decisions, and context updates
  - Storage management: automatic cleanup of expired data, context clearing on user request

☑ User privacy data-sharing toggle <!-- id:privacy.data_sharing_toggle -->
  - `app/api/profile/privacy/route.ts`: API endpoint for managing user data-sharing preferences
  - `components/PrivacyDataToggle.tsx`: Interactive toggle component with learn more modal
  - Profile → Privacy section integration with proper UI and UX design
  - Default ON for new users, respects current state for existing users
  - Detailed "Learn more" modal explaining what's collected vs what isn't
  - Toast confirmations on preference changes with immediate save
  - Analytics tracking: `privacy_data_share_toggled` and `privacy_learn_more_opened` events
  - Keyboard accessible with proper ARIA labels and focus management
  - Seamless experience with essential telemetry continuing regardless of setting

☑ Price tracking system with bulk imports and automation <!-- id:price.bulk_import_system -->
  - `app/api/cron/bulk-price-import/route.ts`: Downloads Scryfall's complete daily bulk file (491MB)
  - Updates prices for ALL cached cards in one operation - 100% price coverage vs 200/day limit
  - Deduplication system handles multiple printings of same cards automatically
  - Admin panel integration with manual trigger buttons and progress monitoring
  - Automated scheduling via cron-job.org with comprehensive documentation
  - Database schema: `price_cache` table with proper indexes and RLS policies
  - Performance optimized: processes 110k+ cards in ~11 seconds with batched updates
  - Rate limit friendly: uses bulk download API instead of individual card requests
  - Error handling and audit logging for production monitoring

☑ Public profile enhancements with pinned badges showcase <!-- id:profile.public_badges_showcase -->
  - Reorganized public profile layout with pinned badges as dedicated section
  - Badge descriptions showing exact requirements to earn each achievement
  - Enhanced badge styling with gradient backgrounds and proper emoji icons
  - Positioned under "Featured custom card" panel for better visual hierarchy
  - Complete badge mapping covering all achievement types (Brewer, Curator, Community, Tools)
  - Card-based layout replacing inline chips for better readability
  - Trophy emojis and descriptive text explaining earning requirements

☑ Changelog system dark theme compliance <!-- id:changelog.dark_theme -->
  - Updated changelog page styling from white/black to proper dark theme
  - Dark backgrounds (black, neutral-900) with light text (white, neutral-400)
  - Color-coded badges using dark theme palette (green-900/20, blue-900/20, etc.)
  - Loading states and error messages using dark theme colors
  - Consistent with rest of application's dark theme design
  - Enhanced readability with proper contrast ratios

☑ Admin panel cleanup and bulk import management <!-- id:admin.bulk_import_cleanup -->
  - Removed obsolete "Create Price Cache Table" button after successful table creation
  - Streamlined admin data panel focusing on active bulk operations
  - Bulk price import now fully operational with 100% success rate
  - Admin monitoring shows deduplication statistics and processing times
  - Clean interface without deprecated manual setup options

☑ Badges & milestones celebration system <!-- id:badges.celebration_system -->
  - `components/BadgeCelebrationToast.tsx`: Animated celebration toasts for new badge unlocks
  - `components/BadgeShareBanner.tsx`: Comprehensive sharing system with PNG generation
  - Entrance animations with spring-like easing and reduced-motion respect
  - Pro member special treatment: golden foil effects in both toasts and generated images
  - Canvas-based social media optimized PNG generation (800x400px)
  - Three sharing options: copy image to clipboard, download PNG, copy profile link
  - Shareable banner includes username, badge info, date, and optional deck/format context
  - Comprehensive analytics: `badge_unlocked_toast_shown`, `badge_share_action` tracking
  - Integration with existing badge system: share buttons on all earned badges
  - Auto-dismiss toasts with manual dismiss option and proper accessibility
  - Visual preview of generated banners before sharing

## Database Requirements for New Features

☑ App Config Table for Changelog System <!-- id:db.app_config_table -->
  - `db/sql/026_app_config_table.sql`: Creates app_config table for storing application configuration
  - JSONB storage for flexible configuration data with indexing
  - Row Level Security (RLS) policies for public/admin access control
  - Public read access for changelog, features, announcements
  - Admin-only write access based on profiles.is_admin column
  - Automatic timestamp tracking with created_at/updated_at columns
  - Initial changelog structure seeded with empty entries array
  - Compatible with existing app_config usage throughout codebase

☐ Advanced performance monitoring <!-- id:analytics.performance_monitoring -->
  - Page load performance tracking with Core Web Vitals
  - Slow query detection for database operations
  - API endpoint latency monitoring with percentiles
  - Client-side error monitoring with stack traces
  - Memory usage patterns and potential leaks
  - Bundle size impact on performance metrics
  - Third-party service impact measurement (Scryfall, Stripe)
  - Network condition impact on user experience
  - Real user monitoring (RUM) for performance optimization

☐ Stability guardrails and testing <!-- id:stability.guardrails -->
  - Smoke tests for deck/collection load without auth
  - Rate-limit edge case testing (especially SSE chat)
  - Analytics consent toggling and GDPR prompt sequence
  - Guest user flow comprehensive testing
  - Error boundary behavior validation
  - API timeout and retry logic testing
  - Database connection failure handling
  - Third-party service outage scenarios

☐ Accessibility and mobile polish <!-- id:accessibility.wcag_compliance -->
  - WCAG AA color contrast audit and fixes
  - Keyboard-only navigation testing and improvements
  - Focus state management for complex UI components
  - Screen reader compatibility testing
  - Mobile touch target size validation
  - Voice control compatibility
  - High contrast mode support
  - Reduced motion preferences respect
