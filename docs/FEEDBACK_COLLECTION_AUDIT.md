# ManaTap Player Feedback Collection — Audit & Implementation Plan

**Date:** 2025-03-15  
**Scope:** Audit only; no code changes. Goals: triggered feedback after meaningful actions, founder popup, inline AI-quality prompts, frictionless confusion capture, “help improve the AI” hooks.

---

## 1. Executive Summary

### Top findings
- **Chat is the only place with full feedback flow:** thumbs up/down, optional comment, and “Report issue” (🚩) with issue-type chips and `ai_response_reports` persistence. This is the strongest existing surface.
- **General feedback exists but is under-instrumented:** `FeedbackFab` (floating “Feedback” button) posts to `POST /api/feedback` and Supabase `feedback` table; server emits `feedback_sent`. The app **never** calls `trackFeedbackWidgetOpened()`; there is no link from errors, limits, or satisfaction prompts to the widget.
- **Frustration signals exist but are not used for UI:** `FrustrationDetector` (rapid clicks, form resubmit, error repeat, back-button spam) fires `user_frustrated` to PostHog; only Chat uses `detectErrorRepeat()` on stream errors. No “Something not working?” prompt is shown when frustration is detected.
- **Deck analysis and other high-value moments have no contextual feedback:** After `deck_analyzed`, import complete, mulligan result, or budget swaps there is no “Was this useful?” or “Report bad suggestion.” Deck analyzer panel and swap-suggestions have no feedback UI.
- **No founder-style one-time popup:** No reusable “dismissed once per user/device” pattern for a personal message; patterns exist for PWA/iOS install (e.g. `localStorage` + expiry) and coach bubble (dismiss count cap).

### Top opportunities
1. **Triggered feedback after deck analysis** (DeckSnapshotPanel, DeckAnalyzerPanel): inline “Was this analysis useful?” with thumbs + optional “Report bad suggestion” (reuse chat report pattern or lightweight variant).
2. **Wire FeedbackFab to analytics and to error/limit flows:** Call `trackFeedbackWidgetOpened(trigger)` when opening the widget; optionally show a soft prompt after `user_frustrated` or after repeated errors (“Something not working? Tell us” → open FeedbackFab).
3. **Founder one-time popup:** Reuse existing modal/overlay patterns; store `founder_popup_dismissed` (or similar) in localStorage or user preferences; show once per device or once per user after a delay or after first value moment.
4. **Inline “Report bad suggestion” on deck analyzer suggestions** (DeckAnalyzerPanel) and optionally on **Budget Swaps** (swap-suggestions): capture suggestion id, deck_id, commander, prompt_version; same `ai_response_reports` or a dedicated “suggestion_report” table.
5. **Confusion capture after failure states:** After import failure, analysis timeout, or workflow abandon, show a small “Something go wrong? Quick feedback” link/toast that opens FeedbackFab or a minimal form with context (e.g. `source: deck_import_failed`).

### Top risks
- **Annoyance:** Multiple new prompts (analysis + import + founder + frustration) could stack or feel naggy. Need strict cooldowns, one-time rules, and “don’t show again” for founder popup.
- **Feedback table schema:** Referenced in code but CREATE TABLE not found in audited migrations; ensure schema exists and supports optional `source`, `feature`, `context` for new flows.
- **Duplicate events:** Adding new events (e.g. `analysis_feedback_submitted`) without retiring or renaming existing ones; keep `chat_feedback` and `feedback_sent` as-is and add additive events only.

---

## 2. Existing Feedback Surface Inventory

