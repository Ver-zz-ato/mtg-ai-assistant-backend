# ManaTap AI Chat Flow — Technical Specification

**Purpose:** Fully document the AI chat architecture, request flow, and design rationale. Use this as the single source of truth for how chat works and why.

---

## 1. Goals: What Do We Want?

| Goal | Why |
|------|-----|
| **Single source of truth for chat** | Chat responses come only from the streaming route. No parallel deck_analyze calls for report cards — reduces complexity, wrong-commander issues, and divergent prompts. |
| **Commander correctness** | Commander must be inferred consistently from pasted decklists (Moxfield/Archidekt often put commander at end). Ask the user to confirm before analysis. |
| **Memory within conversation** | Pro and Guest must both support multi-turn: "I believe your commander is X — is this correct?" → User: "yes" or "no, it's Y" → Full analysis. Memory enables this. |
| **Cost control** | Use cheaper models for trivial queries (greetings, simple rules); full models for deck analysis. Respect budget caps. |
| **Fair limits** | Guest: capped per session; Free/Pro: daily limits. Enforced server-side. |
| **Evidence-based analysis** | System prompt enforces problem claims backed by decklist evidence, ADD/CUT recommendations, synergy chains, and a report-card style summary. |

---

## 2. Entry Point and Architecture

### 2.1 Client Flow

```
Chat.tsx (user submits message)
    → postMessageStream({ text, threadId, context, prefs, guestMessageCount, messages })
    → POST /api/chat/stream
```

**File:** `frontend/components/Chat.tsx`, `frontend/lib/threads.ts`

### 2.2 Request Payload (ChatPostSchema)

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `text` | string 1–4000 | Yes | Current user message |
| `threadId` | UUID \| null | No | Thread ID for logged-in users; `null` for guests |
| `messages` | `{ role, content }[]` max 20 | No | Prior conversation for guests (enables multi-turn without DB) |
| `stream` | boolean | No | Legacy; unused |

**Why `messages`?** Guests have no `threadId` — messages are not persisted. Sending prior turns from the client lets the server reconstruct context for commander confirmation, deck reference, and recent conversation.

**File:** `frontend/lib/validate.ts` (`ChatPostSchema`)

---

## 3. Authentication and Identity

### 3.1 User Classification

| Condition | `isGuest` | `userId` | `tid` | Persisted messages? |
|-----------|-----------|----------|-------|---------------------|
| Not logged in | true | null | null | No |
| Logged in | false | set | from request | Yes |
| Pro (subscription) | false | set | from request | Yes |

**Why it matters:** Limits, model selection, thread history, and memory sources depend on this.

**File:** `frontend/app/api/chat/stream/route.ts` (lines 46–56)

### 3.2 Guest Session Token

Guests need a `guest_session_token` cookie. If missing or invalid, the request is rejected.

**Why?** Rate limiting and abuse prevention without sign-in.

**File:** `frontend/lib/guest-tracking.ts`, `frontend/lib/api/guest-limit-check.ts`

---

## 4. Validation and Guards

### 4.1 Order of Checks

1. **Schema validation** — Invalid payload → 400
2. **OpenAI API key** — Missing → 200 with `fallback: true`
3. **Maintenance mode** — Enabled → 503
4. **Guest token** — Missing/invalid → 200 with `fallback: true`, `guestLimitReached`
5. **Guest message limit** — Exceeded → 200 with `fallback: true`
6. **Durable rate limit** (non-guest) — Exceeded → 429
7. **In-memory rate limit** (non-guest) — Exceeded → 429
8. **Budget cap** — Daily/weekly spend exceeded → 429

**Why this order?** Fail fast: auth and limits first, then expensive prompt/LLM work.

---

## 5. Message Limits

| Tier | Limit | Scope |
|------|-------|-------|
| **Guest** | 10 messages | Per session (cookie) |
| **Free** | 50 / day | Per user (DB) |
| **Pro** | 500 / day | Per user (DB) |

**Why?** Guest is for trial; Free/Pro are for daily usage. Pro limit is high for power users.

**File:** `frontend/lib/limits.ts`

---

## 6. Model Selection by Tier

| Tier | Default model | Env override |
|------|---------------|--------------|
| Guest | `gpt-4o-mini` | `MODEL_GUEST` |
| Free | `gpt-4o` | `MODEL_FREE` |
| Pro | `gpt-5.1` | `MODEL_PRO_CHAT` or `MODEL_PRO` |

**Fallback:** If the selected model is not chat-completions-capable, use `gpt-4o-mini`.

**Why tiered models?** Cost vs quality: guests get cheaper model; Pro gets the best.

**File:** `frontend/lib/ai/model-by-tier.ts`

---

## 7. Deck Context Sources

### 7.1 How Deck Context Is Obtained

