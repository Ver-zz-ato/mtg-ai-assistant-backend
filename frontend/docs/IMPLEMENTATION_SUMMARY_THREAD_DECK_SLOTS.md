# Implementation Summary: Thread-Level Commander & Decklist Slots

**Purpose:** Document what was implemented and why, so another LLM can evaluate whether this approach is sound or if simpler alternatives (e.g. "rely on memory / chat capabilities") would suffice.

---

## 1. Problems Addressed

| Problem | User-facing symptom |
|---------|---------------------|
| **AI re-asking for decklist/commander after confirmation** | User pastes deck, AI asks "I believe your commander is Azusa. Is this correct?", user says "yes!" or "yes", then on the *next* message (e.g. "Explain the ramp mix") the AI says "To help you best I need your decklist and commander" again. |
| **User message sometimes doesn't appear in chat** | Optimistic UI or refresh race drops the user's message from the main chat view. |
| **No single source of truth for deck context** | Commander and decklist are re-extracted from `chat_messages` on every request by scanning history; no persistence across turns. |

---

## 2. Root Cause Analysis

### 2.1 Why the AI Re-asks for Commander/Decklist

The commander confirmation flow works like this:

1. **Turn 1:** User pastes deck → AI infers commander from decklist → AI responds: "I believe your commander is Azusa. Is this correct?"
2. **Turn 2:** User says "yes" → Detection runs: `askedCommander` (last assistant msg contains "I believe your commander is") + `looksLikeConfirmation("yes")` → CRITICAL block injected: "Commander confirmed, proceed with analysis."
3. **Turn 3:** User says "Explain the ramp mix for my deck" → Detection runs again. This time:
   - `askedCommander` = last assistant message is the analysis/response, **not** "I believe your commander is"
   - So `askedCommander` is false
   - `userConfirmedOrCorrectedCommander` is false
   - The CRITICAL block is **not** injected
   - The model may fall back to generic behavior ("I need your decklist...") because the system prompt no longer has the explicit "commander confirmed" instruction

**Key insight:** The confirmation state is *ephemeral*. It is only detected when the *current* user message is a confirmation. Once the user moves on to a follow-up question, that state is lost. There is no durable record that the commander was ever confirmed.

### 2.2 Why User Message Sometimes Disappears

- **Duplicate insert:** Both `Chat.tsx` (via `/api/chat/messages`) and the stream route inserted the user message. Race conditions could cause ordering or overwrite issues.
- **Refresh race:** When `refreshMessages` runs (e.g. on thread switch or creation), it fetches `listMessages` and replaces the entire messages array. If the optimistic user message was added but the server hadn't yet persisted it (or a refresh ran before the stream started), the replace would drop the optimistic message.

### 2.3 Why "Rely on Memory" Was Not Enough

The app has several memory mechanisms:

| Mechanism | What it stores | When it applies |
|-----------|----------------|-----------------|
| **Thread summary** (`chat_threads.summary`) | LLM-generated JSON: format, budget, colors, playstyle, deck goals | Only after 10+ messages; generated in background |
| **Recent conversation** | Last 6 turns (User/Assistant), decklists redacted as "(decklist provided; summarized)" | Every request |
| **Pro preferences** | Cross-thread format/budget/colors | Pro only |

None of these store:
- The **confirmed commander name** as a durable slot
- The **pasted decklist text** (or a hash/ref) as a durable slot

The thread summary *could* be extended to include commander, but:
- It is generated only after 10+ messages
- It is produced asynchronously in the background
- It is an LLM extraction, not a structured write at confirmation time
- Early turns (2–5) would not have it

So "relying on memory" would require either:
- Expanding thread summary to include commander and triggering it much earlier, or
- Relying on the model to infer from "Recent conversation: User: yes, Assistant: [analysis]" that the commander is known — but the model was already failing to do this (hence the bug). The CRITICAL block is an **explicit instruction** to not re-ask; without it, behavior is inconsistent.

---

## 3. What Was Implemented

### 3.1 Database Migration

**File:** `frontend/db/migrations/087_add_thread_commander_decklist.sql`

- Added `commander TEXT` and `decklist_text TEXT` to `chat_threads`
- Columns are nullable; used only for paste-based conversations (no linked deck)
- When a deck is linked via `deck_id`, slots are not the primary source

### 3.2 Stream Route: Load Thread Slots

**File:** `frontend/app/api/chat/stream/route.ts`

- After resolving `tid`, the thread is fetched with: `deck_id`, `commander`, `decklist_text`
- `threadCommander` and `threadDecklistText` are used as the canonical source when present

### 3.3 Stream Route: Update Slots

