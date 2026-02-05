# OpenAI Implementation — Detailed Breakdown

**Purpose:** Single reference for how OpenAI is wired across the site: tiers, models, routes, token limits, rate limits, and cost considerations. Use this for cost sanity-checks, model-routing decisions, and debugging.

**Last updated:** February 2025

---

## 1. High-level architecture

- **Two OpenAI APIs in use:**
  - **Chat Completions** (`/v1/chat/completions`) — chat, streaming, AI Deck Scan, deck compare, debug ping, admin AI tests. Uses `messages` + `max_completion_tokens`.
  - **Responses** (`/v1/responses`) — deck analyze (when model is responses-only), swap-suggestions, swap-why, reprint-risk, `openai-client.ts`, suggestion-why. Uses `input` (role + content) + `max_output_tokens`.

- **Model routing** is tier-based (guest / free / pro) and **use-case**-based (chat vs deck_analysis). Responses-only models (e.g. Codex) are never sent to Chat Completions.

- **All production OpenAI calls** go through either:
  - `callLLM()` in `lib/ai/unified-llm-client.ts` (preferred: observability, fallback, timeouts, `ai_usage`), or
  - Direct `fetch` to OpenAI (e.g. `suggestion-why` route) or legacy `callOpenAI()` in `lib/ai/openai-client.ts` (Responses API only).

- **Request bodies** are always passed through `prepareOpenAIBody()` from `lib/ai/openai-params.ts` (strips `temperature`, `top_p`, `max_tokens`; only `max_completion_tokens` / `max_output_tokens` are sent).

---

## 2. Environment variables (model and API selection)

| Variable | Purpose | Default / typical |
|----------|---------|-------------------|
| `OPENAI_API_KEY` | Auth for all OpenAI requests | Required in production |
| `OPENAI_MODEL` | Default model where a single env model is used (e.g. debug, openai-client, suggestion-why) | Often `gpt-5` or `gpt-5.2-codex` |
| `OPENAI_FALLBACK_MODEL` | Fallback for debug LLM ping | `gpt-4o-mini` |
| `MODEL_GUEST` | Model for guest chat | Default in code: `gpt-4o-mini` |
| `MODEL_FREE` | Model for free (signed-in) chat and deck_analysis when not Pro | Default: `gpt-4o` |
| `MODEL_PRO` | Legacy/backwards-compat Pro model | Used if MODEL_PRO_CHAT / MODEL_PRO_DECK unset |
| `MODEL_PRO_CHAT` | Pro **chat** model (must be chat-completions-capable) | Default in code: `gpt-4o` |
| `MODEL_PRO_DECK` / `MODEL_DECK_ANALYSIS_PRO` | Pro **deck analysis** model (can be responses-only) | Default in code: `gpt-4o` |
| `MODELS_RESPONSES_ONLY` | Comma-separated model IDs that require Responses API (e.g. `gpt-5.2-codex`) | Used by `modelCapabilities.ts` |

**Important:** If `MODEL_PRO_CHAT` or `MODEL_PRO_DECK` is set to a responses-only model (e.g. Codex), the chat path will **replace** it with the fallback (e.g. `gpt-4o-mini`) so that Chat Completions never receives a responses-only model.

---

## 3. Tier and model mapping (where the “cost lever” lives)

**Source of truth:** `frontend/lib/ai/model-by-tier.ts` — `getModelForTier({ isGuest, userId, isPro, useCase?: 'chat' | 'deck_analysis' })`.

| Tier | Chat model | Deck analysis model | Fallback (all) |
|------|------------|----------------------|-----------------|
| **Guest** | `MODEL_GUEST` → `gpt-4o-mini` | N/A (deck analyze has no “guest” tier; unauthenticated uses same logic with no user) | `gpt-4o-mini` |
| **Free** | `MODEL_FREE` → `gpt-4o` | Same (deck_analysis uses same free model) | `gpt-4o-mini` |
| **Pro** | `MODEL_PRO_CHAT` \|\| `MODEL_PRO` \|\| `OPENAI_MODEL` (then forced to chat-capable) → e.g. `gpt-4o` | `MODEL_PRO_DECK` \|\| `MODEL_DECK_ANALYSIS_PRO` \|\| `MODEL_FREE` → e.g. `gpt-4o` or `gpt-5` | `gpt-4o-mini` |

So **Pro** is the only tier that can be configured to use a pricier model (e.g. GPT-5+) for chat or deck analysis. Free and Guest use fixed “mini”/“4o” defaults unless you override via env.

