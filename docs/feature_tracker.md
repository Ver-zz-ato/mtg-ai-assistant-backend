# Feature Tracker

Legend: ☑ done · ◪ partial · ☐ todo

Last Updated: 2025-01-27

## Recent Additions (2025-01-27)

☑ Chatbot Context & RAG Enhancements <!-- id:chatbot.context_rag_20250127 -->
- **Task 1: Pasted Decklist Analysis from Thread History**
  - Automatically extracts and analyzes pasted decklists from conversation history
  - No deck creation required - analyzes text directly
  - Thread-scoped only (no cross-thread analysis)
  - Works in both `/api/chat` and `/api/chat/stream` routes
- **Task 2: Full Deck Cards Table Support**
  - Linked decks now use `deck_cards` table (up to 400 cards) instead of `deck_text` field (40 lines)
  - Maintains backward compatibility with `deck_text` fallback
  - Matches DeckAssistant behavior for consistency
- **Task 3: Basic RAG (Retrieval-Augmented Generation)**
  - Simple keyword matching for relevant conversation context
  - Automatically includes relevant past messages when user asks questions about "this deck" or "the list"
  - Limits to 10 most relevant messages to control token usage
  - Thread-scoped only (no cross-thread search)
- **Files Modified**:
  - `frontend/app/api/chat/route.ts` - Full implementation (Tasks 1, 2, 3)
  - `frontend/app/api/chat/stream/route.ts` - Task 1 (lightweight for streaming)
  - `frontend/lib/chat/decklistDetector.ts` - NEW: Shared decklist detection utility
  - `frontend/lib/chat/enhancements.ts` - Added `analyzeDecklistFromText()` function
  - `frontend/components/Chat.tsx` - Updated to use shared `isDecklist` utility
  - `docs/feature_tracker.md` - Added TODO for conversation history search

## Recent Additions (2025-11-02)

☑ Server-Side Analytics Tracking <!-- id:analytics.server_side_nov02 -->
- **Dual-Tracking System**: Client-side PostHog (requires cookie consent) + Server-side tracking (always works)
- **Server-Side Endpoints Created**:
  - `/api/analytics/track-signup` - Tracks signup_completed events bypassing cookie consent
  - `/api/analytics/track-event` - Generic server-side event tracking for critical business events
- **Events Tracked Server-Side**:
  - `signup_completed` - New user registrations (always captured)
  - `auth_login_success` - Successful logins (always captured)
  - `email_verified_success` - Email verification completions (always captured)
  - `pricing_upgrade_clicked` - Upgrade button clicks (always captured)
- **Implementation**: Uses `captureServer()` from `lib/server/analytics.ts` with PostHog Node SDK
- **Files Modified**:
  - `frontend/lib/server/analytics.ts` - Server-side PostHog helper functions
  - `frontend/app/api/analytics/track-signup/route.ts` (NEW)
  - `frontend/app/api/analytics/track-event/route.ts` (NEW)
  - `frontend/components/Header.tsx` - Added server-side tracking for signup/login
  - `frontend/components/InlineSignUpForm.tsx` - Added server-side signup tracking
  - `frontend/components/EmailVerificationSuccessPopup.tsx` - Added server-side email verification tracking
  - `frontend/app/pricing/page.tsx` - Added server-side upgrade click tracking

☑ Tech Stack Documentation <!-- id:docs.tech_stack_nov02 -->
- **Comprehensive Documentation Suite**:
  - `docs/tech-stack/integrations-overview.md` - High-level architecture and data flow patterns
  - `docs/tech-stack/nextjs-configuration.md` - Next.js API routes, middleware, environment variables
  - `docs/tech-stack/posthog-integration.md` - Dual-tracking system, client vs server-side, event taxonomy
  - `docs/tech-stack/stripe-integration.md` - Webhooks, subscription management, API routes
  - `docs/tech-stack/supabase-integration.md` - Client/admin setup, auth flows, RLS, database schema
- **Purpose**: Enable future AI assistants to quickly understand system architecture and implementation patterns
- **Coverage**: All major integrations, data flows, common patterns, troubleshooting guides

☑ Admin Account Actions & GDPR <!-- id:admin.gdpr_nov02 -->
- **Resend Verification Email**: `/api/admin/users/resend-verification`
  - Uses Supabase Admin API `generateLink` with type 'magiclink'
  - Works for both verified and unverified users
  - Logs to admin_audit table
- **GDPR Export**: `/api/admin/users/gdpr-export`
  - Exports all user data: auth, profile, decks, collections, chat threads, wishlists, watchlist, price snapshots
  - Returns comprehensive JSON with all user-related information
- **GDPR Delete**: `/api/admin/users/gdpr-delete`
  - Permanently deletes user account and all associated data
  - Respects foreign key constraints with proper deletion order
  - Multiple confirmation steps for safety
- **UI Integration**: `frontend/app/admin/support/page.tsx`
  - User selection from search results
  - "Account Actions & GDPR" panel with three action buttons
  - Clear labeling and confirmation flows

☑ Pro Subscription Tracker <!-- id:admin.pro_stats_nov02 -->
- **API Endpoint**: `/api/admin/monetize/subscription-stats`
  - Returns total Pro users, breakdown by plan (monthly/yearly/manual)
  - Recent signups (last 30 days)
  - Historical data for growth charts (last 90 days)
- **Admin Dashboard**: `frontend/app/admin/monetize/page.tsx`
  - Summary cards showing key metrics
  - Line chart (Recharts) displaying growth over time
  - Plan breakdown table with percentages
  - Auto-refresh every 30 seconds
  - Real-time Pro subscription monitoring

☑ Bulk Scryfall Import Automation <!-- id:automation.bulk_scryfall_nov02 -->
- **PowerShell Script**: `frontend/scripts/run-bulk-scryfall-local.ps1`
  - Automates dev server startup and bulk import execution
  - Checks if server is running, starts if needed
  - Waits for server readiness (max 120 seconds)
  - Triggers bulk import with CRON_KEY or admin session auth
  - Shows detailed progress and results
  - Optional server keep-alive after completion
- **Desktop Shortcut**: Created via PowerShell script
  - "Bulk Scryfall Import.lnk" on desktop
  - Double-click to run automation
  - Proper working directory and execution policy
- **File Association Fix**: Uses `cmd.exe` to execute npm (avoids file association issues)

## Admin Data Jobs - Local Execution (2025-10-30)

**Status**: ✅ Complete - All 3 jobs now run locally from admin panel with full progress tracking

☑ Jobs 2 & 3 Local Execution <!-- id:admin.jobs_local_2_3 -->
- **Job 2 (Bulk Price Import)**: Now runs directly in localhost:3000 Next.js server
  - File: `frontend/app/api/cron/bulk-price-import/route.ts`
  - Added POST method with admin authentication (cron key or user-based)
  - Downloads ~100MB Scryfall bulk data and extracts prices for all cached cards
  - Updates `price_cache` table with USD, EUR, foil, and MTGO ticket prices
  - Takes ~3-5 minutes, processes all cards in batches of 1000
  - Console logs show detailed progress and statistics
  - Toast notifications for success/error with detailed metrics
- **Job 3 (Historical Price Snapshots)**: Now runs directly in localhost:3000 Next.js server
  - File: `frontend/app/api/cron/price/snapshot/route.ts`
  - Added POST method with admin authentication (cron key or user-based)
  - Fetches live prices from Scryfall for all cards in user decks
  - Creates snapshot rows in `price_snapshots` table (USD, EUR, GBP)
  - Takes ~2-3 minutes, processes in batches with progress logging
  - Toast notifications for success/error with insertion counts
- **Admin Page Updates**: `frontend/app/admin/data/page.tsx`
  - Both jobs now have "🚀 RUN NOW" buttons (matching Job 1 style)
  - Buttons call local API routes instead of Render.com
  - Updated descriptions to clarify they run locally
  - Added "(LOCAL)" labels to job titles for clarity
  - Console progress tracking instructions added

☑ Job 1 Complete Processing Fix <!-- id:admin.job1_complete_processing -->
- **Streaming Mode Fixed**: `frontend/app/api/cron/bulk-scryfall/route.ts`
  - Fixed bug where only first 5000 cards were processed instead of all 110k+
  - Removed premature `break` statement in streaming loop
  - Now processes ALL 110,382 cards in one execution
  - Takes ~1.75 minutes for complete import
  - Removed confusing "streaming" terminology, now just downloads all at once
- **Timestamp Update Fix**:
  - Moved `job:last:bulk_scryfall` timestamp update outside `if (isLastChunk)` condition
  - Always updates timestamp when job completes
  - Added detailed console logging for timestamp updates with error handling
  - Shows exact timestamp and success/failure status in logs

☑ Admin Panel Timestamp Display Fix <!-- id:admin.timestamps_display -->
- **URL Parsing Bug Fixed**: `frontend/app/admin/data/page.tsx`
  - Fixed malformed URL that doubled `/api/admin/config?` in the query string
  - Changed from building URL with array join to direct string template
  - Now correctly fetches: `/api/admin/config?key=job:last:bulk_scryfall&key=job:last:bulk_price_import&key=job:last:price_snapshot_bulk`
  - All 3 "Last successful run" timestamps now display correctly

