# ManaTap AI Chat Flow — Technical Specification

**Purpose:** Single source of truth for how the AI chat works end-to-end. All architecture, request flow, deck context, commander handling, and design rationale live here.

---

## 1. Goals

| Goal | Why |
|------|-----|
| **Single source of truth for chat** | Responses come only from the streaming route. No parallel deck_analyze for report cards. |
| **Commander correctness** | Commander inferred from pasted decklists (Moxfield/Archidekt often put commander last). User confirms before analysis. |
| **Persistent deck context** | Thread-level `commander` and `decklist_text` slots (paste-only) persist across turns so the AI never re-asks. |
| **Memory within conversation** | Pro and Guest both support multi-turn: "I believe your commander is X — is this correct?" → "yes" → full analysis. |
| **Cost control** | Cheaper models for trivial queries; full models for deck analysis. Budget caps enforced. |
| **Fair limits** | Guest: 10/session; Free: 50/day; Pro: 500/day. |
| **Evidence-based analysis** | Problems backed by decklist evidence; ADD/CUT recommendations; synergy chains; report-card style. |

---

## 2. End-to-End Flow Overview

```
Client (Chat.tsx)
  → Optimistic user message
  → postMessageStream({ text, threadId, context, prefs, messages })
  → POST /api/chat/stream

Server (stream route)
  → Guards (auth, limits, maintenance)
  → Insert user message into chat_messages
  → Load thread (deck_id, commander, decklist_text)
  → Resolve deck context (linked / paste / thread slots)
  → Update thread slots when appropriate
  → Classify tier (micro / standard / full)
  → Build v2 summary or raw deck context
  → Commander block (CRITICAL or ask)
  → Assemble system prompt
  → Budget check, Layer 0 gate
  → OpenAI stream
  → Record ai_usage

Client (on stream complete)
  → Replace "Typing…" with final content
  → Save assistant message via /api/chat/messages
  → Clear optimistic ref
```

---

## 3. Client-Side Flow (Chat.tsx)

### 3.1 Before Sending

- Build `context`: `deckId`, `deckContext`, `memoryContext`, `budget`, `colors`, `teaching`
- Build `prefs`: `format`, `budget`, `colors`, `teaching`, `userLevel`
- If no `threadId` and logged in: create thread via `/api/chat/threads/create`, then use new `threadId`

### 3.2 Sending a Message

1. **Optimistic update:** `setMessages([...prev, userMsg])` with `id: user_${timestamp}_${random}`
2. **Track for refresh:** `lastOptimisticUserMsgRef.current = { content, threadId }`
3. **No separate user message save:** The stream route inserts the user message. Chat.tsx does not call `/api/chat/messages` for the user message.
4. **Add typing placeholder:** `setMessages([...prev, { role: "assistant", content: "Typing…" }])`
5. **Call** `postMessageStream({ text, threadId, context, prefs, guestMessageCount, messages })`

**Payload fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `text` | string 1–4000 | Current user message |
| `threadId` | UUID \| null | Thread ID (logged-in) or null (guest) |
| `messages` | `{ role, content }[]` max 12 | Prior user/assistant turns (for guests; also sent for consistency) |
| `context` | object | `deckId`, `deckContext`, `memoryContext`, `budget`, `colors` |
| `prefs` | object | `format`, `budget`, `colors`, `teaching`, `userLevel` |
| `guestMessageCount` | number | Guest message count (for limit checks) |
| `sourcePage` | string | Page path for analytics |

### 3.3 Refresh Merge (listMessages)

When `refreshMessages(tid)` runs (e.g. on thread switch):

1. Fetch `listMessages(tid)`
2. Dedupe by message id
3. **Optimistic merge:** If `lastOptimisticUserMsgRef` has content for this `tid` and the server response does not contain that user message, append it so the UI does not drop it
4. If not streaming: `setMessages(uniqueMessages)` (or merged result)
5. During streaming: skip replace to avoid UI glitches

### 3.4 On Stream Complete

- Replace "Typing…" placeholder with accumulated content
- Save assistant message via `POST /api/chat/messages` (logged-in only)
- Clear `lastOptimisticUserMsgRef.current = null`

**File:** `frontend/components/Chat.tsx`, `frontend/lib/threads.ts`, `frontend/lib/validate.ts` (`ChatPostSchema`)

