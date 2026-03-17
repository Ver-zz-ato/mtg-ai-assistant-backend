# Chat / Deck-Analysis Workflow — Audit Report

**Date:** 2025-03 (post Phase 1 audit).  
**Scope:** Paste deck → commander confirmation → full analysis; prompt build; model/tokens; post-processing; admin debug.

---

## 1. Live request path (concise)

| Stage | Where | Current behavior |
|-------|--------|------------------|
| **Paste / deck detection** | `stream/route.ts`; `active-deck-context.ts`; `decklistDetector.ts` | `isDecklist(text)`; deck from linked deck, thread slot, or current message. `resolveActiveDeckContext()` returns `hasDeck`, `commanderName`, `askReason` (`confirm_inference` / `need_commander`). |
| **Commander detection** | `deck-context-summary.ts` (v2), `decklistDetector.extractCommanderFromDecklistText` (raw) | v2 summary has `commander`; raw path parses decklist. Inferred commander is tentative until user confirms. |
| **Commander confirmation** | `stream/route.ts` ~L558–628; `active-deck-context.ts` | If `inferredCommanderForConfirmation` and last assistant asked "I believe your commander is... Is this correct?" and `looksLikeConfirmation(text)`: set `userConfirmedOrCorrectedCommander`; parse correction from "no, it's X" / "actually my commander is X". `activeDeckContext` has `userJustConfirmedCommander` / `userJustCorrectedCommander`. |
| **Commander + decklist persistence** | `stream/route.ts` ~L776–782 | When `activeDeckContext.commanderName` and (just confirmed or corrected): `UPDATE chat_threads SET commander = ..., commander_status = 'confirmed'|'corrected'`. Decklist from v2/paste is in thread or context; `decklist_text` updated on paste. |
| **Prompt assembly** | `stream/route.ts` ~L350–389; `prompt-path.ts`; `composeSystemPrompt.ts` | **micro:** `MICRO_PROMPT` + NO_FILLER. **standard:** `buildSystemPromptForRequest(deckContext: null)` → composed (prompt_layers) or fallback (prompt_versions) or hardcoded. **full:** same but with `deckContextForCompose`. Then route appends: prefs, v2 summary / DECK CONTEXT, commander block (CRITICAL or ask-confirmation or need_commander), recent conversation, etc. |
| **promptPath** | `prompt-path.ts` `buildSystemPromptForRequest` | Returned as `promptPath: "composed" | "fallback_version" | "fallback_hardcoded"`. Composed = prompt_layers (BASE + FORMAT + MODULEs); fallback = getPromptVersion(kind). |
| **Active prompt version** | `lib/config/prompts.ts` `getPromptVersion("chat")` | Reads `app_config.active_prompt_version_chat` → loads that row from `prompt_versions`. Used only when compose fails. |
| **BASE / FORMAT / MODULE** | `composeSystemPrompt.ts` | From `prompt_layers`: BASE_UNIVERSAL_ENFORCEMENT, FORMAT_COMMANDER (etc.), then MODULE_* by deck detection. |
| **Deck context / commander block injection** | `stream/route.ts` ~L602–689, ~L770–808 | v2 summary or raw decklist; DECK CONTEXT block; then commander block: if commander confirmed → CRITICAL ("proceed with deck analysis NOW"); if askReason === confirm_inference → "Your FIRST response must start with: I believe your commander is [[X]]. Is this correct?"; if need_commander → ask for commander. |
| **Tier model selection** | `model-by-tier.ts` `getModelForTier` | Guest / Free / Pro → MODEL_GUEST, MODEL_FREE, MODEL_PRO_CHAT (env overrides). |
| **Layer 0 / budget gate** | `stream/route.ts` ~L838–935; `layer0-gate.ts` | When `llm_layer0` and not force-full: NO_LLM (static/FAQ/off-topic) or MINI_ONLY (model + max_tokens cap) or FULL_LLM. Pro exempt from MINI_ONLY. Near budget cap can trigger MINI_ONLY for non-Pro. |
| **max_completion_tokens** | `stream/route.ts` ~L953–956 | Default `MAX_TOKENS_STREAM` (4096). If `streamLayer0MiniOnly`: `tokenLimit = Math.min(decision.max_tokens, 4096)` (e.g. 128 or 192). |
| **Stop sequences** | `chat-generation-config.ts` CHAT_STOP_SEQUENCES; `stream/route.ts` ~L965–971 | useStop = true unless model is gpt-5*, gpt-5.1. When true, OpenAI stop list is set. |
| **Stream timeout** | `stream/route.ts` ~L1098–1099; `streaming.ts` | Loop breaks if `elapsed > MAX_STREAM_SECONDS * 1000` (120s) or `estimatedTokens > MAX_TOKENS_STREAM`. |
| **stripIncompleteTruncation** | `outputCleanupFilter.ts`; `stream/route.ts` ~L1218–1219 | If last line has no sentence-ending punctuation and is not a short list item: walk backward to find a line matching /^Step\s+\d/i; if found, drop from that line to end. **Risk:** Can drop the entire last Step block (e.g. Step 3) when the model ends with "Turn 1" or similar. |
| **stripIncompleteSynergyChains** | Same | Removes malformed/truncated synergy blocks. |
| **Validation / repair / regeneration** | `stream/route.ts` ~L1139–1234 | When deck context: validateRecommendations; if needsRegeneration, one non-stream retry with REPAIR_SYSTEM_MESSAGE. Then stripIncomplete*, applyOutputCleanupFilter, applyBracketEnforcement. |
| **Admin debug** | `stream/route.ts` wantDebug = (x-debug-chat === "1"); `threads.ts` postMessageStreamWithDebug | Sends `__MANATAP_DEBUG__` block at stream start with active_deck_context, prompt_tier, prompt_contract, etc. Admin chat-test page uses Chat with debugMode + onDebugLog; requests use x-debug-chat. |

