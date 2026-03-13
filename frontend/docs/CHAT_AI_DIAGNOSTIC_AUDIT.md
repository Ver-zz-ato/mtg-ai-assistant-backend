# ManaTap Chat AI Diagnostic Audit

**Date:** 2025-03-13  
**Scope:** Forensic audit of current chat AI workflow. No code changes. Diagnosis only.

---

## 1. Current Architecture Overview

### Request lifecycle (user message → stream → persistence)

```
1. Client (Chat.tsx)
   - Optimistic user message in UI
   - Builds context: { deckId: linkedDeckId, deckContext, memoryContext, budget, colors, teaching }
   - Calls postMessageStream({ text, threadId, context, prefs, messages })
   - POST /api/chat/stream

2. Stream route (route.ts)
   - Schema validation (ChatPostSchema: text 1–4000, threadId?, messages?)
   - Guards: API key, maintenance, guest token/limit, rate limits
   - Persist user message (if tid && !isGuest)
   - Load thread: deck_id, commander, decklist_text, commander_status, decklist_hash
   - context.deckId overrides thread.deck_id for deckIdLinked
   - Fetch deckData (decks + deck_cards) when deckIdLinked set
   - Phase 5: resolveActiveDeckContext() — single source of truth for deck/commander
   - Build deckContextForCompose from ActiveDeckContext
   - Persist thread slots when user pastes new deck (decklist_text, decklist_hash, commander clear on hash change)
   - Tier classification (micro | standard | full)
   - Prompt assembly: buildSystemPromptForRequest (composed/version/hardcoded)
   - Add: user prefs, user level, v2 summary or raw deck context, recent conversation, commander block
   - v2 path: buildDeckContextSummary (enrichDeck → scryfall_cache → deck_facts, synergy_diagnostics)
   - Raw path: generateDeckContext (analyzeDecklistFromText → problems → prose)
   - Budget check, Layer 0 gate
   - OpenAI stream
   - On complete: validateRecommendations (color identity, already-in-deck, invented cards), cleanup, persist assistant message
```

**Critical:** The stream route uses **only** `context.deckId` from the request. `deckContext` and `memoryContext` are sent by the client but **never read** by the stream route. Deck context is assembled entirely server-side from thread slots, deckData, and ActiveDeckContext.

---

## 2. Files Inspected

| File | Role |
|------|------|
| `app/api/chat/stream/route.ts` | Main stream route; guards, deck resolution, prompt assembly, LLM call, validation |
| `app/api/chat/threads/get/route.ts` | Returns threads with select("*") including deck_id |
| `app/api/chat/threads/list/route.ts` | Returns id, title, created_at only (no deck_id) |
| `lib/chat/active-deck-context.ts` | Canonical deck/commander resolution; precedence and ask-reason logic |
| `lib/chat/decklistDetector.ts` | isDecklist, extractCommanderFromDecklistText, inferCommander |
| `lib/chat/decklist-normalize.ts` | normalizeDecklistText, hashDecklist |
| `lib/chat/enhancements.ts` | analyzeDecklistFromText, generateDeckContext (raw path prose) |
| `lib/chat/chat-context-builder.ts` | injectThreadSummaryContext, getProUserPreferences |
| `lib/deck/deck-context-summary.ts` | buildDeckContextSummary, v2 JSON, getPasteSummary/setPasteSummary |
| `lib/deck/deck-enrichment.ts` | enrichDeck from scryfall_cache; commander_eligible from type_line/oracle_text |
| `lib/deck/deck-facts.ts` | buildDeckFacts from tagged cards; ramp/draw/interaction counts |
| `lib/deck/synergy-diagnostics.ts` | buildSynergyDiagnostics |
| `lib/deck/intelligence-formatter.ts` | formatForLLM (deck_facts + synergy → prose) |
| `lib/ai/conversation-summary.ts` | buildSummaryPrompt, parseSummary, formatSummaryForPrompt |
| `lib/ai/layer0-gate.ts` | NO_LLM / MINI_ONLY / FULL_LLM; needsDeckButMissing, isDeckAnalysisRequest |
| `lib/ai/prompt-path.ts` | buildSystemPromptForRequest (composed → version → hardcoded) |
| `lib/chat/validateRecommendations.ts` | Post-output: ADD already-in-deck, CUT not-in-deck, off-color, invented, illegal |
| `lib/chat/validateAddSuggestions.ts` | validateAddSuggestions (uses COMMANDER_COLOR_MAP fallback) |
| `components/Chat.tsx` | Client UI; builds context (deckId, deckContext, memoryContext); deckContext/memoryContext unused by server |
| `lib/threads.ts` | postMessageStream, postMessageStreamWithDebug |
| `lib/validate.ts` | ChatPostSchema |
| `db/migrations/087_add_thread_commander_decklist.sql` | commander, decklist_text columns |
| `db/migrations/088_chat_threads_deck_metadata.sql` | commander_status, deck_source, decklist_hash, etc. |
| `docs/AI_CHAT_FLOW.md` | High-level flow spec |

