# Feature Tracker

Legend: ☑ done · ◪ partial · ☐ todo

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
◪ Mobile responsiveness verified (IN PROGRESS) <!-- id:ui.mobile_responsive -->
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