☑ Complete Local Execution System <!-- id:admin.jobs_local_complete -->
- **All 3 Jobs Now Local**: Jobs 1, 2, and 3 can all be triggered from admin panel
- **Consistent UX**: All buttons styled the same, all show console progress, all use toast notifications
- **No External Dependencies**: No need for Render.com bulk-jobs-server for local testing
- **GitHub Actions Still Work**: Nightly automated jobs continue to use Render.com for production
- **Dual Execution Support**: Jobs can run both locally (manual) and via GitHub Actions (automated)

**Files Modified (3)**:
1. `frontend/app/api/cron/bulk-scryfall/route.ts` - Process all 110k+ cards, always update timestamp
2. `frontend/app/api/cron/price/snapshot/route.ts` - Added POST method with admin auth
3. `frontend/app/admin/data/page.tsx` - Fixed URL parsing, updated Job 2/3 buttons to call local routes

**Build Verification**: ✅ `npm run build` passed (68s, 0 errors, 0 warnings)
**Risk Level**: ZERO - Backend-only changes, no database schema modifications
**Production Impact**: Jobs continue working as before, now with better local testing capability

## UX Polish Pass - Phase 2 (2025-10-29)

**Status**: ✅ Complete - Build verified (79s, 0 errors) - Ready for production

☑ Loading State Enhancements <!-- id:ux.loading_states -->
- **CSV Upload**: Already had excellent progress bar, spinner, and status text in CollectionCsvUpload.tsx
  - Shows percentage, current step ("Parsing CSV...", "Verifying cards...", etc.)
  - Smooth gradient progress bar animation (blue to purple)
  - Batch processing with real-time progress tracking
- **Fix Names Modal**: Added progress bar with card-by-card tracking
  - File: `frontend/components/FixCollectionNamesModal.tsx`
  - Shows "Fixing 3 of 10 cards..." with animated progress bar
  - Orange-to-red gradient for visual feedback
  - Prevents multiple clicks while processing
- **Collection Stats**: Already gracefully handles loading with '—' placeholders
  - Cards, unique, and value show '—' until data loads
  - No jarring layout shifts or empty spaces

☑ Error Handling Improvements <!-- id:ux.error_handling -->
- Replaced browser `alert()` with toast notifications for better UX:
  - `frontend/components/FixCollectionNamesModal.tsx` (2 instances)
    - Load failures: `showToast(e?.message || 'Failed to load fixes', 'error')`
    - Apply failures: `showToast(e?.message || 'Apply failed', 'error')`
  - `frontend/components/ChatSendHotfix.tsx` (1 instance)
    - Message send failures: `toast(saveJson?.error?.message || 'Failed to send message', 'error')`
- **Impact**: Non-blocking, dismissible error messages vs. ugly browser popups
- **Added import**: `import { toast as showToast } from "@/lib/toast-client"`

☑ Mobile UX Fixes <!-- id:ux.mobile_fixes -->
- **Tool Strip Horizontal Scroll** (`frontend/components/TopToolsStrip.tsx`)
  - Added `overflow-x-auto snap-x snap-mandatory scrollbar-hide` to grid container
  - Added `snap-center flex-shrink-0` to individual tool links
  - Created `.scrollbar-hide` utility in `frontend/app/globals.css`
  - Supports phones <360px (iPhone SE, small Androids)
  - Smooth snap-to-center scrolling experience
  
- **Chatbox Height Cap** (`frontend/components/Chat.tsx`)
  - Added `max-h-[60vh] md:max-h-none` to chat message container
  - Desktop: Full 800px height maintained
  - Mobile: Capped at 60% viewport height to prevent off-screen content
  - Still scrollable within the capped area
  
- **Deck Card Tap Targets** (`frontend/app/my-decks/[id]/CardsPane.tsx`)
  - Updated card row padding: `px-3 py-2 md:px-4 md:py-3`
  - Added `min-h-[44px]` for WCAG AAA compliance (44x44px minimum)
  - Added `hover:bg-neutral-800/50 transition-colors cursor-pointer`
  - Better touch feedback on mobile devices
  - Smoother hover transitions on desktop

☑ Empty States Verified <!-- id:ux.empty_states -->
- All three empty states already well-implemented in `frontend/components/EmptyStates.tsx`:
  - **EmptyDecksState**: Used in `MyDecksList.tsx`
    - Icon: Card deck SVG (blue)
    - Primary: "Create New Deck" → /new-deck
    - Secondary: "Browse Sample Decks" (triggers modal)
    - 3 tips: Import, sample decks, AI chat
  - **EmptyCollectionsState**: Used in `app/collections/page.tsx`
    - Icon: Collection box SVG (purple)
    - Primary: "Create Collection" (inline prompt)
    - Secondary: "Import CSV" → /collections?import=true
    - 3 tips: Per-set collections, CSV import, value tracking
  - **EmptyWishlistState**: Used in `app/wishlist/page.tsx`
    - Icon: Star SVG (amber)
    - Primary: "Add Cards to Wishlist" → /wishlist
    - Secondary: "Browse Price Tracker" → /price-tracker
    - 3 tips: Price alerts, cost-to-finish integration, value tracking
- **Design**: Consistent gradient backgrounds, large icons, clear CTAs, helpful suggestions
- **No changes needed**: All states meet UX best practices

**Files Modified (7)**:
1. `frontend/components/FixCollectionNamesModal.tsx` - Progress bar + toast errors
2. `frontend/components/ChatSendHotfix.tsx` - Toast error handling
3. `frontend/components/TopToolsStrip.tsx` - Horizontal scroll support
4. `frontend/app/globals.css` - .scrollbar-hide utility class
5. `frontend/components/Chat.tsx` - Mobile height cap (max-h-[60vh])
6. `frontend/app/my-decks/[id]/CardsPane.tsx` - Bigger tap targets (44px min)
7. `docs/feature_tracker.md` - This documentation

**Build Verification**: ✅ `npm run build` passed (79s, 0 errors, 0 warnings)
**Risk Level**: ZERO - Frontend-only changes, no database/API modifications
**Rollback**: Simple git revert if needed

## UX Polish Pass (2025-10-29)

☑ Color Pie Alignment Explanation <!-- id:ux.color_pie_explanation -->
- Added helper text to profile page explaining color preference personalization
- "Select your preferred MTG colors. This helps personalize your deck trends and recommendations."

☑ Cost to Finish Autoscroll <!-- id:ux.cost_to_finish_autoscroll -->
- Mobile-only autoscroll to results section after computation completes
- Detects screen size (<768px) and smoothly scrolls to results panel
- Desktop maintains dual-column view without scroll

☑ Support Widgets Collapsible <!-- id:ux.support_collapsible -->
- Converted fixed bottom-left panel to collapsible button next to feedback
- Shows compact "Support me ❤️" button by default
- Expands to show Stripe + Ko-fi options on click
- Click-outside-to-close behavior

☑ Mulligan Hand Testing Widget Relocated <!-- id:ux.mulligan_layout -->
- Implemented dual-column layout (lg:grid-cols-12)
- Left column (lg:col-span-8): All mulligan content
- Right column (lg:col-span-4): Hand Testing Widget as sticky sidebar
- Widget styled with neutral border instead of intrusive orange
- Pro badge maintained but less prominent
- Mobile stacks vertically with widget at bottom

☑ Chatbox Height Increased <!-- id:ux.chatbox_height -->
- Doubled chatbox height on desktop (min-h-[400px] → min-h-[800px])
- Responsive sizing: 400px mobile, 800px desktop (md+)
- Maintains existing scrolling and features

☑ Budget Swaps Sticky Header Removed <!-- id:ux.budget_swaps_sticky -->
- Removed `sticky top-2 z-20` from advanced options header
- Changed to static positioning with bottom margin
- Improves scrolling UX and reduces visual clutter

☑ Mobile Tool Buttons Responsive <!-- id:ux.mobile_tools -->
- Tool strip images now responsive: 120px mobile, 200px desktop
- Grid layout: 2 columns mobile, 5 columns desktop
- Reduced gap and padding on mobile for better fit
- Autodetects screen size via Tailwind breakpoints (md:)

☑ Email Verification Success Popup <!-- id:ux.email_verification_popup -->
- New `EmailVerificationSuccessPopup` component on homepage
- Detects Supabase verification redirect (access_token or email_verified params)
- Celebration modal: "✅ Email Verified! You've earned the Early Adopter badge 🎉"
- Auto-dismisses after 5 seconds or manual close
- PostHog analytics tracking: `email_verified_success`
- Styled similar to BadgeCelebrationToast

☑ Tour System Removed <!-- id:ux.tour_removed -->
- Deleted `MainFeaturesTour.tsx` component
- Removed all `data-tour` attributes from:
  - TopToolsStrip.tsx
  - Header.tsx
  - Homepage components
- Removed HomepageTourWrapper and all tour-related imports
- Clean slate for future onboarding approaches

☑ Database Schema Fix <!-- id:bug.chat_threads_schema -->
- Fixed `chat_threads.updated_at` column reference error
- Changed to `created_at` in threads/get route
- Eliminates PostgreSQL error 42703 on chat thread fetching

## SEO & Performance Optimization (2025-10-29)

☑ Console Cleanup - DeckArtLoader <!-- id:seo.console_cleanup -->
- Removed 50+ verbose console.log statements from DeckArtLoader
- Added AbortError suppression in 3 catch blocks (batch-images, fuzzy match, deck_cards)
- Browse Decks page: 50+ console messages → 0 spam