---

## 3.1 GPT-5+ allowed surfaces (product rule)

Which Pro actions are allowed to use GPT-5+ (or other premium-model) output. Treat this as the product rule; implementation follows it.

| Surface | GPT-5+ allowed? |
|---------|-----------------|
| **Final deck analysis** (analyze, suggestions, synergy) | Yes |
| **Compare AI** (deck comparison) | Yes |
| **AI Deck Scan** (health suggestions) | Maybe — tune by cost vs value |
| **Chat / follow-ups** | No — use tier default (e.g. 4o/mini) unless explicitly escalated |

**Why it matters:** Turns a technical choice into a product rule, makes refactors safer, and gives a clear pricing story: *"Pro deep analysis uses our most powerful model."*

---

## 4. File and path index

### 4.1 Core AI libs (frontend)

| Path | Role |
|------|------|
| `frontend/lib/ai/unified-llm-client.ts` | Single entry for OpenAI: `callLLM()`. Handles Chat vs Responses API, fallback, timeouts, retries, observability, `recordAiUsage()`. |
| `frontend/lib/ai/openai-params.ts` | `prepareOpenAIBody`, `sanitizeOpenAIParams`, `assertNoForbiddenParams`. No `temperature`/`top_p`/`max_tokens`. |
| `frontend/lib/ai/openai-client.ts` | Legacy `callOpenAI(systemPrompt, userPrompt, opts)` — **Responses API only**, uses `OPENAI_MODEL` (default `gpt-5.2-codex`), default 400 tokens. Used by `lib/deck/analysis-generator.ts`. |
| `frontend/lib/ai/model-by-tier.ts` | `getModelForTier()` — guest/free/pro + chat vs deck_analysis. |
| `frontend/lib/ai/modelCapabilities.ts` | `getPreferredApiSurface()`, `isChatCompletionsModel()`, `isResponsesOnlyModel()`. Ensures responses-only models never go to Chat Completions. |
| `frontend/lib/ai/completion-limits.ts` | `COMPLETION_LIMITS` (scan, suggestions, chat, stream, analyze, compare, debug, admin) and `getMaxTokenParam()` for O1/O3 (no max token param). |
| `frontend/lib/ai/pricing.ts` | `costUSD(model, inputTokens, outputTokens)` — rough $/1K tokens for gpt-5, codex, gpt-4o-mini, gpt-4o. |
| `frontend/lib/ai/observability.ts` | `logAICall()` — structured logs (route, model, success, latency, tokens, user type). |
| `frontend/lib/ai/log-usage.ts` | `recordAiUsage()` — writes to `ai_usage` table (user, model, tokens, cost_usd, route, previews, model_tier, etc.). |

### 4.2 Limits and gating

| Path | Role |
|------|------|
| `frontend/lib/limits.ts` | `GUEST_MESSAGE_LIMIT` (10), `FREE_DAILY_MESSAGE_LIMIT` (50), `PRO_DAILY_MESSAGE_LIMIT` (500). |
| `frontend/lib/feature-limits.ts` | Daily caps: guest feature 5; health scan free 10 / pro 50; deck analyze guest 5 / free 20 / pro 200; swap suggestions 5/50; swap why 10/100; reprint risk 10/100; deck compare pro 20; etc. |
| `frontend/lib/api/durable-rate-limit.ts` | `checkDurableRateLimit(supabase, keyHash, routePath, maxRequests, windowDays)` — DB-backed, used by chat, stream, deck analyze, health-suggestions, compare-ai, swap-*, reprint-risk, debug/llm. |
| `frontend/lib/server-pro-check.ts` | `checkProStatus(userId)` — Pro gating. |
| `frontend/lib/config/streaming.ts` | `MAX_STREAM_SECONDS` (120), `MAX_TOKENS_STREAM` (2000), `STREAM_HEARTBEAT_MS` (15000). |

### 4.3 API routes that call OpenAI

