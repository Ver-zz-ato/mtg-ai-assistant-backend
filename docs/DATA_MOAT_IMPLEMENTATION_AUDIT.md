# Data Moat Implementation — Pre-Change Safety Audit (Phase 0)

## 1. Exact files responsible for touchpoints

| Touchpoint | File(s) | Notes |
|------------|---------|--------|
| **ai_suggestion_shown** | `frontend/app/my-decks/[id]/DeckAnalyzerPanel.tsx` | useEffect when `suggestions.length > 0`, ~lines 187–198; calls `capture('ai_suggestion_shown', { suggestion_count, deck_id, categories, prompt_version })`. |
| **ai_suggestion_accepted** | Same file | Three call sites after successful add: ~428 (popular includes), ~549 (synergy-upgrade), ~670 (optional). Each calls `capture('ai_suggestion_accepted', { suggestion_id: s.id, card: s.card, category, deck_id, prompt_version })`. |
| **Deck analysis generation** | `frontend/app/api/deck/analyze/route.ts` | Main handler; builds suggestions, validates, returns JSON. Builds/upserts `deck_context_summary` at ~1469–1483 when `body.deckId` and deckText present. |
| **deck_context_summary creation** | `frontend/lib/deck/deck-context-summary.ts` (`buildDeckContextSummary`) | Upserted from: `app/api/deck/analyze/route.ts`, `app/api/chat/stream/route.ts`, `app/api/chat/route.ts`. |
| **Cron meta_signals** | `frontend/app/api/cron/meta-signals/route.ts` | `runMetaSignals()`: upserts 5 signal types into `meta_signals`, then `app_config` job:last. |
| **Cron commander_aggregates** | `frontend/app/api/cron/commander-aggregates/route.ts` | `runAggregates()`: loops slugs, upserts `commander_aggregates`, then `app_config` job:last. |
| **Cron top_cards** | `frontend/app/api/cron/top-cards/route.ts` | Writes to `top_cards`; no history table requested for this pass. |

## 2. Proposed low-risk implementation plan

- **Migrations (Phase 1):** One new migration file adding four tables: `ai_suggestion_outcomes`, `meta_signals_history`, `commander_aggregates_history`, `deck_metrics_snapshot`. No foreign keys to existing tables; indexes only. Risk: none to build/runtime.
- **Helpers (Phase 2):** New directory `frontend/lib/data-moat/` with four modules. Each uses `getAdmin()` (existing pattern), try/catch, logs on failure, returns boolean. No imports into hot paths until we wire them. Risk: none.
- **Integration — Accepted suggestions (Phase 3A):**  
  - **Where:** `app/api/decks/cards/route.ts` POST handler (add single card).  
  - **Change:** Accept optional body fields `suggestion_id`, `category`, `prompt_version` (and optionally `format`, `commander`). After successful insert or merge, if any suggestion field present, call `logSuggestionOutcome({ ... })` in try/catch; on failure log only, do not change response.  
  - **Client:** `DeckAnalyzerPanel.tsx`: when calling fetch to add card, include in body `suggestion_id: s.id`, `category: s.category`, `prompt_version: promptVersion`, and optionally format/commander if available. Response shape unchanged.  
  - Risk: low (additive body params, best-effort write).
- **Integration — Meta snapshots (Phase 3B):** In `app/api/cron/meta-signals/route.ts`, at end of `runMetaSignals()` after existing `app_config` upsert, call `snapshotMetaSignals()` inside try/catch; on failure log only, still return 200. Risk: low.
- **Integration — Commander aggregates history (Phase 3C):** In `app/api/cron/commander-aggregates/route.ts`, at end of `runAggregates()`, call `snapshotCommanderAggregates()` inside try/catch; same fail-open. Risk: low.
- **Integration — Deck metrics snapshot (Phase 3D):** In `app/api/deck/analyze/route.ts`, immediately after the block that upserts `deck_context_summary` (~1483), if we have `summary` and `deckId`, call `snapshotDeckMetricsForDeck(deckId, summary)` in try/catch. No change to response or earlier logic. Risk: low.
- **Backfill scripts (Phase 4):** New scripts under `frontend/scripts/data-moat/`; not invoked at runtime. Risk: none.

## 3. Uncertainty before coding

- **RLS:** New tables will have RLS enabled; policy will be service-role only (or allow insert by service role). Migration will follow existing patterns (e.g. `mulligan_advice_runs`).  
- **commander_aggregates_history:** Current table has `median_deck_cost`; migration uses `raw JSONB` to tolerate shape changes. We will copy `top_cards`, `recent_decks`, `deck_count`, and optionally `median_deck_cost` into explicit columns plus `raw` for the rest.  
- **DeckAnalyzerPanel:** We need to pass optional suggestion context in the POST body. All three add-card call sites use the same pattern (fetch to `/api/decks/cards?deckid=...` with body `{ name: s.card, qty: 1 }`). We will add optional keys only; no change to success/error handling.

No other uncertainties identified. Proceeding to implementation.
