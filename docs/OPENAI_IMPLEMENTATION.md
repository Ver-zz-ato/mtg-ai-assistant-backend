# OpenAI Implementation Overview

**Last updated:** January 2025  
**Purpose:** Map where OpenAI is used, which models, which APIs, and what limits apply (by user type and timeframe).

**Recent Updates (January 2025):**
- Unified LLM wrapper (`lib/ai/unified-llm-client.ts`) for consistent error handling, fallback, timeouts, and observability
- Dynamic token allocation for deck analyze (800-1500 tokens based on deck size)
- Security fixes: Debug endpoint now admin-only with rate limit; swap routes have rate limits
- Pro-only daily caps added for expensive endpoints (AI Deck Scan: 50/day, Compare: 20/day)
- Systematic observability logging for all OpenAI calls

---

## 1. API surface: Chat Completions vs Responses

| API | Endpoint | Used for | Models |
|-----|----------|----------|--------|
| **Chat Completions** | `https://api.openai.com/v1/chat/completions` | Chat, streaming, AI Deck Scan, compare, debug ping, admin AI tests, test validator | gpt-4o-mini, gpt-5 (env) |
| **Responses** | `https://api.openai.com/v1/responses` | Deck analyze, swap-suggestions, swap-why, reprint-risk, `openai-client` | gpt-5 (env) or gpt-4o-mini |

- **Chat Completions:** `messages`, `max_completion_tokens`. No `temperature` / `top_p` / `max_tokens`.
- **Responses:** `input` (role + `input_text`), `max_output_tokens`. Same param rules.

All request bodies are passed through `prepareOpenAIBody` from `@/lib/ai/openai-params` before sending.

---

## 2. Where each feature calls OpenAI

| Feature | Route / module | Model | Token cap | Notes |
|--------|----------------|-------|-----------|-------|
| **Chat (non-stream)** | `POST /api/chat` | gpt-4o-mini or gpt-5 | 256–384 | Model chosen by query type (simple vs complex). |
| **Chat (stream)** | `POST /api/chat/stream` | gpt-4o-mini | 1000 | Fallback to gpt-4o-mini if gpt-5 fails. |
| **AI Deck Scan** | `POST /api/deck/health-suggestions` | `OPENAI_MODEL` (default gpt-5) | 512 | Pro-only. |
| **Deck compare** | `POST /api/deck/compare-ai` | gpt-4o-mini | 1000 | Pro-only. |
| **Deck analyze** | `POST /api/deck/analyze` | `OPENAI_MODEL` (default gpt-5) | Dynamic: 800-1500 | Responses API. Rate limited. Dynamic based on deck size (<60: 800, 60-100: 1200, >100: 1500). |
| **Swap suggestions** | `POST /api/deck/swap-suggestions` | `OPENAI_MODEL` (default gpt-5) | 512 | Responses API, when `useAI` / `provider === "ai"`. Rate limited: Free 10/day, Pro 100/day. |
| **Swap why** | `POST /api/deck/swap-why` | `OPENAI_MODEL` (default gpt-5) | 80 | Responses API. Rate limited: Free 10/day, Pro 100/day. |
| **Reprint risk** | `POST /api/cards/reprint-risk` | `OPENAI_MODEL` (default gpt-5) | 600 | Responses API. Rate limited: Free 10/day, Pro 100/day. |
| **Debug LLM ping** | `GET /api/chat/debug/llm` | `OPENAI_MODEL` or fallback | 32 | Health check. **Admin-only** with 10/min global rate limit. |
| **Admin AI test – generate** | `POST /api/admin/ai-test/generate` | gpt-4o-mini | 3000 | Admin-only. |
| **Admin AI test – analyze failures** | `POST /api/admin/ai-test/analyze-failures` | gpt-4o-mini | 2000 | Admin-only. |
| **Admin AI test – generate from failures** | `POST /api/admin/ai-test/generate-from-failures` | gpt-4o-mini | 2000 | Admin-only. |
| **Test validator (fact-check)** | `lib/ai/test-validator.ts` | gpt-4o-mini | 800 | Used in AI test pipeline. |
| **Shared helper** | `lib/ai/openai-client.ts` → `callOpenAI` | `OPENAI_MODEL` (default gpt-5) | 400 default | Responses API. Now uses unified wrapper internally. Used by e.g. analysis-generator. |

Model config:

- **`OPENAI_MODEL`** (env): default `gpt-5` where used.
- **`OPENAI_FALLBACK_MODEL`** (env): used for debug LLM ping fallback; default `gpt-4o-mini`.

---

## 3. Rate limits and user-type limits

### 3.1 Chat (non-stream) – `POST /api/chat`

| User type | Daily messages | Per-minute | Thread limit |
|-----------|----------------|------------|--------------|
| **Guest** | 10 | – | – |
| **Free (signed-in)** | 50 | 10 req/min | 30 threads |
| **Pro** | 500 | 10 req/min | Unlimited |

- Guest: enforced via guest token + server-side checks.
- Free/Pro: `checkDurableRateLimit` + `checkProStatus`. Thread limit enforced on thread create.

### 3.2 Chat (stream) – `POST /api/chat/stream`

| User type | Daily messages |
|-----------|----------------|
| **Guest** | 10 |
| **Free** | 50 |
| **Pro** | 500 |

Same durable rate-limit keying as non-stream chat.

### 3.3 Deck analyze – `POST /api/deck/analyze`

| User type | Daily analyses |
|-----------|----------------|
| **Unauthenticated** | 5 |
| **Free** | 20 |
| **Pro** | 200 |

`checkDurableRateLimit` + `checkProStatus`.

### 3.4 Other AI features