| Source | Condition | Used for |
|--------|-----------|----------|
| **Linked deck** | `thread.deck_id` or `context.deckId` | Deck from DB, commander from deck record |
| **Pasted in current message** | `isDecklist(text)` | Parse and extract commander |
| **Prior message (Guest)** | `messages` from client, last user msg is deck | Multi-turn "yes" after deck paste |
| **Prior message (Pro)** | Thread messages, last user msg is deck | Same multi-turn flow via DB |

**Why multiple sources?** Users can paste decks, link decks from My Decks, or follow up with "yes" — all must be supported.

### 7.2 Commander Extraction

**Priority order** (`extractCommanderFromDecklistText`):

1. Explicit "Commander" section (next line or `Commander: CardName`)
2. User message: "my commander is X" / "using X as commander"
3. Last "1 CardName" when deck is ≥95 card lines (Moxfield/Archidekt convention)
4. First card in list (legacy)

**Why commander-at-end?** Many exporters place the commander last; first-card-only was wrong for those lists.

**File:** `frontend/lib/chat/decklistDetector.ts`

### 7.3 v2 Summary vs Raw Fallback

| Path | When | What |
|------|------|------|
| **v2 from linked deck** | `deckData?.deckText` | Build or load from `deck_context_summary` |
| **v2 from pasted (Pro)** | `tid` and pasted deck in thread | Build, cache by deck hash (TTL) |
| **v2 slow discard** | Build > 30s | Fallback to raw; v2 set to null |
| **Raw fallback** | No v2 | `generateDeckContext` with commander passed in |

**Why v2?** Structured JSON (commander, colors, card_names, etc.) is token-efficient and consistent. Raw fallback when v2 is unavailable or too slow.

---

## 8. Prompt Tier Classification

### 8.1 Tiers

| Tier | When | System prompt size |
|------|------|--------------------|
| **micro** | Greetings, simple rules/terms | ~80 tokens |
| **standard** | General questions, no deck | Medium |
| **full** | Deck context, deck-intent, explicit list request | Large |

### 8.2 Escalation Rules (Full Tier)

- Deck context present
- `isDeckAnalysisRequest(text)` (e.g. "analyze my deck")
- Explicit list request (e.g. "give me 10 swaps")
- Multi-step/detailed request

### 8.3 Micro Tier (Never Downgrade on Length Alone)

- Greeting patterns: hi, thanks, ok, got it, cool, nice
- Simple rules/term: "what is trample", "what does ward do"

**Why?** Token cost: micro for trivial, full for deck analysis.

**File:** `frontend/lib/ai/prompt-tier.ts`, `frontend/lib/ai/layer0-gate.ts`

---

## 9. System Prompt Assembly

### 9.1 Base by Tier

- **micro:** `MICRO_PROMPT` + `NO_FILLER_INSTRUCTION`
- **standard:** `buildSystemPromptForRequest` (no deck)
- **full:** `buildSystemPromptForRequest` with `deckContextForCompose`

### 9.2 Full Tier Additions

| Addition | When |
|----------|------|
| User preferences | Format, budget, colors from `prefs` |
| User level | Beginner/intermediate/pro |
| v2 summary block | When v2 exists |
| Linked deck block | When `deckData` |
| Raw deck context | When no v2 and deck from paste/prior |
| Few-shot learning | Non-guest only |
| Thread summary | Pro, 10+ messages |
| Pro preferences | Pro only |
| Commander confirmation | Pasted deck, inferred commander |

### 9.3 Commander Confirmation Flow

**First message (deck pasted, commander inferred):**

> COMMANDER CONFIRMATION (required): Your FIRST response must start with: "I believe your commander is [[X]]. Is this correct?" Do not provide analysis until they confirm or correct. Memory: you will see their answer in the next turn.

**Follow-up (user confirmed or corrected):**

> COMMANDER CONFIRMATION (follow-up): The user already confirmed or corrected the commander. Use commander: [[X]]. Proceed with your full analysis now—do NOT ask again.

**Detection:**

- Confirmation: "yes", "yep", "correct", "that's right", "ok", etc.
- Correction: "no, it's X", "actually my commander is X", "wrong, X"

**Memory source:**

- Pro: `streamThreadHistory` from DB
- Guest: `clientConversation` from request `messages`

**Why?** Avoids wrong commander in analysis; user explicitly validates or corrects.

---

## 10. Recent Conversation Injection

### 10.1 When Injected

| Path | Source |
|------|--------|
| v2 path | `streamThreadHistory` (last 6 turns) |
| Raw path (Pro) | `streamThreadHistory` (last 6 turns) |
| Raw path (Guest) | `clientConversation` from request (last 6 turns) |

**Format:** `User: ...` / `Assistant: ...`; decklists redacted as "(decklist provided; summarized)".

