# Chat/Deck-Analysis Tier Audit (Follow-up)

**Date:** Post live-testing.  
**Scope:** Guest vs Free vs Pro — commander confirmation, cleanup, debug.

---

## Phase 1 — Tier path differences

### Commander detection (same for all tiers)
- **Source:** `resolveActiveDeckContext(active-deck-context.ts)` with `tid`, `isGuest`, `text`, `thread`, `streamThreadHistory`, `clientConversation`, `deckData`.
- **Guest:** No `tid` → `streamThreadHistory = []`; deck from `current_paste` (text is decklist) or `guest_ephemeral` (last decklist in `clientConversation`). Commander from `inferCommander(decklistText)` → `commanderStatus = "inferred"`, `askReason = "confirm_inference"` when `!userRespondedToConfirm`.
- **Free/Pro:** Have `tid` → `streamThreadHistory` from DB; can have `threadCommander`/`threadDecklistText`. If thread has stored commander and no hash change → `commanderStatus = "confirmed"` (so they can skip confirmation on follow-up).
- **Linked deck:** When `source === "linked"` and `deckData?.d?.commander`, we set `commanderStatus = "confirmed"` and never ask. So Guest with a **linked** deck (e.g. from deck page) skips confirmation; paste flow uses inferred.

### Why Guest might skip confirmation
1. **Linked deck:** If Guest sends a request with `context.deckId` and the app provides `deckData`, `source` becomes `"linked"` and `commanderStatus = "confirmed"` → we inject "analyze".
2. **Thread with stored commander:** If the client sends a `threadId` for Guest (e.g. stored from a previous session), and that thread has `commander` set, then `threadCommanderValid` can be true → `commanderStatus = "confirmed"`.
3. **Tier not full:** If for any reason `deckContextForCompose` is null for Guest (e.g. parse fails or entries < 6), `selectedTier` could be "standard" → the entire commander block is inside `if (selectedTier === "full")` → **no commander injection at all** → model sees deck context but no "ask first" instruction and may analyze.

### Confirm vs analyze gate (current)
- **Location:** `stream/route.ts` ~807–827.
- **Logic:** `authForPrompt = isAuthoritativeForPrompt(activeDeckContext)` (confirmed/corrected OR userJustConfirmed/userJustCorrected). If `hasDeck && authForPrompt && commanderName` → inject "analyze". Else if `askReason === "confirm_inference"` → inject "confirm". Else if `askReason === "need_commander"` → inject "ask_commander".
- **Gap:** For **paste** flows (`current_paste` / `guest_ephemeral`), we should **never** treat inferred commander as authoritative. Current code treats **linked** deck commander as authoritative (no ask). So the only inconsistency is if we want paste to always confirm first; linked can stay as-is. So: **for paste sources only**, require explicit confirmed/corrected or just-confirmed/corrected before injecting "analyze".

### Cleanup (same for all tiers)
- **stripIncompleteSynergyChains:** Drops any block that looks like "Chain A/B" or "Synergy:" if `!hasFullChain || endsTruncated || invalidShape`. `hasFullChain` = two `→`; `hasRequiredPhrase` = "together produce" or "advances win". So blocks that don’t match the exact phrase or have one arrow get **entire block removed**. Guest/smaller models may output slightly different phrasing → large removal (e.g. 4513 → 1798 chars).
- **stripIncompleteTruncation:** Already conservative (only last line < 50 chars). Small impact (e.g. 1798 → 1765).
- **No tier-specific cleanup** in code; same filters run for all.

### Token limits / stop / validation
- **Token limit:** Guest uses `getModelForTier` → MODEL_GUEST; when deck context present we use `MAX_TOKENS_DECK_ANALYSIS` (16384) for all. So Guest gets same cap as Pro for deck analysis.
- **Stop sequences:** Same for all (CHAT_STOP_SEQUENCES unless model name in modelsWithoutStop).
- **Validation/repair:** Same `validateRecommendations` and cleanup chain for all tiers when `deckCards.length > 0`.