---

## 4. Server: Guards and Identity

### 4.1 Order of Checks

1. **Schema validation** — Invalid payload → 400
2. **OpenAI API key** — Missing → 200 with `fallback: true`
3. **Maintenance mode** → 503
4. **Guest token** — Missing/invalid → 200 with `guestLimitReached`
5. **Guest message limit** — Exceeded → 200
6. **Durable rate limit** (logged-in) → 429
7. **In-memory rate limit** (logged-in) → 429
8. **Budget cap** (later) → 429

### 4.2 User Classification

| Condition | `isGuest` | `userId` | `tid` | Messages persisted? |
|-----------|-----------|----------|-------|---------------------|
| Not logged in | true | null | null | No |
| Logged in | false | set | from request | Yes |
| Pro | false | set | from request | Yes |

### 4.3 Message Limits

| Tier | Limit | Scope |
|------|-------|-------|
| Guest | 10 | Per session (cookie) |
| Free | 50/day | Per user |
| Pro | 500/day | Per user |

**File:** `frontend/app/api/chat/stream/route.ts`, `frontend/lib/limits.ts`, `frontend/lib/api/guest-limit-check.ts`, `frontend/lib/api/durable-rate-limit.ts`

---

## 5. Server: Persist User Message and Load Thread

### 5.1 Persist User Message

- If `tid && !isGuest && userId`: `INSERT INTO chat_messages (thread_id, role, content) VALUES (tid, 'user', text)`
- This is the only place the user message is persisted (no duplicate from client)

### 5.2 Load Thread

- If `tid && !isGuest`: `SELECT deck_id, commander, decklist_text FROM chat_threads WHERE id = tid`
- `deckIdLinked` = `thread.deck_id` or `context.deckId` (context overrides)
- `threadCommander` = `thread.commander`
- `threadDecklistText` = `thread.decklist_text`

**Thread slots (`chat_threads`):**

| Column | Purpose | When used |
|--------|---------|-----------|
| `deck_id` | Linked deck UUID | Primary deck source when set |
| `commander` | Confirmed commander name | Paste-only; avoids re-asking after confirmation |
| `decklist_text` | Last pasted decklist text | Paste-only; canonical source instead of scanning history |

**File:** `frontend/app/api/chat/stream/route.ts`, `frontend/db/migrations/087_add_thread_commander_decklist.sql`

---

## 6. Server: Deck Context Resolution

### 6.1 Priority

1. **Linked deck** — `deckIdLinked` set → fetch `decks` + `deck_cards` → `deckData`, `deckContextForCompose`
2. **Pasted (current message)** — `isDecklist(text)` → parse, extract commander, build `deckContextForCompose`
3. **Pasted (prior message)** — Guest: scan `clientConversation`; Pro: use `threadDecklistText` or scan `streamThreadHistory`

### 6.2 Thread Slot Updates (Logged-in, Paste-only)

| Trigger | Action |
|---------|--------|
| User pastes deck (current message) and no linked deck | `UPDATE chat_threads SET decklist_text = text, commander = NULL WHERE id = tid` |
| User confirms or corrects commander | `UPDATE chat_threads SET commander = <name> WHERE id = tid` |

### 6.3 Commander Extraction (from decklist)

**Priority** (`extractCommanderFromDecklistText`):

1. Explicit "Commander" section or `Commander: CardName`
2. User message: "my commander is X" / "using X as commander"
3. Last "1 CardName" when deck ≥95 lines (Moxfield/Archidekt)
4. First card (legacy)

**File:** `frontend/lib/chat/decklistDetector.ts`

---

## 7. Server: v2 Summary vs Raw Fallback

### 7.1 v2 Path

| Source | When | Cache |
|--------|------|-------|
| Linked deck | `deckData?.deckText` | `deck_context_summary` by deck_id + hash |
| Pasted (Pro) | `threadDecklistText` or last decklist in `streamThreadHistory` | `deck_context_summary` by deck hash (TTL) |

- If build > 30s: discard v2, fall back to raw
- v2 = structured JSON (commander, colors, card_names, deck_facts, synergy_diagnostics)

### 7.2 Raw Fallback