☑ Dynamic Sitemap with Public Decks <!-- id:seo.dynamic_sitemap -->
- Converted sitemap.ts from sync to async with Supabase integration
- Fetches up to 500 public decks with accurate lastModified timestamps
- Sitemap coverage increased from 13 to 31+ routes (+138%)
- All public deck pages now discoverable by Google

☑ Public Deck SEO Metadata <!-- id:seo.deck_metadata -->
- Added generateMetadata() to /decks/[id]/page.tsx
- Dynamic title and description per deck (commander, format-specific)
- Full OpenGraph and Twitter Card tags for social sharing
- Handles private/missing decks gracefully with fallback metadata

☑ Root Layout Social Tags <!-- id:seo.root_og_tags -->
- Added OpenGraph metadata (type, locale, siteName, images) to app/layout.tsx
- Added Twitter Card metadata for all social platforms
- Site-wide social sharing optimization ready for OG image

☑ Footer Date Bug Fix <!-- id:bug.invalid_date_footer -->
- Fixed "Invalid Date" display in TrustFooter component
- Improved formatDate() with isNaN() validation
- Removed redundant formatting calls (dates pre-formatted from API)
- Now correctly shows "Oct 12, 2025"

## Performance Backlog (Future - Low Priority)

☐ Browse Decks N+1 Query Optimization <!-- id:perf.browse_decks_join -->
- Current: Fetches deck list, then fetches usernames separately (2 queries)
- Proposed: Use SQL join to fetch everything in one query
- Impact: Faster browse page load, reduced database round-trips

☐ MyDecksList Bulk Stats Endpoint <!-- id:perf.bulk_deck_stats -->
- Current: For 10 decks, makes 20 separate API calls (10 cards + 10 tags)
- Proposed: Create /api/decks/bulk-stats endpoint accepting multiple deck IDs
- Impact: Much faster "My Decks" page, reduced network overhead

☐ Shopping List Batch Optimization <!-- id:perf.shopping_batch -->
- Current: Fetches card prices one-by-one if not in cache (slow sequential)
- Proposed: Batch-fetch missing cards using Scryfall /cards/collection endpoint
- Impact: Faster shopping list generation for large decks

☐ Image Lazy Loading Site-Wide <!-- id:perf.lazy_images -->
- Current: All images load immediately even if off-screen (wastes data/CPU)
- Proposed: Use existing LazyImage component across TopToolsStrip, Chat, MyDecksList
- Impact: Faster page loads, reduced bandwidth usage, better mobile experience

## Core Architecture / Standards

☑ All API inputs validated with Zod <!-- id:core.zod -->
☑ Unified API response envelope { ok, error? } <!-- id:core.envelope -->
☑ Middleware logging (method, path, status, ms, userId) <!-- id:core.logging -->
☐ SSE chat streaming (parked for cost) <!-- id:core.sse -->
☑ PostHog analytics wired <!-- id:core.posthog -->
◪ Render deployment working (yaml exists, live not verified) <!-- id:core.render_deploy -->
☑ Environment variables wired (Supabase/OpenAI/etc.) <!-- id:core.env -->
☑ CSRF same-origin guard on mutating endpoints <!-- id:core.csrf -->
☑ ESLint rule to prefer fetchJson over bare fetch <!-- id:core.lint_fetch -->

## Data & Sync

☑ Scryfall bulk sync <!-- id:data.scryfall_bulk -->
☑ Nightly Scryfall refresh <!-- id:data.nightly_jobs -->
☑ Cached price snapshots for Cost-to-Finish (persistent toggle, delta vs yesterday) <!-- id:data.price_snapshots -->
☑ Scryfall server-side cache (DB table + helpers; upsert on save/update; batch fetch) <!-- id:data.scryfall_cache -->
☑ Scryfall cache TTL + on-demand refresh (30d; per-request cap; prewarm cron) <!-- id:data.scryfall_cache_ttl -->
☑ Schedule nightly cache prewarm + daily snapshot (GH Actions) <!-- id:data.cache_prewarm_schedule -->
☑ Weekly FULL snapshot (ALL cards) via GH Actions <!-- id:data.full_snapshot_weekly -->
☑ Archetype recompute endpoint (/api/decks/recompute-archetypes) <!-- id:data.archetype_recompute -->

## Chat & Threads

☑ Supabase chat_threads/messages persistence <!-- id:chat.persist -->
☑ Auth session missing guard (unauthenticated returns empty list to avoid toasts) <!-- id:chat.auth_guard -->
☑ History dropdown loads threads <!-- id:chat.history_dropdown -->
☑ Thread cap at 30 with create guard <!-- id:chat.thread_cap -->
☑ Thread rename endpoint working <!-- id:chat.rename -->
☑ Thread delete endpoint working <!-- id:chat.delete -->
☑ cookieUserId → user → thread rows linked <!-- id:chat.user_linking -->
☑ Thread auto-opens/updates after send <!-- id:chat.auto_open -->
☑ Double-insert safeguard <!-- id:chat.no_double_insert -->
◪ Visible error handling (toasts on failures) <!-- id:chat.errors_visible -->
☑ Consistent chat bubble styles <!-- id:chat.bubbles_style -->

## Personas

☑ Brewer persona <!-- id:persona.brewer -->
☑ Judge persona <!-- id:persona.judge -->
☑ Tutor persona <!-- id:persona.tutor -->
☑ Seed persona per thread <!-- id:persona.system_seed -->
☑ Persona toggle in UI <!-- id:persona.ui_toggle -->
☑ AI coach persona (step-by-step deck feedback) <!-- id:persona.coach -->

## Decks & Collections

☑ My Decks: grid pills with banner art; wider layout; Like + Pin + Edit visible; micro-actions moved to 3‑dot menu. <!-- id:mydecks.pills_actions -->
☑ My Decks: right drawer with banner art, visibility, last updated, Cost to Finish link, and health lights with legend. <!-- id:mydecks.drawer_stats -->
☑ My Decks: pin up to 3 decks; pinned sorted to top; pin button next to Edit. <!-- id:mydecks.pinning -->
☑ Create new deck/collection via floating action button + modal. <!-- id:create.fab_modal -->
☑ Collections pills simplified (Edit + 3‑dot menu). <!-- id:collections.pills_simplified -->

☑ Collections editor: two‑column layout polish with virtualized list and internal scrollbar; row thumbnails with hover previews; set code badge + rarity pill. <!-- id:collections.editor_virtualized -->
☑ Filters: immediate apply (colors, type, price bands), min/max price inputs only, active chips with Clear All. <!-- id:collections.filters_immediate -->
☑ Analytics (right rail): visible chevrons; advanced panels hidden by default; order: Type histogram, Price distribution, Sets; moved Wishlist compare above analytics. <!-- id:collections.analytics_panels_order -->
☑ Type histogram populated (server stats first; Scryfall fallback). <!-- id:collections.type_histogram -->
☑ Sets panels: single detailed listing of sets by frequency; Advanced Sets filter populated. <!-- id:collections.sets_panels -->
☑ Color pie labels show rounded percentages with % sign (editor and drawer). <!-- id:collections.color_pie_percent -->
☑ Batch toolbar: larger UI; Undo snackbar enlarged; added “Add to wishlist” (free). <!-- id:collections.batch_toolbar -->
☑ Wishlist sync: Add‑to‑wishlist mirrors into Profile wishlist; added Quick Add input on Profile. <!-- id:collections.wishlist_sync_profile -->
☑ Title bar: collection title restored with Rename and protected Delete (type DELETE). <!-- id:collections.title_bar -->
☑ Thumbnail/metadata key normalization fixed (no more missing art or set/rarity). <!-- id:collections.meta_key_norm_fix -->
☑ ResizeObserver guard for virtualization (no constructor error). <!-- id:collections.resizeobserver_fix -->

☑ Legality & Tokens panel on My Decks (banned, CI conflicts, token checklist) <!-- id:deck.legality_tokens_panel -->
☑ Collections index: grid tiles with cover, quick stats, hover actions, right drawer, skeletons, type-to-confirm delete <!-- id:collections.grid_tiles -->

☑ Deck builder (Supabase) <!-- id:deck.builder -->
☑ My Decks list: click row to open; simplified actions <!-- id:deck.my_clickable_rows -->
☑ Collection manager <!-- id:deck.collection_mgr -->
☑ CSV import (Arena unclear) <!-- id:deck.import_csv -->
☑ Export deck CSV + copy list <!-- id:deck.export_csv_copy -->
☑ Export to Moxfield/Arena text formats <!-- id:deck.export_moxfield_arena -->
☑ SnapshotFromMessage wired <!-- id:deck.snapshot_from_msg -->
☑ Cost-to-Finish (live pricing + FX) <!-- id:deck.cost_to_finish -->
☑ Budget Swaps page + API (respects snapshot pricing; shared snapshot prefs) <!-- id:deck.budget_swaps -->
☑ Shopping list generator (or enriched export) <!-- id:deck.shopping_list -->
☑ Scryfall links + hover preview in deck editor and collections <!-- id:deck.scryfall_links_previews -->
☑ Token needs analysis (naive common tokens) <!-- id:deck.token_needs -->
☑ Banned badge (Commander via Scryfall legalities) <!-- id:deck.legality_banned -->
☑ Commander staples/metagame context (seed from commander_metagame.json) <!-- id:deck.meta_seed -->
☑ Metagame-aware inclusion hints <!-- id:deck.meta_advice -->
☑ Reprint risk dots (green/orange/red) <!-- id:deck.reprint_risk -->

