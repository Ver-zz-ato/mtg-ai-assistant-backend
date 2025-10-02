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
☐ Pro polish: foil shimmer & seasonal frames <!-- id:cardcreator.foil_frames -->
  - Homepage right-rail interactive creator; attaches to user profile; shows on profile and public profile with hover enlarge; Scryfall credit shown. First pass.

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
