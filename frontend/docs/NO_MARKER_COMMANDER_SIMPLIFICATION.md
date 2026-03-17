# No-Marker Commander Flow Simplification

**Date:** Post explicit-marker hardening.  
**Scope:** Ambiguous/no-marker commander intake only. Explicit marker and linked deck paths unchanged.

---

## Phase 1 — Diagnosis (no-marker path)

### How commander candidates are produced
- **File:** `lib/chat/decklistDetector.ts` — `inferCommander(decklistText, userMessage?, linkedDeckCommander?)`.
- **No explicit marker:** Priority order: Commander section → user message phrases ("my commander is X", "X is the commander") → linked deck → last 1-of in 95+ line export (0.75) → first card (0.35, below 0.5 threshold so returns **null**).
- **Result:** With no marker and no "Commander:" section, we get either one candidate (e.g. last card in 95+ list, reason `commander_last_export`) or **null** (e.g. short deck, first card skipped by threshold).

### Decision rule (before fix)
- **File:** `app/api/chat/stream/route.ts` — `mayAnalyze` then `streamInjected`; `lib/chat/active-deck-context.ts` — `askReason`.
- **Rules:** Explicit marker → `commanderStatus = "confirmed"` → analyze. Inferred one candidate → `askReason = "confirm_inference"` → confirm. Inference null → `askReason = "need_commander"` → ask_commander.
- **Cause of re-ask / extra questions:** (1) After user said "name your commander", reply with just "Korvold, Fae-Cursed King" was **not** treated as commander name — no pattern in `inferCommander` for plain name, so next turn still `need_commander`. (2) Model sometimes ignored CRITICAL and asked for decklist/goals; CRITICAL block tightened. (3) Persistence only when `streamInjected === "analyze"`; when user just confirmed we do inject analyze and persist on same turn.

### State vs model
- **State logic:** `resolveActiveDeckContext` (and normalization) decide inject mode. Persist commander in stream route when `streamInjected === "analyze"` and `userJustConfirmedCommander` or `userJustCorrectedCommander`.
- **Model behavior:** Confirm/ask_commander prompts were long; model could ask for decklist or goals. Shortened to one-line CRITICAL instructions.

---

## Changes made

### 1. User-named commander (CASE C)
- **File:** `lib/chat/active-deck-context.ts`.
- When `hasDeck`, no commander from thread/inference, current message is **not** a decklist, looks like a single card name, and last assistant asked to name commander → set `commanderName = text.trim()`, `userJustConfirmedCommander = true`, path `commander:user_named`.
- Helpers: `lastAssistantAskedForCommanderName(content)`, `looksLikeSingleCardName(text)`.

### 2. Decision tree (unchanged structure, fixed gap)
- Explicit marker → analyze (unchanged).
- One strong candidate → confirm (unchanged).
- No candidate → ask_commander (unchanged).
- **New:** User replies with commander name after ask_commander → treated as confirmed, analyze same turn.

### 3. Post-confirmation analyze
- CRITICAL block in stream route tightened: "Commander is confirmed and deck context is already available. Begin full analysis immediately. Do not ask for decklist, commander, or goals."
- `extra_clarification_allowed` already false when `analyze_now_expected` (normalize-commander-decision.ts).

### 4. Commander question wording
- Confirm: one line: "Is [[Name]] your commander?"
- Ask_commander with candidate: "Is [[Name]] your commander?"
- Ask_commander no candidate: "Please name your commander for this deck."
- All prefixed with "CRITICAL: Ask only this, nothing else."

### 5. Debug
- `commander_resolution_source`: added `user_named_commander` when path includes `commander:user_named`.
- `analyze_gate_reason`: added `user_named_commander` for that path.
- New: `commander_candidate_count`, `candidate_confidence_top`, `confirm_question_expected` in start debug payload.

### 6. Tests
- `tests/unit/active-deck-context.test.ts`: test for user-named commander; infer-then-confirm expectation updated to `commanderStatus === "confirmed"`.

---

## Revert

1. **active-deck-context.ts:** Remove `lastAssistantAskedForCommanderName`, `looksLikeSingleCardName`, the `userNamedCommanderThisTurn` block, and `userNamedCommanderThisTurn` from `userJustConfirmedCommander`.
2. **stream/route.ts:** Revert CRITICAL analyze text; revert confirm/ask_commander to previous wording; remove `commander:user_named` from `commander_resolution_source` and `analyze_gate_reason`; remove `commander_candidate_count`, `candidate_confidence_top`, `confirm_question_expected`.
3. **active-deck-context.test.ts:** Remove user-named test; restore inferThenConfirm to expect `commanderStatus === "inferred"` if desired.