| Route | File | Model source | API type | Token cap | Tier / rate limits |
|-------|------|--------------|----------|-----------|--------------------|
| **Chat (non-stream)** | `frontend/app/api/chat/route.ts` | `getModelForTier(…)` (chat) | Chat Completions | 256 (simple) / 384 (complex) | Guest 10/day, Free 50/day + 10/min, Pro 500/day + 10/min; Free 30 threads, Pro unlimited |
| **Chat (stream)** | `frontend/app/api/chat/stream/route.ts` | `getModelForTier(…)` (chat) | Chat Completions | Up to `MAX_TOKENS_STREAM` (2000) | Same daily as chat; stream max 120s |
| **AI Deck Scan** | `frontend/app/api/deck/health-suggestions/route.ts` | `getModelForTier(…)` | Chat Completions | Not set in route (no maxTokens) | Pro-only feature; Free 10/day, Pro 50/day (from feature-limits) |
| **Deck compare** | `frontend/app/api/deck/compare-ai/route.ts` | `getModelForTier(…)` with `isPro: true` | Chat Completions | 1000 | Pro-only; 20/day |
| **Deck analyze** | `frontend/app/api/deck/analyze/route.ts` | `getModelForTier(…, useCase: 'deck_analysis')` | Chat or Responses (by model) | Dynamic: 800 (&lt;60 cards), 1200 (60–100), 1500 (&gt;100) | Unauth 5/day, Free 20/day, Pro 200/day |
| **Swap suggestions** | `frontend/app/api/deck/swap-suggestions/route.ts` | `getModelForTier(…)` | Responses (when provider is AI) | 512 | Free 5/day, Pro 50/day; guest cap 5 |
| **Swap why** | `frontend/app/api/deck/swap-why/route.ts` | `getModelForTier(…)` | Responses | 80 | Free 10/day, Pro 100/day; guest 5 |
| **Reprint risk** | `frontend/app/api/cards/reprint-risk/route.ts` | `getModelForTier(…)` | Responses | 600 | Free 10/day, Pro 100/day; guest 5 |
| **Suggestion why** (deck suggestion explanation) | `frontend/app/api/deck/suggestion-why/route.ts` | `OPENAI_MODEL` (default `gpt-5.2-codex`) | **Direct fetch** to Responses | 120 | No rate limit in this route (internal use) |
| **Debug LLM ping** | `frontend/app/api/chat/debug/llm/route.ts` | `OPENAI_MODEL` or `gpt-4o-mini` | Chat Completions | 32 | **Admin-only**; 10/min global |
| **Admin AI test – generate** | `frontend/app/api/admin/ai-test/generate/route.ts` | Hardcoded `gpt-4o-mini` | Chat Completions | 3000 | Admin-only |
| **Admin AI test – analyze-failures** | `frontend/app/api/admin/ai-test/analyze-failures/route.ts` | `gpt-4o-mini` | Chat Completions | 2000 | Admin-only |
| **Admin AI test – generate-from-failures** | `frontend/app/api/admin/ai-test/generate-from-failures/route.ts` | `gpt-4o-mini` | Chat Completions | 2000 | Admin-only |

### 4.4 Other call sites

- **Deck analysis pipeline** (plan slots, validate, post-filter) uses the **deck analyze** route’s local `callOpenAI()` which in turn uses `callLLM()` with `getModelForTier(…, useCase: 'deck_analysis')` and dynamic token cap.
- **Conversation summary** (chat route, background): uses the same `callOpenAI()` helper as main chat (tier-based model, 256/384 tokens).
- **analysis-generator.ts** (`generateDeckAnalysis`): uses `lib/ai/openai-client.ts` `callOpenAI()` — **Responses API**, `OPENAI_MODEL`, default 2000 tokens.

---

## 5. Per-feature summary: model, tokens, and limits

| Feature | Model (effective) | Token cap | Pro? | Daily / rate limits |
|--------|-------------------|-----------|------|---------------------|
| Chat (non-stream) | Tier: Guest mini, Free/Pro 4o (or MODEL_*) | 256 or 384 | No | Guest 10, Free 50, Pro 500; 10/min; Free 30 threads |
| Chat (stream) | Same tier as chat | 2000 (stream) | No | Same daily as chat; 120s stream |
| AI Deck Scan | Tier (Pro gets MODEL_PRO_CHAT/4o) | None in route | **Yes** | Free 10, Pro 50 |
| Deck compare | Pro tier (same as Pro chat) | 1000 | **Yes** | 20/day |
| Deck analyze | Tier + useCase deck_analysis | 800 / 1200 / 1500 | No | Unauth 5, Free 20, Pro 200 |
| Swap suggestions | Tier | 512 | No | Free 5, Pro 50; guest 5 |
| Swap why | Tier | 80 | No | Free 10, Pro 100; guest 5 |
| Reprint risk | Tier | 600 | No | Free 10, Pro 100; guest 5 |
| Suggestion why | OPENAI_MODEL (codex) | 120 | No | None in route |
| Debug LLM | OPENAI_MODEL or mini | 32 | Admin | 10/min |
| Admin AI tests | gpt-4o-mini | 2000–3000 | Admin | — |