---

## 3. Commander Detection: Current Behavior

### 3.1 Extraction (decklistDetector.ts)

**`inferCommander(decklistText, userMessage?, linkedDeckCommander?)`** — priority order:

1. **Commander section** — next line after "Commander:" or "Commander: CardName" on same line → confidence 0.95  
2. **User message** — "my commander is X", "using X as commander" → 0.9  
3. **Linked deck metadata** — `decks.commander` → 0.95  
4. **Last 1-of in 95+ line list** — Moxfield/Archidekt style → 0.75  
5. **First card** — fallback; confidence 0.35, below COMMANDER_CONFIDENCE_THRESHOLD (0.5) → returns **null** (avoids Sol Ring as commander)

**`extractCommanderFromDecklistText`** — same heuristics, no confidence; used in raw path.

### 3.2 Resolution (active-deck-context.ts)

Commander precedence:

1. **thread.commander** (confirmed/corrected) when `hasDeck`  
2. **deckData.d.commander** when `source === "linked"`  
3. **inferCommander(decklistText, text, linkedDeckCommander)** when `decklistText`  
4. Else `commanderStatus = "missing"`

**Confirmation detection:**

- `askedCommander` = last assistant message matches `/I believe your commander is|is this correct\?/i`  
- `looksLikeConfirmation(text)` = "yes", "yep", "correct", "no it's X", "actually my commander is X"  
- `userRespondedToConfirm` = `askedCommander && looksLikeConfirmation(text)`  
- `extractCorrection(text)` = parses "no, it's [[X]]" or plain "no it's X"  
- `userJustConfirmedCommander` = confirmed (no correction); `userJustCorrectedCommander` = corrected

### 3.3 Persistence

- **When user pastes deck:** `UPDATE chat_threads SET decklist_text, decklist_hash, commander = NULL` (unless `preserveCommander` — same commander name and hash not changed)  
- **When user confirms/corrects:** `UPDATE chat_threads SET commander, commander_status` — **only inside the CRITICAL block** when `isAuthoritativeCommander(activeDeckContext)`  
- **Bug:** `isAuthoritativeCommander` returns true only when `commanderStatus === "confirmed" || "corrected"`. When user says "yes", status is still `"inferred"` (not yet persisted). So we never enter the CRITICAL block, never persist, and instead re-inject "ask confirmation" on the next turn. **Commander confirmation persists only after the first subsequent request** (when thread has commander from prior correction path or linked deck).

**Evidence:**  
`route.ts` lines 675–676: persist is inside `if (activeDeckContext.hasDeck && authCommander && activeDeckContext.commanderName)`. `authCommander = isAuthoritativeCommander(activeDeckContext)` requires `status === "confirmed" | "corrected"`. When user says "yes", `userJustConfirmedCommander = true` but `commanderStatus` remains `"inferred"`.

---

## 4. Deck Context Resolution: Current Behavior

### 4.1 Precedence (active-deck-context.ts)

**Deck source order (explicit in code):**

1. **linked** — `deckData.deckText` and `deckIdLinked` set, and no explicit override in user message  
2. **current_paste** — current message is decklist and (explicit override OR no linked deck)  
3. **thread_slot** — `threadDecklistText`  
4. **guest_ephemeral** — guest: last decklist in `clientConversation`  
5. **history_fallback** — Pro: last decklist in `streamThreadHistory`  
6. **none**

**Override detection:** `detectExplicitOverride(text)` — "use this instead", "ignore the linked deck", "for another deck".

**Hash change:** When `source === "current_paste"` and `decklistHash !== threadDecklistHashStored`, `deckReplacedByHashChange = true` → persistence clears commander unless `preserveCommander` (commander name matches stored and hash unchanged).

---

## 5. Prompt Assembly: Current Behavior

### 5.1 Context blocks (injection order)

| Block | When | Source | Authority |
|-------|------|--------|-----------|
| Base system prompt | Always | composed / version / hardcoded | Tier-dependent |
| User preferences | full tier, prefs | prefs.format, budget, colors | Advisory |
| User level | Always | prefs.userLevel | Advisory |
| v2 summary (deck_facts + synergy) | full, v2Summary | buildDeckContextSummary, formatForLLM | Structured, authoritative for counts |
| Linked deck block | full, deckData | decks + deck_cards | Authoritative |
| Raw deck context | full, no v2 | generateDeckContext (problems prose) | Advisory |
| Recent conversation | standard/full | last 2 (standard) or 6 (full) turns, decklists redacted | Advisory |
| Commander block | full | CRITICAL or ask or need_commander | Authoritative when CRITICAL |
| Thread summary | Pro, 10+ msgs | chat_threads.summary (LLM-generated JSON) | Advisory |
| Pro preferences | Pro | user_chat_preferences | Advisory |