| Trigger | Action |
|---------|--------|
| User pastes decklist (current message) and no linked deck | `UPDATE chat_threads SET decklist_text = text, commander = NULL` |
| User confirms or corrects commander | `UPDATE chat_threads SET commander = <name>` |

Slots are only updated for logged-in users with a thread (`tid && !isGuest`).

### 3.4 Stream Route: Use Slots in Logic

- **v2 paste path:** Prefer `threadDecklistText` over scanning `streamThreadHistory` for the last decklist
- **Raw paste path:** Prefer `threadDecklistText` and `threadCommander` over scanning messages
- **CRITICAL block:** When `threadCommander` is set (from a previous turn), inject the CRITICAL block immediately — no need to re-detect confirmation on the current message. Block text: "COMMANDER CONFIRMED: [[X]]. Do NOT say 'I need your decklist', 'paste your decklist', 'To help you best I need'..."

### 3.5 Stream Route: Commander Block Logic Change

**Before:** CRITICAL block only when `userConfirmedOrCorrectedCommander` in the *current* request.

**After:**
- `commanderForBlock = threadCommander ?? (userConfirmedOrCorrectedCommander ? ... : null)`
- If `threadCommander` is set → always inject CRITICAL
- If user just confirmed this turn → inject CRITICAL and persist `commander` to the thread

### 3.6 Chat.tsx: Message Visibility

- **Removed** the `fetch('/api/chat/messages', { message: { role: 'user', content } })` call. User message persistence is handled solely by the stream route (which inserts at the start of the request).
- **Added** `lastOptimisticUserMsgRef` to track the last optimistically added user message
- **Refresh merge:** When `refreshMessages` receives `listMessages` results, if the optimistic message (matching content + threadId) is not in the server response, it is appended so the UI does not drop it
- **Ref cleared** when the stream completes (success or error)

---

## 4. Current AI Workflow (End-to-End)

### 4.1 Client-Side

```
User types message in Chat.tsx
  → Optimistic: setMessages([...prev, userMsg])
  → lastOptimisticUserMsgRef = { content, threadId }
  → postMessageStream({ text, threadId, context, prefs, messages: last 12 turns })
  → fetch("/api/chat/stream", POST)
```

**Payload:** `text`, `threadId` (or null for guests), `messages` (last 12 user/assistant turns for guests), `context` (deckId, deckContext, memoryContext), `prefs` (format, budget, colors).

### 4.2 Server: Guards and Identity

1. Schema validation (ChatPostSchema)
2. OpenAI API key check → fallback if missing
3. Maintenance mode → 503 if enabled
4. Auth: `getUser()` → `userId` or `isGuest`
5. Guest: `guest_session_token` cookie required; `checkGuestMessageLimit`
6. Logged-in: durable + in-memory rate limit; Pro status check

### 4.3 Server: Persist User Message and Load Thread

- If `tid && !isGuest`: insert user message into `chat_messages`
- Load thread: `chat_threads` → `deck_id`, `commander`, `decklist_text`
- `context.deckId` overrides `thread.deck_id` when present

### 4.4 Server: Deck Context Resolution

| Source | Condition | Result |
|--------|-----------|--------|
| Linked deck | `deckIdLinked` set | Fetch `decks` + `deck_cards` → `deckData`, `deckContextForCompose` |
| Pasted (current msg) | `isDecklist(text)` | Parse, extract commander, build `deckContextForCompose`; update `decklist_text`, clear `commander` |
| Pasted (prior msg) | Guest: `clientConversation`; Pro: `streamThreadHistory` or `threadDecklistText` | Use last decklist in history or thread slot |
| Thread slot | `threadDecklistText` set | Prefer over scanning history |

### 4.5 Server: Prompt Tier Classification

- **micro:** Greetings ("hi", "thanks"), simple rules ("what is trample") → ~80 tokens
- **standard:** General questions, no deck → medium prompt
- **full:** Deck context, deck-intent ("analyze my deck"), explicit list request, multi-step → large prompt

### 4.6 Server: v2 Summary or Raw Fallback

- **Linked deck:** Load/build v2 from `deck_context_summary` (cache by deck hash)
- **Pasted (Pro):** Prefer `threadDecklistText`; else scan `streamThreadHistory`; build v2, cache by deck hash
- **v2 slow (>30s):** Discard, fall back to raw
- **Raw path:** `generateDeckContext` with decklist; prefer `threadDecklistText` / `threadCommander` when available

### 4.7 Server: Commander Confirmation