---

## 6. Chat “simple vs complex” (token cap only)

**File:** `frontend/app/api/chat/route.ts`.

- **Model** is chosen only by tier (`getModelForTier`); there is no separate “simple = mini, complex = 5” model switch.
- **Token cap** varies:
  - **Simple:** 256 tokens. Simple = e.g. “what is X”, “show cards”, “is X legal”.
  - **Complex:** 384 tokens. Complex = not simple AND (has deck context OR ≥2 complex keywords). Keywords include synergy, analyze, improve, suggest, recommend, swap, why, how does, etc.

So Pro cost scales with **Pro model** (e.g. gpt-4o or GPT-5+ if you set `MODEL_PRO_CHAT`) and **usage**, not with a second model for “complex” in this route.

---

## 7. Timeouts (unified-llm-client)

| Feature / route | Timeout |
|-----------------|---------|
| chat | 30 s |
| deck_analyze | 300 s (5 min) |
| deck_scan | 300 s |
| deck_compare | 300 s |
| swap_suggestions, swap_why, reprint_risk | 300 s |
| debug_ping | 10 s |
| default | 20 s |

---

## 8. Fallback and observability

- **Fallback:** On model/parameter errors (e.g. model not found, not a chat model, unsupported parameter), `callLLM` retries once with `fallbackModel` (typically `gpt-4o-mini`). Response is marked `fallback: true` with `originalModel` and `fallbackModel`. No fallback on auth (401/403), context_length_exceeded, or generic 400/422.
- **Observability:** Every `callLLM` call is logged via `logAICall()` (route, feature, model, success, latency, tokens, user type, fallback). Optional DB table `ai_api_logs` is documented but commented out.
- **ai_usage:** `recordAiUsage()` is called from `callLLM` (and from chat/stream and suggestion-why) to write to `ai_usage` (user_id, thread_id, model, input/output tokens, cost_usd, route, previews, model_tier, prompt_path, format_key). Used for cost and usage dashboards.

---

## 9. Cost considerations (summary)

- **High-cost levers:** Pro chat and Pro deck analysis models (e.g. GPT-5+), long outputs (deck analyze 800–1500, stream up to 2000), and Pro-heavy features (AI Deck Scan, deck compare).
- **Pricing table** in `lib/ai/pricing.ts`: gpt-5/codex ~$0.50 in / $1.50 out per 1K tokens; gpt-4o-mini ~$0.15 / $0.60; gpt-4o ~$0.25 / $1.00.
- **Recommendations from your usage review:** Hybrid routing (premium model only for final deck analysis / deep synergy), soft cap on verbosity, per-request token ceilings, and keeping Codex/dev usage isolated.

---

## 10. Quick reference: “What uses what?”

| Element on site | Route / flow | Model | API | Token cap |
|-----------------|--------------|-------|-----|-----------|
| Main chat (send message) | POST /api/chat | Tier (Guest mini, Free/Pro 4o or env) | Chat | 256 / 384 |
| Streaming chat | POST /api/chat/stream | Same tier | Chat | 2000 |
| Deck page – “AI Deck Scan” | POST /api/deck/health-suggestions | Tier | Chat | — |
| Deck page – “Compare” (AI) | POST /api/deck/compare-ai | Pro tier | Chat | 1000 |
| Deck analyze (suggestions, analysis text) | POST /api/deck/analyze + internal callOpenAI | Tier (deck_analysis) | Chat or Responses | 800–1500 |
| Swap suggestions (AI) | POST /api/deck/swap-suggestions | Tier | Responses | 512 |
| “Why this swap?” | POST /api/deck/swap-why | Tier | Responses | 80 |
| Reprint risk (AI) | POST /api/cards/reprint-risk | Tier | Responses | 600 |
| Suggestion explanation (why card) | POST /api/deck/suggestion-why | OPENAI_MODEL (codex) | Responses | 120 |
| Admin “Debug LLM” | GET /api/chat/debug/llm | OPENAI_MODEL or mini | Chat | 32 |
| Admin AI test tools | /api/admin/ai-test/* | gpt-4o-mini | Chat | 2000–3000 |

This document should give you everything needed to sanity-check Pro price vs GPT-5+ cost, design a model-routing matrix, or tighten prompts and token limits without changing behavior elsewhere.