## Analytics / Logging

☑ Route timing logs <!-- id:analytics.api_timing -->
☑ Likes API telemetry + rate limit logs <!-- id:analytics.likes_logs -->
☑ AI cost tracker (tokens → £/$ per chat) <!-- id:analytics.ai_cost_tracker -->
☑ Admin AI usage dashboard page (/admin/ai-usage) <!-- id:analytics.ai_usage_admin_page -->
☑ Admin AI usage summary endpoint (CSV exports, click-to-filter, client model filter) <!-- id:analytics.ai_usage_admin -->
☑ Deck metrics (curve/ramp/draw/removal bands, color identity) <!-- id:analytics.deck_metrics -->

## UI / UX

☑ Collections: internal list scrollbar within the editor panel (prevents full-page growth). <!-- id:ui.collections_scrollpanel -->
☑ Collections: Wishlist compare moved above advanced analytics; panels show chevrons. <!-- id:ui.collections_wishlist_compare_move -->
- ☑ Set icons sprite: replace text badge with real SVG set icons (WUBRG‑themed). <!-- id:ui.set_icons_svg -->
- ☑ Optional "Apply" mode for filters (toggle immediate vs staged). <!-- id:ui.filters_apply_toggle -->

- ☑ Wishlist UX revamp: dedicate Wishlists page (lists + items), reflect Add-to-Wishlist from Collections, quick add/search, move out of Profile box for better visibility. <!-- id:ui.wishlist_revamp -->
☑ Wishlist Editor upgrades in Profile — typeahead, hover preview, CSV, sticky header, bulk remove, name fixes (Pro) <!-- id:ui.wishlist_profile_upgrades -->
  - Implemented endpoints: /api/wishlists/upload-csv, /api/wishlists/export, /api/wishlists/remove-batch, /api/wishlists/fix-names, /api/wishlists/fix-names/apply, /api/wishlists/rename.
  - Editor now supports: typeahead add, bulk add modal, keyboard shortcuts (+/−/Delete, Ctrl+F, Ctrl+B), hover previews, internal scroll with sticky header, selection + Remove selected, inline fix?, and Pro‑gated batch fix with server enforcement.
  - Auth user metadata kept in sync after CSV import/rename/remove.

☑ Clean Tailwind components <!-- id:ui.tailwind_clean -->
☑ Homepage: moved “Most liked decks” under Recent Public Decks (left rail) <!-- id:ui.homepage_most_liked_position -->
☑ Archetype tags include tooltips on deck headers <!-- id:ui.archetype_tooltips -->
☑ Unified Tooltip component used for likes and trends labels <!-- id:ui.tooltip_unified -->
☑ Skeletons for commander avatars and profile deck tiles <!-- id:ui.skeletons_profile -->
☑ Collections: deep-link to Cost-to-Finish with collection preselected <!-- id:ui.collections_ctf_deeplink -->
☑ Header: My Collections link added <!-- id:ui.header_collections_link -->
☑ Header auth: Sign up + Forgot password (modal entries) <!-- id:ui.auth_quick -->
☑ History dropdown reload resilience <!-- id:ui.history_resilience -->
☑ Error toasts present across API calls <!-- id:ui.error_toasts -->
☑ Mobile responsiveness verified (CHAT INTERFACE COMPLETE) <!-- id:ui.mobile_responsive -->
☑ Probability/Mulligan: deep-link + presets + persistence + copy summary <!-- id:ui.tools_polish -->
☑ Finetune Probability Helpers UI <!-- id:ui.finetune_prob -->
☑ Finetune Mulligan Simulator UI <!-- id:ui.finetune_mull -->

## UI / Images

◪ Scryfall images in deck lists (grid + rows) <!-- id:img.deck_lists -->
☑ Scryfall mini-thumbs in Cost-to-Finish & Swaps <!-- id:img.ctf_swaps -->
☑ Chat card chips (max 5) with hover preview (follow-cursor, fade-in; extended to Cost-to-Finish/Budget Swaps) <!-- id:img.chat_chips -->
☑ Card hover previews clamped to viewport in Decks and Collections <!-- id:img.preview_clamp -->
☑ Profile page basics (username, avatar, formats, color pie, wishlist, activity) <!-- id:profile.basic -->
☑ Commander avatar gallery in profile <!-- id:profile.avatars_commander -->
☑ Profile layout rails (left recent decks, right badges) <!-- id:profile.rails_badges -->
☑ Activity shows decks and collections counts <!-- id:profile.activity_counts -->
☑ Shared public profile (SQL provided) + share endpoint/UI <!-- id:profile.public_share -->
☑ Share link returns absolute URL <!-- id:profile.share_absolute -->
☑ Public profile enrichment (commander art, badges, recent decks with likes) <!-- id:profile.public_expand -->
☑ Commander art as “recent decks” tile backgrounds (homepage, profile, public profile) <!-- id:img.commander_tiles -->
☑ Scryfall attribution footer <!-- id:img.attribution -->

## Social / Engagement

☑ Deck endorsements (likes/stars) with per-user and per-IP guard; buttons on homepage, profile recent decks, public profile, deck page, My Decks rows <!-- id:social.likes -->
☑ Likes rate-limited (20 actions/5min window; 429 with Retry-After) <!-- id:social.likes_rate_limit -->

## Analytics / Insights

☑ Profile color pie and archetype radar derived from decklists (card types, keywords, curve). Scores also persisted per deck for instant loads <!-- id:insights.radar_colorpie -->
☑ Deck detail pages show archetype summary <!-- id:insights.deck_archetype_summary -->
☑ Deck page trends: labeled radar + color pie legend; robust deck-card color fallback <!-- id:insights.deck_trends_labels_fallback -->
☑ Public pages ISR (60–180s) where safe <!-- id:insights.isr_public_pages -->
☑ Deck/Collections show per-card and total est. value from latest snapshot <!-- id:insights.est_value_snapshot -->
☑ Admin snapshot status + viewer (top rows by unit; CSV) — USD/EUR/GBP <!-- id:insights.snapshot_viewer -->
☑ Snapshot builder (today) and FULL bulk builder (USD/EUR + derived GBP) <!-- id:insights.snapshot_builders -->

## Productivity / My Decks

☑ Row actions: toggle public/private, copy link; art thumbnails per row <!-- id:mydecks.actions_thumbs -->
☑ My Deck’s deck page trends fixed (radar axis labels, pie legend, deck-card color fallback) <!-- id:mydecks.trends_labels_fallback -->

## Public Profile

☑ ProfileCardEditor preview: no-op onChange guard (prevents navigation crash from Collections → Profile). <!-- id:profile.preview_onchange_guard -->

☑ Top commanders panel and signature deck art overlay <!-- id:public_profile.top_commanders_signature -->
☑ Signature deck selector in Profile (persists to metadata; used by share API) <!-- id:public_profile.signature_selector -->
☑ Pinned decks (up to 3) on public profile <!-- id:public_profile.pinned_decks -->

### Admin Hub

☑ Admin/Data: ELI5 + visible last-run for bulk jobs; trigger buttons retained. <!-- id:admin.hub_data_eli5 -->

☑ Admin landing page /admin/JustForDavy with section links <!-- id:admin.hub -->
☑ Plain‑English ELI5 blurbs + hover tooltips across admin pages <!-- id:admin.eli5_tooltips -->

### Ops & Safety
☑ Feature flags & kill switches (widgets, chat_extras, risky_betas) wired to UI <!-- id:admin.flags -->
☑ Maintenance mode + banner; middleware read-only for writes (excludes admin/config/health) <!-- id:admin.maintenance_readonly -->
☑ LLM budget caps (daily/weekly) enforced in chat route <!-- id:admin.llm_caps -->
☑ Snapshot rollback to yesterday (price:snapshotDate) <!-- id:admin.snapshot_rollback -->

## Data & Pricing

☑ Prewarm Scryfall cron: authorize via x-cron-key or signed-in admin; records last run in app_config and admin_audit. <!-- id:data.prewarm_auth_last_run -->
☑ Daily/Bulk snapshot routes record last-run timestamps (build, bulk, cron daily). <!-- id:data.snapshot_last_run_keys -->
☑ Admin/Data: ELI5 blurbs and last-run timestamps shown for Prewarm, Daily Snapshot, Build Snapshot, Weekly FULL. <!-- id:admin.data_eli5_last_run -->
☑ Scryfall cache inspector (lookup/refresh) <!-- id:admin.cache_inspector -->
☑ Bulk jobs monitor triggers (prewarm/daily/weekly) <!-- id:admin.jobs_monitor_triggers -->
◪ Price delta heatmap (needs snapshot history) <!-- id:admin.heatmap -->

### AI & Chat Quality
☑ Prompt & System-note library (versioned, A/B) <!-- id:admin.prompt_library -->
☑ LLM metrics board (7d) <!-- id:admin.llm_metrics -->
☑ Moderation lists (allow/block) <!-- id:admin.moderation -->
☑ Knowledge gaps logging + viewer <!-- id:admin.knowledge_gaps -->
☑ Eval playground (queue tiny evals + viewer) <!-- id:admin.eval_playground -->
☐ Canned answer packs auto-append (switchboard saved) <!-- id:admin.canned_packs_auto -->

