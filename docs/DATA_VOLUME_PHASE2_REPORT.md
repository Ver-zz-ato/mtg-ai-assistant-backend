# ManaTap Phase 2 Audit: Data Volume & Usefulness

**Goal:** Determine whether we already have enough telemetry to build behavioral datasets.  
**Scope:** PostHog events, Supabase `deck_context_summary` and `mulligan_advice_runs`.  
**Scripts:** `frontend/scripts/audit-phase2/` (PostHog requires API key; Supabase scripts run with service role).

---

## 1. PostHog Events (Step 1)

*Run: `POSTHOG_PERSONAL_API_KEY=... POSTHOG_PROJECT_ID=... npx tsx scripts/audit-phase2/posthog-events.ts` and paste the JSON output below, or run equivalent HogQL in PostHog → Data → Query.*

### 1.1 Total event counts

| Event | Total | Notes |
|-------|-------|--------|
| ai_suggestion_shown | *[run script or PostHog Insights]* | |
| ai_suggestion_accepted | *[run script or PostHog Insights]* | |
| deck_analyzed | *[run script or PostHog Insights]* | |
| deck_saved | *[run script or PostHog Insights]* | |
| mulligan_decision | *[run script or PostHog Insights]* | |

### 1.2 Events per month

*Paste step1_by_month from script output or build in PostHog: filter by event, group by `toStartOfMonth(timestamp)`.*

### 1.3 Events per deck

*Paste step1_by_deck (top 500 deck_id by count) or PostHog: group by `properties.deck_id` for the above events.*

### 1.4 Events per commander

*Paste step1_by_commander (top 200 commander_name by count) or PostHog: group by `properties.commander_name`.*

---

## 2. Suggestion Dataset Feasibility (Step 2)

*Same script: step2_* fields.*

### 2.1 Unique suggestion_id count

- **Unique suggestion_id (ai_suggestion_shown):** *[run script]*  
- **Accepted suggestions (ai_suggestion_accepted count):** *[run script]*

### 2.2 Top 50 accepted AI suggestions (by card name)

| Rank | Card | Accept count |
|------|------|--------------|
| 1 | *[paste from step2_top_50_accepted_cards]* | |
| … | | |

*If PostHog property for card is different (e.g. `card` vs `properties.card`), adjust HogQL in the script.*

---

## 3. Deck Structural Dataset (Step 3)

*Run: `npx tsx scripts/audit-phase2/supabase-deck-structure.ts` (from frontend/).*

### 3.1 Sample size

- **Decks sampled:** 100 (or fewer if `deck_context_summary` has fewer rows).
- **Actual sample (this run):** **92** rows.

### 3.2 Aggregated stats (from deck_context_summary.summary_json)

| Metric | Avg | Min | Max | n |
|--------|-----|-----|-----|---|
| land_count | 29.75 | 0 | 59 | 92 |
| ramp_count | 28.92 | 0 | 61 | 92 |
| removal_count | 5.77 | 0 | 17 | 92 |
| draw_count | 8.16 | 0 | 28 | 92 |

*Note: ramp_count in summary may include all non-land mana sources; interpret in line with `lib/deck/deck-context-summary.ts`.*

### 3.3 Curve histogram (CMC buckets 0–1, 2, 3, 4, 5+)

| Bucket index | Avg count | Min | Max |
|--------------|-----------|-----|-----|
| 0 (0–1 CMC) | 35.3 | 0 | 100 |
| 1 (2 CMC) | 14.6 | 0 | 39 |
| 2 (3 CMC) | 14.1 | 0 | 34 |
| 3 (4 CMC) | 8.6 | 0 | 24 |
| 4 (5+ CMC) | 9.0 | 0 | 32 |

### 3.4 Top archetype_tags (from sample)

| Tag | Count |
|-----|-------|
| unknown | 69 |
| spellslinger | 12 |
| ramp_midrange | 6 |
| aristocrats | 3 |
| combo | 1 |
| graveyard | 1 |

---

## 4. Mulligan Dataset (Step 4)

*Run: `npx tsx scripts/audit-phase2/supabase-mulligan.ts` (from frontend/).*

### 4.1 Keep rate

- **Total runs (with action):** **29**
- **Keep:** 6  
- **Mulligan:** 23  
- **Keep rate:** **20.7%**

