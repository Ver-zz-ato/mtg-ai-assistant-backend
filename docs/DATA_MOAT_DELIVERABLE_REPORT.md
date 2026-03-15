# Data Moat — Implementation Deliverable Report

## 1. Pre-change audit

See **docs/DATA_MOAT_IMPLEMENTATION_AUDIT.md** for the full Phase 0 audit.

**Summary of touchpoints identified:**

| Touchpoint | File(s) |
|------------|--------|
| ai_suggestion_shown / ai_suggestion_accepted | `frontend/app/my-decks/[id]/DeckAnalyzerPanel.tsx` |
| Deck analysis + deck_context_summary | `frontend/app/api/deck/analyze/route.ts` |
| deck_context_summary build | `frontend/lib/deck/deck-context-summary.ts` |
| Cron meta_signals | `frontend/app/api/cron/meta-signals/route.ts` |
| Cron commander_aggregates | `frontend/app/api/cron/commander-aggregates/route.ts` |

---

## 2. Proposed low-risk implementation plan (executed)

- **Phase 1:** One migration adding four append-only tables; no FKs; RLS service-role only.
- **Phase 2:** Four helpers under `lib/data-moat/`; try/catch, log on failure, return boolean.
- **Phase 3A:** Cards route POST: optional body fields; after successful add/merge, best-effort `logSuggestionOutcome()` in try/catch. Client sends `suggestion_id`, `category`, `prompt_version` (and optional format/commander).
- **Phase 3B:** Meta cron: after existing logic, try/catch `snapshotMetaSignals()`.
- **Phase 3C:** Commander cron: after existing logic, try/catch `snapshotCommanderAggregates()`.
- **Phase 3D:** Deck analyze: after deck_context_summary read/upsert, try/catch `snapshotDeckMetricsForDeck()` for both “built” and “cached” summary paths.
- **Phase 4:** Optional backfill scripts (non-runtime).
- **Phase 5:** Typecheck, lint, build, and this report.

---

## 3. Changes made

- **Migration:** Added `089_data_moat_tables.sql` with four tables: `ai_suggestion_outcomes`, `meta_signals_history`, `commander_aggregates_history`, `deck_metrics_snapshot` (indexes as specified; no FKs).
- **Helpers:** `log-suggestion-outcome.ts`, `snapshot-meta-signals.ts`, `snapshot-commander-aggregates.ts`, `snapshot-deck-metrics.ts` — all use `getAdmin()`, try/catch, warn on failure, return boolean.
- **Integration — Accepted suggestions:** In `app/api/decks/cards/route.ts`, after successful insert or merge, dynamic import and call `logSuggestionOutcome(...)` with body fields; PostHog unchanged. In `DeckAnalyzerPanel.tsx`, all three “Add” flows send `suggestion_id`, `category`, `prompt_version` (and optional format/commander) in the POST body.
- **Integration — Meta/commander history:** In meta-signals and commander-aggregates cron routes, after existing `app_config` upsert, call snapshot helpers in try/catch; response unchanged.
- **Integration — Deck metrics:** In `app/api/deck/analyze/route.ts`, after deck_context_summary upsert or when using cached `row.summary_json`, call `snapshotDeckMetricsForDeck(deckId, summary)` in try/catch.
- **Backfill scripts:** `scripts/data-moat/backfill-meta-history.ts`, `backfill-commander-history.ts`, `backfill-deck-metrics.ts` — load `.env.local`, call snapshot helpers or iterate deck_context_summary and snapshot per deck; optional, not required for runtime.
- **Build unblock:** Typed `out` in `scripts/audit-phase2/posthog-events.ts` so `step1_event_totals` and `step1_by_month` are assignable (fixes Next.js build TypeScript step).

---

## 4. Migrations added

| Migration | Description |
|-----------|-------------|
| `frontend/db/migrations/089_data_moat_tables.sql` | Creates `ai_suggestion_outcomes`, `meta_signals_history`, `commander_aggregates_history`, `deck_metrics_snapshot` with indexes and RLS (service-role only). No foreign keys. |

---

## 5. Files touched