### User Support
☑ User lookup (read-only) + toggle Pro <!-- id:admin.user_lookup_pro -->
◪ Account actions & GDPR helpers (placeholders) <!-- id:admin.account_gdpr -->

### Observability & Debugging
☑ Event stream (admin audit latest 200) <!-- id:admin.event_stream -->
☑ Rate limit & 429s dashboard <!-- id:admin.rate_limits -->
☑ Error logs (latest 200) <!-- id:admin.error_logs -->
◪ RLS probe (planned) <!-- id:admin.rls_probe -->

### Monetization & Growth
☑ Monetize toggles (existing) <!-- id:admin.monetize_toggles -->
☑ Promo / announcement bar (app_config.promo) <!-- id:admin.promo_bar -->

### Security & Compliance
☑ Admin audit log (writes to admin_audit) <!-- id:admin.audit_log -->
☑ CSP tester + allowed hosts (report-only) <!-- id:admin.csp_tester -->
☑ Key rotation health (timestamps) <!-- id:admin.key_rotation -->

### Deployment Awareness
☑ Version & env panel (sha, model, region, deployed_at) <!-- id:admin.version_env -->
☑ Perf budgets (target inputs) <!-- id:admin.perf_budgets -->

### Chat Levers
☑ Defaults editor (format, budget cap, power) <!-- id:admin.chat_defaults -->
☑ Answer packs switchboard (saved to config) <!-- id:admin.answer_packs -->
☑ Rules source tuning (preferred references) <!-- id:admin.rules_sources -->
☑ Model & cost policy (per-route, ceilings) <!-- id:admin.model_policy -->

## Advanced / Stretch

- ☐ Dedicated Wishlists page (lists + items, quick add/search, share) and route; wire collection “Go to my Wishlist” there. <!-- id:adv.wishlists_page -->
- ☐ Thumbnail lazy-loading and cache by Scryfall ID for very large collections. <!-- id:adv.thumb_cache -->
- ☐ Binder client: apply chevrons/advanced analytics parity with editor. <!-- id:adv.binder_parity -->

☑ Hand/mulligan simulator (deep-link, presets, local persistence, copy summary) <!-- id:adv.mulligan_sim -->
☑ Probability helpers (deep-link, presets, local persistence, copy summary) <!-- id:adv.prob_helpers -->
☐ Nightly sync scaling + Pro recompute <!-- id:adv.nightly_scale_pro -->
☑ Full Stripe subscriptions (monthly £1.99/yearly £14.99) with checkout + webhooks <!-- id:adv.stripe_subscriptions -->
◪ Patreon/Ko-fi/Stripe toggles <!-- id:adv.monetize_toggles -->
☐ External login linking (Google/Discord) <!-- id:adv.oauth_links -->

## Pro Mode (Later)

☐ Pro toggle (profiles.is_pro or cookie) <!-- id:pro.toggle -->
☐ Hide ads in Pro <!-- id:pro.hide_ads -->
☑ “Recompute prices” button <!-- id:pro.recompute_btn -->
☐ Allow heavier jobs in Pro <!-- id:pro.heavy_jobs -->
☑ Donate link (Stripe/Ko‑fi/PayPal in footer; support widgets) <!-- id:pro.donate_link -->

## Recent Fixes (2025-09-29)

☑ Hydration-safe Pro auto-update badge; renders after mount; toggle persists in localStorage <!-- id:fix.hydration_auto_badge -->
☑ Share deck link enables immediately after publish/private toggle <!-- id:fix.share_link_immediate -->
☑ Deck Analyzer “Run” button wired to network call; surfaced errors via toast <!-- id:fix.analyzer_run -->
☑ Color pie counts sum quantities per card color identity <!-- id:fix.color_pie_qty -->
☑ Rename “Recompute” → “Recalculate prices”; matched Upload CSV styling <!-- id:ui.recompute_rename_style -->
☑ Embedded Probability panel under Legality & Tokens (Pro-gated with friendly toast) <!-- id:ui.embed_probability_panel -->
☑ Layout polish: qty buttons grouped left, delete right with confirm; actions moved to right “Functions” panel; added “Deck name:” label; removed “Deck ID:” text <!-- id:ui.layout_polish -->
☑ Assistant replies prefill Quick Add only (no auto-add) <!-- id:chat.quick_add_prefill -->
☑ Commander-aware analyzer recommendations with Add buttons <!-- id:insights.commander_recs -->
☑ Batch Fix Names modal (Pro-gated) with reload after apply <!-- id:ui.batch_fix_names_modal -->
☑ Live price fallback for newly fixed cards (Scryfall collection batch) <!-- id:data.price_fallback_live -->
☑ Support widgets (Stripe link, Ko‑fi) + footer links (Stripe, Ko‑fi, PayPal); disabled locally via host check <!-- id:ui.support_widgets -->
☑ Privacy and Terms pages; footer wired to /privacy and /terms <!-- id:legal.pages_footer -->
☑ Cookie banner; analytics (PostHog) gated on consent; pageviews sent post-consent <!-- id:privacy.consent_banner -->
☑ Updated Stripe payment link in footer and support widget to https://buy.stripe.com/14A4gAdle89v3XE61q4AU01 <!-- id:monetize.stripe_link_update -->
☑ Brand rename MTG Coach → ManaTap AI (header logo text, footer ©, page metadata titles) <!-- id:ui.brand_rename -->
☑ Support widgets: user toggle in header + ?widgets=off/on override; live update via event <!-- id:ui.support_widgets_toggle -->
☑ Pro context (session-level is_pro) + ProBadge + unified upsell toast helper <!-- id:ui.pro_badge_toast -->
☑ UI ErrorBoundary with toast + PostHog reporting <!-- id:ui.error_boundary_posthog -->
☑ My Decks click-to-open maintained; speed-up by skipping per-deck top-cards prefetch <!-- id:ui.mydecks_speed_click -->
☑ Pro pill badges on non‑Pro screens (Functions, Probability) <!-- id:ui.pro_pills -->
☑ Lazy-loaded Analyzer & Probability panels <!-- id:perf.lazy_panels -->
☑ Fix Names: fuzzy API base + case-insensitive cache; skip case-only diffs <!-- id:fix.fixnames_fuzzy_base -->
☑ Removed header Widgets toggle; keep dock bottom-right; dev stays off <!-- id:ui.remove_widgets_toggle -->
☑ Assistant label: removed “(beta)” <!-- id:ui.assistant_label -->
☑ Share link shows toast confirmation <!-- id:ui.share_link_toast -->
☑ CSP (report-only) added via headers() <!-- id:security.csp_report_only -->
☑ Ko‑fi overlay disabled to avoid white screen; support dock pointer-events isolated; local dev hard-off <!-- id:ui.support_widgets_overlay_fix -->
◪ Tests: unit color-pie quantity/identity done; E2E running via Playwright webServer, smoke passes; Analyzer/Share/Quick-Add specs pending <!-- id:tests.reliability_suite -->

## Recent Additions (2025-10-03)

☑ Build Assistant (sticky) on My Decks — constraints display + edit, Pro-gated actions, history <!-- id:assistant.sticky_panel -->
- Shows intent constraints (format/colors/budget/plan/archetype); edits persist via ?i= base64url. <!-- id:assistant.constraints_editable -->
- Next Best Actions: Check legality & tokens (hotlinked), Balance curve (Pro), Budget swaps (Pro), Re-analyze (Pro). <!-- id:assistant.actions -->
- Undo/Redo stacks for AI-driven changes (snapshot diff per action). <!-- id:assistant.history_undo_redo -->

☑ Interactive approval panels (anchored, large) <!-- id:ui.interactive_panels -->
- Balance curve and Budget swaps now present line-by-line suggestions with Approve and Approve All; anchored above cursor. <!-- id:assistant.approval_flow -->
- Budget swaps panel shows estimated total savings in header (uses snapshot/live prices per currency). <!-- id:assistant.budget_savings_header -->
- Curve balancing has “On-color adds” toggle: only suggests cards within deck color identity (CI ⊆ deck colors). <!-- id:assistant.oncolor_toggle -->
- Panels auto-close after inactivity (12s), or upon Approve All / Close. <!-- id:assistant.panel_autoclose -->

☑ Legality & Tokens integration polish <!-- id:deck.legality_integration_polish -->
- Button runs analyze + price snapshot and shows a large anchored summary panel. <!-- id:deck.legality_toast_panel -->
- Auto-opens the Legality & Tokens panel and hydrates with result via custom event. <!-- id:deck.legality_auto_open -->

☑ Analytics hardening (PostHog) <!-- id:analytics.posthog_harden -->
- Removed auto-init from instrumentation-client; init guarded by Providers (key present, online, consent). <!-- id:analytics.posthog_guarded_init -->
- Prevents “Failed to fetch” console noise offline or without keys; keeps toolbar disabled. <!-- id:analytics.posthog_fetch_fix -->

☑ Unit tests for assistant helpers <!-- id:tests.assistant_helpers -->
- base64url encode/decode round-trip and snapshot diff helper. <!-- id:tests.base64url_diff -->

