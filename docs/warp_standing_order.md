# Warp Standing Order — Auto-Tick Local Tracker (no scripts, no CI)

Role: You are the repo maintainer for C:\Users\davy_\mtg_ai_assistant.
Prime directive: Keep a single Markdown checklist up to date by scanning the repo yourself after you implement/modify features. No GitHub Actions, no local scripts — you do the scanning and edits.

Create once (now)

1. Create docs/feature_tracker.md. Use real boxes:
   - ☑ = done, ◪ = partial, ☐ = todo
   - Keep stable HTML IDs per line: <!-- id:section.key -->
   - Top legend: Legend: ☑ done · ◪ partial · ☐ todo
2. Seed it with the sections & items from this document’s “Sections & Items (seed list)”.

Ongoing behavior (every time you edit the repo)

- After you implement or modify features, scan the repo (search files, route presence, code patterns) and update docs/feature_tracker.md.
- Use the Autocheck Hints to decide done/partial/todo.
- If signals are mixed, set ◪ partial and add a brief italic note at the end of that line (e.g., routes exist; missing UI wire).
- Do not add any scripts or CI. You perform the scan and file edits yourself.

Sections & Items (seed list)

Core Architecture / Standards
- ☑ All API inputs validated with Zod <!-- id:core.zod -->
- ☑ Unified API response envelope { ok, error? } <!-- id:core.envelope -->
- ☑ Middleware logging (method, path, status, ms, userId) <!-- id:core.logging -->
- ☐ SSE chat streaming (parked for cost) <!-- id:core.sse -->
- ☑ PostHog analytics wired <!-- id:core.posthog -->
- ◪ Render deployment working (yaml exists, live not verified) <!-- id:core.render_deploy -->
- ☑ Environment variables wired (Supabase/OpenAI/etc.) <!-- id:core.env -->

Data & Sync
- ☐ Scryfall bulk sync <!-- id:data.scryfall_bulk -->
- ☐ Nightly Scryfall refresh <!-- id:data.nightly_jobs -->
- ☐ Cached price snapshots for Cost-to-Finish <!-- id:data.price_snapshots -->

Chat & Threads
- ☑ Supabase chat_threads/messages persistence <!-- id:chat.persist -->
- ☑ History dropdown loads threads <!-- id:chat.history_dropdown -->
- ☑ Thread rename endpoint working <!-- id:chat.rename -->
- ☑ Thread delete endpoint working <!-- id:chat.delete -->
- ☑ cookieUserId → user → thread rows linked <!-- id:chat.user_linking -->
- ☑ Thread auto-opens/updates after send <!-- id:chat.auto_open -->
- ☑ Double-insert safeguard <!-- id:chat.no_double_insert -->
- ◪ Visible error handling (toasts on failures) <!-- id:chat.errors_visible -->
- ☑ Consistent chat bubble styles <!-- id:chat.bubbles_style -->

Personas
- ☐ Brewer persona <!-- id:persona.brewer -->
- ☐ Judge persona <!-- id:persona.judge -->
- ☐ Tutor persona <!-- id:persona.tutor -->
- ☐ Seed persona per thread <!-- id:persona.system_seed -->
- ☐ Persona toggle in UI <!-- id:persona.ui_toggle -->
- ☐ AI coach persona (step-by-step deck feedback) <!-- id:persona.coach -->

Decks & Collections
- ☑ Deck builder (Supabase) <!-- id:deck.builder -->
- ☑ Collection manager <!-- id:deck.collection_mgr -->
- ☑ CSV import (Arena unclear) <!-- id:deck.import_csv -->
- ☑ Export deck CSV + copy list <!-- id:deck.export_csv_copy -->
- ☐ Export to Moxfield/Arena text formats <!-- id:deck.export_moxfield_arena -->
- ☑ SnapshotFromMessage wired <!-- id:deck.snapshot_from_msg -->
- ☑ Cost-to-Finish v2 (live pricing + FX) <!-- id:deck.cost_to_finish -->
- ☑ Budget Swaps page + API <!-- id:deck.budget_swaps -->
- ◪ Shopping list generator (or enriched export) <!-- id:deck.shopping_list -->
- ☐ Token needs analysis <!-- id:deck.token_needs -->
- ☐ Banned badge + replacement hints (format-wide) <!-- id:deck.legality_banned -->
- ☑ Commander staples/metagame context (seed from commander_metagame.json) <!-- id:deck.meta_seed -->
- ◪ Metagame-aware inclusion hints <!-- id:deck.meta_advice -->
- ◪ Reprint risk dots (green/orange/red) <!-- id:deck.reprint_risk -->

Analytics / Logging
- ☑ Route timing logs <!-- id:analytics.api_timing -->
- ☐ AI cost tracker (tokens → £/$ per chat) <!-- id:analytics.ai_cost_tracker -->
- ☑ Deck metrics (curve/ramp/draw/removal bands, color identity) <!-- id:analytics.deck_metrics -->

UI / UX
- ☑ Clean Tailwind components <!-- id:ui.tailwind_clean -->
- ◪ History dropdown reload resilience <!-- id:ui.history_resilience -->
- ☐ Error toasts present across API calls <!-- id:ui.error_toasts -->
- ◪ Mobile responsiveness verified <!-- id:ui.mobile_responsive -->

Advanced / Stretch
- ☐ Hand/mulligan simulator <!-- id:adv.mulligan_sim -->
- ☐ Probability helpers <!-- id:adv.prob_helpers -->
- ☐ Nightly sync scaling + Pro recompute <!-- id:adv.nightly_scale_pro -->
- ☐ Patreon/Ko-fi/Stripe toggles <!-- id:adv.monetize_toggles -->
- ☐ External login linking (Google/Discord) <!-- id:adv.oauth_links -->

Pro Mode (Later)
- ☐ Pro toggle (profiles.is_pro or cookie) <!-- id:pro.toggle -->
- ☐ Hide ads in Pro <!-- id:pro.hide_ads -->
- ☐ “Recompute prices” button <!-- id:pro.recompute_btn -->
- ☐ Allow heavier jobs in Pro <!-- id:pro.heavy_jobs -->
- ☐ Donate link (Patreon/Ko-fi) <!-- id:pro.donate_link -->

Autocheck Hints
- Zod: z.object( and shared schema imports in app/api/**
- Envelope: ok( / err( helpers used across API routes
- Logging: withLogging / withTiming wrappers; JSON logs with method/path/status/ms/userId
- PostHog: posthog-js import + capture( calls in UI
- Render deploy: config exists + optional README deploy URL; if not verifiable locally, keep ◪
- Chat rename/delete: presence of /app/api/chat/threads/rename/route.ts and /delete/route.ts exporting a handler; UI wired to these
- Errors visible: toast or inline error components referenced on chat actions and deck actions
- Deck metrics: /api/deck/analyze and UI components rendering curve/bands
- Meta seed/advice: code that loads commander_metagame.json and surfaces inclusion notes in analysis or swaps
- Reprint risk: code annotating items with low|med|high and rendering dots
- Mobile responsive: quick scan for Tailwind breakpoints (sm/md/lg) on key pages; if uncertain, leave ☐

Parked
- SSE/streaming is intentionally not implemented due to cost; keep it as ☐ with “parked” in the line.

Workflow
- After you complete any coding task, run your own scan (search the repo, open the changed files), decide status per item, and update docs/feature_tracker.md accordingly. Keep IDs intact. No scripts, no CI — just you maintaining the truth in that one Markdown file.