| File | Change |
|------|--------|
| `frontend/db/migrations/089_data_moat_tables.sql` | New (four tables). |
| `frontend/lib/data-moat/log-suggestion-outcome.ts` | New. |
| `frontend/lib/data-moat/snapshot-meta-signals.ts` | New. |
| `frontend/lib/data-moat/snapshot-commander-aggregates.ts` | New. |
| `frontend/lib/data-moat/snapshot-deck-metrics.ts` | New. |
| `frontend/app/api/decks/cards/route.ts` | POST: optional body fields; try/catch `logSuggestionOutcome` after add/merge. Fixed `||`/`??` parentheses for typecheck. |
| `frontend/app/my-decks/[id]/DeckAnalyzerPanel.tsx` | Three add-card POSTs: include `suggestion_id`, `category`, `prompt_version` (and optional format/commander) in body. |
| `frontend/app/api/cron/meta-signals/route.ts` | After app_config upsert, try/catch `snapshotMetaSignals()`. |
| `frontend/app/api/cron/commander-aggregates/route.ts` | After app_config upsert, try/catch `snapshotCommanderAggregates()`. |
| `frontend/app/api/deck/analyze/route.ts` | After deck_context_summary upsert or when using cached summary, try/catch `snapshotDeckMetricsForDeck()`. Inline type for `row.summary_json` where passed to helper. |
| `frontend/scripts/data-moat/backfill-meta-history.ts` | New (optional). |
| `frontend/scripts/data-moat/backfill-commander-history.ts` | New (optional). |
| `frontend/scripts/data-moat/backfill-deck-metrics.ts` | New (optional). |
| `frontend/scripts/audit-phase2/posthog-events.ts` | Typed `out` so build TypeScript passes (minimal fix; no behavior change). |

---

## 6. Build / typecheck / lint results

- **Typecheck (`npx tsc --noEmit`):** Two errors in **our** code were fixed in `app/api/decks/cards/route.ts` (mixed `||`/`??` parentheses). Remaining tsc errors are **pre-existing** in `scripts/audit-phase2/posthog-events.ts` (fixed by typing `out`), `tests/unit/*` (vitest/jest types, NODE_ENV, test-mutation), and are outside data-moat scope.
- **Next.js build:** TypeScript step passes after the posthog-events fix. Full `npm run build` was run (compile + typecheck + page generation); no refactors were introduced.
- **Lint:** Lint was run on changed files. Reported issues are **pre-existing** (no-explicit-any, unused vars, fetch vs fetchJson, etc.). No new lint rules were added; no refactors of existing code for lint.

---

## 7. Risks / caveats

- **meta_signals_history upsert:** Uses unique on `(snapshot_date, signal_type)`. If your Supabase client expects a single constraint name for `.upsert(..., { onConflict: '...' })`, verify the exact syntax for composite unique (e.g. `onConflict: 'snapshot_date,signal_type'` or as per Supabase docs).
- **Rejected/ignored suggestions:** Not instrumented in this pass; only **accepted** outcomes are written. Adding rejected/ignored would require a clear client/API hook and is out of scope here.
- **Backfill scripts:** Use `@/` path aliases; run from repo root with `npx tsx scripts/data-moat/backfill-*.ts` (or from frontend with correct tsconfig). They are optional and not required for runtime.
- **Full repo typecheck:** `tsc --noEmit` still reports errors in `tests/unit/*` and possibly other scripts; those are unchanged by this work. Next.js build only typechecks what it bundles.

---

## 8. Rollback instructions

- **Code rollback:** Revert the commits that added data-moat integration (helpers, route changes, DeckAnalyzerPanel body params, cron snapshot calls, analyze snapshot call). Leave migration in place if you want to keep tables for future use, or roll back migration as below.
- **Migration rollback:** To remove the four tables, run a new migration that drops them in reverse order of creation, e.g.  
  `DROP TABLE IF EXISTS deck_metrics_snapshot;`  
  `DROP TABLE IF EXISTS commander_aggregates_history;`  
  `DROP TABLE IF EXISTS meta_signals_history;`  
  `DROP TABLE IF EXISTS ai_suggestion_outcomes;`  
  Or revert application of `089_data_moat_tables.sql` per your migration tool (e.g. Supabase CLI down).
- **Disable runtime writes without code revert:**  
  - **Suggestions:** Remove or comment the try/catch block that calls `logSuggestionOutcome` in `app/api/decks/cards/route.ts` (two places: after merge, after insert).  
  - **Meta/commander history:** Remove or comment the try/catch that calls `snapshotMetaSignals()` in meta-signals cron and `snapshotCommanderAggregates()` in commander-aggregates cron.  
  - **Deck metrics:** Remove or comment the try/catch blocks that call `snapshotDeckMetricsForDeck()` in `app/api/deck/analyze/route.ts` (both “built summary” and “cached summary” paths).  
  No feature flags were added; re-enabling is done by restoring those calls.

---

**End of deliverable report.**
