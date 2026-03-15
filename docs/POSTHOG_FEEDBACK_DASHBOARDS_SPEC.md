# PostHog feedback dashboards — audit and build spec

**Purpose:** Confirmed inventory of feedback-related events and exact specs for the 3 highest-value feedback dashboards. Dashboards are **not** managed in code in this repo; this document is the **manual build sheet** for creating them in PostHog.

---

## Phase A — Confirmed event inventory

All of the following were **confirmed in code** (file paths and property names match the repo). Session enrichment (e.g. `current_path`, `landing_page`, `device_type`) is added by `lib/ph.ts` + `lib/analytics/session-bootstrap.ts` for client events; not listed below as event-specific.

| Event | Properties (event-specific) | File(s) | Notes / gaps |
|-------|-----------------------------|---------|--------------|
| **analysis_feedback_submitted** | `rating` (5 or 2), `feature` ("deck_analysis"); optional: `deck_id`, `score`, `prompt_version` (when available from parent) | `components/AnalysisFeedbackRow.tsx` | Context added: deck_id, score, prompt_version passed from DeckSnapshotPanel / DeckAnalyzerPanel. |
| **suggestion_report_opened** | `feature` ("deck_analyzer_suggestion"), `suggestion_id` | `components/SuggestionReportControl.tsx` | — |
| **suggestion_report_submitted** | `feature`, `suggestion_id`, `suggestion_category`, `suggested_card_name`, `issue_types` (array), `primary_issue_type` (first selected or null), `deck_id`, `commander_name`, `prompt_version_id` | `components/SuggestionReportControl.tsx` | `primary_issue_type` added for single-property breakdown in PostHog. |
| **feedback_prompt_shown** | `source` ("frustration") | `components/FrustrationFeedbackPrompt.tsx` | Only fired when frustration prompt is shown (once per session). |
| **feedback_widget_opened** | `page`, `trigger` (button_click \| error_occurred \| feature_limit \| satisfaction_prompt \| **frustration_prompt** \| **founder_popup**), `user_tenure`, `timestamp` | `lib/analytics-enhanced.ts`; `components/FeedbackFab.tsx` | Trigger attribution fixed: when opened via event, detail.trigger is used (founder_popup, frustration_prompt). |
| **founder_popup_shown** | (none) | `components/FounderFeedbackPopup.tsx` | Fired on 45s timer or on first `manatap:deck_analysis_complete`. |
| **founder_popup_cta_clicked** | (none) | `components/FounderFeedbackPopup.tsx` | Fired when user clicks “Send feedback”; then opens FeedbackFab via event with detail.trigger = founder_popup. |
| **user_frustrated** | `indicator` (rapid_clicks \| form_resubmit \| back_button_spam \| error_repeat), `context`, `page_path`, `timestamp` | `lib/analytics-enhanced.ts` (trackUserFrustration); called from `lib/frustration-detector.ts` | — |
| **feedback_sent** | `user_id`, `rating`; optional **`source`** (feedback_button \| frustration_prompt \| founder_popup \| deck_analysis) when sent in request body | `app/api/feedback/route.ts` (server) | Source attribution added: API reads optional body.source and includes in PostHog event. |
| **chat_feedback** | `rating`, `msg_id`; enriched: `thread_id`, `user_message`, `assistant_message`, `format`, `persona`, `prompt_version`, `commander_name`, `message_id` (from enrichChatEvent) | `components/Chat.tsx` + `lib/analytics/enrichChatEvent.ts` | Client-only; persona/prompt_version often null if not in context. |
| **deck_analyzed** | **Homepage (DeckSnapshotPanel):** `workflow_run_id`, `format`, `plan`, `colors`, `score`, `card_count`, `prompt_version`. **Deck page (DeckAnalyzerPanel):** `deck_id`, `score`, `prompt_version`, `suggestion_count`, `commander_name`, `format` (no workflow_run_id, plan, colors, card_count) | `components/DeckSnapshotPanel.tsx`; `app/my-decks/[id]/DeckAnalyzerPanel.tsx` | Deck page now fires `deck_analyzed` with deck-page-specific properties. |
| **deck_analyze_started** | `format`, `plan`, `colors`, `card_count`, `workflow_run_id` | `components/DeckSnapshotPanel.tsx` | Only homepage; deck page does not fire this. |
| **ai_suggestion_shown** | `suggestion_count`, `deck_id`, `categories`, `prompt_version` | `app/my-decks/[id]/DeckAnalyzerPanel.tsx` | Fired when suggestions are set (deck page analyzer). |
| **ai_suggestion_accepted** | `suggestion_id`, `card`, `category`, `deck_id`, `prompt_version` | `app/my-decks/[id]/DeckAnalyzerPanel.tsx` | — |

