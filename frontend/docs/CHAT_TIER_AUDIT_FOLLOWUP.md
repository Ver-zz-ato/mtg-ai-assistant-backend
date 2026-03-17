# Chat/Deck-Analysis Tier Audit (Follow-up)

**Date:** Post live-testing.  
**Scope:** Guest vs Free vs Pro — commander confirmation, cleanup, debug.

---

### Deck Source Types (Important)

The system distinguishes between two deck sources:

- **Paste** (`current_paste` / `guest_ephemeral`):
  Deck was just pasted into chat. Commander must be confirmed before analysis.

- **Linked** (`source === "linked"`):
  Deck is attached to the thread (e.g. from deck page chat or older linked threads).
  Stored commander is trusted and analysis can run without confirmation.

**Note:** The homepage chat no longer supports linking a deck. It only uses paste or existing thread context.

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
- Same `promptPath`, same `promptVersionId`, same confirmation flow, same deck context injection, same token limit, same cleanup. Free uses MODEL_FREE (e.g. gpt-5-mini), Pro uses MODEL_PRO_CHAT (e.g. gpt-5.1). **Conclusion:** Free being more generic is **model quality**, not pipeline difference. No code change.

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
| **Free vs Pro quality** | Same pipeline (promptPath, promptVersionId, confirmation, deck context, token limit, cleanup). Free more generic = **model quality** (e.g. gpt-5-mini vs gpt-5.1). No code change. |
| **Revert** | Revert stream route to use `authForPrompt` only for analyze gate; revert outputCleanupFilter to drop on `!hasFullChain \|\| endsTruncated \|\| invalidShape`; remove new debug fields from payload and admin summary. |

---

## Ask-commander / analysis mismatch fix

**Problem:** Debug showed `decision=ask_commander` and `commander_confirm_required=true`, but the assistant output was full Step 1–8 analysis. The decision layer and actual generated content were out of sync.

**Exact mismatch cause:** The commander decision (`injected` = ask_commander / confirm / analyze) was computed only *after* the system prompt was built. For full tier with deck context we always used the **deck_analysis** prompt (Step 1–8, full analysis instructions) and appended a single short “COMMANDER NEEDED: ask the user” line at the end. The model saw dominant “do full analysis” instructions and often ignored the ask-commander line. **Type:** Prompt assembly + branch logic (decision was correct; prompt content was wrong for ask_commander/confirm).

**Files changed:** `app/api/chat/stream/route.ts`.

**How ask_commander is now enforced:**
- Commander decision (`streamInjected` = analyze | confirm | ask_commander | none) is computed **early** at the start of the full-tier branch (same `mayAnalyze` / `askReason` logic).
- When `streamInjected === "ask_commander"` or `"confirm"`, we use **chat**-kind system prompt (no deck_analysis), and append a dedicated **CRITICAL** block: “ASK FOR COMMANDER ONLY — NO ANALYSIS … Do NOT provide deck analysis, Step 1–8 … Stop after asking.”
- For **confirm**: one line stating the inferred commander and asking “Is this correct?” For **ask_commander**: if we have a candidate, ask to confirm that; otherwise ask the user to name their commander.

**How analysis is prevented before confirmation:**
- When `streamInjected` is ask_commander or confirm we do **not** load the deck_analysis prompt version; we use the generic chat prompt.
- We do **not** add: v2Summary deck intelligence block, DECK CONTEXT block, few-shot learning, raw decklist context, or “Formatting: Step 1, Step 2”. Those blocks are gated with `streamInjected === "analyze"`.
- Only when `streamInjected === "analyze"` do we add the CRITICAL commander-confirmed block and the Step 1–2 formatting.

**response_shape_guess fix:** End debug now prefers **actual content**. If the output contains analysis structure (`Step N` or Report Card), we label `full_analysis` or `partial_analysis` regardless of `injected`. We label `ask_commander` only when the output does *not* look like analysis (no steps). So we never label a full analysis response as ask_commander.

**Revert:** In `stream/route.ts`: (1) Remove early computation of `streamInjected`/`streamDecisionReason` in the full-tier else block and restore the previous prompt path (always use deck_analysis when hasDeckContextForPrompt). (2) Restore the previous Phase 6 block that computed `injected`/`decisionReason` locally and added Formatting + all three commander branches. (3) Restore the gating so v2Summary, DECK CONTEXT, few-shot, and raw path blocks run for all full tier (remove `&& streamInjected === "analyze"`). (4) Revert `response_shape_guess` to the previous formula (based only on `promptContractLog.injected`).

---

## Ask-commander decklist re-ask regression fix

**Problem:** When `decision=ask_commander` and `has_full_deck_context=true`, the assistant sometimes asked the user to paste/provide the decklist again instead of only asking for commander confirmation. Regression appeared after the composed prompt/layer addition.

**Cause:** For ask_commander/confirm we were still using `buildSystemPromptForRequest({ kind: "chat", ... })`, which loads **composed** layers (BASE_UNIVERSAL_ENFORCEMENT + FORMAT_* from `prompt_layers`). Those layers can contain generic “to analyze a deck, ask for decklist”–style guidance, which contaminated the output despite the CRITICAL “ask commander only” block.

**Fix:**
- **Minimal prompt for ask_commander/confirm:** When `streamInjected === "ask_commander"` or `"confirm"` and we have deck context, we no longer load composed/chat layers. We use only `CHAT_HARDCODED_DEFAULT` (hardcoded string) so no “ask for decklist” instruction can appear.
- **CRITICAL block hardened:** Explicit “You ALREADY have the user's full decklist. Do NOT ask them to paste it, provide it, send the 99 cards…” and FORBIDDEN phrases listed.
- **Output safety guard:** If `prompt_mode === "ask_commander"` and we have full deck context but the model output contains decklist-reask phrases (e.g. “paste your decklist”, “provide your decklist”), we replace the response with a deterministic canned ask-commander message (e.g. “Is [[X]] your commander for this deck? Please confirm or correct.”).
- **Debug:** End payload includes `ask_commander_fallback_used` and `ask_commander_decklist_reask_blocked` when applicable.

**Revert:** In `stream/route.ts`: (1) For ask_commander/confirm branch, restore `buildSystemPromptForRequest({ kind: "chat", deckContextForCompose: null, ... })`. (2) Revert CRITICAL block text to previous “ASK FOR COMMANDER ONLY — NO ANALYSIS” wording. (3) Remove the `looksLikeDecklistReask` check and `askCommanderFallbackUsed` canned replacement. (4) Remove `ask_commander_fallback_used` / `ask_commander_decklist_reask_blocked` from end debug payload.

---

## Rollback + deterministic commander extraction

**Goal:** Simplify ask_commander path; resolve commander deterministically when the decklist explicitly marks it; reduce prompt-layer hacks.

**Reverted / simplified:** ask_commander prompt restored to `buildSystemPromptForRequest({ kind: "chat", ... })`; CRITICAL blocks shortened to one line; output guard (decklist-reask canned replacement) removed.

**Deterministic extraction:** Inline marker `1 CardName COMMANDER!` detected in decklistDetector; when inference reason is `commander_section`, `commander_section_same_line`, or `explicit_inline_marker`, active-deck-context sets `commanderStatus = "confirmed"` and path `commander:explicit_marker` so we skip confirm and go straight to analyze.

**Debug (new):** Start payload includes `commander_resolution_source`, `commander_trusted_for_analysis`, `analyze_gate_reason`. **Persistent state:** Unchanged.