### 5.2 Commander block logic

- **CRITICAL** — when `hasDeck && isAuthoritativeCommander && commanderName`: "The commander is [[X]]. You MUST proceed. FORBIDDEN: Do NOT ask for decklist/commander..."  
- **Ask confirmation** — when `askReason === "confirm_inference" && commanderName`: "Your FIRST response must start with: I believe your commander is [[X]]. Is this correct?"  
- **Need commander** — when `askReason === "need_commander"`: "Ask the user to confirm their commander. Do NOT guess."

### 5.3 v2 vs raw

- **v2:** Uses `enrichDeck` → scryfall_cache (type_line, oracle_text, color_identity). Builds deck_facts (ramp, draw, interaction from tags) and synergy_diagnostics. Cached in `deck_context_summary` (linked) or in-memory paste cache (4h TTL).  
- **Raw:** `analyzeDecklistFromText` (simple parsing, land/removal keyword heuristics) → `generateDeckContext` (problem prose). No Scryfall lookup in raw path.

---

## 6. Persistence and Memory: Current Behavior

### 6.1 Durable storage

| Data | Table | When |
|------|-------|------|
| User message | chat_messages | tid && !isGuest |
| Assistant message | chat_messages | On stream complete, tid && !isGuest |
| commander | chat_threads | User confirms/corrects (when CRITICAL block runs — currently buggy) |
| decklist_text | chat_threads | User pastes deck, no linked deck |
| decklist_hash | chat_threads | Same |
| deck_source | chat_threads | Same |
| commander_status | chat_threads | Same or on confirm |
| summary | chat_threads | Background LLM after 10+ messages |
| deck_context_summary | deck_context_summary | v2 build for linked decks (by deck_id + hash) |

### 6.2 Ephemeral / non-persistent

- **Paste summary cache** — in-memory Map, 4h TTL, 500 max; lost on cold start  
- **clientConversation** — guest; not persisted  
- **Thread summary** — generated on first 10+ message thread; stored thereafter  

### 6.3 Client "memory" (unused by stream)

- **aiMemory (ai-memory.ts)** — localStorage, lastDeck, lastCollection, recentCards, preferences. `getChatContext()` is sent as `memoryContext` but **stream route does not read it**.  
- **deckContext** — client builds from `analyzeDeckProblems` + `generateDeckContext` when linkedDeckId; **stream route ignores it**.

---

## 7. MTG Grounding Audit

### 7.1 Oracle text

- **Yes, in v2 path:** `enrichDeck` fetches from `scryfall_cache` (type_line, oracle_text, color_identity, legalities, etc.).  
- **deck-context-summary.ts** `tally()` uses regex on `oracle_text` for ramp (add {W}, search for land), draw (draw a card, scry, investigate), removal (destroy/exile/counter), wipes.  
- **deck-enrichment.ts** `isCommanderEligible()` uses `type_line` (legendary creature) and `oracle_text` ("can be your commander").  
- **No:** Oracle is never injected as user-facing text into the prompt. The model receives structured counts and tags, not raw Oracle text.

### 7.2 Commander legality

- **Structured check:** `resolveCommanderFromEnriched` in deck-context-summary uses `commander_eligible` from `enrichDeck` (type_line + oracle_text).  
- **validateRecommendations / validateAddSuggestions:** Color identity from scryfall cache or COMMANDER_COLOR_MAP (hardcoded ~10 commanders). Off-color ADD suggestions are stripped.  
- **Inference:** Commander legality is enforced structurally for deck building and validation. The model is instructed via prompt but not given raw legality data.

### 7.3 Category counts (ramp, draw, removal)

- **v2:** Computed from `deck_facts` (tagCards → buildDeckFacts). Tag-based: ramp, land_ramp, mana_rock, draw, spot_removal, board_wipe, etc.  
- **Raw fallback (tally):** Regex on oracle_text.  
- **Raw fallback (enhancements.analyzeDecklistFromText):** Name-based heuristics only (e.g. removal keywords in card names). No Scryfall.

### 7.4 Model reliance

- Card suggestions: Model uses deck_facts, card_names, and prompt rules. No runtime legality check before generation; **validateRecommendations** runs after output.  
- Rules explanations: Model knowledge only. No Oracle injection for rules Q&A.  
- Swap quality: Model + post-hoc validation (off-color, already-in-deck, invented). No structural "best swap" ranking.

---

## 8. Failure Analysis