- If `v2Summary?.commander` and `streamContextSource === "paste_ttl"` → `inferredCommanderForConfirmation`
- `historyForConfirm` = `streamThreadHistory` (Pro) or `clientConversation` (Guest)
- `askedCommander` = last assistant msg contains "I believe your commander is" or "is this correct?"
- `looksLikeConfirmation(text)` = "yes", "yep", "correct", "no it's X", etc.
- **If confirmed this turn:** `userConfirmedOrCorrectedCommander = true`; persist `commander` to thread
- **commanderForBlock** = `threadCommander` ?? (confirmed this turn ? inferred/corrected : null)
- If `commanderForBlock`: inject CRITICAL block
- Else if `inferredCommanderForConfirmation`: inject "ask confirmation" instruction

### 4.8 Server: Prompt Assembly

- Base by tier (micro / standard / full)
- User prefs (format, budget, colors)
- v2 summary block or raw deck context
- Recent conversation (last 6 turns)
- Thread summary (Pro, 10+ messages)
- Pro preferences
- Commander block (CRITICAL or ask)
- Budget check → Layer 0 gate (NO_LLM / MINI_ONLY / FULL_LLM)

### 4.9 Server: LLM Call and Stream

- Messages to OpenAI: `[{ role: "system", content: sys }, { role: "user", content: text }]`
- Model: Guest → gpt-4o-mini; Free → gpt-4o; Pro → gpt-5.1 (env overridable)
- Stream SSE back to client; record `ai_usage`

### 4.10 Client: On Stream Complete

- Replace "Typing…" placeholder with final content
- Save assistant message via `/api/chat/messages` (logged-in)
- Clear `lastOptimisticUserMsgRef`

### 4.11 Visual Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Chat.tsx: optimistic user msg → postMessageStream                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ /api/chat/stream: Auth → Limits → Insert user msg → Load thread (deck_id,        │
│ commander, decklist_text) → Resolve deck context (linked / paste / slot)         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Tier (micro|standard|full) → v2 or raw deck context → Commander block            │
│ (threadCommander or just-confirmed) → Prompt assembly                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Layer 0 (optional) → OpenAI stream → SSE to client → Save assistant msg          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow After Implementation

```
Turn 1: User pastes deck
  → isDecklist(text) → UPDATE decklist_text, commander = NULL
  → v2Summary built from text
  → inferredCommanderForConfirmation = "Azusa"
  → CRITICAL not set (not confirmed yet)
  → AI: "I believe your commander is Azusa. Is this correct?"

Turn 2: User says "yes"
  → looksLikeConfirmation("yes") + askedCommander → userConfirmedOrCorrectedCommander = true
  → commanderForBlock = inferredCommanderForConfirmation
  → CRITICAL block injected
  → UPDATE chat_threads SET commander = "Azusa"

Turn 3: User says "Explain the ramp mix"
  → threadCommander = "Azusa" (from DB)
  → commanderForBlock = threadCommander
  → CRITICAL block injected (no re-ask)
  → AI proceeds with ramp analysis
```

---

## 6. Alternative Approaches Considered

### 5.1 Rely on LLM "memory" / conversation history

- **Idea:** Include last N turns; let the model infer that the commander was confirmed.
- **Why not:** The model was already failing to do this; the CRITICAL block is an explicit instruction. Relying on implicit inference was the pre-implementation state.

### 5.2 Extend thread summary to include commander

- **Idea:** Add commander (and decklist ref) to `chat_threads.summary` and inject that.
- **Drawbacks:**
  - Summary is generated only after 10+ messages
  - It is produced asynchronously; first few turns have no summary
  - Requires an extra LLM call and parsing; slots are a direct write at confirmation time

### 5.3 Stronger prompt instructions without persistence

- **Idea:** Add a one-time instruction like "Once the user confirms the commander, remember it for the rest of this conversation."
- **Why not:** Stateless per-request model; each turn is independent. Without persistence, the next turn has no way to know the prior confirmation unless it is in a stored slot.

---

## 6. Open Questions for Review

1. **Is structured persistence (slots) the right level of abstraction?** Alternatives: key-value store, a generic `thread_context` JSON column, or a separate `thread_deck_context` table.
2. **Should we rely more on the thread summary?** E.g. trigger summary generation earlier (e.g. after 3–5 messages) and include commander there, instead of dedicated columns.
3. **Guest handling:** Slots apply only to logged-in users with threads. Guests use `clientConversation`. Is that sufficient, or should we support ephemeral guest threads?
4. **Linked deck vs paste:** When `deck_id` is set, we use the linked deck; slots are for paste-only. Is that the correct priority?

---

## 7. Files Touched

| File | Change |
|------|--------|
| `frontend/db/migrations/087_add_thread_commander_decklist.sql` | New migration |
| `frontend/app/api/chat/stream/route.ts` | Load/update/use slots; CRITICAL block when `threadCommander` set |
| `frontend/components/Chat.tsx` | Remove user message POST; add optimistic merge and ref |