---

## 2. Is the v3 prompt actually used?

- **Normal path:** Composed from **prompt_layers** (BASE + FORMAT + MODULEs). Your v3 evidence-grounded text is **not** stored in prompt_layers by default; migrations have layered rules into BASE/FORMAT over time. So **no** — the exact v3 doc is not guaranteed on the normal path unless BASE (or a dedicated layer) was manually set to v3.
- **Fallback:** If compose fails, `getPromptVersion("chat")` is used. The migration `evidence_based_deck_analysis_prompt.sql` inserted an evidence-based prompt into **prompt_versions** and set it active. That is a **shorter** variant of v3, not the full v3 doc.
- **Prompt drift:** Yes — prompt_layers (evolved by many migrations) can differ from the single v3 spec; prompt_versions may hold a different (e.g. evidence-based) variant. So drift is possible.

---

## 3. Pro full model path

- Pro is exempt from Layer 0 MINI_ONLY (`layer0-gate.ts`). So Pro gets FULL_LLM and full `MAX_TOKENS_STREAM` unless the route is force-full. Pro uses the same composed/fallback prompt build as Free; only the model (and any Pro-only injections like saved preferences) differ.

---

## 4. Likely causes of “ends at Step 3”

1. **stripIncompleteTruncation** — When the model stops mid-sentence (e.g. after "Turn 1" with no period), the function finds the last "Step N" line and drops from that line to the end. So the **entire last Step** (e.g. Step 3) is removed, leaving only up to Step 2 (or the previous Step). This matches “analysis cuts off around Step 3”.
2. **Token cap** — If Layer 0 MINI_ONLY applied (e.g. near budget cap for non-Pro), max_tokens can be 128/192, which would truncate early; less likely if user is Pro or under cap.
3. **Stop sequences** — If the model emitted a phrase in CHAT_STOP_SEQUENCES, the API would stop there; possible but less likely for mid-analysis.
4. **Stream timeout** — 120s is usually enough; only very long answers would hit it.

**Conclusion:** The most likely cause is **stripIncompleteTruncation** removing the last Step block when the model’s ending is abrupt (no final punctuation).

---

## 5. Exact files (reference)