| Surface | File(s) | Trigger | Current tracking | Gap / issue | Priority |
|--------|---------|---------|------------------|-------------|----------|
| **Chat message thumbs + comment** | `components/Chat.tsx` (MessageBubble feedback UI) | User clicks 👍/👎 or 💬 on assistant message | `chat_feedback` (PostHog) with rating, msg_id; enrichChatEvent (thread_id, user_message, assistant_message, format); `POST /api/feedback` with rating + text | No prompt_version in client context; no “reason” chips for negative (only in Report flow). | P2 – extend with reason chips on negative |
| **Chat “Report issue” (🚩)** | `components/Chat.tsx` | User clicks 🚩 on message | Modal with issue types: invented_card, wrong_format, bad_recommendation, incorrect_data, other. `POST /api/chat/report` → `ai_response_reports` (thread_id, message_id, issue_types, description, ai_response_text, user_message_text). No PostHog event for report submitted. | No capture('ai_report_submitted') with feature + context; admin uses `/admin/ai-reports` and PATCH `/api/admin/ai-reports`. | P1 – add PostHog event for report submitted |
| **Floating Feedback button (FeedbackFab)** | `components/FeedbackFab.tsx`, used in `layout.tsx`, `page.tsx`, `LeftSidebar.tsx`, `profile/page.tsx` | User clicks “Feedback” (bottom-left) | Modal: 1–5 rating + free text. `POST /api/feedback` → Supabase `feedback` (user_id, email, rating, text). Server: `feedback_sent` (user_id, rating). | **No** `trackFeedbackWidgetOpened()` call; no trigger from errors/limits/satisfaction; no `source` or `feature` in payload. | P1 – add widget-opened tracking + optional context |
| **Admin feedback list** | `app/admin/feedback/page.tsx`, `app/api/admin/feedback/route.ts` | Admin opens /admin/feedback | GET with filters (all / low / high rating). Reads `feedback` table. | N/A (admin only). | — |
| **Admin AI reports** | `app/admin/ai-reports/page.tsx`, `app/api/admin/ai-reports/route.ts` | Admin reviews user reports | PATCH to update status (resolved/reviewed/dismissed). Table: `ai_response_reports`. | Good for triage; no dashboard on “report rate by feature” yet. | P2 – analytics |

**Other relevant surfaces (no direct feedback UI):**
- **Deck analysis result:** `DeckSnapshotPanel.tsx` → `DeckHealthCard`; `deck_analyze_started` / `deck_analyzed` (with prompt_version when available). No “useful?” or “report” UI.
- **Deck analyzer (deck page):** `app/my-decks/[id]/DeckAnalyzerPanel.tsx` – suggestions with “Why?”; `ai_suggestion_shown` / `ai_suggestion_accepted`. No “bad suggestion” report.
- **Budget Swaps:** `app/deck/swap-suggestions/Client.tsx` – suggestions with rationale; no feedback.
- **Deck Roast:** `components/DeckRoastPanel.tsx` – roast result; no feedback.
- **Import:** `ImportDeckModal.tsx` – `deck_import_attempted` / `deck_import_completed`; on failure only error state, no “report problem” link.
- **Mulligan / Probability:** HandTestingWidget, probability page – analytics events; no feedback prompts.
- **Errors:** Chat calls `detectErrorRepeat('chat_stream_error', …)` → `user_frustrated`; no UI prompt. `trackApiError`, `trackErrorBoundary` exist; no follow-up feedback CTA.

---

## 3. Recommended New Feedback Opportunities