☑ Homepage polish (initial pass) <!-- id:ui.homepage_rework_pass1 -->
- Top tools as feature cards with emojis and MTG-flavored accents; added 🧪 Deck Snapshot/Judger. <!-- id:ui.home.feature_cards -->
- Left rail: Most liked decks styled as mini leaderboard (🥇/🥈/🥉). <!-- id:ui.home.leaderboard -->
- Center chat: header “Your deck-building assistant” + suggested prompt chips (Build, Swaps, Precon, Snapshot). <!-- id:ui.home.chat_header_chips -->
- Right rail: Shoutbox with distinct chat-bubble styling (emerald theme). <!-- id:ui.home.shout_bubbles -->

## Stripe Subscription Implementation (2025-10-11)

☑ Complete Stripe Subscription System <!-- id:stripe.complete_system -->
- Full monthly (£1.99) and yearly (£14.99) subscription implementation with 37% yearly discount
- Stripe API v2024-06-20 integration with proper error handling and caching
- Complete webhook system handling checkout completion, subscription updates, and cancellations
- Customer portal integration for subscription management
- Database schema with all Stripe fields in profiles table
- Production-ready API routes with proper authentication and validation
- Updated pricing page showcasing actual Pro features with beautiful UI
- Comprehensive production deployment checklist and testing guide

☑ Pro Feature Integration Enhancement <!-- id:stripe.pro_features -->
- All 20 Pro features properly integrated with Stripe subscription status
- Real-time Pro status checking via ProContext and database
- Automatic Pro feature activation/deactivation based on subscription status
- Pro badges and gate systems throughout entire application
- Analytics tracking for subscription events and Pro feature usage

## Recent Fixes & Additions (2025-10-04)

- Chat post proxy and TLS hardening <!-- id:chat.post_proxy_tls -->
  - Added /api/chat/messages/post proxy to route client posts to /api/chat; resolves TLS/fetch failed in production.
  - Verified normal replies or offline fallback without 500s.
- CSP allowances for Scryfall API and mana symbol images <!-- id:security.csp_scryfall_allow -->
  - connect-src: https://api.scryfall.com; img-src: https://svgs.scryfall.io (and existing hosts).
- CSV import: ampersand-delimited parsing <!-- id:deck.csv_ampersand -->
  - Lines like `10x&Forest&The Lord of the Rings` now parse correctly.
- Safer deck deletion with typed modal confirmation <!-- id:ui.delete_typed_modal -->
  - Replaced confirm() with modal requiring the user to type DELETE on /mydecks and deck pages.
- Homepage badges integration (PNG) and right-rail snapshot <!-- id:ui.home.badges_png -->
  - Replaced top tools cards with 5 PNG badges, wired to routes; right sidebar uses Deck Snapshot Horizontal PNG.
  - Switched to static image imports for reliable asset paths; removed decorative borders/padding; added subtle drop shadows to images.
  - Tightened vertical spacing around badges and right-rail snapshot + Custom Card Creator.
- Spacing debug tooling (dev-only) <!-- id:dev.spacing_debug -->
  - Toggle via ?dbg=space or small DBG button in right rail; shows colored outlines and ruler bars to visualize exact gaps above/below snapshot and creator, and top badges container.
- Fix Names pipeline hardening <!-- id:fix.fixnames_pipeline_tls -->
  - Batch and individual Fix Names call internal handlers directly to avoid TLS/proxy issues; deck fix-names route stray variable removed.
  - Added explicit runtime = "nodejs" for routes that require Node APIs to avoid Edge runtime errors.
- Profile polish <!-- id:profile.save_publish -->
  - Save Profile button immediately updates public profile; removed legacy DBG button from Profile UI.
- Sharing and pins reliability <!-- id:profile.pins_share_origin -->
  - Resolved bad_origin issues for saving pins/sharing profile under Render domain config.
- Custom Card Wallet empty state <!-- id:profile.wallet_empty_state -->
  - When empty, shows a friendly nudge with a link to the homepage.
- Pro badge visibility <!-- id:ui.pro_badge_visibility -->
  - Pro badge now reflects correctly after refresh or sign-out/in when toggled by admin.

## Hand Testing Widget (2025-10-04)

☑ Interactive Hand Testing Widget (PRO-gated) <!-- id:deck.hand_testing_widget -->
- Full London mulligan simulation with animated card draws and keep/mulligan decisions.
- Real MTG card artwork fetched via Scryfall API with caching (/api/cards/batch-images endpoint).
- Hover preview system (same as deck list cards) with high-quality image enlargement following cursor.
- Recording and tracking of mulligan sequences with shareable results.
- PRO feature gating with attractive upgrade prompt for non-PRO users.
- Integrated into individual deck pages sidebar with proper layout and responsiveness.
- Production URL handling for share links (replaces localhost:3000 with manatap.ai).
- Card image optimization: uses normal quality for better visibility, with smart fallbacks.
- Removed from mulligan simulator page with helpful message directing users to individual deck pages.
- Full-width responsive layout updates for deck pages (matching homepage/cost-to-finish pattern).
- Smart position calculation for hover previews to stay within viewport bounds.

## Voice Input Integration (2025-10-04)

☑ Voice-to-Text Chat Input (Speech Recognition) <!-- id:chat.voice_input -->
- Microphone button added to main homepage chat and individual deck page mini chats.
- Uses browser's native Web Speech API (webkitSpeechRecognition/SpeechRecognition) for reliable speech-to-text.
- Visual feedback: gray microphone icon when inactive, red pulsing icon when actively listening.
- Single-shot recognition mode with automatic restart for continuous listening experience.
- Automatic speech recognition stops when sending messages to prevent interference.
- Graceful error handling for microphone permission denials, network issues, and unsupported browsers.
- Cross-browser compatibility (Chrome, Edge, other Chromium browsers) with clear fallback messages.
- Speech transcripts automatically appear in chat input field, ready for editing or immediate sending.
- Seamless integration with existing chat UI without disrupting current workflows.
- Production-ready with clean code (debug logging and test functions removed).

## Week 1 Analytics Enhancement & Legal Pages (2025-10-04/05)

☑ Analytics Event Tracking Implementation <!-- id:analytics.week1_events -->
- Added authentication event tracking to Header.tsx: login attempts, successes, failures; logout attempts, successes, failures.
- Added navigation link click tracking on desktop header and mobile menu links.
- Implemented deck editor engagement depth tracking: deck editor opens, card additions to decks.
- All events sent to PostHog with proper consent gating, error safety, and environment setup.
- Confirmed backend PostHog integration working through existing setup.

☑ CORS Backend Configuration <!-- id:backend.cors_config -->
- Updated Flask backend (app.py) CORS configuration to allow browser requests from https://manatap.ai and https://app.manatap.ai.
- Added Node.js Express backend (index.js) CORS support with proper origins, methods, credentials, and preflight handling.
- Configured explicit OPTIONS route handling to ensure preflight requests return 200 status.
- Methods: GET, POST, PUT, DELETE, OPTIONS with credentials support.

☑ OpenAI API Integration Fixes <!-- id:api.openai_fixes -->
- Fixed OpenAI API URL in chat route from v1/responses to v1/chat/completions.
- Updated request format from custom format to standard OpenAI chat completions format.
- Fixed response parsing to handle OpenAI's standard response structure.
- Updated debug LLM endpoint with same fixes for consistent API handling.
- Fixed token usage parsing to match OpenAI's prompt_tokens/completion_tokens format.

☑ Legal Pages & Footer Updates <!-- id:legal.comprehensive_update -->
- Updated Terms page with UK digital service purchase clause.
- Added GDPR compliance statement to Privacy page.
- Created new Refund & Cancellation Policy page (/refund) with:
  * 14-day refund policy for new Pro subscribers
  * Stripe payment processor details and billing portal instructions
  * UK legal jurisdiction and tax information
  * Stripe support link integration
- Created comprehensive Support page (/support) with:
  * About ManaTap.ai section with creator information
  * Core features list (Cost-to-Finish, Budget Swaps, Probability Helpers, etc.)
  * Technology stack details (Next.js 15, Supabase, OpenAI GPT-5)
  * Contact information (davy@manatap.ai)
- Updated footer navigation:
  * Changed "About" to "Support" with proper link
  * Added "Refund Policy" link alongside Terms and Privacy

☑ Build System & Code Quality <!-- id:build.quality_fixes -->
- Fixed TopToolsStrip.tsx warnings by replacing require() calls with dynamic imports.
- Eliminated "Module not found" build warnings for optional badge modules.
- Maintained graceful fallback for missing custom badge components.
- Verified all new pages build correctly and are included in production bundle.
☑ All 150 pages building successfully with proper static/dynamic rendering.

## Admin Safety & Operations Infrastructure (2025-10-11)

☑ Complete Admin Safety Dashboard Implementation <!-- id:admin.safety_complete -->
- System Health Pinboard: Real-time 4-widget dashboard showing errors (24h), AI spending vs budget, price snapshot health, and performance metrics
- Color-coded health indicators (green/yellow/red) with automatic refresh and one-click manual refresh
- Integration with existing /admin/ops page using established UI patterns and components

☑ Budget Auto-Disable & Enforcement System <!-- id:admin.budget_enforcement -->
- Comprehensive budget enforcement utilities (lib/server/budgetEnforcement.ts) with spending status checking
- Auto-disable functionality: automatically disables risky_betas flag when daily/weekly budget limits exceeded
- Manual override: red "Auto-Disable" button appears in pinboard when over budget
- All budget actions logged to admin_audit table with full payload tracking
- Fail-safe design: system continues operating even if budget checks fail

