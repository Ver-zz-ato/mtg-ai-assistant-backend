# Data Moat — Feedback Document for LLM

This document summarizes everything implemented for the “data moat” (behavioural + meta history), how it was done, and what to do next. Use it as context for future work or handoffs.

---

## 1. What was built (overview)

We added a **minimal-risk, append-only data foundation** in the ManaTap frontend/backend so you can later:

1. **Learn from AI suggestion outcomes** — when users accept (or in future reject/ignore) card suggestions.
2. **Analyse meta over time** — daily snapshots of meta_signals and commander_aggregates.
3. **Analyse deck “fitness” over time** — daily snapshots of deck-level metrics (lands, ramp, removal, draw, curve, etc.) when decks are analysed or saved.

All writes are **best-effort, fail-open**: if a write fails, the user flow still succeeds. No API response shapes were changed. No existing features were refactored.

---

## 2. Database (Supabase)

**Migration:** `frontend/db/migrations/089_data_moat_tables.sql`

**Four tables:**

| Table | Purpose |
|-------|--------|
| **ai_suggestion_outcomes** | One row per logged outcome: suggestion_id, deck_id, user_id, suggested_card, replaced_card, category, prompt_version_id, format, commander, accepted/rejected/ignored, outcome_source, created_at. Indexes on suggestion_id, deck_id, user_id, created_at. |
| **meta_signals_history** | Daily snapshots of meta_signals. Columns: snapshot_date, signal_type, data (JSONB). Unique on (snapshot_date, signal_type). |
| **commander_aggregates_history** | Daily snapshots of commander_aggregates. Columns: snapshot_date, commander_slug, deck_count, top_cards, recent_decks, raw (JSONB). Unique on (snapshot_date, commander_slug). |
| **deck_metrics_snapshot** | One row per deck per day. Columns: deck_id, deck_hash, snapshot_date, format, commander, land_count, ramp_count, removal_count, draw_count, curve_histogram, archetype_tags, synergy_diagnostics, deck_facts (JSONB where needed). Unique on (deck_id, snapshot_date). |

- **RLS:** All four tables have RLS enabled with a single policy: service_role only. No foreign keys to existing tables (avoids breakage from legacy/null data).
- **Verification:** See `docs/DATA_MOAT_VERIFY_SQL.md` for SQL to run in Supabase after using the admin Test page.

---

## 3. Server-side helpers (data-moat)

**Location:** `frontend/lib/data-moat/`

| File | Function | Behaviour |
|------|----------|-----------|
| **log-suggestion-outcome.ts** | `logSuggestionOutcome(input)` | Inserts one row into ai_suggestion_outcomes. Uses getAdmin(), try/catch, returns boolean. Logs warning on failure. |
| **snapshot-meta-signals.ts** | `snapshotMetaSignals()` | Reads meta_signals, upserts rows into meta_signals_history for today (one per signal_type). |
| **snapshot-commander-aggregates.ts** | `snapshotCommanderAggregates()` | Reads commander_aggregates, upserts rows into commander_aggregates_history for today. |
| **snapshot-deck-metrics.ts** | `snapshotDeckMetricsForDeck(deckId, summary)` | Maps a deck summary (DeckSummaryLike) into one row in deck_metrics_snapshot for today; upsert on (deck_id, snapshot_date). |

All helpers: **read/write via getAdmin()**, **try/catch**, **log on failure**, **return boolean**. No throws into caller.

---

## 4. Where writes are triggered (integration)

### 4.1 Accepted suggestion outcomes

- **API:** `frontend/app/api/decks/cards/route.ts` (POST). After a successful insert or merge of a deck card, if the request body includes suggestion context (suggestion_id / suggestionId, etc.), the handler does a dynamic import of `logSuggestionOutcome` and calls it in a try/catch. Response is unchanged.
- **Client:** `frontend/app/my-decks/[id]/DeckAnalyzerPanel.tsx`. All three “Add” flows (popular includes, synergy-upgrade, optional) send in the POST body: `suggestion_id: s.id`, `category`, `prompt_version` (and optional format/commander). PostHog `ai_suggestion_accepted` is unchanged.
- **Scope:** Only **accepted** outcomes are logged in this pass. Rejected/ignored are not yet instrumented.

### 4.2 Meta and commander history (cron)