| Opportunity | Exact trigger | UI form factor | File(s) | Data to capture | Priority | Size |
|-------------|---------------|----------------|---------|------------------|----------|------|
| **Post–deck analysis “Was this useful?”** | When `result` is set after successful analyze (DeckSnapshotPanel) or when analysis completes (DeckAnalyzerPanel) | Inline below DeckHealthCard / result: thumbs + optional “Report something wrong” link | `DeckSnapshotPanel.tsx`, `DeckHealthCard.tsx`; `DeckAnalyzerPanel.tsx` | feature=deck_analysis, score, prompt_version, deck_id (if any), rating, optional text | P1 | M |
| **FeedbackFab open from error/frustration** | After `user_frustrated` (e.g. error_repeat) or after 2+ failed import attempts | Toast or small banner: “Something not working? [Tell us]” → open FeedbackFab with source prefilled | `lib/frustration-detector.ts` or callback; `FeedbackFab.tsx` | trigger=error_occurred | P1 | S |
| **Founder one-time popup** | First session after N minutes or after first value moment (e.g. deck_analyzed), once per device/user | Modal or compact banner; “Hey — I’m the developer. If anything feels wrong or missing, I’d love to hear it.” [Send feedback] [Maybe later] | New component + layout or page-level; localStorage key e.g. `founder_popup_seen` or user pref | dismissed / cta_clicked | P1 | M |
| **“Report bad suggestion” on deck analyzer** | User clicks “Report” next to a suggestion in DeckAnalyzerPanel | Inline expandable or small modal: reason chips (wrong card, too generic, misunderstood deck, rules, bug, other) + optional description | `DeckAnalyzerPanel.tsx` | suggestion_id, deck_id, commander, card, category, prompt_version, issue_types | P1 | M |
| **Report bad suggestion on Budget Swaps** | User clicks “Report” on a swap suggestion | Same pattern as above | `app/deck/swap-suggestions/Client.tsx` | suggestion context, from/to cards, deck_id, issue_types | P2 | M |
| **Post-import failure “Something go wrong?”** | When import fails (after 1st failure or 2nd attempt) | Small text link below error: “Report this issue” → open FeedbackFab or minimal form with source=deck_import_failed | `ImportDeckModal.tsx` | source, error_message (truncated), format | P2 | S |
| **Post–deck roast feedback** | When roast result is shown | Inline thumbs or “Was this fun / useful?” | `DeckRoastPanel.tsx` | feature=deck_roast, level, rating | P3 | S |
| **Mulligan / probability “Was this helpful?”** | After advice received or result shown | Optional inline chip | `HandTestingWidget.tsx`, probability page | feature=mulligan | P3 | S |

---

## 4. Analytics Readiness Assessment

### What already exists
- **PostHog:** `chat_feedback` (rating, msg_id, thread_id, user_message, assistant_message, format); `feedback_sent` (server, user_id, rating); `user_frustrated` (indicator, context, page_path); `deck_analyzed` (workflow_run_id, format, score, card_count, prompt_version); `deck_import_attempted` / `deck_import_completed`; `workflow.abandoned`; `chat_stream_error`; `error_boundary_triggered`; `api_error`.
- **Supabase:** `feedback` (user_id, email, rating, text, created_at — schema inferred from API); `ai_response_reports` (thread_id, message_id, issue_types, description, ai_response_text, user_message_text, status, etc.).
- **Enrichment:** `enrichChatEvent` adds thread_id, persona, prompt_version, format, commander_name, message_id, truncated messages. Chat feedback does not currently send prompt_version (not available in client context).

### What needs additive instrumentation
- **feedback_sent / feedback:** Add optional `source`, `feature`, `page` (or pass from client in body) so that FeedbackFab and future CTAs can tag origin. No rename of event.
- **New events (additive only):** e.g. `analysis_feedback_submitted`, `suggestion_report_submitted`, `founder_popup_dismissed`, `founder_popup_cta_clicked`, `feedback_prompt_shown` (when “Something not working?” is shown).
- **ai_response_reports:** When adding “report bad suggestion” from deck analyzer or swap-suggestions, either reuse this table with a `source`/`feature` column (e.g. `deck_analyzer_suggestion`, `budget_swap`) and nullable thread_id/message_id, or add a small `suggestion_reports` table. Prefer extending existing table with source + suggestion_id for simplicity.
- **Negative feedback tied to:** feature, deck_id, commander, analysis session / run_id, prompt_version, experiment variant. Currently: chat_feedback has thread/message; feedback table has no feature/source; ai_response_reports has thread/message. Add feature/source and context fields where new flows are added.

### What can feed PostHog dashboards
- **Feedback volume by feature:** Once `source`/`feature` is sent with feedback_sent and new events, breakdown by feature.
- **Negative feedback reasons by feature:** From ai_response_reports (issue_types) + new suggestion reports; filter by source.
- **By prompt_version / variant:** If prompt_version and variant are attached to analysis_feedback and suggestion_report, dashboards can slice by them.
- **“Analysis useful?” rate over time:** From new analysis_feedback_submitted (or feedback_sent with source=deck_analysis) with rating.
- **Report bad suggestion rate by commander/archetype:** From suggestion reports with deck_id/commander (or derived from deck).
- **Confusion prompt conversion:** Track feedback_prompt_shown + feedback_sent with source=error_occurred or similar.
- **Founder popup:** founder_popup_cta_clicked / founder_popup_dismissed; show rate and conversion.