**Why?** AI needs prior turns for commander confirmation follow-up and coherent multi-turn responses.

---

## 11. Budget Enforcement

### 11.1 Logic

- `ai_usage` table: daily and weekly spend
- `app_config.llm_budget`: `daily_usd`, `weekly_usd`
- If over either limit → 429, block request

**Why?** Prevents runaway spend.

**File:** `frontend/lib/server/budgetEnforcement.ts`

---

## 12. Layer 0 Gate

### 12.1 When Active

- `LLM_LAYER0=on` or `app_config`
- Bypassed if `llm_force_full_routes` includes `"chat_stream"`

### 12.2 Decisions

| Mode | When | Effect |
|------|------|--------|
| **NO_LLM** | Empty input, needs deck but missing, static FAQ, off-topic | Deterministic text, no LLM call |
| **MINI_ONLY** | Simple rules/term, simple one-liner, near budget cap (non-Pro) | Override to `gpt-4o-mini`, lower max_tokens (128 or 192) |
| **FULL_LLM** | Default, deck + analysis | Normal tier/model |

**Pro:** Always FULL_LLM (no budget-cap downgrade).

**File:** `frontend/lib/ai/layer0-gate.ts`

---

## 13. Streaming Config

| Config | Value | Why |
|--------|-------|-----|
| `MAX_TOKENS_STREAM` | 4096 | Enough for full analysis |
| `MAX_STREAM_SECONDS` | 120 | Avoid hanging streams |
| `STREAM_HEARTBEAT_MS` | 15000 | Keep connection alive |

**File:** `frontend/lib/config/streaming.ts`

---

## 14. API Call and Response

### 14.1 Messages Sent to OpenAI

```json
[
  { "role": "system", "content": "<assembled system prompt>" },
  { "role": "user", "content": "<current user message>" }
]
```

Only current turn is sent; prior turns are in the system prompt.

### 14.2 Stop Sequences

Used except for `gpt-5-mini` / `gpt-5-nano`.

### 14.3 Error Handling

- 429 / quota → 503 with retry message
- Other errors → may fallback to non-stream `/api/chat`

---

## 15. Client-Side: Sending `messages`

### 15.1 What Is Sent

- Last 12 user/assistant turns
- Only `role` and `content`
- State *before* adding the current user message

**Why 12?** ~6 exchanges; enough for commander confirmation and recent context without oversized payloads.

**File:** `frontend/components/Chat.tsx`

---

## 16. Debug Logging

**Enable:** `DEBUG_CHAT_STREAM=1` in `.env.local`

**Tags:** `[STREAM_DEBUG]identity`, `[STREAM_DEBUG]v2_result`, `[STREAM_DEBUG]raw_path`, `[STREAM_DEBUG]raw_deck`, `[STREAM_DEBUG]commander_confirm`

Use to trace Guest vs Pro, v2 vs raw, and commander resolution.

---

## 17. Visual Flow Diagram

```
User sends message
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Auth → Limits → Rate limit → Model (guest/free/pro)                   │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Deck context (linked / pasted / clientConversation for Guest)         │
│ → Prompt tier (micro / standard / full)                               │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ v2 build (linked or paste) or raw fallback                            │
│ → Commander confirmation (ask first, or follow-up if confirmed)       │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Budget check → Layer 0 (if on) → Model override? (MINI_ONLY)          │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ OpenAI stream (4096 max tokens) → SSE to Chat UI                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 18. Key Files

| File | Role |
|------|------|
| `frontend/app/api/chat/stream/route.ts` | Main stream route |
| `frontend/lib/ai/model-by-tier.ts` | Model selection |
| `frontend/lib/ai/prompt-tier.ts` | Prompt tier classification |
| `frontend/lib/ai/layer0-gate.ts` | NO_LLM / MINI_ONLY / FULL_LLM |
| `frontend/lib/chat/decklistDetector.ts` | Deck detection, commander extraction |
| `frontend/lib/chat/enhancements.ts` | `generateDeckContext` |
| `frontend/lib/limits.ts` | Message limits |
| `frontend/lib/validate.ts` | ChatPostSchema |
| `frontend/components/Chat.tsx` | Client, sends `messages` |
| `frontend/lib/threads.ts` | `postMessageStream` |

---

## 19. Design Decisions Summary

| Decision | Why |
|----------|-----|
| Single stream route for chat | One prompt path, one model path; no deck_analyze in chat |
| Client sends `messages` for guests | No thread persistence; server needs prior turns for memory |
| Commander confirmation before analysis | Reduces wrong-commander errors; user validates |
| Commander-at-end detection | Matches Moxfield/Archidekt output format |
| 3 prompt tiers | Balance token cost and answer quality |
| Layer 0 for trivial queries | Save LLM calls and budget |
| Pro exempt from budget downgrade | Pro users expect full model even when budget is tight |
