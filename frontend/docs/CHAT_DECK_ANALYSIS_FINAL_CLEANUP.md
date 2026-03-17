# Chat/Deck-Analysis Workflow — Final Cleanup Pass

**Goal:** Stabilize deck intake + analysis with deterministic commander extraction, minimal confirmation, and immediate analysis once commander is trusted. No repeated commander/decklist/goals questions.

---

## Phase 1 — Audit (current flow)

### Files and roles
- **Decklist parsing:** `lib/chat/decklistDetector.ts` — `isDecklist()`, `inferCommander()`, explicit marker/section patterns.
- **Commander extraction:** `lib/chat/decklistDetector.ts` — `inferCommander()`; trusted = explicit section, same-line "Commander:", inline "COMMANDER!".
- **No-marker inference:** `inferCommander()` — last 1-of in 95+ lines (0.75), user message phrases, linked deck; first card (0.35) returns null.
- **Confirmation / promotion:** `lib/chat/active-deck-context.ts` — `looksLikeConfirmation()`, `extractCorrection()`, `userDeclaredCommanderThisTurn`, `userNamedCommanderThisTurn`, **replyIsJustCommanderName()** (this pass).
- **Decision (ask vs analyze):** `app/api/chat/stream/route.ts` — `mayAnalyze` → `streamInjected`; `lib/chat/active-deck-context.ts` — `askReason` (need_commander, confirm_inference).
- **Normalization:** `lib/chat/normalize-commander-decision.ts` — invariants: analyze only when commander confirmed/linked; downgrade analyze→confirm when inferred-only.
- **Prompt selection:** `stream/route.ts` — ask_commander/confirm → chat prompt; analyze → deck_analysis prompt + CRITICAL block.
- **Debug:** `stream/route.ts` — start payload: commander_resolution_source, analyze_gate_reason, commander_candidate_count, confirm_question_expected, **previous_turn_was_ask_commander**, **user_reply_promoted_to_commander**.

### What was already working
- Explicit marker → confirmed → immediate analysis.
- Linked deck → trusted → immediate analysis.
- One candidate → confirm question; "yes" / "correct" → promote → analyze.
- No candidate → ask to name; user replies with single card name → user_named → promote → analyze.
- "X is the commander" with X matching candidate → promote.
- CRITICAL analyze block and short ask_commander/confirm instructions in place.

### Remaining gap (fixed in this pass)
- **User replies with only the candidate name** after "Is [[Korvold]] your commander?" (e.g. "Korvold" or "Korvold, Fae-Cursed King") were not promoted; `looksLikeConfirmation("Korvold")` is false. So the next turn could re-ask or not analyze.
- **Debug:** No explicit "previous turn asked commander" or "user reply promoted" flag for admin visibility.

---

## Phase 2–5 — Changes in this pass

### 1. Reply-with-candidate-name promotion (Phase 3)
- **File:** `lib/chat/active-deck-context.ts`.
- **Added:** `replyIsJustCommanderName(reply, commanderName)` — normalizes reply (strip optional "yes, ", brackets, punctuation) and compares to commander name (case-insensitive, NFKD).
- **Logic:** When `askedCommander && commanderName && replyIsJustCommanderName(text, commanderName)` → set `replyConfirmsCandidate = true` and include in `userJustConfirmedCommander`.
- **Effect:** User can reply with the full commander/candidate name (or "yes, Full Name") after the one short confirm question and get immediate analysis.

### 2. Deterministic extraction (Phase 2)
- **No code change.** Explicit marker, "Commander:", section, linked deck already set trusted state and skip ask. Not weakened.

### 3. Post-confirm analyze invariant (Phase 4)
- **No code change.** Normalization already enforces: analyze only when commander confirmed or linked; `analyze_now_expected` and `extra_clarification_allowed` derived correctly. CRITICAL block already forbids asking for decklist/commander/goals.

### 4. Ask_commander output (Phase 5)
- **No code change.** Already one-line CRITICAL instructions; no fallback added.

### 5. Debug / observability (Phase 6)
- **File:** `lib/chat/active-deck-context.ts` — added `lastTurnAskedCommander: boolean` to context (true when last assistant message asked for commander).
- **File:** `app/api/chat/stream/route.ts` — start debug payload:
  - `previous_turn_was_ask_commander`: `activeDeckContext.lastTurnAskedCommander`
  - `user_reply_promoted_to_commander`: `userJustConfirmedCommander || userJustCorrectedCommander`

### 6. Tests
- **File:** `tests/unit/active-deck-context.test.ts` — added: after "Is [[Muldrotha, the Gravetide]] your commander?", reply "Muldrotha, the Gravetide" → `userJustConfirmedCommander` true, `lastTurnAskedCommander` true; reply "Muldrotha" (short) → no promotion (strict name match).

---

## Phase 8 — Deliverables summary

### Files changed
| File | Change |
|------|--------|
| `lib/chat/active-deck-context.ts` | `replyIsJustCommanderName()`; `replyConfirmsCandidate` in `userJustConfirmedCommander`; `lastTurnAskedCommander` on context. |
| `app/api/chat/stream/route.ts` | Debug: `previous_turn_was_ask_commander`, `user_reply_promoted_to_commander`. |
| `tests/unit/active-deck-context.test.ts` | Tests for reply-with-full-name promotion and `lastTurnAskedCommander`. |
| `docs/CHAT_DECK_ANALYSIS_FINAL_CLEANUP.md` | This doc. |

### Commander extraction
- Unchanged: explicit inline marker, "Commander:" line, Commander section, linked deck → trusted, immediate analysis.

### No-marker user replies → trusted
- **Already:** "yes", "correct", "X is the commander", user-named single card after "name your commander".
- **Added:** Reply that is exactly the candidate/commander name (or "yes, Name") after confirm question → `replyConfirmsCandidate` → `userJustConfirmedCommander` → analyze same turn.

### Post-confirm invariant
- Already enforced in `normalizeCommanderDecisionState` and CRITICAL analyze block; no change.

### Fallback for ask_commander
- None added; prompt discipline only.

### Debug fields added
- `previous_turn_was_ask_commander`
- `user_reply_promoted_to_commander`

### Revert
1. **active-deck-context.ts:** Remove `replyIsJustCommanderName`, `replyConfirmsCandidate`, and `lastTurnAskedCommander`; remove `replyConfirmsCandidate` from `userJustConfirmedCommander`.
2. **stream/route.ts:** Remove `previous_turn_was_ask_commander` and `user_reply_promoted_to_commander` from debug payload.
3. **active-deck-context.test.ts:** Remove the two new tests (replyIsJustName, replyShortName).