---

## 5. Recommended Phased Implementation Plan

### Phase 1 — Smallest high-value additive changes
1. **FeedbackFab:** Call `trackFeedbackWidgetOpened(page, 'button_click')` on open; add optional `source`/`feature` to POST body and server `feedback_sent` so future CTAs can pass context.
2. **Chat report submitted:** Fire `capture('ai_report_submitted', { feature: 'chat', thread_id, message_id, issue_types })` (or use existing name with clear semantics) when report succeeds.
3. **“Something not working?” after frustration:** When `user_frustrated` fires, set a short-lived flag; show a non-intrusive toast or small banner once per session: “Something not working? [Tell us]” → open FeedbackFab with source=error_occurred; cooldown 24h or session.
4. **Post–deck analysis “Was this useful?”:** In DeckSnapshotPanel (and optionally DeckAnalyzerPanel), below result card add inline thumbs (👍/👎) + optional “Report something wrong” linking to FeedbackFab or lightweight modal with source=deck_analysis and score/prompt_version in payload.
5. **Founder popup (minimal):** New component; show once per device (localStorage key + “dismissed” or “cta_clicked”); after delay (e.g. 60s) or after first value event (e.g. deck_analyzed); message + [Send feedback] [Maybe later]. CTA opens FeedbackFab or /support.

### Phase 2 — Secondary improvements
- **“Report bad suggestion” in DeckAnalyzerPanel:** Per-suggestion “Report” with reason chips; POST to extended ai_response_reports or new endpoint storing suggestion_id, deck_id, commander, issue_types.
- **Import failure CTA:** In ImportDeckModal, on error show “Report this issue” link → FeedbackFab with source=deck_import_failed.
- **Feedback table:** Ensure schema has optional `source`/`feature`/`context` (migration if missing); document in API.
- **PostHog:** Add dashboard for feedback by source, report rate by feature, founder popup conversion.

### Phase 3 — Advanced confusion / rage instrumentation
- **detectFormResubmit** on import and analyze forms: call when user retries after error; after threshold show “Something not working?” with link to FeedbackFab.
- **Workflow abandon:** On `workflow.abandoned` for deck_analyze or deck_create, optionally show a one-time “Did something go wrong?” with link (low frequency, so low annoyance).
- **Budget Swaps “Report bad suggestion”** (same pattern as deck analyzer).
- **Deck Roast / Mulligan** optional “Was this helpful?” inline.

---

## 6. Exact Implementation Candidates

### Phase 1
| Change | Components / routes | Notes |
|--------|---------------------|--------|
| FeedbackFab tracking + context | `components/FeedbackFab.tsx`, `app/api/feedback/route.ts` | On open: `trackFeedbackWidgetOpened(pathname, 'button_click')`. Body: optional `source`, `feature`; server stores in feedback if column exists or in a JSON column. |
| Chat report PostHog | `components/Chat.tsx` (submitReport) | After successful POST /api/chat/report, `capture('ai_report_submitted', { feature: 'chat', thread_id, message_id, issue_types })`. |
| Frustration → “Something not working?” | `lib/frustration-detector.ts` or new small hook; `FeedbackFab.tsx` | On `user_frustrated`, set session flag; show toast/banner once per session with “Tell us” → open FeedbackFab with source=error_occurred. Cooldown (e.g. 24h in localStorage). |
| Post–analysis feedback | `components/DeckSnapshotPanel.tsx`, `components/DeckHealthCard.tsx`; `app/my-decks/[id]/DeckAnalyzerPanel.tsx` | New inline row: “Was this useful?” 👍/👎; on submit POST /api/feedback with rating, source=deck_analysis, score, prompt_version (if available); optional “Report something wrong” → same as chat report or FeedbackFab with context. |
| Founder popup | New `components/FounderFeedbackPopup.tsx` or similar; mount in layout or main pages | Check localStorage `founder_popup_seen`; if not set, show after delay or after first `deck_analyzed`/value moment; [Send feedback] opens FeedbackFab and sets seen; [Maybe later] sets seen. |

