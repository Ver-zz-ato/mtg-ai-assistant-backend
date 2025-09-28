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

## Data & Sync

☐ Scryfall bulk sync <!-- id:data.scryfall_bulk -->
☐ Nightly Scryfall refresh <!-- id:data.nightly_jobs -->
☑ Cached price snapshots for Cost-to-Finish (persistent toggle, delta vs yesterday) <!-- id:data.price_snapshots -->
☑ Scryfall server-side cache (DB table + helpers; upsert on save/update; batch fetch) <!-- id:data.scryfall_cache -->
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

☐ Brewer persona <!-- id:persona.brewer -->
☐ Judge persona <!-- id:persona.judge -->
☐ Tutor persona <!-- id:persona.tutor -->
☐ Seed persona per thread <!-- id:persona.system_seed -->
☐ Persona toggle in UI <!-- id:persona.ui_toggle -->
☐ AI coach persona (step-by-step deck feedback) <!-- id:persona.coach -->

## Decks & Collections

☑ Legality & Tokens panel on My Decks (banned, CI conflicts, token checklist) <!-- id:deck.legality_tokens_panel -->

☑ Deck builder (Supabase) <!-- id:deck.builder -->
☑ My Decks list: click row to open; simplified actions <!-- id:deck.my_clickable_rows -->
☑ Collection manager <!-- id:deck.collection_mgr -->
☑ CSV import (Arena unclear) <!-- id:deck.import_csv -->
☑ Export deck CSV + copy list <!-- id:deck.export_csv_copy -->
☐ Export to Moxfield/Arena text formats <!-- id:deck.export_moxfield_arena -->
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
☑ AI cost tracker (tokens → £/$ per chat) <!-- id:analytics.ai_cost_tracker -->
☑ Admin AI usage summary endpoint (CSV exports, click-to-filter, client model filter) <!-- id:analytics.ai_usage_admin -->
☑ Deck metrics (curve/ramp/draw/removal bands, color identity) <!-- id:analytics.deck_metrics -->

## UI / UX

☑ Clean Tailwind components <!-- id:ui.tailwind_clean -->
☑ Homepage: moved “Most liked decks” under Recent Public Decks (left rail) <!-- id:ui.homepage_most_liked_position -->
☑ Archetype tags include tooltips on deck headers <!-- id:ui.archetype_tooltips -->
☑ Collections: deep-link to Cost-to-Finish with collection preselected <!-- id:ui.collections_ctf_deeplink -->
☑ Header: My Collections link added <!-- id:ui.header_collections_link -->
☑ Header auth: Sign up + Forgot password (modal entries) <!-- id:ui.auth_quick -->
◪ History dropdown reload resilience <!-- id:ui.history_resilience -->
☑ Error toasts present across API calls <!-- id:ui.error_toasts -->
☐ Mobile responsiveness verified <!-- id:ui.mobile_responsive -->
☑ Probability/Mulligan: deep-link + presets + persistence + copy summary <!-- id:ui.tools_polish -->
☐ Finetune Probability Helpers UI <!-- id:ui.finetune_prob -->
☐ Finetune Mulligan Simulator UI <!-- id:ui.finetune_mull -->

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
☑ Likes rate-limited (audit table) <!-- id:social.likes_rate_limit -->

## Analytics / Insights

☑ Profile color pie and archetype radar derived from decklists (card types, keywords, curve). Scores also persisted per deck for instant loads <!-- id:insights.radar_colorpie -->
☑ Deck detail pages show archetype summary <!-- id:insights.deck_archetype_summary -->
☑ Deck page trends: labeled radar + color pie legend; robust deck-card color fallback <!-- id:insights.deck_trends_labels_fallback -->

## Productivity / My Decks

☑ Row actions: toggle public/private, copy link; art thumbnails per row <!-- id:mydecks.actions_thumbs -->
☑ My Deck’s deck page trends fixed (radar axis labels, pie legend, deck-card color fallback) <!-- id:mydecks.trends_labels_fallback -->

## Public Profile

☑ Top commanders panel and signature deck art overlay <!-- id:public_profile.top_commanders_signature -->

## Advanced / Stretch

☑ Hand/mulligan simulator (deep-link, presets, local persistence, copy summary) <!-- id:adv.mulligan_sim -->
☑ Probability helpers (deep-link, presets, local persistence, copy summary) <!-- id:adv.prob_helpers -->
☐ Nightly sync scaling + Pro recompute <!-- id:adv.nightly_scale_pro -->
☐ Patreon/Ko-fi/Stripe toggles <!-- id:adv.monetize_toggles -->
☐ External login linking (Google/Discord) <!-- id:adv.oauth_links -->

## Pro Mode (Later)

☐ Pro toggle (profiles.is_pro or cookie) <!-- id:pro.toggle -->
☐ Hide ads in Pro <!-- id:pro.hide_ads -->
☐ “Recompute prices” button <!-- id:pro.recompute_btn -->
☐ Allow heavier jobs in Pro <!-- id:pro.heavy_jobs -->
☐ Donate link (Patreon/Ko-fi) <!-- id:pro.donate_link -->