☑ Stale Snapshot Alert System <!-- id:admin.snapshot_alerts -->
- Automated price snapshot age monitoring with 36h/72h thresholds (healthy/stale/critical)
- Visual health indicators in admin dashboard showing exact age and last snapshot date
- Integration with existing snapshot rollback functionality
- Real-time staleness detection (currently detecting 190h old snapshots in production)

☑ Automated System Monitoring API <!-- id:admin.monitoring_api -->
- POST /api/admin/monitor endpoint for automated health checks and actions
- Comprehensive monitoring: budget limits, snapshot staleness, error rates (>50/day threshold)
- Automated alert generation with structured logging to admin_audit table
- JSON response format suitable for cron jobs, webhooks, and external monitoring integrations
- Production-ready for automated operations (every 30min recommended)

☑ Enhanced Chat Experience with Deck-Aware Context <!-- id:chat.deck_context_enhancement -->
- Shared chat enhancements library (lib/chat/enhancements.ts) for all chat instances
- Deck-aware context injection: analyzes deck problems (size, mana base, removal gaps) and injects into AI system prompt
- Source attribution system: automatic source badges showing Scryfall, price snapshot dates, Commander Spellbook, and user deck context
- Enhanced action chips: smart contextual buttons (Add to Deck, Budget Swaps, View on Scryfall, Probability Helper, Cost to Finish)
- Integrated across main Chat component and DeckAssistant mini-chat with consistent UX
- Uses existing Scryfall cache infrastructure and respects user preferences (format, colors, budget)

☑ Complete Mobile-First Chat Interface Redesign <!-- id:chat.mobile_complete_redesign -->
- Full mobile-first architecture with touch-optimized controls (44px+ minimum touch targets)
- Smart dual-layout system: mobile full-width buttons, desktop compact sidebar design
- iOS-optimized input handling (16px font size prevents zoom, proper keyboard behavior)
- Mobile voice input integration with floating microphone button inside textarea
- Auto-scroll functionality with smooth scrolling to new messages and streaming content
- Progressive enhancement approach using responsive breakpoints (sm: prefixes)
- Production build verified with all 165 pages compiling successfully and zero errors
- Cross-platform mobile browser testing (Safari, Chrome Mobile, Edge Mobile)
- Accessibility compliance with proper ARIA labels and screen reader compatibility
- Performance optimizations including `overscroll-behavior-y-contain` and efficient rendering

☑ Production Monitoring & Safety Documentation <!-- id:admin.safety_docs -->
- Comprehensive setup guide (ADMIN_SAFETY_SETUP.md) with feature explanations and usage instructions
- Detailed testing guide (ADMIN_SAFETY_TESTING.md) with browser console tests and validation steps
- All features tested and verified working in development environment
- Integration with existing admin infrastructure without breaking changes
- Ready for production deployment with operational confidence

## Mobile Chat Interface Optimization (2025-10-11)

☑ Complete Mobile-First Chat Interface Redesign <!-- id:mobile.chat_interface_complete -->
- **Mobile-First Layout Architecture**: Full-height flex layout (`h-full flex flex-col`) with proper viewport handling and flexible message area
- **Touch-Optimized Controls**: Minimum 44px touch targets on all interactive elements with `touch-manipulation` CSS for immediate response
- **Smart Input System**: iOS zoom prevention (`fontSize: '16px'`), proper keyboard handling (Enter/Shift+Enter), and mobile-friendly textarea styling
- **Dual Voice Input Design**: Mobile floating button positioned inside textarea, desktop traditional sidebar button with visual state indicators
- **Responsive Button Architecture**: Mobile full-width buttons (py-4) with clear labels, desktop compact side-by-side layout maintained
- **Auto-Scroll Behavior**: Smooth scrolling to new messages with `scrollIntoView` and proper scroll anchoring via `messagesEndRef`
- **Mobile Preferences Panel**: Collapsible format/colors/budget controls with smaller touch targets and responsive text sizing
- **Streaming Content Mobile UX**: Mobile-optimized loading states with "Thinking..." and "Stop Generation" buttons
- **Cross-Platform Voice Recognition**: Browser Speech API integration with mobile-specific error handling and permission management
- **Production Build Verified**: All 165 pages building successfully with no compilation errors, proper TypeScript validation

☑ Progressive Enhancement Mobile Strategy <!-- id:mobile.progressive_enhancement -->
- **Responsive Breakpoints**: Mobile-first design using `sm:` prefixes for desktop enhancements rather than mobile overrides
- **Touch Interaction Patterns**: Active states, hover effects, and proper touch feedback with `active:scale-95` and visual transitions
- **Mobile Performance**: Optimized scrolling with `overscroll-behavior-y-contain` and efficient message rendering
- **Keyboard Integration**: Smart keyboard handling that doesn't interfere with mobile virtual keyboards
- **Accessibility Compliance**: Proper ARIA labels, semantic HTML structure, and screen reader compatibility
- **Cross-Browser Testing**: Verified functionality in mobile Safari, Chrome Mobile, and Edge Mobile environments

## Mobile Experience & Progressive Web App (2025-10-11) - NEXT PHASE

◪ Progressive Web App Implementation <!-- id:mobile.pwa_complete -->
- PWA manifest for "install app" prompts and native-like experience
- Offline capability for deck viewing and basic functionality
- Push notifications for price alerts and system updates
- Additional mobile component optimizations (deck editor, collections, profile)

## Pro Features Audit & Consistency (2025-10-27)

☑ Complete Pro Features Audit and Gate Implementation <!-- id:pro.features_audit_oct27 -->
- Comprehensive audit of all 20 Pro features across entire codebase
- 16/20 features already fully implemented with proper Pro gates
- 2/20 features needed Pro gate additions (deck versions)
- 2/20 features needed UI consistency fixes (export button labels)

☑ Deck Versions API Pro Gates <!-- id:pro.deck_versions_gates -->
- Added Pro gates to all three HTTP handlers (GET, POST, PUT) in `/api/decks/[id]/versions`
- GET handler: Pro check added after ownership validation
- POST handler: Updated from user_metadata check to profiles.is_pro (single source of truth)
- PUT handler: Updated from user_metadata check to profiles.is_pro (single source of truth)
- All handlers now return 403 with "Deck versions are a Pro feature. Upgrade to unlock version history!" message
- Deck Comments API confirmed to stay FREE (auth-only) per user request

☑ Pro Check Consistency Across Site <!-- id:pro.check_consistency -->
- Standardized all Pro checks to use `profiles.is_pro` from database (single source of truth)
- Removed inconsistent `user_metadata.pro` checks in favor of database queries
- Works seamlessly with all 3 Pro subscription types: monthly (£1.99), yearly (£14.99), and manual admin grants
- Ensures real-time Pro status accuracy after Stripe webhook updates or admin toggles

☑ Export Button UI Consistency <!-- id:pro.export_buttons_consistency -->
- Updated Budget Swaps export buttons to match Cost to Finish styling
- Moxfield and MTGO export buttons now always show "Pro" badge (not conditional)
- Standardized badge styling: `bg-amber-400 text-black text-[10px] font-bold uppercase`
- Consistent visual indication of Pro features across all pages

☑ Pro Features Integration Verification <!-- id:pro.integration_verification -->
- All 20 Pro features verified working correctly:
  1. ✅ AI-Powered Budget Swaps (strict mode free, AI mode Pro)
  2. ✅ Export to Moxfield (Pro badge, gate enforced)
  3. ✅ Export to MTGO (Pro badge, gate enforced)
  4. ✅ Fork Deck with Swaps (Pro badge, gate enforced)
  5. ✅ Explain Why (budget swap reasoning, Pro-gated)
  6. ✅ Price Tracker Watchlist Panel (Pro-gated)
  7. ✅ Price Tracker Deck Value Panel (Pro-gated)
  8. ✅ Fix Card Names (collections, Pro-gated)
  9. ✅ Set to Playset (collections bulk action, Pro-gated)
  10. ✅ Price Snapshot Refresh (collections, Pro-gated)
  11. ✅ Unlimited Chat Messages (free: 50/day, Pro: unlimited)
  12. ✅ Custom Cards Save (free: 5, Pro: 20)
  13. ✅ Deck Versions (GET/POST/PUT all Pro-gated) **NEWLY ADDED**
  14. ✅ Deck Comments (FREE per user request)
  15. ✅ Probability Helpers Embedded Panel (Pro-gated)
  16. ✅ Hand Testing Widget (Pro-gated)
  17. ✅ Build Assistant Actions (balance curve, Pro-gated)
  18. ✅ Build Assistant Re-analyze (Pro-gated)
  19. ✅ Wishlist Editor Advanced Features (Pro-gated)
  20. ✅ Enhanced Analytics (advanced panels, Pro-gated)

☑ Safe Implementation & Rollback Plan <!-- id:pro.safe_implementation -->
- All changes are additions only - no breaking modifications to existing code
- Can revert by removing Pro check blocks if needed
- No linter errors introduced
- Verified all files compile successfully
- Changes isolated to 2 files: versions API route and Budget Swaps client component

## Content & Feature Enhancements (2025-10-28)