| Concern | File(s) |
|---------|--------|
| Stream entry, guards, tier, prompt, commander block, Layer 0, token limit, stop, post-process | `app/api/chat/stream/route.ts` |
| Commander/deck state | `lib/chat/active-deck-context.ts` |
| Prompt build | `lib/ai/prompt-path.ts`, `lib/prompts/composeSystemPrompt.ts` |
| Prompt version fallback | `lib/config/prompts.ts` |
| Layer 0 | `lib/ai/layer0-gate.ts` |
| Token/stream config | `lib/config/streaming.ts` |
| Stop sequences | `lib/ai/chat-generation-config.ts` |
| Cleanup | `lib/chat/outputCleanupFilter.ts` |
| Admin isolated chat + debug | `app/admin/chat-test/page.tsx` |
| Debug stream | `lib/threads.ts` (postMessageStreamWithDebug), stream route (wantDebug, __MANATAP_DEBUG__) |

---

## 6. Post-patch updates (done)

- **Canonical deck-analysis prompt:** Full tier + deck context now prefers `getPromptVersion("deck_analysis")` as primary; if present, that prompt is used (one standard across tiers). Fallback remains `buildSystemPromptForRequest` with kind `deck_analysis` or `chat`. Set `active_prompt_version_deck_analysis` in DB to the v3 content to use it as canonical.
- **stripIncompleteTruncation:** Narrowed to only remove a single short incomplete last line (< 50 chars). No longer removes a full Step block (fixes “cuts off at Step 3”).
- **Admin debug:** Start payload now includes `phase`, `promptPath`, `promptVersionId`, `model`, `tier`, `tokenLimit`, `useStop`, `layer0_mode`, `layer0_reason`. End-stream payload (`phase: "end"`) includes `stream_duration_ms`, `lenRaw`, `lenAfterTrimOutro`, `lenAfterSynergy`, `lenAfterTruncation`, `lenFinal`, `synergyRemoved`, `truncationRemoved`, `truncation_guess`. Admin chat-test page shows a one-line summary per entry (START: path/model/tier/tokens/injected; END: lenFinal + trunc/synergy flags).
- **Token cap:** Deck-analysis requests (when not Layer0 MINI_ONLY) use `MAX_TOKENS_DECK_ANALYSIS` (8192). Commented as temporary/test-friendly; revert to `MAX_TOKENS_STREAM` in `streaming.ts` and route if needed.
- **Commander confirmation:** Unchanged; still ask → confirm → persist → then analysis.

---

## 7. Phase 8 — Deliverables summary

| Deliverable | Result |
|-------------|--------|
| **Audit summary** | This doc (live path, files, v3 usage, Pro path, Step 3 cause). |
| **Files changed** | `route.ts`, `outputCleanupFilter.ts`, `streaming.ts`, `threads.ts`, `admin/chat-test/page.tsx`, `docs/CHAT_DECK_ANALYSIS_AUDIT.md`. |
| **Why each file** | Route: deck_analysis prompt primary for full+deck, debug start/end payloads, deck-analysis token cap. outputCleanupFilter: narrow stripIncompleteTruncation. streaming: MAX_TOKENS_DECK_ANALYSIS. threads: parse end-stream debug and strip from content. admin page: debug summary line (START/END). |
| **Canonical path** | `prompt_versions` for deck analysis when available (fallback_version); composed path still used when no deck_analysis version or no deck context. |
| **Commander flow** | No change; confirm-first preserved. |
| **Truncation bug cause** | `stripIncompleteTruncation` was dropping from last "Step N" to end when the final line lacked punctuation; fixed by only trimming a single short incomplete last line (< 50 chars). |
| **Limit relaxations** | Deck-analysis token cap 8192 (temporary/test-friendly); commented in code. |
| **Revert** | Revert stripIncompleteTruncation to previous “drop from Step N” logic if needed; set tokenLimit for deck path back to MAX_TOKENS_STREAM; remove end-stream debug enqueue and client parsing; remove start debug extras; restore single prompt path for full tier. |