- When no v2: `generateDeckContext` with decklist
- Prefer `threadDecklistText` and `threadCommander` over scanning messages

**File:** `frontend/lib/deck/deck-context-summary.ts`, `frontend/lib/chat/enhancements.ts`

---

## 8. Server: Prompt Tier Classification

| Tier | When | Prompt size |
|------|------|-------------|
| **micro** | Greetings (hi, thanks, ok); simple rules ("what is trample") | ~80 tokens |
| **standard** | General questions, no deck | Medium |
| **full** | Deck context; deck-intent; explicit list request; multi-step | Large |

**Full tier triggers:**
- `hasDeckContext`
- `isDeckAnalysisRequest(text)` (e.g. "analyze my deck")
- Explicit list (e.g. "give me 10 swaps")
- Multi-step / detailed ("walk me through")

**File:** `frontend/lib/ai/prompt-tier.ts`

---

## 9. Server: Commander Confirmation and CRITICAL Block

### 9.1 Variables

- `inferredCommanderForConfirmation` — from v2Summary.commander when `streamContextSource === "paste_ttl"`
- `historyForConfirm` — `streamThreadHistory` (Pro) or `clientConversation` (Guest)
- `askedCommander` — last assistant message contains "I believe your commander is" or "is this correct?"
- `looksLikeConfirmation(text)` — "yes", "yep", "correct", "ok"; or "no, it's X", "actually my commander is X"
- `commanderCorrectionForPrompt` — parsed commander name when user corrects

### 9.2 Logic

```text
commanderForBlock = threadCommander ?? (userConfirmedOrCorrectedCommander ? (commanderCorrectionForPrompt || inferredCommanderForConfirmation) : null)
```

- **If commanderForBlock set:** Inject CRITICAL block. If user just confirmed this turn, persist: `UPDATE chat_threads SET commander = commanderForBlock`
- **Else if inferredCommanderForConfirmation:** Inject "ask confirmation" instruction

### 9.3 CRITICAL Block Text

> === CRITICAL: COMMANDER CONFIRMED ===
> The commander is [[X]]. The full decklist is in DECK CONTEXT above. You MUST proceed with deck analysis NOW. FORBIDDEN: Do NOT say "I need your decklist", "paste your decklist", "To help you best I need", "Tell me your commander", or ask for format/budget/goals. Start your analysis immediately.

### 9.4 Ask Confirmation Text

> COMMANDER CONFIRMATION (required): Your FIRST response must start with exactly this: "I believe your commander is [[X]]. Is this correct?" Do not provide analysis until they confirm or correct.

**File:** `frontend/app/api/chat/stream/route.ts`

---

## 10. Server: System Prompt Assembly

### 10.1 Base by Tier

- **micro:** `MICRO_PROMPT` + `NO_FILLER_INSTRUCTION`
- **standard:** `buildSystemPromptForRequest` (no deck) + last 2 turns
- **full:** `buildSystemPromptForRequest` with `deckContextForCompose`

### 10.2 Full Tier Additions

| Block | When |
|-------|------|
| User preferences | Format, budget, colors from `prefs` |
| User level | Beginner/intermediate/pro |
| v2 summary | When v2 exists |
| Linked deck block | When `deckData` |
| Raw deck context | When no v2 |
| Few-shot learning | Non-guest |
| Recent conversation | Last 6 turns (decklists redacted) |
| Thread summary | Pro, 10+ messages (from `chat_threads.summary`) |
| Pro preferences | Pro only |
| Commander block | CRITICAL or ask (see §9) |

### 10.3 Thread Summary

- Fetched from `chat_threads.summary`
- LLM-generated JSON: format, budget, colors, playstyle, deck goals
- Only available after 10+ messages; generated in background if missing

**File:** `frontend/lib/chat/chat-context-builder.ts`, `frontend/lib/ai/prompt-path.ts`

---

## 11. Server: Budget and Layer 0

### 11.1 Budget

- `allowAIRequest` checks `ai_usage` vs `app_config.llm_budget`
- Over limit → 429

### 11.2 Layer 0 Gate (Optional)

- **NO_LLM:** Empty input; needs deck but missing; static FAQ; off-topic → deterministic text, no LLM
- **MINI_ONLY:** Simple rules/term; near budget cap (non-Pro) → override to gpt-4o-mini, lower max_tokens
- **FULL_LLM:** Default
- Pro: always FULL_LLM

