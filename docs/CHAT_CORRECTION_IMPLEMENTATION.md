# Chat “Correct the AI” — Implementation Summary

**Date:** 2026-03-15  
**Scope:** Additive “Correct the AI” flow on main chat and per-deck chat. No refactor of chat architecture; existing thumbs and report-issue flows unchanged.

---

## 1. Task 1 — Audit (findings)

### Where thumbs and report live
- **Main chat:** `frontend/components/Chat.tsx`. Assistant message actions live inside an inline helper **InlineFeedback** (same file, ~line 1161). It receives `msgId` and `content`; has access to `messages`, `threadId`, `fmt`, `linkedDeckId` from closure.
- **Per-deck chat:** `frontend/app/my-decks/[id]/DeckAssistant.tsx`. Separate component; **no** shared MessageBubble. Assistant messages have only a “Copy” button in the header (no thumbs or report before this work). Now they also have “Correct” (and “Corrected” after submit).

### Metadata available at correction time

| Metadata            | Main chat (Chat.tsx)     | Per-deck chat (DeckAssistant) |
|---------------------|--------------------------|--------------------------------|
| thread_id           | ✅ `threadId`             | ✅ `threadId`                  |
| message_id          | ✅ from `m.id`           | ✅ from `m.id`                 |
| user_message_text   | ✅ previous message      | ✅ previous message            |
| assistant_message   | ✅ `content`             | ✅ `m.content`                 |
| deck_id             | ✅ `linkedDeckId` (or null) | ✅ `deckId`                 |
| commander_name      | ❌ not in state          | ✅ `commander`                 |
| format              | ✅ `fmt`                 | ✅ `fmt`                       |
| persona             | ❌ not in client state   | ❌                             |
| prompt_version      | ❌ not in client state   | ❌                             |
| page path           | ✅ from `pathname` / modal sends `window.location.pathname` | ✅ same |
| has_deck_context    | ✅ `!!linkedDeckId`      | ✅ true when deck page         |

---

## 2. Files modified

- **frontend/app/api/chat/report/route.ts**  
  - Added `source: "chat_correction"` handling.  
  - Accepts optional `correction_text`, `better_cards_text`, `format`, `page_path`, `chat_surface`.  
  - Validation: for `chat_correction`, allow submit if at least one of: `issueTypes`, `description`, `correction_text`, `better_cards_text` has content.  
  - Builds `context_jsonb` for corrections (see payload below).  
  - Existing chat report and deck_analyzer_suggestion behavior unchanged.

- **frontend/components/Chat.tsx**  
  - Import `ChatCorrectionModal`.  
  - State: `correctedMessageIds: string[]`, `correctionOpenForMessageId: string | null`.  
  - **InlineFeedback** extended with props `isCorrected`, `onOpenCorrection`.  
  - New button: “Correct” (and “Corrected” label after submit) next to 👍👎💬🚩.  
  - Renders `ChatCorrectionModal` when `correctionOpenForMessageId` is set; passes message/content, threadId, linkedDeckId, fmt, `chatSurface: "main_chat"`.

- **frontend/app/my-decks/[id]/DeckAssistant.tsx**  
  - Import `ChatCorrectionModal`.  
  - State: `correctedMessageIds`, `correctionOpenForMessageId`.  
  - For each assistant message: “Correct” button in header row (and “Corrected” after submit).  
  - Renders `ChatCorrectionModal` when `correctionOpenForMessageId` is set; passes `chatSurface: "deck_chat"`, deckId, commander, fmt.

---

## 3. Files created

- **frontend/components/ChatCorrectionModal.tsx**  
  - Reusable modal: “Correct the AI” title, “What was wrong?” with multi-select reason chips, optional “What should it have said instead?”, optional “Better cards”, optional “Anything else?”.  
  - Submit/Cancel.  
  - Validation: at least one reason or one of the optional text fields.  
  - On success: toast “Thanks — this helps improve the AI.”, calls `onSuccess()` (parent adds message id to corrected set and closes).  
  - Fires PostHog `chat_correction_opened` on open and `chat_correction_submitted` on submit (wrapped in try/catch so analytics never block submit).

---

## 4. Backend path used

