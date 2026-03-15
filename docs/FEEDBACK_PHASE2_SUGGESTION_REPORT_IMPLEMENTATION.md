# Phase 2: Report bad suggestion — Implementation Report

## 1. Files modified

- **frontend/app/my-decks/[id]/DeckAnalyzerPanel.tsx**
  - Imported `SuggestionReportControl`.
  - Added `<SuggestionReportControl />` in each of the three suggestion blocks (must-fix, synergy-upgrade, optional) next to Why? / Dismiss / Add, with `suggestion`, `deckId`, `commanderName`, `promptVersionId`, and `suggestionIndex` (per-block index `i`).

- **frontend/app/api/chat/report/route.ts** (already extended in prior step)
  - Accepts `source: "deck_analyzer_suggestion"` and optional suggestion fields; writes to `ai_response_reports` with `context_jsonb` when migration 093 is applied.

## 2. Files created

- **frontend/components/SuggestionReportControl.tsx**
  - Lightweight “Report” control; on click opens inline expander with:
    - Title: “Report bad suggestion”
    - Multi-select reason chips: wrong card suggested, too generic, misunderstood my deck, rules issue, outside color identity, bug/broken, other
    - Optional textarea: “What went wrong? (optional)”
    - Submit / Cancel
  - Validation: at least one reason OR non-empty description.
  - On success: toast “Thanks — this helps improve the AI.”, replace control with “Reported”, prevent duplicate submit for that suggestion in session.
  - Derives suggestion id: `s.id` when present, else `derived:${deckId}:${category}:${card}:${index}`.

- **frontend/db/migrations/093_ai_response_reports_context.sql** (already added in prior step)
  - Adds optional `context_jsonb JSONB` to `ai_response_reports`.

- **docs/FEEDBACK_PHASE2_SUGGESTION_REPORT_IMPLEMENTATION.md** (this file)

## 3. Backend path used

- **Existing chat report route extended:** `POST /api/chat/report`
  - When `source === "deck_analyzer_suggestion"`: validation allows one or more issue types OR description; `thread_id` / `message_id` set to null; suggestion context stored in `context_jsonb`; `ai_response_text` from `suggested_card_name`, `user_message_text` from description.
  - Existing chat report behavior unchanged when `source` is omitted.

## 4. Metadata captured on submit

Sent in request body and stored (e.g. in `context_jsonb` / existing columns):

- `source`: `"deck_analyzer_suggestion"`
- `deck_id`
- `commander_name`
- `suggestion_id` (stable id or derived)
- `suggested_card_name`
- `suggestion_category`
- `suggestion_index`
- `issue_types` (array of reason ids)
- `description` (optional)
- `prompt_version_id` (if available)
- Server adds: `user_id` (if authenticated), `status: "pending"`

Not sent in this phase: `experiment_variant`, `workflow_run_id`, `page_path` (can be added later if available).

## 5. PostHog events

- **suggestion_report_opened**  
  Properties: `feature: "deck_analyzer_suggestion"`, `suggestion_id`
- **suggestion_report_submitted**  
  Properties: `feature`, `suggestion_id`, `suggestion_category`, `suggested_card_name`, `issue_types`, `deck_id`, `commander_name`, `prompt_version_id`

Analytics calls are wrapped in try/catch / dynamic import so failures do not affect the submit flow.

## 6. Budget Swaps

- **Intentionally deferred.**
- **Reason:** Budget Swaps (`app/deck/swap-suggestions/Client.tsx`) uses a different suggestion shape (`{ from, to, price_*, rationale?, confidence? }`) and a different UX (swap pairs, batch apply). Reuse would require either a second source type and payload shape in the report API or a generic report component with feature-specific payloads; that goes beyond “trivial” reuse.
- **For later:** Add a second source (e.g. `budget_swap_suggestion`) and a small adapter in Budget Swaps that maps a swap row to `suggestion_id`, `suggested_card_name` (e.g. `to`), and optional category; then reuse `SuggestionReportControl` with a prop to switch payload/source.

## 7. Manual test checklist

- [ ] Open a deck, run Deck Analyzer, wait for suggestions.
- [ ] For a suggestion in each category (must-fix, synergy-upgrade, optional):
  - [ ] Click “Report”; expander opens with title and reason chips.
  - [ ] Submit with at least one reason (and optionally description); see toast “Thanks — this helps improve the AI.” and control changes to “Reported”.
  - [ ] Confirm the same suggestion cannot be reported again in that session.
- [ ] Submit with only optional text (no reason) and confirm it succeeds.
- [ ] Cancel closes the form without submitting.
- [ ] Verify existing chat report flow still works (report from a chat message).
- [ ] If migration 093 is not applied, confirm report either still works (e.g. fallback) or fails gracefully without breaking the UI (fail-open).

## 8. Assumptions / gaps

- **Stable suggestion id:** Deck analyze API does not return `id` for all suggestions; derived id is used when `s.id` is missing so reports are still keyed and deduped in-session.
- **Auth:** Report API uses optional `user_id`; anonymous reports are allowed (user_id null).
- **Migration:** Applying `093_ai_response_reports_context.sql` is required for `context_jsonb` to be stored; otherwise the extended insert may error (handled in API with 500 or table-missing handling).
- **Typecheck:** `npx tsc --noEmit` currently fails in existing test files (vitest types, NODE_ENV, etc.); no new errors in `SuggestionReportControl.tsx` or `DeckAnalyzerPanel.tsx`.

## 9. Typecheck / build result

- **Lint:** No issues in `SuggestionReportControl.tsx` or `DeckAnalyzerPanel.tsx`.
- **Typecheck:** Project-level `tsc --noEmit` reports pre-existing errors in `tests/unit/*` only; new and modified app code typechecks.
