# Data Moat — Rejected / Ignored Outcomes — Pre-Implementation Audit

## 1. Where AI suggestions are rendered and accepted sent

- **Component:** `frontend/app/my-decks/[id]/DeckAnalyzerPanel.tsx`
- **State:** `suggestions` (array of `{ card, reason?, category?, id?, needs_review?, reviewNotes? }`). Set from `/api/deck/analyze` response `j.suggestions`.
- **Accepted sent:** Three places (one per category block: must-fix, synergy-upgrade, optional). Each does POST to `/api/decks/cards?deckid=...` with body `{ name: s.card, qty: 1, suggestion_id: s.id, category: s.category || '...', prompt_version: promptVersion }`. PostHog `capture('ai_suggestion_accepted', ...)` after success. The cards route already calls `logSuggestionOutcome` with `accepted: true` server-side.

## 2. Dismiss / reject / close UI

- **Finding:** There is no existing “Dismiss”, “Reject”, or “Skip” button. Only “Add” and “Why?” (and “Hide” for reasoning).
- **Plan:** Add a small “Dismiss” button next to each suggestion’s “Add” button in all three category blocks. On click: log rejected via new API, then remove that suggestion from local state so it disappears. No redesign of the panel.

## 3. Low-risk event for “ignored”

- **Safe:** “Suggestion batch replaced by a new analysis” — when the user runs “Analyze” again, `run()` fetches new suggestions and does `setSuggestions(j.suggestions)`. The previous batch is then replaced. Any suggestion from the previous batch that had an `id` and was neither accepted nor rejected can be treated as “ignored” with `outcome_source: "batch_replaced"`.
- **Implementation:** Before `setSuggestions(Array.isArray(j?.suggestions) ? j.suggestions : [])` in `run()`, take current `suggestions`, collect unique `s.id` values, and call a batch-log API to insert one row per id with `ignored: true`, `outcome_source: "batch_replaced"`. One POST with `suggestion_ids[]` and context (deck_id, format, commander) is enough. No need to track “already logged” on the client for ignored: duplicate suggestion_ids across runs are acceptable (append-only; we may log the same suggestion as ignored twice if it appeared in two batches).
- **Not implemented as “ignored”:** Tab close, route change, component unmount, timeouts — too ambiguous.

## 4. Current request body for accepted logging

- **Client → cards route:** `name`, `qty: 1`, `suggestion_id: s.id`, `category: s.category || 'synergy-upgrade' | 'optional'`, `prompt_version: promptVersion`. Optional: format, commander (can be sent for data-moat; deck_id comes from URL).
- **Cards route** already passes to `logSuggestionOutcome`: suggestion_id, deck_id, user_id, suggested_card (name), category, prompt_version_id, format, commander, accepted: true, outcome_source: "client_accept".

## 5. Schema and helper

- **Tables:** `ai_suggestion_outcomes` has `accepted`, `rejected`, `ignored` (BOOLEAN NULL) and `outcome_source` (TEXT NULL). No change needed.
- **Helper:** `frontend/lib/data-moat/log-suggestion-outcome.ts` already accepts `accepted`, `rejected`, `ignored`, `outcome_source`. No change needed for Phase 1.

## 6. Plan summary

| Item | Plan |
|------|------|
| **Files to touch** | New: `app/api/deck/suggestion-outcome/route.ts` (POST single outcome), `app/api/deck/suggestion-outcome/batch-ignored/route.ts` (POST batch ignored). Modify: `app/my-decks/[id]/DeckAnalyzerPanel.tsx` (Dismiss button + batch-replaced call before setSuggestions). Update: `lib/data-dashboard/get-suggestions-dashboard.ts`, `app/admin/datadashboard/suggestions/page.tsx`. Optional: `app/api/admin/datadashboard/test/route.ts` + test page. |
| **Outcomes safe now** | **Rejected:** yes (explicit Dismiss click). **Ignored:** yes, only “batch_replaced” when user runs a new analysis and the previous batch is replaced. |
| **Ambiguity** | None for rejected. For ignored we do not use unmount/tab close/timeouts. |
| **Fail-open** | Outcome API returns 200 and { ok: true } even if DB write fails (log on server, don’t break client). Client removes suggestion from UI on Dismiss regardless of API result. Batch-ignored: same; run() continues and sets new suggestions even if batch log fails. |

## 7. Duplicate prevention

- **Rejected:** One click per suggestion; after click we remove that suggestion from state so the same suggestion cannot be dismissed again. Server does not dedupe (append-only; if client sent twice by bug, we’d have two rows — acceptable).
- **Ignored:** We only log on “batch replaced”. Same suggestion_id could be logged twice if it appeared in two different batches; that’s acceptable.

---

**Proceeding to implementation.**