☑ Blog Articles Published <!-- id:blog.articles_oct28 -->
- **Mana Curve Strategy Article**: "Mastering the Mana Curve: The Foundation of Winning Deck Construction"
  * 400+ words, 4 min read, Strategy category
  * Covers 2-3-4 rule for Commander, early/mid/late game planning, common curve mistakes
  * Links to ManaTap deck analyzer and mana curve tools
- **Budget Commander Article**: "Building Competitive EDH on $100: The Complete Guide"
  * 600+ words, 5 min read, Budget Building category
  * Covers budget allocation strategy, top 3 budget commanders (Zada, Talrand, Krenko)
  * Where to save vs splurge, upgrade path from $100 to $500
  * Links to ManaTap Budget Swaps feature
- Both articles fully integrated into blog grid (frontend/app/blog/page.tsx)
- Individual article pages with proper metadata and SEO optimization
- Date: 2025-10-28

☑ Blog Visual Enhancements <!-- id:blog.visuals_oct28 -->
- **Preview Card Styling**:
  * Unique gradient backgrounds per article (emerald-green-teal for budget, violet-purple-indigo for strategy, amber-orange-rose for gems)
  * Large animated emoji icons (💰 budget, 📊 strategy, 💎 gems)
  * Enhanced hover states with -translate-y-2 lift effect
  * Category badges with color coding (purple for Strategy, green for Budget)
  * Gradient text on hover for titles
  * Border separator for metadata section
- **Individual Blog Post Hero Sections**:
  * Full-width hero banner (40vh min 300px) with matching gradient
  * Pattern overlay for visual depth
  * Large 9xl emoji icon with drop shadow
  * Title displays in white with drop shadow over gradient
  * Backdrop blur category/readtime badges
  * Author/date in rounded pill with backdrop blur
- **Enhanced Article Content**:
  * Prose styling with gradient H1 headings (blue-to-purple)
  * Improved typography hierarchy (H1: 4xl, H2: 2xl, H3: xl)
  * Better spacing and leading for readability
  * Styled links, lists, and horizontal rules
  * Italic styling for footnotes
  * Shadow-xl on article card
- **Enhanced CTA Section**:
  * Matches article gradient for visual consistency
  * Pattern overlay and subtle animations
  * Rocket emoji (🚀) as focal point
  * Two-button layout: "Start Building" (solid white) and "View Pro Features" (glass)
  * Hover effects with -translate-y-1 and shadow changes

☑ Named Wishlist Management Complete CRUD <!-- id:wishlist.crud_complete -->
- **API Endpoints Created**:
  * `/api/wishlists/create` - POST endpoint with name validation, duplicate checking
  * `/api/wishlists/[id]/rename` - POST endpoint with ownership validation
  * `/api/wishlists/[id]/delete` - DELETE endpoint with "cannot delete last wishlist" protection
- **UI Implementation**:
  * New/Rename/Delete buttons integrated into wishlist selector
  * Three styled modals with gradient headers and proper validation
  * Create modal: Green gradient, emoji 📋, autofocus input, max 100 chars
  * Rename modal: Blue-indigo gradient, emoji ✏️, prefilled placeholder
  * Delete modal: Red gradient with type-to-confirm ("DELETE"), shows item count warning
  * All modals have backdrop-blur, proper z-index (9999), click-outside-to-close
- **User Experience**:
  * Create wishlist auto-selects new list after creation
  * Delete switches to next available wishlist
  * Cannot delete if it's your only wishlist
  * All actions tracked with PostHog analytics
- **Files Modified**:
  * `frontend/app/api/wishlists/create/route.ts` (NEW)
  * `frontend/app/api/wishlists/[id]/rename/route.ts` (NEW)
  * `frontend/app/api/wishlists/[id]/delete/route.ts` (NEW)
  * `frontend/app/wishlist/page.tsx` (state + buttons + 3 modals added)

☑ UI Filter & Form Enhancements (2025-10-28) <!-- id:ui.collection_filters_oct28 -->
- Collection Editor Complete Visual Overhaul
  * Top control bar styling: search input, sort dropdowns, currency selector with focus rings
  * Color filter: Visual MTG color pills (WUBRG + colorless) with active states showing card colors
  * Type filter: Styled checkboxes with blue accent
  * Price filter REVAMPED: DualRange slider, quick-select chips (Any, <$1, $1-5, etc.)
  * Advanced filters: Gradient header with pulse, styled panel
  * All filters with proper hover states and transitions
- Collection Page Button & Panel Styling
  * All panel headers with gradients and pulse indicators
  * Export buttons with distinct gradients (MTGA blue, MTGO indigo, Moxfield purple, CSV teal)
  * Action buttons styled (Add emerald-green, Fix names orange-red + PRO badge)
  * Header controls (Copy, QR, CSV export) with gradient styling
  * Title bar (Save, Cancel, Rename, Delete) with appropriate gradients
- Wishlist Page Complete Button Styling
  * All buttons styled with gradients and emojis
  * Fix Names modal integration with enhanced backdrop
  * CSV upload/export buttons with distinct colors
  * Remove buttons with red-rose gradient
- Fix Names Modal Integration
  * FixCollectionNamesModal component with enhanced backdrop (bg-black/80, backdrop-blur-md)
  * API endpoints: `/api/collections/fix-names`, `/api/wishlists/fix-names` with full DFC logic
  * Proper overlapping backdrop and styled buttons matching site-wide patterns
- DualRange Slider Component
  * New `frontend/components/DualRange.tsx` for smooth min/max price selection
  * Two-handle slider with visual fill between handles
  * Integrated into Collection Editor price filter

## Future Enhancements

☐ Conversation History Search <!-- id:feature.conversation_history_search -->
- **Cross-thread search**: Allow users to search across all their chat threads
- **Keyword search**: Find specific cards, topics, or discussions from past conversations
- **Implementation ideas**: 
  - Full-text search on `chat_messages` table
  - Vector embeddings for semantic search (advanced)
  - Simple keyword indexing for fast queries
- **UI**: Search bar in chat interface to filter/find relevant past discussions

## Virtual Scrolling Already Implemented

☑ Collection Editor Virtual Scrolling <!-- id:ui.virtual_scrolling_collections -->
- Custom virtual scroller already implemented in CollectionEditor.tsx (line 875+)
- Renders only visible rows with efficient windowing
- Supports 1000+ card collections with smooth 60fps scrolling
- Custom implementation (not library-based) perfectly tuned for ManaTap's use case
- Confirmed working and performant

## Guest Experience & UX Improvements (2025-10-28)

☑ Profile Button Hidden in Guest Mode <!-- id:guest.profile_hidden -->
- Profile button in header now only shows when user is logged in
- Guest users see auth forms instead
- Profile page already has proper guest protection with polite landing page
- Shows feature benefits to encourage signup

☑ Enhanced Create Account Modal <!-- id:auth.signup_enhanced -->
- **Visual Improvements**:
  * Gradient title (blue → purple → pink)
  * Enhanced description highlighting Pro features with yellow accent
  * Gradient CTA button (blue → purple) with shadow effects
- **Social Proof & Live Presence**:
  * Pulsing green dot with "X Planeswalkers brewing right now" (randomized 3-18)
  * Activity ticker showing "New deck uploaded: Atraxa Reanimator"
  * Price trends indicator "X+ builders • Price trends down 4.2% this week"
  * Enhanced gradient background with glow effect
- **Trust & Legal**:
  * Privacy & Terms links at bottom of modal
  * "By creating an account, you agree to our..." phrasing
  * Links to /terms and /privacy with hover effects
  * Opens in new tab with proper security attributes

☑ Meta Panel Improvements <!-- id:meta.panel_improvements -->
- **Public Decks Counter Updated**:
  * Removed "(Last 30 Days)" text from display
  * Backend now queries last 6 months (180 days) instead of 30 days
  * Added gradient styling (purple → pink) to the count number
  * More data for better trending analysis
- **Format Case-Sensitivity Fixed**:
  * Normalized format names to Title Case in trending API
  * "Commander" and "commander" now count as same format
  * Prevents duplicate format entries in statistics
  * Applied normalization: charAt(0).toUpperCase() + slice(1).toLowerCase()

☑ 15 Public Decks Import Script <!-- id:content.public_decks_import -->
- **SQL Script Created**: import-15-public-decks.sql
- **Diverse Commander Archetypes**:
  1. Krenko - Goblin Tribal Aggro
  2. Talrand - Control/Spellslinger
  3. Kinnan - Infinite Mana Combo
  4. Sram - Voltron Equipment
  5. Edgar Markov - Vampire Tribal
  6. Meren - Reanimator/Graveyard
  7. Atraxa - Superfriends
  8. Zada - Token Storm
  9. Yuriko - Ninja Burn
  10. Gisela - Angel Tribal
  11. Urza - Artifact Combo
  12. Omnath - Landfall
  13. Korvold - Aristocrats/Sacrifice
  14. Brago - Blink/ETB
  15. Chulane - Bant Value
- **Features**:
  * Spread across 45-175 days ago for realistic timeline
  * All set to is_public = true
  * Archetype tags stored in meta jsonb column
  * Uses PostgreSQL dollar-quoting ($$) to avoid escape issues
  * Clear instructions for user_id replacement
  * Includes verification query
- **Schema Compliant**: Matches actual Supabase database schema