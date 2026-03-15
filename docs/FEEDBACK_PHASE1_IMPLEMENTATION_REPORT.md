# Phase 1 Feedback Implementation Report

**Date:** 2025-03-15  
**Scope:** Tasks 1–4 from FEEDBACK_COLLECTION_AUDIT.md Phase 1.

---

## 1. Files Created

| File | Purpose |
|------|---------|
| `frontend/components/AnalysisFeedbackRow.tsx` | Inline "Was this analysis useful?" 👍/👎 row; POSTs to `/api/feedback` with optional `source`, `score`, `deck_id`; fires `analysis_feedback_submitted`; hides after click. |
| `frontend/components/FrustrationFeedbackPrompt.tsx` | Listens for `manatap:frustration_detected`; shows at most once per session; skips when focus is in input/textarea; shows toast panel "Something not working?" with [Send feedback] → opens FeedbackFab; fires `feedback_prompt_shown`. |
| `frontend/components/FounderFeedbackPopup.tsx` | One-time popup (localStorage `founder_popup_seen`); triggers after 45s or first `manatap:deck_analysis_complete`; [Send feedback] / [Maybe later]; fires `founder_popup_shown` and `founder_popup_cta_clicked`. |

---

## 2. Files Modified

| File | Changes |
|------|---------|
| `frontend/components/FeedbackFab.tsx` | Import `trackFeedbackWidgetOpened`; on open call `trackFeedbackWidgetOpened(pathname, 'button_click')`; added listener for `manatap:open_feedback` to open modal from elsewhere. |
| `frontend/components/DeckSnapshotPanel.tsx` | Import `AnalysisFeedbackRow`; after `DeckHealthCard` render `<AnalysisFeedbackRow score={result.score} />`; dispatch `manatap:deck_analysis_complete` after successful analysis. |
| `frontend/app/my-decks/[id]/DeckAnalyzerPanel.tsx` | Import `AnalysisFeedbackRow`; after score display render `<AnalysisFeedbackRow score={score} deckId={deckId} />`; dispatch `manatap:deck_analysis_complete` after successful analysis. |
| `frontend/lib/frustration-detector.ts` | After each `trackUserFrustration` call, dispatch `manatap:frustration_detected` (detail: `{ indicator }`) so UI can show prompt. |
| `frontend/app/layout.tsx` | Import and render `FrustrationFeedbackPrompt` and `FounderFeedbackPopup` (after `FeedbackFab`). |

---

## 3. PostHog Events Added

| Event | When | Properties (typical) |
|-------|------|----------------------|
| `feedback_widget_opened` | Already existed; now fired when FeedbackFab is opened (Task 1). | `page`, `trigger: 'button_click'`, `user_tenure`, `timestamp` |
| `analysis_feedback_submitted` | User clicks 👍 or 👎 on post-deck-analysis row (Task 2). | `rating` (5 or 2), `feature: 'deck_analysis'` |
| `feedback_prompt_shown` | Frustration detected and prompt shown (Task 3). | `source: 'frustration'` |
| `founder_popup_shown` | Founder popup is displayed (Task 4). | (none) |
| `founder_popup_cta_clicked` | User clicks "Send feedback" in founder popup (Task 4). | (none) |

**Existing events unchanged:** `chat_feedback`, `feedback_sent`, `user_frustrated`.

---

## 4. Assumptions Made

- **POST /api/feedback:** Request body may include optional `source`, `score`, `deck_id`. The route was **not** modified; it continues to insert only `user_id`, `email`, `rating`, `text`. Extra fields are ignored. Analysis feedback is tracked via PostHog `analysis_feedback_submitted` only.
- **Toast panel:** `toast-client`’s `toastPanel` is used for the frustration prompt. If the toast API is not registered yet when the event fires, the prompt is skipped (fail-open).
- **Founder popup:** Shown once per device (localStorage). If the user clears storage, they may see it again. "Maybe later" does not send a separate event; only "Send feedback" sends `founder_popup_cta_clicked`.
- **Deck analysis complete:** Dispatched from both DeckSnapshotPanel (homepage/analyze) and DeckAnalyzerPanel (my-decks deck page) so either can trigger the founder popup on first analysis.
- **Frustration prompt:** Session-scoped (`sessionStorage feedback_prompt_shown_session`). Does not show when focus is in `input`, `textarea`, or `[contenteditable=true]`.

---

## 5. Manual Test Checklist

- [ ] **Task 1 – FeedbackFab tracking**  
  - Open site, click "Feedback" (bottom-left).  
  - In PostHog (or network), confirm `feedback_widget_opened` with `trigger: 'button_click'` and current `page` path.

- [ ] **Task 2 – Analysis feedback**  
  - **Homepage:** Paste a deck in the analyze panel, click Analyze; when result appears, confirm "Was this analysis useful?" with 👍 Yes / 👎 Not really. Click 👍; row disappears; check PostHog for `analysis_feedback_submitted` with `rating: 5`, `feature: 'deck_analysis'`.  
  - **Deck page:** Open a deck, run Deck Analyzer; when score appears, confirm same row. Click 👎; check `analysis_feedback_submitted` with `rating: 2`.  
  - Confirm no errors in console; failed POST should not block UI (fail-open).

- [ ] **Task 3 – Frustration prompt**  
  - Trigger frustration (e.g. rapid repeated clicks on a button, or trigger `user_frustrated` from Chat stream error 3x).  
  - Confirm toast/panel "Something not working?" with [Send feedback].  
  - Click [Send feedback]; FeedbackFab modal should open.  
  - Confirm `feedback_prompt_shown` with `source: 'frustration'` in PostHog.  
  - Refresh and trigger again; prompt should **not** show twice in same session (sessionStorage).

- [ ] **Task 4 – Founder popup**  
  - Clear `localStorage.founder_popup_seen` (or use incognito).  
  - **Path A:** Wait 45 seconds on site; popup should appear.  
  - **Path B:** Clear storage again; run a deck analysis (home or deck page) before 45s; popup should appear after first analysis.  
  - Click "Maybe later"; popup closes; reload → popup does not show again.  
  - Clear storage again; show popup; click "Send feedback" → FeedbackFab opens; confirm `founder_popup_cta_clicked` in PostHog.

- [ ] **Regression**  
  - Chat message thumbs and "Report issue" (🚩) still work.  
  - Existing FeedbackFab submit (rating + text) still works and sends to `/api/feedback`.  
  - No new console errors on normal navigation and analysis flows.

---

## 6. TypeScript Build

- `npx tsc --noEmit` reports errors only in **existing test files** (vitest types, etc.), not in the new or modified feedback components.
- Lint on the touched components reports no issues.