**File:** `frontend/lib/server/budgetEnforcement.ts`, `frontend/lib/ai/layer0-gate.ts`

---

## 12. Server: Model Selection and LLM Call

### 12.1 Models

| Tier | Default | Env override |
|------|---------|--------------|
| Guest | gpt-4o-mini | MODEL_GUEST |
| Free | gpt-4o | MODEL_FREE |
| Pro | gpt-5.1 | MODEL_PRO_CHAT / MODEL_PRO |

### 12.2 Messages to OpenAI

```json
[
  { "role": "system", "content": "<assembled system prompt>" },
  { "role": "user", "content": "<current user message>" }
]
```

Only the current turn; prior turns are in the system prompt.

### 12.3 Streaming

- `MAX_TOKENS_STREAM` 4096
- `MAX_STREAM_SECONDS` 120
- `STREAM_HEARTBEAT_MS` 15000

**File:** `frontend/lib/ai/model-by-tier.ts`, `frontend/lib/config/streaming.ts`, `frontend/lib/ai/openai-params.ts`

---

## 13. Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Chat.tsx: optimistic user msg → lastOptimisticUserMsgRef → postMessageStream     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ /api/chat/stream: Schema → API key → Maintenance → Guest token/limit             │
│ → Auth → Rate limits → Model tier                                                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Insert user msg → Load thread (deck_id, commander, decklist_text)                │
│ → Resolve deck context (linked / paste / slots) → Update slots if needed         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Tier (micro|standard|full) → v2 or raw → Commander block (threadCommander or     │
│ just-confirmed) → Assemble prompt → Budget → Layer 0                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ OpenAI stream → SSE → Client replaces Typing… → Save assistant msg → Clear ref   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Key Files

| File | Role |
|------|------|
| `frontend/app/api/chat/stream/route.ts` | Main stream route |
| `frontend/components/Chat.tsx` | Client UI, optimistic update, refresh merge |
| `frontend/lib/threads.ts` | `postMessageStream` |
| `frontend/lib/validate.ts` | ChatPostSchema |
| `frontend/lib/ai/model-by-tier.ts` | Model selection |
| `frontend/lib/ai/prompt-tier.ts` | Tier classification |
| `frontend/lib/ai/prompt-path.ts` | buildSystemPromptForRequest |
| `frontend/lib/ai/layer0-gate.ts` | NO_LLM / MINI_ONLY / FULL_LLM |
| `frontend/lib/chat/decklistDetector.ts` | isDecklist, extractCommanderFromDecklistText |
| `frontend/lib/chat/enhancements.ts` | generateDeckContext |
| `frontend/lib/chat/chat-context-builder.ts` | injectThreadSummaryContext, Pro prefs |
| `frontend/lib/deck/deck-context-summary.ts` | v2 summary build/cache |
| `frontend/lib/limits.ts` | Message limits |
| `frontend/db/migrations/087_add_thread_commander_decklist.sql` | Thread slots schema |

---

## 15. Debug Logging

**Enable:** `DEBUG_CHAT_STREAM=1` in `.env.local`

**Tags:** `[STREAM_DEBUG]identity`, `[STREAM_DEBUG]v2_result`, `[STREAM_DEBUG]raw_path`, `[STREAM_DEBUG]raw_deck`, `[STREAM_DEBUG]commander_confirm`

---

## 16. Design Decisions Summary

| Decision | Why |
|----------|-----|
| Single stream route | One prompt path, one model path; no deck_analyze in chat |
| Thread slots (commander, decklist_text) | Persistent deck context so AI does not re-ask after confirmation |
| Stream route inserts user message | Single write; no duplicate from client |
| Optimistic merge on refresh | User message stays visible if refresh runs before server has it |
| Client sends messages for guests | No thread; server needs prior turns for memory |
| Commander confirmation before analysis | Reduces wrong-commander; user validates |
| Commander-at-end detection | Matches Moxfield/Archidekt output |
| 3 prompt tiers | Balance cost and quality |
| Layer 0 for trivial queries | Save LLM calls and budget |
| Pro exempt from budget downgrade | Pro expects full model |