### Phase 2
| Change | Components / routes | Notes |
|--------|---------------------|--------|
| Report bad suggestion (deck analyzer) | `app/my-decks/[id]/DeckAnalyzerPanel.tsx`, `app/api/chat/report/route.ts` or new `app/api/feedback/suggestion-report/route.ts` | Per-suggestion “Report” button; modal with issue chips; store in ai_response_reports with source=deck_analyzer_suggestion + suggestion_id, deck_id, commander. |
| Import failure CTA | `components/ImportDeckModal.tsx` | When error state and (optional) retry count ≥ 1, show “Report this issue” → FeedbackFab with source=deck_import_failed. |
| feedback table schema | `frontend/db/migrations/` | Add columns source, feature, context (or context JSONB) if missing. |
| Dashboards | PostHog | Funnels: feedback by source; ai_report by feature; founder popup seen vs CTA. |

### Phase 3
| Change | Components / routes | Notes |
|--------|---------------------|--------|
| detectFormResubmit on import/analyze | `ImportDeckModal.tsx`, `DeckSnapshotPanel.tsx` or deck analyze form | On submit failure call detectFormResubmit('deck_import', error); after threshold show “Something not working?” (reuse Phase 1 pattern). |
| Workflow abandon CTA | `lib/analytics/workflow-abandon.ts` or consumer | On abandon, optionally trigger one-time “Did something go wrong?” (same toast/link pattern). |
| Budget Swaps report | `app/deck/swap-suggestions/Client.tsx` | Same as deck analyzer report; endpoint can be shared. |
| Deck Roast / Mulligan | `DeckRoastPanel.tsx`, mulligan widget | Optional “Was this helpful?” inline. |

---

## 7. Safe Implementation Notes

- **Preserve existing behavior:** Do not change semantics of `chat_feedback`, `feedback_sent`, or existing feedback/report APIs; add optional fields and new events only.
- **Fail-open:** If tracking or new feedback endpoints fail, do not block the user; catch and log.
- **Avoid refactors:** Reuse FeedbackFab for “Tell us” CTAs; reuse ai_response_reports for suggestion reports with a source column; reuse existing modal/toast patterns (e.g. toast-client, existing modal patterns).
- **Reuse primitives:** trackFeedbackWidgetOpened already exists; use it. FrustrationDetector already fires; add a listener/callback for UI. localStorage for founder popup same pattern as iOS install prompt.
- **Event names:** Keep `chat_feedback`, `feedback_sent`; add `analysis_feedback_submitted`, `ai_report_submitted`, `founder_popup_dismissed`, `founder_popup_cta_clicked`, `feedback_prompt_shown` (or similar) as new names.
- **Response shapes:** Keep existing POST /api/feedback and POST /api/chat/report response shapes; extend request body with optional fields only.

---

## 8. Phase 1 Implementation Shortlist (Top 3–5 Changes)

1. **FeedbackFab: track opens and add source/feature** — `FeedbackFab.tsx` (call `trackFeedbackWidgetOpened` on open); `app/api/feedback/route.ts` (accept optional `source`, `feature`; store if schema supports).
2. **Chat: fire PostHog event when report is submitted** — `Chat.tsx` in `submitReport()` after successful POST to `/api/chat/report`: `capture('ai_report_submitted', { feature: 'chat', ... })`.
3. **“Something not working?” after user_frustrated** — When frustration is detected, show one-time-per-session toast/banner with link that opens FeedbackFab with source=error_occurred; implement in a small hook or callback from frustration-detector + FeedbackFab (e.g. global event “open-feedback” with payload).
4. **Post–deck analysis “Was this useful?”** — In `DeckSnapshotPanel` (and optionally `DeckAnalyzerPanel`), add inline thumbs below result; POST to `/api/feedback` with rating + source=deck_analysis + score + prompt_version; optional “Report something wrong” link.
5. **Founder one-time popup** — New component; localStorage `founder_popup_seen`; show once after delay or first value moment; [Send feedback] / [Maybe later]; CTA opens FeedbackFab.

These five are additive, reuse existing infrastructure, and give the highest signal (analysis + confusion + founder voice) with minimal annoyance if cooldowns and one-time rules are applied.