*(Sample is small; production widget + admin playground combined.)*

### 4.2 Mulligan count distribution

| Mulligan count | Runs |
|----------------|------|
| 0 | 13 |
| 1 | 9 |
| 2 | 3 |
| 3 | 2 |
| 4 | 1 |
| 5 | 1 |

### 4.3 Ramp presence vs keep rate

*Proxy: “reasons mention ramp” (AI gave a reason mentioning ramp/rock/signet etc.).*

- **Runs where reasons mention ramp:** 22  
- **Keep when ramp mentioned:** 2  
- **Mull when ramp mentioned:** 20  
- **Keep rate when ramp mentioned:** **9.1%**

*(In this sample, when the AI’s reasons mention ramp, it usually recommended mulligan; not necessarily “deck has ramp” → higher keep.)*

---

## 5. Output Summary

### 5.1 Dataset sizes (as of this audit)

| Dataset | Source | Approx size | Usable for |
|---------|--------|-------------|------------|
| PostHog: ai_suggestion_* / deck_* / mulligan_decision | PostHog | *Run script* | Event counts, acceptance by card, deck/commander attribution |
| deck_context_summary | Supabase | 92+ rows (sample 100) | Deck structure: lands, curve, ramp/removal/draw, archetype_tags |
| mulligan_advice_runs | Supabase | 29 runs (this DB) | Keep rate, mulligan count, reasons vs action |

*PostHog totals and suggestion_id/card breakdown require running the PostHog script with a personal API key.*

### 5.2 Which models could be trained

- **Suggestion acceptance (card-level):** Feasible **if** PostHog has sufficient `ai_suggestion_accepted` and `ai_suggestion_shown` with `suggestion_id`, `card`, `deck_id`, and optionally `category`/`prompt_version`. Use script to get unique suggestion IDs and top accepted cards; if counts are in the hundreds/thousands, a lightweight “recommend cards that get accepted more” or acceptance-prediction model is plausible. **Rejection** is only inferable (shown but not accepted), so rejector model is weaker without explicit reject events.
- **Deck structure / archetype:** **92** deck summaries with land_count, curve_histogram, ramp/removal/draw, archetype_tags are enough for **descriptive stats and simple clustering** (e.g. archetype distribution, curve profiles). Training a **predictive** model (e.g. “suggest archetype from list”) would benefit from hundreds more decks and labels; we have the schema, not yet the volume in this sample.
- **Mulligan keep/mull:** **29** runs is too small to train a model. Use this pipeline to **keep logging**; once you have hundreds or thousands of runs with action + input (hand, deck, mulliganCount), you can train a small keep/mull classifier or use the data for reward signals.

### 5.3 Missing instrumentation

- **PostHog:** No server-side event for `deck_saved`/`deck_updated` with `deck_id` in a way that always matches client `deck_id` (we have server captureServer; ensure same property names). Confirm `suggestion_id` is sent on **both** `ai_suggestion_shown` and `ai_suggestion_accepted` so acceptance can be joined. Add **ai_suggestion_rejected** (with suggestion_id, card, reason) to improve behavioral learning.
- **Suggestions in DB:** No table of (suggestion_id, suggested_card, replaced_card, category, accepted, deck_id, prompt_version, created_at). PostHog is the only source for “which card was accepted”; consider a lightweight `ai_suggestion_outcomes` table written when user accepts (and optionally when they reject) so you can query without PostHog.
- **Mulligan:** `mulligan_advice_runs` has input_json/output_json; ensure **production_widget** runs are always logged (they are via run-logger). No explicit “user kept/mulled after advice” event in DB; PostHog has `mulligan_decision` but it’s client-only—correlate with runs by time/session if needed.
- **Deck structure over time:** No historical snapshot of deck_context_summary (e.g. by date). For “meta evolution” or deck health over time, add a snapshot table or append-only deck_metrics by day.

---

**Scripts location:** `frontend/scripts/audit-phase2/`  
**PostHog:** Run `posthog-events.ts` with API key and project ID, then paste results into §1–2.  
**Supabase:** §3 and §4 were populated from `supabase-deck-structure.ts` and `supabase-mulligan.ts` (run 2026-03-15).