- **POST /api/chat/report**  
  - Same endpoint as existing “Report issue” and deck-analyzer suggestion reports.  
  - For corrections, client sends `source: "chat_correction"` and the new optional fields.  
  - No new route; no new table. Uses existing `ai_response_reports` and optional `context_jsonb` (already extended in 093).

---

## 5. Payload stored on submit

Row in **ai_response_reports**:

- `user_id`, `thread_id`, `message_id`, `issue_types`, `description`, `ai_response_text`, `user_message_text`, `status: "pending"` (same as before).

**context_jsonb** when `source === "chat_correction"`:

```json
{
  "source": "chat_correction",
  "correction_text": "<optional, max 2000>",
  "better_cards_text": "<optional, max 1000>",
  "deck_id": "<optional>",
  "commander_name": "<optional>",
  "format": "<optional>",
  "prompt_version_id": "<optional>",
  "page_path": "<optional>",
  "chat_surface": "main_chat" | "deck_chat"
}
```

---

## 6. PostHog events added

1. **chat_correction_opened**  
   - Properties: `feature: "chat"`, `thread_id`, `message_id`, `deck_id`, `has_deck_context` (boolean).  
   - Fired when the correction modal is opened (from main or deck chat).

2. **chat_correction_submitted**  
   - Properties: `feature: "chat"`, `thread_id`, `message_id`, `issue_types`, `deck_id`, `commander_name`, `prompt_version`, `has_better_cards` (boolean), `chat_surface` ("main_chat" | "deck_chat").  
   - Fired after successful POST to /api/chat/report.  
   - Both events are inside try/catch; analytics failure does not affect submit flow.

---

## 7. Main chat vs per-deck chat

- **Both covered:** Main chat uses `Chat.tsx` (InlineFeedback + modal). Per-deck chat uses `DeckAssistant.tsx` (Correct button + same modal).
- **chat_surface:** Set in the modal payload: `"main_chat"` when opened from `Chat.tsx`, `"deck_chat"` when opened from `DeckAssistant.tsx`. No routing hacks; each component passes the appropriate value.

---

## 8. Manual test checklist

- [ ] **Main chat**  
  - [ ] Send a message, get an assistant reply.  
  - [ ] Hover assistant message: see 👍👎💬🚩 and **Correct**.  
  - [ ] Click **Correct**: modal opens with “Correct the AI”, reason list, optional fields.  
  - [ ] Submit with at least one reason: success toast, modal closes, that message shows “Corrected” and Correct button is gone.  
  - [ ] Submit with only “What should it have said” (no reason): allowed and succeeds.  
  - [ ] Cancel: modal closes, no “Corrected”.  
  - [ ] Thumbs and Report issue still work and are unchanged.

- [ ] **Per-deck chat**  
  - [ ] Open a deck, open Deck Assistant, send a message, get a reply.  
  - [ ] Hover assistant message: see Copy and **Correct**.  
  - [ ] Click **Correct**: same modal; submit; that message shows “Corrected”.  
  - [ ] In PostHog (or network): `chat_surface` is `deck_chat` and, if present, `commander_name` / `deck_id` are set.

- [ ] **Fail-open**  
  - [ ] Disable network or return 500 from /api/chat/report: submit shows error toast, chat remains usable; no crash.

- [ ] **Mobile**  
  - [ ] Tap targets for Correct and modal buttons are usable; modal is readable and scrollable on small viewports.

---

## 9. Typecheck / build

- `npx tsc --noEmit` in frontend reports errors only in **existing** test files (vitest types, etc.), not in the new or modified chat/correction code.
- New and modified application code is type-clean.

---

## 10. Assumptions and gaps

- **Assumptions**  
  - `ai_response_reports.context_jsonb` already exists (migration 093).  
  - No schema change required; all new data is in `context_jsonb` for `source: "chat_correction"`.  
  - Reason codes (e.g. `wrong_rules`, `misunderstood_deck`, `bad_recommendation`, …) are stored as-is; admin/review tooling can filter by `context_jsonb->>'source' = 'chat_correction'` and use the same table.

- **Gaps / not in scope**  
  - No card picker; “Better cards” is a single plain text field.  
  - No generic moderation/review UI; admin continues to use existing ai-reports list (and can filter by context source if needed).  
  - `prompt_version` and `persona` are not available in client state for either chat; sent as null when not available.  
  - Correction reasons are a fixed list; “other” is always available.