- **AI Deck Scan:** Pro-only (`checkProStatus`). Pro-only daily cap: 50/day.
- **Deck compare:** Pro-only (`checkProStatus`). Pro-only daily cap: 20/day.
- **Swap suggestions, swap-why, reprint-risk:** Rate limited: Free users 10/day, Pro users 100/day. No Pro gate.
- **Admin AI test routes:** Admin-only. No rate limits.
- **Debug LLM ping:** **Admin-only** (`isAdmin` check). Global rate limit: 10/min.

---

## 4. Timeframes

- **Daily limits:** 24-hour rolling window (e.g. “last 24h”).
- **Per-minute (chat):** 10 requests per user per minute.
- **Streaming:** Max stream duration ~120s; token cap 1000 for stream.

---

## 5. Central modules

| Module | Role |
|--------|------|
| `lib/ai/unified-llm-client.ts` | **Unified LLM wrapper** - Single entry point for all OpenAI calls. Handles fallback, timeouts, retries, and observability logging. |
| `lib/ai/observability.ts` | Structured logging for all OpenAI API calls (route, model, success/fail, latency, tokens, user type). |
| `lib/ai/openai-params.ts` | `prepareOpenAIBody`, `sanitizeOpenAIParams`, `assertNoForbiddenParams`. Used by all OpenAI call sites. |
| `lib/ai/completion-limits.ts` | `COMPLETION_LIMITS`, `getMaxTokenParam`. Token caps and model-specific param handling. |
| `lib/ai/openai-client.ts` | `callOpenAI` for Responses API. Now uses unified wrapper internally. Used by e.g. analysis-generator. |
| `lib/api/durable-rate-limit` | Durable rate limiting (daily / per-minute). |
| `lib/server-pro-check` | `checkProStatus` for Pro gating. |
| `lib/admin-check.ts` | `isAdmin` for admin-only endpoint protection. |

---

## 6. Summary table: model + limits by feature

| Feature | Model | Token cap | Pro? | Daily limit (user type) |
|---------|-------|-----------|------|--------------------------|
| Chat | mini / gpt-5 | 256–384 | No | Guest 10, Free 50, Pro 500 |
| Chat stream | gpt-4o-mini | 1000 | No | Same as chat |
| AI Deck Scan | gpt-5 | 512 | Yes | – |
| Deck compare | gpt-4o-mini | 1000 | Yes | – |
| Deck analyze | gpt-5 | Dynamic: 800-1500 | No | Unauth 5, Free 20, Pro 200 |
| Swap suggestions | gpt-5 | 512 | No | Free 10/day, Pro 100/day |
| Swap why | gpt-5 | 80 | No | Free 10/day, Pro 100/day |
| Reprint risk | gpt-5 | 600 | No | Free 10/day, Pro 100/day |
| Admin AI tests | gpt-4o-mini | 2000–3000 | Admin | – |

All OpenAI requests use `max_completion_tokens` (or `max_output_tokens` for Responses) only; no `temperature`, `top_p`, or `max_tokens` are sent.

---

## 7. Unified LLM Wrapper and Fallback Strategy

### 7.1 Unified Wrapper (`lib/ai/unified-llm-client.ts`)

All OpenAI API calls now go through a unified wrapper that provides:

- **Consistent error handling**: Normalizes errors across all routes
- **Automatic fallback**: gpt-5 → gpt-4o-mini on 4xx unsupported param/model errors
- **Configurable timeouts**: Route-specific timeouts (chat: 15s, analyze: 30s, etc.)
- **Retry logic**: Exponential backoff for 429/5xx (configurable per route)
- **Observability**: Automatic logging of all calls (route, model, success/fail, latency, tokens, user type)
- **Never silent fallback**: All fallback responses are marked with `{ fallback: true, originalModel, fallbackModel }`

### 7.2 Fallback Logic

```typescript
if (error is 4xx unsupported param/model issue) → retry once on fallback model
if (error is 429/5xx) → exponential backoff or fail fast (route-dependent)
always mark fallback responses with { fallback: true, originalModel, fallbackModel }
```

### 7.3 Timeout Values

| Route | Timeout |
|-------|---------|
| Chat | 15 seconds |
| Deck analyze | 30 seconds |
| AI Deck Scan | 25 seconds |
| Swap suggestions/why | 20 seconds |
| Reprint risk | 20 seconds |
| Debug ping | 10 seconds |

Timeouts use `AbortController` and return friendly "AI is busy, please try again" messages.

---

## 8. Observability

All OpenAI calls are automatically logged via `lib/ai/observability.ts` with:

- Route name and feature
- Model used (original and actual if fallback)
- Success/fail status and error codes
- Latency (milliseconds)
- Token usage (input/output)
- User type (guest/free/pro) and hashed user ID
- Fallback status

Logs are written to console in development and can be stored in database (`ai_api_logs` table) for production analytics.

---

## 9. Reassurance on recent changes

The recent “params removal” work (see `OPENAI_PARAMS_REMOVAL_CHANGELOG.md`) touched many files, but the change is **narrow and consistent**:

1. **One pattern everywhere:** Build the request body → call `prepareOpenAIBody(body)` → `JSON.stringify` → `fetch`. No change to auth, routing, or business logic.
2. **Single source of truth:** All sanitization lives in `lib/ai/openai-params.ts`. If we ever need to adjust forbidden params, we change that file only.
3. **Guarded by tests:** `tests/unit/openai-params.test.ts` ensures we strip `temperature` / `top_p` / `max_tokens` and keep `max_completion_tokens`. Run `npm run test:unit:openai` to verify.
4. **Easy to reason about:** Every OpenAI call site now uses the same helper. There are no hidden “defaults” or alternate code paths that still send old params.