**Confirmed in code:** All event names and the properties listed above exist in the repo. No event names were invented.

**Session context (auto-added by capture()):** For client events, `lib/ph.ts` merges in `getSessionContext()`: e.g. `landing_page`, `referrer`, `utm_*`, `device_type`, `current_path`, `is_authenticated`. So `current_path` is available on all client events even if not explicitly passed.

---

## Phase B & C — Dashboard specs (manual build)

Create these three dashboards in PostHog UI. Use the exact names below.

---

### Dashboard 1 — Name: **ManaTap — Deck Analysis Quality**

**Goal:** Measure whether players find deck analysis useful and how that changes over time.

**Note:** `deck_analyzed` fires from **both** homepage (DeckSnapshotPanel) and deck page (DeckAnalyzerPanel). Deck-page event has `deck_id`, `suggestion_count`, `commander_name`, `format`; homepage has `workflow_run_id`, `plan`, `colors`, `card_count`. Funnel “deck_analyzed → analysis_feedback_submitted” now includes both flows. Use breakdown by `deck_id` (present only on deck page) to distinguish.

| # | Insight type | Event | Filters | Breakdown | Interval | Visualization | Notes |
|---|--------------|--------|---------|-----------|----------|---------------|--------|
| 1 | Trends | `analysis_feedback_submitted` | — | Property: `rating` | Day or Week | Line chart (multiple series by rating) | Two series: rating = 5 (positive), rating = 2 (negative). |
| 2 | Single value or Pie | `analysis_feedback_submitted` | — | Property: `rating` | — | Pie or single value | e.g. “% positive” = count(rating=5) / total; or show 5 vs 2 counts. |
| 3 | Funnel | Step 1: `deck_analyzed` → Step 2: `analysis_feedback_submitted` | — | — | — | Funnel | Conversion = % of users who got deck_analyzed and then submitted analysis feedback. **Only homepage analyze** users in step 1. |
| 4 | Trends | `analysis_feedback_submitted` | — | Property: `feature` | Day or Week | Line | Confirm all have feature = deck_analysis. |
| 5 | (Optional) Breakdown by page | `analysis_feedback_submitted` | — | Property: `current_path` (session context) | — | Bar/table | If session context is present; shows where feedback came from (home vs deck page). |

**Breakdowns:** You can break down `analysis_feedback_submitted` by `prompt_version`, `deck_id`, or `score` when present (deck page sends deck_id/score/prompt_version; homepage sends score/prompt_version).

---

### Dashboard 2 — Name: **ManaTap — Suggestion Failure Intelligence**

**Goal:** Understand how AI suggestions are failing in Deck Analyzer (which categories, reasons, cards, commanders).

| # | Insight type | Event | Filters | Breakdown | Interval | Visualization | Notes |
|---|--------------|--------|---------|-----------|----------|---------------|--------|
| 1 | Trends | `suggestion_report_submitted` | — | — | Day or Week | Line chart | Volume of suggestion reports over time. |
| 2 | Breakdown | `suggestion_report_submitted` | — | Property: `suggestion_category` | — | Bar chart or table | must-fix, synergy-upgrade, optional. |
| 3 | Breakdown by issue type | `suggestion_report_submitted` | — | Property: `primary_issue_type` | — | Bar or table | Use `primary_issue_type` (first selected reason) for a single-property breakdown. Optionally also break down by `issue_types` (array) if PostHog supports it. |
| 4 | Table | `suggestion_report_submitted` | — | — | — | Table | Columns: `suggested_card_name` (or group by it). Sort by count. “Top reported cards.” |
| 5 | Table | `suggestion_report_submitted` | — | — | — | Table | Columns: `commander_name`. Sort by count. “Top commanders by report count.” |
| 6 | Breakdown | `suggestion_report_submitted` | — | Property: `prompt_version_id` | — | Bar/table | If present (nullable); filter out null if needed. |
| 7 | Funnel | Step 1: `suggestion_report_opened` → Step 2: `suggestion_report_submitted` | — | — | — | Funnel | Completion rate: % of “report opened” that led to “report submitted.” |