- **Meta:** `frontend/app/api/cron/meta-signals/route.ts`. After the existing logic that upserts meta_signals and app_config, the route calls `snapshotMetaSignals()` in a try/catch. On failure it only logs; cron still returns 200.
- **Commander:** `frontend/app/api/cron/commander-aggregates/route.ts`. Same pattern: after existing upserts, try/catch `snapshotCommanderAggregates()`.

### 4.3 Deck metrics snapshot

- **Deck analyse:** `frontend/app/api/deck/analyze/route.ts`. After the block that reads/upserts deck_context_summary (both “build new summary” and “use cached row.summary_json”), the route calls `snapshotDeckMetricsForDeck(deckId, summary)` in a try/catch.
- **Chat (main chat AI):** `frontend/app/api/chat/stream/route.ts` and `frontend/app/api/chat/route.ts`. When the user has a **linked deck** and we have a v2Summary (either from cache or after building and upserting deck_context_summary), we call `snapshotDeckMetricsForDeck(deckId, v2Summary)` in a try/catch so that “analyse my deck” in main chat also produces a deck_metrics_snapshot row.

---

## 5. Bug fixes done alongside the data moat

- **deck_metrics_snapshot empty after chat analysis:** The snapshot was only wired in deck/analyze. It is now also called from chat/stream and chat/route when a linked deck’s summary is built or loaded, so analysing a deck via main chat populates deck_metrics_snapshot.
- **Inline card links (ADD X / CUT Y):** Card names in “ADD Viscera Seer / CUT Mayhem Devil” were not clickable because the markdown renderer only recognised `[[Card Name]]`. We now run `applyBracketEnforcement()` from `lib/chat/outputCleanupFilter.ts` inside the markdown renderer (when renderCard is provided), so “ADD X / CUT Y” is normalised to “ADD [[X]] / CUT [[Y]]” and those segments become card links.

---

## 6. Optional backfill scripts (non-runtime)

**Location:** `frontend/scripts/data-moat/`

- **backfill-meta-history.ts** — Calls `snapshotMetaSignals()` for today (e.g. after migration to seed meta_signals_history).
- **backfill-commander-history.ts** — Calls `snapshotCommanderAggregates()` for today.
- **backfill-deck-metrics.ts** — Reads all rows from deck_context_summary and calls `snapshotDeckMetricsForDeck(deck_id, summary_json)` for each (upsert per deck for today).

Run from project root (or frontend with correct tsconfig), e.g. `npx tsx frontend/scripts/data-moat/backfill-meta-history.ts`. They load `.env.local` and use getAdmin(). Optional; not required for normal runtime.

---

## 7. Admin dashboard (read-only + test)

**Base path:** `/admin/datadashboard`  
**Entry from main admin:** A “Data Dashboard” card was added under **Data & Tools** on `/admin/JustForDavy` with ELI5: “Behaviour & meta data: suggestions accepted, deck snapshots, meta/commander history. Run tests, see counts.”

**Pages:**

- **Overview** (`/admin/datadashboard`) — Data health: row counts and latest dates for all four tables; links to the three section pages and Test.
- **Suggestions** (`/admin/datadashboard/suggestions`) — KPIs (total accepted, today, last 7d, unique cards/decks), top accepted cards, by category, by commander, recent rows. Uses `ai_suggestion_outcomes` only.
- **Deck Metrics** (`/admin/datadashboard/deck-metrics`) — KPIs, aggregate averages, commander breakdown, archetype tag distribution, curve bucket averages, recent snapshots, outlier panels (lowest/highest lands, highest ramp). Uses `deck_metrics_snapshot` only.
- **Meta Trends** (`/admin/datadashboard/meta-trends`) — KPIs, meta_signals_history table, commander_aggregates_history summary, commander trend detail (deck_count delta), counts per snapshot_date for both history tables. Uses `meta_signals_history` and `commander_aggregates_history`.
- **Test** (`/admin/datadashboard/test`) — Four “Run” actions: (1) insert one test row into ai_suggestion_outcomes (outcome_source = admin_test), (2) snapshot meta signals for today, (3) snapshot commander aggregates for today, (4) snapshot one deck from deck_context_summary into deck_metrics_snapshot. Plus a section with **SQL to verify in Supabase** (same queries as in `docs/DATA_MOAT_VERIFY_SQL.md`).