### 8.1 Re-asking for commander after confirmation

**Cause:** `isAuthoritativeCommander` is true only when `commanderStatus === "confirmed" | "corrected"`. On "yes", status is still `"inferred"`. The CRITICAL block and persist never run. Next turn: same state → ask again.

### 8.2 Re-asking for decklist on follow-up

- Guest: Deck only in `clientConversation`. If messages truncated or not sent correctly, server has no deck.  
- Pro: Relies on `threadDecklistText` or history scan. If thread slots not persisted (e.g. hash change cleared them, or paste occurred before slot logic), history scan may miss deck.  
- **deckContextForCompose** requires 6+ parsed cards. Shorter lists can be dropped.

### 8.3 Incorrect MTG rules

- No Oracle/rules injection. Model relies on training. Hallucination-prone on edge cases.

### 8.4 Confident but weak swap suggestions

- Model generates; validation strips bad adds. No scoring or ranking of suggestions. Few-shot examples may bias style over quality.

### 8.5 Inconsistent deck identity between turns

- Hash change clears commander. New paste with different hash → commander cleared.  
- `preserveCommander` requires same commander name; small spelling changes break it.  
- Linked deck vs paste race: override detection is regex-based; ambiguous user text can misroute.

---

## 9. Sharpest Pain Points

| # | Weakness | Category | Severity |
|---|----------|----------|----------|
| 1 | Commander confirmation never persists on "yes" (authCommander blocks CRITICAL) | **State** | Critical |
| 2 | Client deckContext and memoryContext sent but ignored by stream | **Architecture** | High |
| 3 | Raw path has no Scryfall; ramp/draw/removal from name heuristics only | **Grounding** | High |
| 4 | validateRecommendations color identity: COMMANDER_COLOR_MAP fallback for ~10 commanders only | **Grounding** | High |
| 5 | Thread summary generated async; first 10+ message thread gets no summary | **State** | Medium |
| 6 | Paste cache in-memory; cold start loses all paste summaries | **State** | Medium |
| 7 | threads/list does not return deck_id; Chat uses threads/get which does | **Architecture** | Low (works but inconsistent) |
| 8 | inferredCommanderForConfirmation only set for paste_ttl; raw path confirmation logic is split | **Prompt** | Medium |
| 9 | No Oracle injection for rules Q&A; model knowledge only | **Grounding** | Medium |
| 10 | deckReplacedByHashChange can clear commander on minor paste edits | **State** | Medium |

---

## 10. Minimal Evidence-Backed Recommendations

### Must-fix

1. **Commander persistence on "yes":** When `userJustConfirmedCommander` or `userJustCorrectedCommander`, treat commander as authoritative for this turn. Inject CRITICAL block and persist `commander` + `commander_status` even when `commanderStatus === "inferred"`.

### Should-fix

2. **Use or remove client context:** Either consume `deckContext`/`memoryContext` in the stream route or stop sending them to avoid confusion.  
3. **Color identity for validation:** Resolve commander color identity from scryfall_cache when not in COMMANDER_COLOR_MAP instead of failing open.  
4. **Unify commander confirmation logic:** Derive confirmation state from ActiveDeckContext only; remove duplicated logic in stream route (`inferredCommanderForConfirmation` block).

### Later

5. **Paste cache persistence:** Consider KV (e.g. Upstash) for paste summaries across cold starts.  
6. **Raw path enrichment:** Use lightweight Scryfall lookup for raw path when v2 unavailable.  
7. **Hash change handling:** Option to preserve commander when hash change is minor (e.g. comment/formatting only).  
8. **Oracle injection for rules:** Optional retrieval for high-value rules questions.

---

## 11. Open Questions / Ambiguities

1. **threads/get vs list:** Chat uses `threads/get` (select("*")); `listThreads` in threads.ts uses `threads/list` (id, title, created_at). Confirm which is used for thread sidebar and whether deck_id is needed there.  
2. **Guest deck persistence:** Guest has no thread; deck only in `clientConversation`. Exact contract for `messages` array (max 20, role/content) and ordering is unclear from stream route usage.  
3. **LLM_V2_CONTEXT kill switch:** When `streamRuntimeConfig.flags.llm_v2_context === false`, full raw path. Unclear where this is set (app_config, env).  
4. **Layer 0 runtime:** `layer0Decide` called only when `LLM_LAYER0=on`. Default behavior without flag not fully traced.  
5. **COMMANDER_COLOR_MAP coverage:** validateAddSuggestions uses a small hardcoded map. Unclear how often cache miss leads to no color check.  
6. **Background summary timing:** injectThreadSummaryContext triggers fire-and-forget; first request gets empty, later requests may get it. Race conditions possible.

---

*End of audit. No code changes were made.*