---

### Dashboard 3 — Name: **ManaTap — Frustration to Feedback**

**Goal:** Measure whether detected frustration turns into useful feedback (prompt shown → widget opened → feedback sent).

**Attribution:** `feedback_sent` now includes optional `source` (feedback_button \| frustration_prompt \| founder_popup \| deck_analysis) when the client sends it. `feedback_widget_opened` now has correct `trigger` (frustration_prompt, founder_popup) when the widget is opened from those flows. You can filter/break down by `source` and `trigger` respectively.

| # | Insight type | Event | Filters | Breakdown | Interval | Visualization | Notes |
|---|--------------|--------|---------|-----------|----------|---------------|--------|
| 1 | Trends | `user_frustrated` | — | — | Day or Week | Line chart | Volume of frustration events. |
| 2 | Trends | `feedback_prompt_shown` | Filter: `source` = `frustration` | — | Day or Week | Line chart | How often the “Something not working?” prompt was shown. |
| 3 | Funnel | Step 1: `user_frustrated` → Step 2: `feedback_prompt_shown` → Step 3: `feedback_widget_opened` (filter trigger = frustration_prompt) → Step 4: `feedback_sent` (filter source = frustration_prompt) | — | — | — | Funnel | Step 3/4 can be filtered by trigger/source for frustration-origin only. |
| 4 | Breakdown | `user_frustrated` | — | Property: `indicator` | — | Bar chart | rapid_clicks, form_resubmit, back_button_spam, error_repeat. |
| 5 | Trends | `feedback_sent` | — | — | Day or Week | Line chart | Total feedback submissions (all sources). |
| 6 | (Optional) Funnel | Step 1: `founder_popup_shown` → Step 2: `founder_popup_cta_clicked` → Step 3: `feedback_widget_opened` (trigger = founder_popup) → Step 4: `feedback_sent` (source = founder_popup) | — | — | — | Funnel | Founder popup → CTA → widget opened → feedback sent; filter step 3/4 by trigger/source. |

---

## Phase D — Gaps and limitations (post–instrumentation update)

The following gaps were addressed in the additive instrumentation pass (see implementation report):

- **analysis_feedback_submitted** — Now includes optional `deck_id`, `score`, `prompt_version` when available from parents.
- **deck_analyzed** — Now also fired from deck page (DeckAnalyzerPanel) with deck_id, suggestion_count, commander_name, format (homepage keeps workflow_run_id, plan, colors, card_count).
- **feedback_sent** — Optional `source` (feedback_button \| frustration_prompt \| founder_popup \| deck_analysis) read from request body and sent to PostHog.
- **feedback_widget_opened** — Trigger set from event detail when opened via founder popup or frustration prompt (frustration_prompt, founder_popup).
- **suggestion_report_submitted** — Added `primary_issue_type` (first selected reason) for single-property breakdown.

**Remaining limitations:** `feedback` table in DB does not store `source` (only PostHog event has it). Deck page does not fire `deck_analyze_started` (only homepage does).

---

## Files modified (instrumentation pass)

- **Created (original):** `docs/POSTHOG_FEEDBACK_DASHBOARDS_SPEC.md`.
- **Updated (instrumentation):** This doc (inventory, dashboard notes, gaps section). Code changes: `AnalysisFeedbackRow.tsx`, `DeckSnapshotPanel.tsx`, `DeckAnalyzerPanel.tsx`, `FeedbackFab.tsx`, `FounderFeedbackPopup.tsx`, `FrustrationFeedbackPrompt.tsx`, `app/api/feedback/route.ts`, `lib/analytics-enhanced.ts`, `SuggestionReportControl.tsx`.

PostHog dashboards are **not** managed in code; this doc remains the manual build sheet.

---

## Delivery summary

| Item | Result |
|------|--------|
| **Dashboards created in code?** | No. This repo does not define PostHog dashboards in code. |
| **Deliverable** | Manual build sheet above: dashboard names, insight types, events, filters, breakdowns, intervals, and caveats. |
| **Instrumentation** | Additive fixes applied: analysis_feedback_submitted context, deck_analyzed on deck page, feedback_sent source, feedback_widget_opened trigger, primary_issue_type. See implementation report. |
| **How to use** | In PostHog: create 3 dashboards with the exact names; add insights per the tables; apply filters and breakdowns as specified. |