**Data layer:** `frontend/lib/data-dashboard/` — read-only helpers that take a Supabase admin client and return typed shapes: `get-data-dashboard-overview.ts`, `get-suggestions-dashboard.ts`, `get-deck-metrics-dashboard.ts`, `get-meta-trends-dashboard.ts`.  
**API:** GET routes under `frontend/app/api/admin/datadashboard/` (overview, suggestions, deck-metrics, meta-trends, test is POST). All check admin via getServerSupabase + isAdmin(user), then use getAdmin() for DB access.  
**UI:** Client components that fetch these APIs and render tables/cards with loading and empty states. ELI5 boxes were added on Overview, Suggestions, Deck Metrics, Meta Trends, and Test so the purpose of each page is clear.

---

## 8. Key files reference

| Area | Paths |
|------|--------|
| Migration | `frontend/db/migrations/089_data_moat_tables.sql` |
| Helpers | `frontend/lib/data-moat/*.ts` (4 files) |
| Dashboard data | `frontend/lib/data-dashboard/*.ts` (4 files) |
| Integration | `frontend/app/api/decks/cards/route.ts`, `frontend/app/api/deck/analyze/route.ts`, `frontend/app/api/chat/stream/route.ts`, `frontend/app/api/chat/route.ts`, `frontend/app/api/cron/meta-signals/route.ts`, `frontend/app/api/cron/commander-aggregates/route.ts` |
| Client suggestion payload | `frontend/app/my-decks/[id]/DeckAnalyzerPanel.tsx` |
| Card link fix | `frontend/lib/chat/markdownRenderer.tsx` (import + use of `applyBracketEnforcement`) |
| Admin dashboard | `frontend/app/admin/datadashboard/*.tsx`, `frontend/app/admin/JustForDavy/page.tsx` (Data Dashboard card) |
| Docs | `docs/DATA_MOAT_IMPLEMENTATION_AUDIT.md`, `docs/DATA_MOAT_DELIVERABLE_REPORT.md`, `docs/DATA_MOAT_VERIFY_SQL.md`, `docs/DATA_DASHBOARD_AUDIT.md` |

---

## 9. What to do next (suggestions)

1. **Rejected / ignored suggestion outcomes**  
   Only “accepted” is logged today. To support reject-rate or “ignored” analytics, add a clear client or API hook when the user explicitly rejects or dismisses a suggestion (e.g. “Don’t add” or closing the suggestion), then call `logSuggestionOutcome` with `rejected: true` or `ignored: true` and the same suggestion_id/category/etc. Keep it best-effort and fail-open.

2. **Run backfills once (if desired)**  
   If you want history from “today” for meta and commander without waiting for cron, run the backfill scripts once (and optionally backfill-deck-metrics to seed deck_metrics_snapshot from existing deck_context_summary). After that, cron and product flows will keep appending.

3. **Monitor data health**  
   Use the Data Dashboard Overview and Test page regularly. If row counts or “latest” dates stop moving, check cron execution (meta-signals, commander-aggregates) and that deck analysis / chat flows are hitting the routes that call `snapshotDeckMetricsForDeck` and `logSuggestionOutcome`.

4. **Downstream use (no schema change)**  
   The tables are ready for read-only analytics, ML training data, or internal reports. Prefer new queries or API routes that read from these tables rather than changing their schema. If you need new columns, add them in a new migration and keep existing columns intact.

5. **Optional: alerts or thresholds**  
   If cron is critical for meta/commander history, consider a simple check (e.g. “latest meta_signals_history.snapshot_date &lt; today”) and notify (e.g. Slack or email) when it fails. Same idea for deck_metrics_snapshot if you care about daily coverage.

6. **Optional: top_cards history**  
   We did not add a history table for `top_cards`. If you later want “top cards over time”, add a `top_cards_history` (or similar) table and a snapshot helper called from the top_cards cron, following the same append-only, fail-open pattern.

7. **Keep constraints**  
   Continue to avoid refactoring working features, changing API response shapes, or touching hot paths for this data. Prefer additive, append-only changes and fail-open behaviour so the data moat stays low-risk.

---

## 10. Rollback (reminder)

- **Code:** Revert commits that added data-moat integration (helpers, route calls, DeckAnalyzerPanel body params, dashboard, test). No feature flags were added.
- **DB:** To drop the four tables, run a new migration that drops `deck_metrics_snapshot`, `commander_aggregates_history`, `meta_signals_history`, `ai_suggestion_outcomes` (in that order if there were FKs; currently there are none).
- **Disable writes only:** Comment out the try/catch blocks that call the data-moat helpers in the routes listed in section 4; leave tables and dashboard in place.

---

**End of feedback document.**