### Conclusion (diagnosis)
- **Guest skip confirm:** Most likely (a) **paste** with `deckContextForCompose` null so tier = standard and no commander block injected, or (b) **linked** deck / thread with stored commander. Fix: (1) For **paste sources** (current_paste, guest_ephemeral), only inject "analyze" when commander is confirmed/corrected or just confirmed/corrected. (2) Ensure Guest paste always gets full tier when has deck (already should; add safety if needed).
- **Guest over-cleanup:** **stripIncompleteSynergyChains** is too strict: it removes whole blocks for "invalidShape" or missing "together produce"/"advances win". Fix: only remove blocks that are **clearly truncated** (e.g. `endsTruncated`), not for format differences.

---

## Phase 5 — Free vs Pro (quality)
- Same `promptPath`, same `promptVersionId`, same confirmation flow, same deck context injection, same token limit, same cleanup. Free uses MODEL_FREE (e.g. gpt-4o), Pro uses MODEL_PRO_CHAT (e.g. gpt-5.1). **Conclusion:** Free being more generic is **model quality**, not pipeline difference. No code change.

---

## Post-patch summary (done)

- **Confirm-before-analyze:** For paste sources (`current_paste`, `guest_ephemeral`), we only inject "analyze" when commander is confirmed/corrected or just confirmed/corrected this turn. Linked deck keeps prior behavior (stored commander can analyze). Gate uses `mayAnalyze = hasDeck && commanderName && (pasteSource ? commanderConfirmedOrCorrected : authForPrompt)`.
- **Cleanup:** `stripIncompleteSynergyChains` now only removes a block when it is **clearly truncated** (e.g. `endsTruncated` or block ends with `→`/`"[\n` and lacks full chain). No longer removes blocks for missing "together produce"/"advances win" or format differences.
- **Debug:** Start payload includes `decision`, `decision_reason`, `commander_confirm_required`, `commander_confirmed`. End payload includes `cleanup_chars_removed_synergy`, `cleanup_chars_removed_truncation`, `response_shape_guess` (ask_commander | full_analysis | partial_analysis | other). Admin chat-test summary line shows these.

---

## Phase 7 — Deliverables

| Item | Result |
|------|--------|
| **Diagnosis** | Guest could skip confirmation if (1) linked deck or thread with stored commander, or (2) tier not full so no commander block injected. Cleanup was over-removing: synergy filter dropped whole blocks for format/phrase mismatch, not only truncation. |
| **Files changed** | `app/api/chat/stream/route.ts`, `lib/chat/outputCleanupFilter.ts`, `app/admin/chat-test/page.tsx`, `docs/CHAT_TIER_AUDIT_FOLLOWUP.md`. |
| **Why Guest skipped confirmation** | For **paste** flows we now require explicit confirmed/corrected (or just-confirmed this turn) before injecting "analyze". Linked deck unchanged. No tier-specific skip. |
| **What caused Guest truncation/cleanup** | `stripIncompleteSynergyChains` removed any chain-like block that didn’t have two `→` and "together produce"/"advances win". Guest/smaller models often use different wording → large removal (e.g. 4513→1798). Fixed by only removing when **clearly truncated** (ends with `"[\n` or incomplete `→`). |
| **Confirm-before-analyze change** | Single gate: `mayAnalyze = hasDeck && commanderName && (pasteSource ? commanderConfirmedOrCorrected : authForPrompt)`. Paste = current_paste or guest_ephemeral. |
| **Free vs Pro quality** | Same pipeline (promptPath, promptVersionId, confirmation, deck context, token limit, cleanup). Free more generic = **model quality** (e.g. gpt-4o vs gpt-5.1). No code change. |
| **Revert** | Revert stream route to use `authForPrompt` only for analyze gate; revert outputCleanupFilter to drop on `!hasFullChain \|\| endsTruncated \|\| invalidShape`; remove new debug fields from payload and admin summary. |
